// src/infrastructure/adapters/outbound/mcp/stdio-mcp-connector.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const McpConnectorPort = require('../../../../application/ports/outbound/mcp-connector-port');

/**
 * Stdio MCP连接器
 * 通过标准输入输出方式连接MCP服务
 */
class StdioMcpConnector extends McpConnectorPort {
  /**
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(logger) {
    super();
    this.logger = logger;
  }

  /**
   * 连接到MCP服务
   * @param {Object} config - MCP配置对象
   * @returns {Promise<Object>} MCP会话信息
   */
  async connect(config) {
    try {
      // 处理安装配置
      if (config.setup) {
        await this._executeSetup(config);
      }

      // 创建MCP进程
      const processInfo = await this._createMcpProcess(config);

      // 获取工具列表
      const tools = await this.getTools(processInfo);

      // 创建MCP会话信息
      const mcpSession = {
        ...processInfo,
        tools,
        status: 'connected',
        createdAt: new Date(),
        isExternal: true,
      };

      this.logger.info(`MCP实例创建成功`);
      return mcpSession;
    } catch (error) {
      this.logger.error('MCP连接错误:', error);
      throw new Error(`无法连接到MCP: ${error.message}`);
    }
  }

  /**
   * 断开MCP服务连接
   * @param {Object} instance - MCP实例
   * @returns {Promise<void>}
   */
  async disconnect(instance) {
    if (instance.process) {
      try {
        // 优雅地终止进程
        instance.process.removeAllListeners();
        instance.process.kill('SIGTERM');

        // 如果2秒后还未退出，强制终止
        setTimeout(() => {
          if (!instance.process.killed) {
            instance.process.kill('SIGKILL');
          }
        }, 2000);
      } catch (error) {
        this.logger.error(`断开MCP连接失败:`, error);
      }
    }
  }

  /**
   * 调用MCP工具
   * @param {Object} instance - MCP实例
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<any>} 工具执行结果
   */
  async callTool(instance, toolName, params) {
    const startTime = Date.now();
    this.logger.info(`准备调用远程MCP工具: ${toolName}`, { params });

    if (!instance || !instance.process) {
      throw new Error('无效的MCP会话或进程');
    }

    if (!toolName) {
      throw new Error('工具名称不能为空');
    }

    const safeParams = params && typeof params === 'object' ? params : {};

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('工具调用超时'));
      }, 30000);

      // 生成请求ID
      const requestId = 1000 + Math.floor(Math.random() * 9000);

      let buffer = '';
      let errorOutput = '';
      let responseReceived = false;

      // 监听进程的错误输出
      const errorHandler = data => {
        const errorData = data.toString();
        errorOutput += errorData;
        this.logger.error(`工具 ${toolName} 错误输出:`, errorData);
      };

      // 清理函数，确保只执行一次
      const cleanup = () => {
        if (!responseReceived) {
          responseReceived = true;
          clearTimeout(timeout);
          instance.process.stdout.removeListener('data', dataHandler);
          instance.process.stderr.removeListener('data', errorHandler);
        }
      };

      // 监听进程输出
      const dataHandler = data => {
        if (responseReceived) return;

        const chunk = data.toString();
        buffer += chunk;
        this.logger.debug(`收到工具 ${toolName} 输出:`, chunk);

        try {
          const lines = buffer.split('\n').filter(line => line.trim());

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.startsWith('{')) continue;

            try {
              const response = JSON.parse(line);

              if (response.jsonrpc === '2.0' && response.id === requestId) {
                cleanup();

                if (response.error) {
                  reject(new Error(response.error.message || '工具调用失败'));
                } else if (response.result !== undefined) {
                  resolve(response.result);
                } else {
                  reject(new Error('无效的工具调用响应'));
                }
                return;
              }

              // 兼容模式处理
              if (response.jsonrpc === '2.0' && response.result) {
                if (
                  (toolName === 'market-trending' || toolName === 'stock-quote') &&
                  typeof response.result === 'object'
                ) {
                  cleanup();
                  resolve(response.result);
                  return;
                }
              }
            } catch (lineError) {
              // 继续处理下一行
            }
          }

          buffer =
            lines.length > 0 && !lines[lines.length - 1].endsWith('}')
              ? lines[lines.length - 1]
              : '';
        } catch (e) {
          this.logger.debug(`解析输出失败，继续等待: ${e.message}`);
        }
      };

      // 设置错误处理
      instance.process.on('error', error => {
        cleanup();
        reject(new Error(`MCP进程错误: ${error.message}`));
      });

      // 监听输出
      instance.process.stdout.on('data', dataHandler);
      instance.process.stderr.on('data', errorHandler);

      // 发送请求
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: safeParams,
        },
      };

      try {
        instance.process.stdin.write(JSON.stringify(request) + '\n');
        this.logger.debug(`已发送请求到MCP进程`);
      } catch (writeError) {
        cleanup();
        reject(new Error(`发送请求失败: ${writeError.message}`));
      }
    });
  }

  /**
   * 获取MCP工具列表
   * @param {Object} instance - MCP实例
   * @returns {Promise<Array<Object>>} 工具列表
   */
  async getTools(instance) {
    const childProcess = instance.process;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('获取工具列表超时'));
      }, 20000);

      let buffer = '';
      let toolsReceived = false;
      const initRequestId = 1;
      const toolsListRequestId = 2;

      // 监听stderr以捕获错误
      const errorHandler = data => {
        this.logger.error(`工具列表获取错误输出: ${data.toString()}`);
      };

      // 监听进程输出
      const dataHandler = data => {
        buffer += data.toString();
        this.logger.debug(`接收到MCP数据: ${data.toString()}`);

        try {
          const lines = buffer.split('\n').filter(line => line.trim());

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!line.startsWith('{') && !line.startsWith('[')) {
              continue;
            }

            try {
              const response = JSON.parse(line);

              // 处理初始化响应
              if (response.id === initRequestId) {
                const toolsListRequest = {
                  jsonrpc: '2.0',
                  id: toolsListRequestId,
                  method: 'tools/list',
                  params: {},
                };
                childProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
                continue;
              }

              // 处理工具列表响应
              if (response.id === toolsListRequestId && response.result && response.result.tools) {
                toolsReceived = true;
                clearTimeout(timeout);
                childProcess.stdout.removeAllListeners('data');
                childProcess.stderr.removeAllListeners('data');
                resolve(response.result.tools);
                return;
              }

              // 向后兼容
              if (response.tools) {
                toolsReceived = true;
                clearTimeout(timeout);
                childProcess.stdout.removeAllListeners('data');
                childProcess.stderr.removeAllListeners('data');
                resolve(response.tools);
                return;
              }
            } catch (lineError) {
              // 继续处理下一行
            }
          }

          buffer =
            lines.length > 0 && !lines[lines.length - 1].endsWith('}')
              ? lines[lines.length - 1]
              : '';
        } catch (e) {
          if (!toolsReceived) {
            this.logger.debug(`解析输出失败，继续等待: ${e.message}`);
          }
        }
      };

      childProcess.stdout.on('data', dataHandler);
      childProcess.stderr.on('data', errorHandler);

      // 发送初始化请求
      setTimeout(() => {
        if (!toolsReceived) {
          const initRequest = {
            jsonrpc: '2.0',
            id: initRequestId,
            method: 'initialize',
            params: {
              protocolVersion: '0.1.0',
              capabilities: {
                tools: {},
              },
              clientInfo: {
                name: 'mcp-client',
                version: '1.0.0',
              },
            },
          };

          try {
            childProcess.stdin.write(JSON.stringify(initRequest) + '\n');
          } catch (writeError) {
            this.logger.error('无法发送初始化请求:', writeError);
          }
        }
      }, 2000);
    });
  }

  /**
   * 检查连接状态
   * @param {Object} instance - MCP实例
   * @returns {Promise<boolean>} 是否连接
   */
  async checkConnection(instance) {
    if (!instance || !instance.process) {
      return false;
    }

    return !instance.process.killed && instance.process.exitCode === null;
  }

  /**
   * 执行安装配置
   * @private
   */
  async _executeSetup(config) {
    if (!config.setup) return;

    this.logger.info(`检测到安装步骤，开始执行`, {
      command: config.setup.command,
      args: config.setup.args,
    });

    try {
      await this._handleSetupExecution(config);
    } catch (error) {
      this.logger.error(`安装命令执行失败`, {
        error: error.message,
        stack: error.stack,
        command: config.setup.command,
        args: config.setup.args,
      });
      throw error;
    }
  }

  /**
   * 处理安装执行
   * @private
   */
  async _handleSetupExecution(config) {
    let setupCommand = config.setup.command;
    let setupArgs = config.setup.args;
    let useVirtualEnv = false;
    let venvPath = '';
    let workingDir = null;

    // 处理Git仓库克隆
    if (setupCommand === 'git' && setupArgs.includes('clone')) {
      workingDir = this._createGitWorkingDir();
      config.workingDir = workingDir;
    }

    // 处理Python环境
    if (process.platform === 'darwin' && this._isPythonCommand(setupCommand, setupArgs)) {
      const venvSetup = await this._setupPythonVirtualEnv(config);
      if (venvSetup) {
        useVirtualEnv = true;
        venvPath = venvSetup.venvPath;
        setupCommand = venvSetup.command;
        setupArgs = venvSetup.args;
      }
    }

    // 执行安装命令
    await this._runSetupCommand(setupCommand, setupArgs, workingDir);

    return { useVirtualEnv, venvPath };
  }

  /**
   * 创建Git仓库工作目录
   * @private
   */
  _createGitWorkingDir() {
    const instanceId = Date.now().toString();
    const reposBasePath = path.join(__dirname, '../../../../../repos');

    if (!fs.existsSync(reposBasePath)) {
      fs.mkdirSync(reposBasePath, { recursive: true });
    }

    const workingDir = path.join(reposBasePath, instanceId);
    fs.mkdirSync(workingDir, { recursive: true });
    this.logger.info(`创建Git仓库工作目录: ${workingDir}`);

    return workingDir;
  }

  /**
   * 检查是否为Python命令
   * @private
   */
  _isPythonCommand(command, args) {
    return (
      command === 'pip' ||
      command === 'pip3' ||
      command === 'python' ||
      command === 'python3' ||
      (args.includes('pip') && args.includes('-m'))
    );
  }

  /**
   * 设置Python虚拟环境
   * @private
   */
  async _setupPythonVirtualEnv(config) {
    try {
      const instanceId = Date.now().toString();
      const venvBasePath = path.join(__dirname, '../../../../../venvs');

      if (!fs.existsSync(venvBasePath)) {
        fs.mkdirSync(venvBasePath, { recursive: true });
      }

      const venvPath = path.join(venvBasePath, instanceId);
      this.logger.info(`将创建虚拟环境: ${venvPath}`);

      // 创建虚拟环境
      await this._createVirtualEnvironment(venvPath);

      // 配置使用虚拟环境
      const venvPythonPath = path.join(venvPath, 'bin', 'python');
      let setupArgs = [...config.setup.args];

      if (setupArgs.includes('-m') && setupArgs.includes('pip')) {
        // 保持 -m pip 格式
      } else {
        const packageIndex = setupArgs.indexOf('install') + 1;
        setupArgs = ['-m', 'pip', 'install'];
        if (packageIndex > 0 && packageIndex < config.setup.args.length) {
          setupArgs.push(config.setup.args[packageIndex]);
        }
      }

      return {
        venvPath,
        command: venvPythonPath,
        args: setupArgs,
      };
    } catch (error) {
      this.logger.error(`虚拟环境设置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 创建虚拟环境
   * @private
   */
  async _createVirtualEnvironment(venvPath) {
    return new Promise((resolve, reject) => {
      const createVenvProcess = spawn('python3', ['-m', 'venv', venvPath], {
        shell: process.platform === 'win32',
        env: { ...process.env },
      });

      let venvError = '';

      createVenvProcess.stderr.on('data', data => {
        venvError += data.toString();
        this.logger.error(`创建虚拟环境错误: ${data.toString().trim()}`);
      });

      createVenvProcess.on('exit', code => {
        if (code === 0) {
          this.logger.info(`虚拟环境创建成功: ${venvPath}`);
          resolve();
        } else {
          reject(new Error(`虚拟环境创建失败: ${venvError}`));
        }
      });

      createVenvProcess.on('error', err => {
        reject(err);
      });
    });
  }

  /**
   * 运行安装命令
   * @private
   */
  async _runSetupCommand(command, args, workingDir) {
    return new Promise((resolve, reject) => {
      this.logger.info(`开始执行安装命令: ${command} ${args.join(' ')}`);

      const spawnOptions = {
        shell: process.platform === 'win32',
        env: { ...process.env },
      };

      if (workingDir) {
        spawnOptions.cwd = workingDir;
      }

      const setupProcess = spawn(command, args, spawnOptions);
      let setupOutput = '';
      let setupError = '';

      setupProcess.stdout.on('data', data => {
        setupOutput += data.toString();
        this.logger.info(`安装输出: ${data.toString().trim()}`);
      });

      setupProcess.stderr.on('data', data => {
        setupError += data.toString();
        this.logger.error(`安装错误: ${data.toString().trim()}`);
      });

      setupProcess.on('error', error => {
        reject(new Error(`安装进程错误: ${error.message}`));
      });

      setupProcess.on('exit', code => {
        if (code === 0) {
          this.logger.info(`安装成功完成`);
          resolve();
        } else {
          const errorMessage = this._getSetupErrorMessage(command, code, setupError);
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * 获取安装错误消息
   * @private
   */
  _getSetupErrorMessage(command, code, error) {
    let errorMessage = `安装失败，退出码: ${code}`;

    if (error.includes('No module named pip')) {
      errorMessage = `${command} 没有pip模块。请先安装pip`;
    } else if (error.includes('not found') || code === 127) {
      errorMessage = `找不到命令 ${command}。请确保它已安装并在PATH中`;
    } else if (error.includes('Permission denied')) {
      errorMessage = `权限不足，无法安装。尝试使用管理员权限或添加 --user 标志`;
    } else if (error.includes('externally-managed-environment')) {
      errorMessage = `Python环境为外部管理环境，无法直接安装包。请使用虚拟环境`;
    }

    return errorMessage + (error ? `\n错误信息: ${error}` : '');
  }

  /**
   * 创建MCP进程
   * @private
   */
  async _createMcpProcess(config) {
    let executableCmd;
    let args;
    let env = config.env || {};

    if (typeof config === 'string') {
      const parts = config.trim().split(' ');
      executableCmd = parts[0];
      args = parts.slice(1);
    } else if (config.command && config.args) {
      executableCmd = config.command;
      args = Array.isArray(config.args) ? config.args : [];
      env = { ...process.env, ...config.env };
    } else {
      throw new Error('无效的命令配置');
    }

    this.logger.info(`执行命令: ${executableCmd}, 参数: ${args.join(' ')}`);

    const spawnOptions = {
      env,
      shell: process.platform === 'win32',
    };

    if (config.workingDir) {
      spawnOptions.cwd = config.workingDir;
    }

    const childProcess = spawn(executableCmd, args, spawnOptions);

    this._setupProcessListeners(childProcess, executableCmd);

    return {
      process: childProcess,
      clientType: 'stdio',
      command: executableCmd,
      args,
      env: config.env,
    };
  }

  /**
   * 设置进程监听器
   * @private
   */
  _setupProcessListeners(childProcess, command) {
    childProcess.on('error', error => {
      this.logger.error(`进程启动错误: ${error.message}`);
    });

    childProcess.on('exit', code => {
      this.logger.info(`MCP进程退出，退出码: ${code}`);
    });

    childProcess.stdout.on('data', data => {
      this.logger.debug(`MCP 输出: ${data.toString()}`);
    });

    childProcess.stderr.on('data', data => {
      this.logger.error(`MCP错误输出: ${data}`);
    });
  }
}

module.exports = StdioMcpConnector;
