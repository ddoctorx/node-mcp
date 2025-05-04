// 加载环境变量 - 必须在最顶部
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const socketIo = require('socket.io');
const openai = require('./openai');
const axios = require('axios');
const fs = require('fs');

// 导入新架构组件
const registry = require('./registry');
const mcpPoolModule = require('./mcp-pool');
const lifecycleManager = require('./lifecycle-manager');
const proxy = require('./proxy');
const { logger } = require('./logger');

// 预定义的MCP服务器配置
let predefinedMcpServers = {};

// 尝试加载MCP服务器配置文件
try {
  const configPath = path.join(__dirname, '../config/mcp-servers.json');
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    if (config.mcpServers) {
      predefinedMcpServers = config.mcpServers;
      logger.info(`已加载预定义MCP服务器配置`, {
        servers: Object.keys(predefinedMcpServers),
      });
    }
  }
} catch (error) {
  logger.error(`加载MCP服务器配置失败`, { error: error.message });
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 服务配置
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
// 修改静态文件路径指向out目录
// app.use(express.static(path.join(__dirname, '../frontend/out')));
app.use(express.static(path.join(__dirname, '../public')));

// 存储所有会话
const sessions = {};

// 用户映射 - 存储用户拥有的会话
const userSessions = {};

// 存储聊天历史
const chatHistories = {};

// 初始化MCP服务池
const mcpPool = mcpPoolModule.init({
  createStdioMcp: createStdioMcpFactory,
  createSseMcp: createSseMcpFactory,
});
logger.info('MCP服务池已初始化');

// 初始化生命周期管理器
const lifecycleController = lifecycleManager.init(
  {
    // 默认配置
    checkInterval: 60 * 1000, // 1分钟检查一次
    idleTimeout: 5 * 60 * 1000, // 5分钟无活动则回收
    autoCleanup: true,
  },
  // 终止实例的回调函数
  async (instanceId, mcpSession) => {
    return await mcpPool.removeMcpInstance(instanceId);
  },
);
logger.info('生命周期管理器已初始化', {
  checkInterval: '60秒',
  idleTimeout: '5分钟',
  autoCleanup: true,
});

// 创建并集成反向代理路由
const proxyRouter = proxy.createProxyRouter(mcpPool);
app.use('/api/proxy', proxyRouter);
logger.info('反向代理路由已创建并集成');

// 创建新会话
function createSession(userId) {
  const sessionId = uuidv4();

  // 使用真实的用户ID，如果没有则生成一个
  const actualUserId = userId || `anonymous-${uuidv4()}`;

  sessions[sessionId] = {
    id: sessionId,
    userId: actualUserId,
    mcpSessions: {},
    createdAt: new Date(),
  };

  // 将会话添加到用户的会话列表中
  if (!userSessions[actualUserId]) {
    userSessions[actualUserId] = new Set();
  }
  userSessions[actualUserId].add(sessionId);

  // 新增：加载用户在其他会话中的MCP实例
  if (actualUserId && !actualUserId.startsWith('anonymous-')) {
    logger.info(`开始为用户[${actualUserId}]加载实例到会话[${sessionId}]`);

    const userInstances = registry.findUserInstances(actualUserId);
    userInstances.forEach(instance => {
      logger.debug(`准备加载实例[${instance.instanceId}]到会话[${sessionId}]`);

      // 将实例关联到新会话
      if (instance.mcpSession) {
        // 创建MCP会话对象，保留所有必要的属性
        const mcpSessionObj = {
          instanceId: instance.instanceId,
          name: instance.mcpSession.name,
          clientType: instance.mcpSession.clientType,
          tools: instance.mcpSession.tools,
          status: instance.mcpSession.status,
          command: instance.mcpSession.command,
          args: instance.mcpSession.args,
          env: instance.mcpSession.env,
          url: instance.mcpSession.url,
          isExternal: instance.mcpSession.isExternal || true,
        };

        // 针对不同类型的MCP添加特殊属性
        if (instance.mcpSession.clientType === 'stdio' && instance.mcpSession.process) {
          mcpSessionObj.process = instance.mcpSession.process;
          logger.info(`已为实例[${instance.instanceId}]复制进程对象到会话[${sessionId}]`);
        } else if (instance.mcpSession.clientType === 'sse') {
          mcpSessionObj.heartbeatInterval = instance.mcpSession.heartbeatInterval;
          mcpSessionObj.lastPingTime = instance.mcpSession.lastPingTime;
        }

        // 保存到会话
        sessions[sessionId].mcpSessions[instance.mcpSession.name] = mcpSessionObj;
        registry.associateSessionWithInstance(sessionId, instance.instanceId);
      }
    });

    logger.info(
      `已加载用户 ${actualUserId} 的 ${userInstances.length} 个MCP实例到新会话 ${sessionId}`,
    );
  }

  return { sessionId, userId: actualUserId };
}

// 从MCP进程获取工具列表
async function getToolsFromProcess(childProcess) {
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeout = setTimeout(() => {
      reject(new Error('获取工具列表超时'));
    }, 20000);

    let buffer = '';
    let errorBuffer = '';
    let toolsReceived = false;
    let initRequestId = 1;
    let toolsListRequestId = 2;

    // 监听stderr以捕获错误
    const errorHandler = data => {
      errorBuffer += data.toString();
      console.error(`工具列表获取错误输出: ${data.toString()}`);
    };

    // 监听进程输出
    const dataHandler = data => {
      buffer += data.toString();
      console.log(`接收到MCP数据: ${data.toString()}`);

      try {
        // 尝试解析JSON响应，注意每个响应应该在单独的行上
        const lines = buffer.split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 跳过非JSON的行
          if (!line.startsWith('{') && !line.startsWith('[')) {
            continue;
          }

          try {
            const response = JSON.parse(line);
            console.log(`解析的响应:`, response);

            // 处理初始化响应
            if (response.id === initRequestId) {
              console.log('收到初始化响应，准备请求工具列表');
              // 发送获取工具列表的请求
              const toolsListRequest = {
                jsonrpc: '2.0',
                id: toolsListRequestId,
                method: 'tools/list',
                params: {},
              };
              childProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
              console.log('已发送工具列表请求');
              continue;
            }

            // 处理工具列表响应
            if (response.id === toolsListRequestId && response.result && response.result.tools) {
              toolsReceived = true;
              clearTimeout(timeout);

              // 彻底清理所有事件监听器
              childProcess.stdout.removeAllListeners('data');
              childProcess.stderr.removeAllListeners('data');
              childProcess.removeAllListeners('error');
              childProcess.removeAllListeners('exit');

              console.log(`成功获取工具列表:`, response.result.tools);
              resolve(response.result.tools);
              return;
            }

            // 向后兼容：检查是否包含工具列表（直接格式）
            if (response.tools) {
              toolsReceived = true;
              clearTimeout(timeout);

              // 彻底清理所有事件监听器
              childProcess.stdout.removeAllListeners('data');
              childProcess.stderr.removeAllListeners('data');
              childProcess.removeAllListeners('error');
              childProcess.removeAllListeners('exit');

              console.log(`成功获取工具列表（直接格式）:`, response.tools);
              resolve(response.tools);
              return;
            }
          } catch (lineError) {
            console.log(`尝试解析行失败: ${line}`);
          }
        }

        // 如果成功获取了工具列表，彻底清空缓冲区
        if (toolsReceived) {
          buffer = '';
          return;
        } else {
          // 保留未解析的行
          // 只保留最后一个不完整的行（如果有的话）
          const lastLine = lines[lines.length - 1];
          if (lastLine && !lastLine.endsWith('}')) {
            buffer = lastLine;
          } else {
            buffer = '';
          }
        }
      } catch (e) {
        if (!toolsReceived) {
          console.log(`解析输出失败，继续等待: ${e.message}`);
        }
      }
    };

    childProcess.stdout.on('data', dataHandler);
    childProcess.stderr.on('data', errorHandler);

    // 添加进程错误和退出处理
    childProcess.on('error', err => {
      clearTimeout(timeout);
      childProcess.stdout.removeListener('data', dataHandler);
      childProcess.stderr.removeListener('data', errorHandler);
      reject(new Error(`获取工具列表时进程错误: ${err.message}`));
    });

    childProcess.on('exit', code => {
      if (code !== 0 && !toolsReceived) {
        clearTimeout(timeout);
        childProcess.stdout.removeListener('data', dataHandler);
        childProcess.stderr.removeListener('data', errorHandler);
        reject(new Error(`进程非正常退出，退出码: ${code}`));
      }
    });

    // 等待进程稳定后，发送初始化请求
    setTimeout(() => {
      if (!toolsReceived) {
        console.log('发送初始化请求...');

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
          console.log('已发送初始化请求:', JSON.stringify(initRequest));
        } catch (writeError) {
          console.error('无法发送初始化请求:', writeError);
        }
      }
    }, 2000); // 给进程2秒时间启动
  });
}

// 调用远程MCP工具（保持不变）
async function callRemoteMcpTool(mcpSession, toolName, params) {
  console.log(`准备调用远程MCP工具: ${toolName}, 参数:`, params);

  return new Promise((resolve, reject) => {
    // 检查MCP会话是否有效且有进程对象
    if (!mcpSession) {
      console.error(`无效的MCP会话`);
      return reject(new Error('无效的MCP会话'));
    }

    if (!mcpSession.process) {
      console.error(`MCP会话没有有效的进程对象`);
      return reject(new Error('MCP会话没有有效的进程对象'));
    }

    if (!toolName) {
      console.error(`工具名称不能为空`);
      return reject(new Error('工具名称不能为空'));
    }

    // 确保params是对象
    const safeParams = params && typeof params === 'object' ? params : {};

    // 设置超时
    const timeout = setTimeout(() => {
      console.error(`工具调用超时: ${toolName}`);
      cleanup();
      reject(new Error('工具调用超时'));
    }, 30000);

    // 生成请求ID
    const requestId = 1000 + Math.floor(Math.random() * 9000);

    // 构建MCP协议请求
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: safeParams,
      },
    };

    console.log(`发送调用请求:`, JSON.stringify(request, null, 2));

    let buffer = '';
    let errorOutput = '';
    let responseReceived = false;

    // 监听进程的错误输出
    const errorHandler = data => {
      const errorData = data.toString();
      errorOutput += errorData;
      console.error(`工具 ${toolName} 错误输出:`, errorData);
    };

    // 清理函数，确保只执行一次
    const cleanup = () => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timeout);
        mcpSession.process.stdout.removeListener('data', dataHandler);
        mcpSession.process.stderr.removeListener('data', errorHandler);
      }
    };

    // 监听进程输出
    const dataHandler = data => {
      if (responseReceived) return; // 如果已经收到响应，忽略后续输出

      const chunk = data.toString();
      buffer += chunk;
      console.log(`收到工具 ${toolName} 输出:`, chunk);

      try {
        // 尝试逐行解析 - 可能有多行输出
        const lines = buffer.split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.startsWith('{')) continue;

          try {
            const response = JSON.parse(line);
            console.log(`成功解析JSON响应:`, response);

            // 先处理标准JSON-RPC 2.0请求，ID匹配的情况
            if (response.jsonrpc === '2.0' && response.id === requestId) {
              console.log(`找到匹配的响应，ID: ${requestId}`);
              cleanup(); // 清理事件监听和超时

              if (response.error) {
                console.error(`工具 ${toolName} 返回错误:`, response.error);
                reject(new Error(response.error.message || '工具调用失败'));
              } else if (response.result !== undefined) {
                console.log(`工具 ${toolName} 调用成功:`, response.result);
                resolve(response.result);
              } else {
                reject(new Error('无效的工具调用响应'));
              }
              return;
            }

            // 即使ID不匹配，也尝试处理兼容模式（重要！）
            // 这是针对market-trending和stock-quote等工具的特殊处理
            if (response.jsonrpc === '2.0' && response.result) {
              console.log(
                `收到带有结果的JSON-RPC响应，请求ID不匹配 (实际: ${response.id}, 预期: ${requestId})，但继续处理`,
              );

              // 特别处理特定工具类型
              if (
                (toolName === 'market-trending' || toolName === 'stock-quote') &&
                typeof response.result === 'object'
              ) {
                console.log(`检测到${toolName}工具返回，使用兼容模式处理结果`);
                cleanup();
                resolve(response.result);
                return;
              }
            }
          } catch (lineError) {
            // 这行不是有效的JSON或不匹配当前请求，继续
            console.log(`解析输出行失败: ${line}, 错误: ${lineError.message}`);
          }
        }

        // 尝试解析完整的JSON对象（补充处理，处理跨行情况）
        if (!responseReceived && buffer.includes('{') && buffer.includes('}')) {
          try {
            // 查找可能的完整JSON对象
            const jsonStart = buffer.indexOf('{');
            let jsonEnd = -1;
            let bracketCount = 0;

            for (let i = jsonStart; i < buffer.length; i++) {
              if (buffer[i] === '{') bracketCount++;
              if (buffer[i] === '}') bracketCount--;

              if (bracketCount === 0) {
                jsonEnd = i;
                break;
              }
            }

            if (jsonEnd !== -1) {
              const jsonStr = buffer.substring(jsonStart, jsonEnd + 1);
              console.log(`尝试解析跨行JSON: ${jsonStr}`);

              const response = JSON.parse(jsonStr);

              // 处理标准JSON-RPC 2.0响应
              if (response.jsonrpc === '2.0') {
                if (response.id === requestId) {
                  console.log(`找到匹配的跨行响应，ID: ${requestId}`);
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
                if (
                  response.result &&
                  (toolName === 'market-trending' || toolName === 'stock-quote') &&
                  typeof response.result === 'object'
                ) {
                  console.log(`检测到${toolName}工具跨行响应，使用兼容模式处理结果`);
                  cleanup();
                  resolve(response.result);
                  return;
                }
              }
            }
          } catch (e) {
            console.log(`跨行JSON解析失败: ${e.message}`);
          }
        }

        // 使用最后一行或空字符串更新缓冲区
        buffer =
          lines.length > 0 && !lines[lines.length - 1].endsWith('}') ? lines[lines.length - 1] : '';
      } catch (e) {
        console.log(`解析输出失败，继续等待: ${e.message}`);
      }
    };

    // 设置错误处理
    mcpSession.process.on('error', error => {
      cleanup();
      console.error(`工具 ${toolName} 调用过程发生错误:`, error);
      reject(new Error(`MCP进程错误: ${error.message}`));
    });

    // 监听输出
    mcpSession.process.stdout.on('data', dataHandler);
    mcpSession.process.stderr.on('data', errorHandler);

    // 发送请求
    try {
      mcpSession.process.stdin.write(JSON.stringify(request) + '\n');
      console.log(`已发送请求到MCP进程`);
    } catch (writeError) {
      cleanup();
      console.error(`向MCP发送请求失败:`, writeError);
      reject(new Error(`发送请求失败: ${writeError.message}`));
    }
  });
}

// 从stdio创建MCP实例的工厂函数
async function createStdioMcpFactory(config, instanceId) {
  try {
    // 检查是否需要先执行安装步骤
    if (config.setup) {
      logger.info(`检测到安装步骤，开始执行`, {
        command: config.setup.command,
        args: config.setup.args,
      });

      try {
        // 检查setup命令是否存在
        let setupCommand = config.setup.command;
        let setupArgs = config.setup.args;
        let useVirtualEnv = false;
        let venvPath = '';

        // 为Git仓库创建工作目录
        let workingDir = null;
        if (setupCommand === 'git' && setupArgs.includes('clone')) {
          logger.info(`检测到Git克隆操作，将创建工作目录`);

          try {
            // 为每个仓库实例创建唯一的工作目录
            const reposBasePath = path.join(__dirname, '../repos');

            // 确保基础目录存在
            if (!fs.existsSync(reposBasePath)) {
              fs.mkdirSync(reposBasePath, { recursive: true });
            }

            // 使用实例ID创建唯一的仓库目录
            workingDir = path.join(reposBasePath, instanceId);
            logger.info(`创建Git仓库工作目录: ${workingDir}`);

            // 创建目录
            fs.mkdirSync(workingDir, { recursive: true });

            // 修改运行命令的工作目录
            if (config.command) {
              logger.info(`将设置MCP命令工作目录为: ${workingDir}`);
              config.workingDir = workingDir;
            }
          } catch (dirError) {
            logger.error(`创建仓库工作目录失败: ${dirError.message}`);
            return {
              success: false,
              error: `创建仓库工作目录失败: ${dirError.message}`,
            };
          }
        }

        // 特殊情况: 当Python或pip命令不可用时尝试替代方案
        if (
          !setupCommand ||
          setupCommand === 'pip' ||
          setupCommand === 'pip3' ||
          setupCommand === 'python' ||
          setupCommand === 'python3'
        ) {
          try {
            logger.info(`验证${setupCommand}命令是否可用`);
            // 根据不同操作系统使用不同的命令检查
            const isWindows = process.platform === 'win32';
            const checkCommand = isWindows ? 'where' : 'which';

            const whichPipProcess = spawn(checkCommand, [setupCommand]);
            const pipPath = await new Promise((resolve, reject) => {
              let output = '';
              whichPipProcess.stdout.on('data', data => {
                output += data.toString().trim();
              });
              whichPipProcess.on('close', code => {
                if (code === 0 && output) {
                  resolve(output);
                } else {
                  reject(new Error(`${setupCommand}命令不可用，退出码: ${code}`));
                }
              });
              whichPipProcess.on('error', err => {
                reject(err);
              });
            });

            if (pipPath) {
              logger.info(`找到${setupCommand}命令路径: ${pipPath}`);
            }
          } catch (pipCheckError) {
            logger.warn(`${setupCommand}命令不可用，尝试使用替代方案`, {
              error: pipCheckError.message,
            });

            // 尝试通过which命令查找可能的Python路径
            try {
              // 尝试常见的Homebrew Python路径
              const homebrewPythonPaths = [
                '/opt/homebrew/bin/python3',
                '/opt/homebrew/opt/python/bin/python3',
                '/opt/homebrew/opt/python@3/bin/python3',
                '/usr/local/bin/python3',
                '/usr/bin/python3',
              ];

              // 检测macOS上的Homebrew Python
              if (process.platform === 'darwin') {
                for (const pythonPath of homebrewPythonPaths) {
                  try {
                    await fs.promises.access(pythonPath, fs.constants.X_OK);
                    logger.info(`找到可用的Python路径: ${pythonPath}`);

                    // 如果是pip命令，转换为使用Python -m pip
                    if (setupCommand === 'pip' || setupCommand === 'pip3') {
                      setupCommand = pythonPath;
                      setupArgs = ['-m', 'pip', ...setupArgs];
                      logger.info(`已转换为使用: ${setupCommand} ${setupArgs.join(' ')}`);
                      break;
                    }
                    // 如果是python命令，直接使用找到的Python
                    else if (setupCommand === 'python' || setupCommand === 'python3') {
                      setupCommand = pythonPath;
                      logger.info(`已转换为使用: ${setupCommand}`);
                      break;
                    }
                  } catch (err) {
                    // 路径不存在或不可执行，继续尝试下一个
                    logger.debug(`Python路径不可用: ${pythonPath}`);
                  }
                }
              }

              // 如果都找不到，使用config.command（主命令）
              if ((setupCommand === 'pip' || setupCommand === 'pip3') && config.command) {
                setupCommand = config.command;
                setupArgs = ['-m', 'pip', ...setupArgs];
                logger.info(`转为使用主命令: ${setupCommand} ${setupArgs.join(' ')}`);
              }
            } catch (pathCheckError) {
              logger.error(`查找Python路径失败`, { error: pathCheckError.message });
            }
          }
        }

        // 在macOS上自动使用虚拟环境（解决externally-managed-environment问题）
        if (
          process.platform === 'darwin' &&
          (setupArgs.includes('pip') || (setupArgs.includes('-m') && setupArgs.includes('pip')))
        ) {
          logger.info(`检测到macOS环境，将使用虚拟环境安装Python包`);

          try {
            // 为每个MCP实例创建唯一的虚拟环境路径
            const venvBasePath = path.join(__dirname, '../venvs');

            // 确保目录存在
            if (!fs.existsSync(venvBasePath)) {
              fs.mkdirSync(venvBasePath, { recursive: true });
            }

            // 使用实例ID创建唯一的虚拟环境名称
            venvPath = path.join(venvBasePath, instanceId);
            logger.info(`将创建虚拟环境: ${venvPath}`);

            // 1. 创建虚拟环境
            logger.info(`开始创建Python虚拟环境...`);
            const createVenvProcess = spawn(setupCommand, ['-m', 'venv', venvPath], {
              shell: process.platform === 'win32',
              env: { ...process.env },
            });

            await new Promise((resolve, reject) => {
              let venvError = '';

              createVenvProcess.stderr.on('data', data => {
                venvError += data.toString();
                logger.error(`创建虚拟环境错误: ${data.toString().trim()}`);
              });

              createVenvProcess.on('exit', code => {
                if (code === 0) {
                  logger.info(`虚拟环境创建成功: ${venvPath}`);
                  resolve();
                } else {
                  logger.error(`虚拟环境创建失败，退出码: ${code}`);
                  reject(new Error(`虚拟环境创建失败: ${venvError}`));
                }
              });

              createVenvProcess.on('error', err => {
                logger.error(`虚拟环境创建进程错误: ${err.message}`);
                reject(err);
              });
            });

            // 2. 确定虚拟环境中的Python解释器路径
            const isWindows = process.platform === 'win32';
            const venvPythonPath = isWindows
              ? path.join(venvPath, 'Scripts', 'python.exe')
              : path.join(venvPath, 'bin', 'python');

            logger.info(`虚拟环境Python解释器路径: ${venvPythonPath}`);

            // 3. 使用虚拟环境中的pip安装包
            const originalSetupArgs = [...setupArgs];

            // 修改安装命令，使用虚拟环境中的Python
            setupCommand = venvPythonPath;

            // 如果安装命令是python -m pip install xxx，保持这种格式
            if (originalSetupArgs.includes('-m') && originalSetupArgs.includes('pip')) {
              // 保持原来的参数不变，因为我们已经修改了setupCommand指向虚拟环境的Python
            } else {
              // 否则重构为使用pip模块
              const packageIndex = originalSetupArgs.indexOf('install') + 1;
              setupArgs = ['-m', 'pip', 'install'];

              if (packageIndex > 0 && packageIndex < originalSetupArgs.length) {
                setupArgs.push(originalSetupArgs[packageIndex]);
              }
            }

            useVirtualEnv = true;
            logger.info(`将使用虚拟环境安装包: ${setupCommand} ${setupArgs.join(' ')}`);
          } catch (venvError) {
            logger.error(`虚拟环境设置失败: ${venvError.message}`);
            return {
              success: false,
              error: `虚拟环境设置失败: ${venvError.message}`,
            };
          }
        }

        // 执行安装命令
        logger.info(`开始执行安装命令: ${setupCommand} ${setupArgs.join(' ')}`);

        // 对于Windows，某些命令可能需要使用不同的选项
        const spawnOptions = {
          shell: process.platform === 'win32', // 在Windows上使用shell
          env: { ...process.env }, // 继承环境变量
        };

        // 如果设置了工作目录，添加到选项中
        if (workingDir) {
          spawnOptions.cwd = workingDir;
          logger.info(`在工作目录 ${workingDir} 中执行安装命令`);
        }

        const setupProcess = spawn(setupCommand, setupArgs, spawnOptions);

        return new Promise((resolve, reject) => {
          let setupOutput = '';
          let setupError = '';

          setupProcess.stdout.on('data', data => {
            setupOutput += data.toString();
            logger.info(`安装输出: ${data.toString().trim()}`);
          });

          setupProcess.stderr.on('data', data => {
            setupError += data.toString();
            logger.error(`安装错误: ${data.toString().trim()}`);
          });

          setupProcess.on('error', error => {
            logger.error(`安装进程错误: ${error.message}`, {
              command: setupCommand,
              args: setupArgs,
              error: error.toString(),
              code: error.code,
              path: error.path,
              syscall: error.syscall,
            });

            let helpfulMessage = `安装失败: ${error.message}. 请确保 ${setupCommand} 已安装并在PATH中.`;

            // 添加macOS特定提示
            if (process.platform === 'darwin' && error.code === 'ENOENT') {
              helpfulMessage += `\n\n在macOS上，您可能需要使用Homebrew安装Python:\n`;
              helpfulMessage += `brew install python3\n\n`;
              helpfulMessage += `或者在前端页面中输入完整的Python路径，例如:\n`;
              helpfulMessage += `/opt/homebrew/bin/python3 或 /usr/bin/python3`;
            }

            reject({
              success: false,
              error: helpfulMessage,
            });
          });

          setupProcess.on('exit', code => {
            if (code === 0) {
              logger.info(`安装成功完成`, { command: setupCommand });
              // 继续正常的MCP创建流程，如果使用虚拟环境，则使用虚拟环境中的Python
              if (useVirtualEnv) {
                // 修改主命令配置，使用虚拟环境中的解释器
                const isWindows = process.platform === 'win32';
                const venvPythonPath = isWindows
                  ? path.join(venvPath, 'Scripts', 'python.exe')
                  : path.join(venvPath, 'bin', 'python');

                // 创建新的配置使用虚拟环境
                const venvConfig = { ...config };
                venvConfig.command = venvPythonPath;

                logger.info(`使用虚拟环境中的Python执行MCP: ${venvPythonPath}`);
                resolve(createMcpProcess(venvConfig, instanceId));
              } else {
                resolve(createMcpProcess(config, instanceId));
              }
            } else {
              logger.error(`安装失败，退出码: ${code}`, {
                command: setupCommand,
                output: setupOutput,
                error: setupError,
              });

              // 尝试给出更具体的错误信息
              let errorMessage = `安装失败，退出码: ${code}`;

              if (setupError.includes('No module named pip')) {
                errorMessage = `${setupCommand} 没有pip模块。请先安装pip`;
              } else if (setupError.includes('not found') || code === 127) {
                errorMessage = `找不到命令 ${setupCommand}。请确保它已安装并在PATH中`;
              } else if (
                setupOutput.includes('Permission denied') ||
                setupError.includes('Permission denied')
              ) {
                errorMessage = `权限不足，无法安装。尝试使用管理员权限或添加 --user 标志`;
              } else if (setupError.includes('externally-managed-environment')) {
                errorMessage = `Python环境为外部管理环境，无法直接安装包。请使用虚拟环境或添加 --break-system-packages 标志`;
                // 添加macOS提示
                if (process.platform === 'darwin') {
                  errorMessage += `\n\n请尝试使用以下命令创建虚拟环境:\n`;
                  errorMessage += `python3 -m venv ./venv\n`;
                  errorMessage += `source ./venv/bin/activate\n`;
                  errorMessage += `pip install mcp-server-fetch`;
                }
              }

              // 添加macOS提示
              if (process.platform === 'darwin') {
                errorMessage += `\n\n在macOS上，您可能需要使用Homebrew安装Python:\nbrew install python3\n`;
                errorMessage += `或尝试在前端页面选择其他Python命令，例如：/opt/homebrew/bin/python3`;
              }

              reject({
                success: false,
                error: errorMessage + (setupError ? `\n错误信息: ${setupError}` : ''),
              });
            }
          });
        });
      } catch (setupError) {
        logger.error(`安装命令执行失败`, {
          error: setupError.message,
          stack: setupError.stack,
          command: config.setup.command,
          args: config.setup.args,
        });

        let errorMessage = `安装命令执行失败: ${setupError.message}. 可能原因: 1) 命令不存在 2) 权限不足 3) 网络问题`;

        // 添加macOS提示
        if (process.platform === 'darwin') {
          errorMessage += `\n\n在macOS上，您可能需要选择正确的Python路径:\n`;
          errorMessage += `- 如果使用Homebrew: /opt/homebrew/bin/python3\n`;
          errorMessage += `- 或系统Python: /usr/bin/python3`;
        }

        return {
          success: false,
          error: errorMessage,
        };
      }
    }

    // 没有安装步骤，直接创建MCP进程
    return createMcpProcess(config, instanceId);
  } catch (error) {
    logger.error('MCP连接错误:', error);
    return {
      success: false,
      error: `无法连接到MCP: ${error.message}`,
    };
  }
}

// 从配置创建MCP进程的函数
async function createMcpProcess(config, instanceId) {
  try {
    // 根据配置是否包含command和args来决定如何处理
    let executableCmd;
    let args;
    let env = config.env || {};

    if (typeof config === 'string') {
      // 向后兼容：如果config是字符串，按旧方式解析
      const parts = config.trim().split(' ');
      executableCmd = parts[0];
      args = parts.slice(1);
    } else if (config.command && config.args) {
      // 新的配置格式
      executableCmd = config.command;
      args = Array.isArray(config.args) ? config.args : [];
      env = { ...process.env, ...config.env }; // 合并环境变量
    } else {
      return {
        success: false,
        error: '无效的命令配置',
      };
    }

    console.log(`执行命令: ${executableCmd}, 参数: ${args.join(' ')}`);
    if (Object.keys(env).length > 0) {
      console.log(`环境变量:`, Object.keys(env));
    }

    // 检查命令是否在允许的列表中（这里简化处理）
    const allowedExecutables = [
      'node',
      'npm',
      'npx',
      'python',
      'python3',
      'docker',
      'uvx',
      'pip',
      'pip3',
      'git',
      'sh',
      'bash',
    ];
    const baseCmd = executableCmd.split('/').pop().split('\\').pop();

    // 允许直接执行js文件
    if (!allowedExecutables.includes(baseCmd) && !baseCmd.endsWith('.js')) {
      console.error(`命令不在允许列表中: ${baseCmd}`);
      return {
        success: false,
        error: `命令 ${baseCmd} 不在允许的列表中`,
      };
    }

    // 创建子进程
    console.log(`启动子进程: ${executableCmd} ${args.join(' ')}`);

    try {
      // 对于Windows，某些命令可能需要使用不同的选项
      const spawnOptions = {
        env,
        shell: process.platform === 'win32', // 在Windows上使用shell
      };

      // 如果配置中指定了工作目录，则使用它
      if (config.workingDir) {
        console.log(`使用工作目录: ${config.workingDir}`);
        spawnOptions.cwd = config.workingDir;
      }

      const childProcess = spawn(executableCmd, args, spawnOptions);

      childProcess.on('error', error => {
        console.error(`进程启动错误: ${error.message}`);
      });

      // 处理进程退出
      childProcess.on('exit', code => {
        console.log(`MCP进程退出，退出码: ${code}`);
      });

      // 更详细的日志
      childProcess.stdout.on('data', data => {
        console.log(`MCP 输出: ${data.toString()}`);
      });

      // 日志处理
      childProcess.stderr.on('data', data => {
        console.error(`MCP错误输出: ${data}`);
      });

      // 尝试获取工具列表
      let toolsList;
      try {
        // 尝试从MCP服务获取工具列表
        console.log('等待获取工具列表...');
        toolsList = await getToolsFromProcess(childProcess);
        console.log(`从MCP获取的工具列表:`, toolsList);
      } catch (error) {
        console.error(`无法从MCP获取工具列表: ${error.message}`);
        // 不再使用本地工具列表，直接返回错误
        return {
          success: false,
          error: `MCP服务器启动成功，但无法获取工具列表: ${error.message}`,
        };
      }

      // 创建MCP会话对象
      const mcpSession = {
        process: childProcess,
        clientType: 'stdio',
        command: executableCmd,
        args,
        env: config.env, // 保存环境变量配置
        tools: toolsList,
        status: 'connected',
        createdAt: new Date(),
        isExternal: true, // 标记为外部MCP
      };

      console.log(`MCP实例创建成功: ${instanceId}`);
      return {
        success: true,
        mcpSession,
      };
    } catch (spawnError) {
      console.error(`子进程创建失败: ${spawnError.message}`);
      return {
        success: false,
        error: `创建MCP进程失败: ${spawnError.message}`,
      };
    }
  } catch (error) {
    console.error('MCP连接错误:', error);
    return {
      success: false,
      error: `无法连接到MCP: ${error.message}`,
    };
  }
}

// 从SSE服务器创建MCP实例的工厂函数
async function createSseMcpFactory(config, instanceId) {
  try {
    const url = typeof config === 'string' ? config : config.url;

    if (!url) {
      return {
        success: false,
        error: '缺少URL参数',
      };
    }

    console.log(`尝试连接到SSE MCP服务器: ${url}`);

    // 验证服务器是否可用
    const pingResponse = await axios
      .get(`${url}/ping`, {
        timeout: 5000,
      })
      .catch(error => {
        console.error(`SSE服务器ping失败: ${error.message}`);
        throw new Error(`无法连接到SSE服务器: ${error.message}`);
      });

    console.log(`SSE服务器ping成功，状态: ${pingResponse.status}`);

    // 获取工具列表
    let toolsList;
    try {
      // 尝试从SSE服务器获取工具列表
      toolsList = await getToolsFromSseServer(url);
      console.log(`从SSE服务器获取的工具列表:`, toolsList);
    } catch (error) {
      console.error(`无法从SSE服务器获取工具列表: ${error.message}`);
      // 如果无法从SSE服务器获取工具列表，返回错误
      return {
        success: false,
        error: `SSE服务器可用，但无法获取工具列表: ${error.message}`,
      };
    }

    // 设置心跳检测，确保连接有效
    const heartbeatInterval = setInterval(async () => {
      try {
        await axios.get(`${url}/ping`, { timeout: 5000 });
        console.log(`SSE服务器心跳检测成功: ${url}, 实例ID: ${instanceId}`);
      } catch (error) {
        console.error(`SSE服务器心跳检测失败: ${error.message}`);
      }
    }, 30000); // 每30秒检查一次

    // 创建MCP会话对象
    const mcpSession = {
      url,
      clientType: 'sse',
      tools: toolsList,
      status: 'connected',
      createdAt: new Date(),
      isExternal: true,
      lastPingTime: Date.now(),
      heartbeatInterval,
    };

    console.log(`SSE MCP实例创建成功: ${instanceId}`);
    return {
      success: true,
      mcpSession,
    };
  } catch (error) {
    console.error('SSE MCP连接错误:', error);
    return {
      success: false,
      error: `无法连接到SSE MCP: ${error.message}`,
    };
  }
}

// 从SSE服务器获取工具列表
async function getToolsFromSseServer(url) {
  console.log(`尝试从SSE服务器获取工具列表: ${url}`);

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('获取SSE工具列表超时'));
    }, 10000);

    try {
      // 尝试从服务器获取工具列表
      const response = await axios.get(`${url}/tools`, {
        timeout: 8000,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeout);

      if (response.data && response.data.tools) {
        console.log(`成功获取到SSE服务器工具列表: ${JSON.stringify(response.data.tools)}`);
        resolve(response.data.tools);
      } else {
        console.error('SSE服务器返回的数据不包含工具列表');
        reject(new Error('无效的工具列表响应'));
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error(`从SSE服务器获取工具列表失败: ${error.message}`);
      reject(error);
    }
  });
}

// 调用SSE MCP工具
async function callSseMcpTool(mcpSession, toolName, params) {
  console.log(`准备调用SSE MCP工具: ${toolName}, 参数:`, params);

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SSE工具调用超时'));
    }, 30000);

    try {
      // 生成请求ID
      const requestId = `req_${Date.now()}`;

      // 构建请求
      const requestBody = {
        id: requestId,
        tool: toolName,
        params: params || {},
      };

      // 发送POST请求到SSE服务器的工具调用端点
      const response = await axios.post(`${mcpSession.url}/call`, requestBody, {
        timeout: 25000,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      clearTimeout(timeout);

      if (
        response.data &&
        (response.data.result !== undefined || response.data.error !== undefined)
      ) {
        if (response.data.error) {
          console.error(`SSE工具 ${toolName} 返回错误:`, response.data.error);
          reject(new Error(response.data.error || '工具调用失败'));
        } else {
          console.log(`SSE工具 ${toolName} 调用成功`);
          resolve(response.data.result);
        }
      } else {
        reject(new Error('无效的SSE响应格式'));
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error(`调用SSE工具 ${toolName} 失败:`, error.message);
      reject(new Error(`SSE工具调用失败: ${error.message}`));
    }
  });
}

// 更新connectSseMcp函数以支持实际的SSE连接
async function connectSseMcp(sessionId, name, url) {
  if (!sessions[sessionId]) {
    console.log(`会话不存在: ${sessionId}，自动创建新会话`);
    sessionId = createSession('anonymous');
    console.log(`已创建新会话: ${sessionId}`);
  }

  if (sessions[sessionId].mcpSessions[name]) {
    disconnectMcp(sessionId, name);
  }

  try {
    console.log(`尝试连接到SSE MCP服务器: ${url}`);

    // 验证服务器是否可用
    const pingResponse = await axios
      .get(`${url}/ping`, {
        timeout: 5000,
      })
      .catch(error => {
        console.error(`SSE服务器ping失败: ${error.message}`);
        throw new Error(`无法连接到SSE服务器: ${error.message}`);
      });

    console.log(`SSE服务器ping成功，状态: ${pingResponse.status}`);

    // 获取工具列表
    let toolsList;
    try {
      // 尝试从SSE服务器获取工具列表
      toolsList = await getToolsFromSseServer(url);
      console.log(`从SSE服务器获取的工具列表:`, toolsList);
    } catch (error) {
      console.error(`无法从SSE服务器获取工具列表: ${error.message}`);
      // 如果无法从SSE服务器获取工具列表，返回错误
      return {
        success: false,
        error: `SSE服务器可用，但无法获取工具列表: ${error.message}`,
      };
    }

    // 创建SSE会话对象
    sessions[sessionId].mcpSessions[name] = {
      name,
      url,
      clientType: 'sse',
      tools: toolsList,
      status: 'connected',
      createdAt: new Date(),
      isExternal: true, // 现在支持真实外部MCP
      lastPingTime: Date.now(),
    };

    // 设置心跳检测，确保连接有效
    const heartbeatInterval = setInterval(async () => {
      const mcpSession = sessions[sessionId]?.mcpSessions?.[name];
      if (!mcpSession) {
        clearInterval(heartbeatInterval);
        return;
      }

      try {
        await axios.get(`${url}/ping`, { timeout: 5000 });
        mcpSession.lastPingTime = Date.now();

        // 如果状态之前是失败，恢复为已连接
        if (mcpSession.status === 'failed') {
          mcpSession.status = 'connected';
          io.to(sessionId).emit('mcp_status_changed', {
            name,
            status: 'connected',
          });
        }
      } catch (error) {
        console.error(`SSE服务器心跳检测失败: ${error.message}`);
        mcpSession.status = 'failed';
        io.to(sessionId).emit('mcp_status_changed', {
          name,
          status: 'failed',
        });
      }
    }, 30000); // 每30秒检查一次

    // 存储心跳检测间隔ID，以便清理
    sessions[sessionId].mcpSessions[name].heartbeatInterval = heartbeatInterval;

    console.log(`SSE MCP添加成功: ${name}`);
    return {
      success: true,
      mcp: {
        name,
        clientType: 'sse',
        url,
        tools: toolsList,
        status: 'connected',
      },
    };
  } catch (error) {
    console.error('SSE MCP连接错误:', error);
    return {
      success: false,
      error: `无法连接到SSE MCP: ${error.message}`,
    };
  }
}

function disconnectMcp(sessionId, name) {
  if (!sessions[sessionId] || !sessions[sessionId].mcpSessions[name]) {
    return { success: false, error: 'MCP会话不存在' };
  }

  try {
    const mcpSession = sessions[sessionId].mcpSessions[name];

    // 如果是stdio类型，终止进程
    if (mcpSession.clientType === 'stdio' && mcpSession.process) {
      mcpSession.process.kill();
    }

    // 如果是SSE类型，清除心跳检测间隔
    if (mcpSession.clientType === 'sse' && mcpSession.heartbeatInterval) {
      clearInterval(mcpSession.heartbeatInterval);
    }

    // 从会话中删除MCP
    delete sessions[sessionId].mcpSessions[name];

    return { success: true };
  } catch (error) {
    console.error('断开MCP错误:', error);
    return {
      success: false,
      error: `无法断开MCP连接: ${error.message}`,
    };
  }
}

// API端点
app.post('/api/session', (req, res) => {
  const { userId } = req.body;
  const result = createSession(userId);
  res.json({
    success: true,
    sessionId: result.sessionId,
    userId: result.userId,
  });
});

// 更新后的MCP API端点
app.post('/api/mcp', async (req, res) => {
  const {
    sessionId,
    name,
    clientType,
    url,
    command,
    args,
    env,
    fullCommand,
    predefinedServer,
    setup,
  } = req.body;

  console.log('收到添加MCP请求:', {
    sessionId,
    name,
    clientType,
    url: url ? '有值' : undefined,
    command: command ? '有值' : undefined,
    args: args ? '有值' : undefined,
    env: env ? '有值' : undefined,
    setup: setup ? '有值' : undefined,
    fullCommand: fullCommand ? '有值' : undefined,
    predefinedServer: predefinedServer || '无',
  });

  if (!sessionId || !name) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!name) missingParams.push('name');

    console.error(`缺少必要参数: ${missingParams.join(', ')}`);
    return res.status(400).json({
      success: false,
      error: `缺少必要参数: ${missingParams.join(', ')}`,
    });
  }

  // 始终验证会话是否存在，如果不存在则自动创建
  let actualSessionId = sessionId;
  if (!sessions[sessionId]) {
    console.log(`会话 ${sessionId} 不存在，自动创建新会话`);
    const sessionResult = createSession('anonymous');
    actualSessionId = sessionResult.sessionId;
    console.log(`已创建新会话: ${actualSessionId}`);
  }

  // 获取会话的用户ID
  const userId = sessions[actualSessionId].userId;
  logger.info(`为会话[${actualSessionId}]添加MCP，用户ID: [${userId}]`);

  let config;
  try {
    // 检查是否使用预定义服务器
    if (predefinedServer && predefinedMcpServers[predefinedServer]) {
      const serverConfig = predefinedMcpServers[predefinedServer];
      console.log(`使用预定义的MCP服务器: ${predefinedServer}`);

      // 设置客户端类型为stdio（预定义服务器目前仅支持stdio）
      clientType = 'stdio';

      // 使用预定义服务器的配置
      config = {
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: serverConfig.env || {},
        setup: serverConfig.setup || undefined,
      };

      console.log(`预定义服务器配置:`, config);
    } else if (clientType === 'stdio') {
      // 检查是新的配置格式还是旧的命令字符串格式
      if (command && args) {
        // 新的配置格式
        console.log(`准备连接stdio MCP: ${name}, 命令: ${command}, 参数: ${args.join(' ')}`);
        config = { command, args, env, setup }; // 添加setup字段
      } else if (fullCommand) {
        // 向后兼容：旧的完整命令字符串格式
        console.log(`准备连接stdio MCP: ${name}, 命令: ${fullCommand}`);
        config = fullCommand;
      } else {
        console.error('stdio类型缺少必要的命令参数');
        return res.status(400).json({
          success: false,
          error: 'stdio类型需要提供命令参数',
        });
      }
    } else if (clientType === 'sse') {
      if (!url) {
        console.error('缺少URL参数');
        return res.status(400).json({
          success: false,
          error: '缺少URL参数',
        });
      }
      console.log(`准备连接sse MCP: ${name}, URL: ${url}`);
      config = { url };
    } else {
      console.error(`不支持的MCP类型: ${clientType}`);
      return res.status(400).json({
        success: false,
        error: `不支持的MCP类型: ${clientType}`,
      });
    }

    // 使用MCP池获取或创建实例
    const poolResult = await mcpPool.getOrCreateMcpInstance(
      actualSessionId,
      name,
      config,
      clientType,
      userId,
    );

    if (!poolResult.success) {
      console.error(`MCP连接失败:`, poolResult.error);
      return res.status(400).json({
        success: false,
        error: poolResult.error,
      });
    }

    // 在会话中添加MCP引用信息
    if (!sessions[actualSessionId].mcpSessions) {
      sessions[actualSessionId].mcpSessions = {};
    }

    // 获取完整的实例详情，包括进程对象
    const instanceDetail = registry.getInstanceDetail(poolResult.instanceId);

    // 创建MCP会话对象，确保包含所有必要的属性
    const mcpSessionObj = {
      instanceId: poolResult.instanceId,
      name: name,
      ...poolResult.mcp,
    };

    // 从实例详情中添加特定类型必需的属性
    if (instanceDetail && instanceDetail.mcpSession) {
      // 对于stdio类型，确保添加process对象
      if (instanceDetail.mcpSession.clientType === 'stdio' && instanceDetail.mcpSession.process) {
        mcpSessionObj.process = instanceDetail.mcpSession.process;
        logger.info(`为MCP ${name} 添加进程对象到会话 ${actualSessionId}`);
      }
      // 对于SSE类型，添加相关属性
      else if (instanceDetail.mcpSession.clientType === 'sse') {
        mcpSessionObj.heartbeatInterval = instanceDetail.mcpSession.heartbeatInterval;
        mcpSessionObj.lastPingTime = instanceDetail.mcpSession.lastPingTime;
      }
    }

    // 存储实例ID和名称的映射
    sessions[actualSessionId].mcpSessions[name] = mcpSessionObj;

    // 通知所有连接的客户端
    io.to(actualSessionId).emit('mcp_connected', poolResult.mcp);

    // 处理结果
    const result = {
      success: true,
      mcp: poolResult.mcp,
      instanceId: poolResult.instanceId,
      isPooled: true,
      isNew: poolResult.isNew,
    };

    // 如果使用了新会话，返回新会话ID
    if (actualSessionId !== sessionId) {
      result.newSessionId = actualSessionId;
    }

    res.json(result);
  } catch (error) {
    console.error(`处理MCP请求时出错:`, error);
    res.status(500).json({
      success: false,
      error: `添加MCP服务失败: ${error.message}`,
    });
  }
});

// 创建一个适配器函数，用于处理OpenAI函数调用和远程MCP工具调用之间的参数差异
async function mcpToolAdapter(sessionId, mcpName, toolName, params) {
  const startTime = Date.now();
  const { mcpTool } = require('./logger');

  mcpTool.callStarted(sessionId, mcpName, toolName, params);

  if (!sessions[sessionId] || !sessions[sessionId].mcpSessions[mcpName]) {
    const error = new Error(`找不到MCP会话: ${mcpName}`);
    mcpTool.callFailed(sessionId, mcpName, toolName, error);
    throw error;
  }

  // 获取MCP会话信息
  const mcpInfo = sessions[sessionId].mcpSessions[mcpName];
  const instanceId = mcpInfo.instanceId;

  // 获取实例详情
  const instanceDetail = registry.getInstanceDetail(instanceId);
  if (!instanceDetail) {
    const error = new Error(`找不到MCP实例: ${instanceId}`);
    mcpTool.callFailed(sessionId, mcpName, toolName, error);
    throw error;
  }

  // 使用正确的mcpSession对象
  // 优先使用会话中的mcpInfo（可能包含进程对象），如果没有，再使用实例详情中的mcpSession
  const mcpSession = mcpInfo.process ? mcpInfo : instanceDetail.mcpSession;

  // 额外的日志记录和验证
  if (mcpSession.clientType === 'stdio' && !mcpSession.process) {
    logger.error(`严重错误：无法找到进程对象，尝试使用实例详情`, {
      sessionHasProcess: !!mcpInfo.process,
      instanceHasProcess: !!instanceDetail.mcpSession.process,
      mcpName,
      sessionId,
      instanceId,
    });

    // 如果会话中没有process但实例详情中有，则使用实例详情中的
    if (instanceDetail.mcpSession.process) {
      // 更新会话中的process对象以便后续使用
      mcpInfo.process = instanceDetail.mcpSession.process;
      logger.info(`从实例详情中恢复了进程对象到会话`);
    }
  }

  // 获取工具定义，以检查参数规范
  const toolDef = mcpSession.tools.find(t => t.name === toolName);

  if (!toolDef) {
    const error = new Error(`在MCP ${mcpName} 中找不到工具 ${toolName}`);
    mcpTool.callFailed(sessionId, mcpName, toolName, error);
    throw error;
  }

  // 确保参数是对象
  const safeParams = params && typeof params === 'object' ? params : {};

  // 处理必需参数检查，确保工具执行正确
  if (toolDef.parameters && toolDef.parameters.required && toolDef.parameters.required.length > 0) {
    // 检查必需参数是否提供
    const missingParams = toolDef.parameters.required.filter(
      param =>
        safeParams[param] === undefined || safeParams[param] === null || safeParams[param] === '',
    );

    if (missingParams.length > 0) {
      // 对于图像生成等特殊工具，可以添加一些默认值
      if (toolName === 'image-gen' && missingParams.includes('prompt')) {
        const result = {
          error: '缺少必需参数',
          message: '图像生成需要提供prompt参数，请提供描述图像内容的文本',
        };

        mcpTool.callFailed(sessionId, mcpName, toolName, new Error('缺少必需参数prompt'));
        return result;
      }
    }
  }

  try {
    // 更新实例的最后使用时间
    instanceDetail.lastUsedTime = Date.now();

    let result;
    if (mcpSession.isExternal) {
      if (mcpSession.clientType === 'stdio') {
        // 调用远程stdio MCP工具
        result = await callRemoteMcpTool(mcpSession, toolName, safeParams);
      } else if (mcpSession.clientType === 'sse') {
        // 调用远程SSE MCP工具
        result = await callSseMcpTool(mcpSession, toolName, safeParams);
      }
    } else {
      // 调用本地工具
    }

    const responseTime = Date.now() - startTime;
    mcpTool.callCompleted(sessionId, mcpName, toolName, responseTime, result);
    return result;
  } catch (error) {
    mcpTool.callFailed(sessionId, mcpName, toolName, error);
    throw error; // 继续抛出错误，让上层处理
  }
}

// 工具调用API端点
app.post('/api/mcp/call', async (req, res) => {
  const { sessionId, mcpName, tool, params } = req.body;

  logger.info(`收到工具调用请求:`, {
    sessionId,
    mcpName,
    tool,
    params: params ? '参数存在' : '无参数',
  });

  if (!sessionId || !mcpName || !tool) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!mcpName) missingParams.push('mcpName');
    if (!tool) missingParams.push('tool');

    logger.error(`工具调用 - 缺少必要参数: ${missingParams.join(', ')}`);
    return res.status(400).json({
      success: false,
      error: `缺少必要参数: ${missingParams.join(', ')}`,
    });
  }

  // 检查会话是否存在，如果不存在则自动创建
  let actualSessionId = sessionId;
  if (!sessions[sessionId]) {
    logger.info(`聊天API - 会话不存在，自动创建新会话`, { sessionId });
    // 创建新会话并使用它
    const newSession = createSession('anonymous');
    actualSessionId = newSession.sessionId;

    // 初始化聊天历史
    initChatHistory(actualSessionId);

    // 返回新创建的会话ID信息
    logger.info(`已创建新会话，返回新会话ID`, { newSessionId: actualSessionId });

    return res.json({
      success: true,
      newSessionId: actualSessionId,
      message: {
        id: Date.now().toString(),
        role: 'system',
        content: '已创建新会话，请使用新会话ID',
        time: new Date().toISOString(),
      },
    });
  }

  // 获取用户ID
  const userId = sessions[actualSessionId].userId;

  // 检查MCP是否在此会话中
  if (!sessions[actualSessionId].mcpSessions || !sessions[actualSessionId].mcpSessions[mcpName]) {
    logger.info(`在会话 ${actualSessionId} 中找不到MCP ${mcpName}，尝试查找用户的其他会话`);

    // 尝试在用户的其他会话中查找相同名称的MCP
    let foundMcp = false;
    let foundSessionId = null;
    let foundInstance = null;

    // 如果是已认证用户（非匿名用户），先尝试使用registry查找用户实例
    if (userId && !userId.startsWith('anonymous-')) {
      const userInstances = registry.findUserInstances(userId);

      for (const instance of userInstances) {
        if (instance.mcpSession && instance.mcpSession.name === mcpName) {
          foundMcp = true;
          foundInstance = instance;
          logger.info(`在用户 ${userId} 的实例库中找到MCP ${mcpName}`);
          break;
        }
      }

      // 如果找到了实例，将它关联到当前会话
      if (foundMcp && foundInstance) {
        // 将实例关联到当前会话
        sessions[actualSessionId].mcpSessions = sessions[actualSessionId].mcpSessions || {};

        // 创建MCP会话对象，确保保留所有必要的属性
        const mcpSessionObj = {
          instanceId: foundInstance.instanceId,
          name: mcpName,
          clientType: foundInstance.mcpSession.clientType,
          tools: foundInstance.mcpSession.tools,
          status: foundInstance.mcpSession.status,
          command: foundInstance.mcpSession.command,
          args: foundInstance.mcpSession.args,
          env: foundInstance.mcpSession.env,
          url: foundInstance.mcpSession.url,
          isExternal: foundInstance.mcpSession.isExternal || true,
        };

        // 根据客户端类型添加特定属性
        if (foundInstance.mcpSession.clientType === 'stdio' && foundInstance.mcpSession.process) {
          mcpSessionObj.process = foundInstance.mcpSession.process;
          logger.info(`为MCP ${mcpName} 复制进程对象到会话 ${actualSessionId}`);
        } else if (foundInstance.mcpSession.clientType === 'sse') {
          mcpSessionObj.heartbeatInterval = foundInstance.mcpSession.heartbeatInterval;
          mcpSessionObj.lastPingTime = foundInstance.mcpSession.lastPingTime;
        }

        // 保存到会话
        sessions[actualSessionId].mcpSessions[mcpName] = mcpSessionObj;

        // 关联会话与实例
        registry.associateSessionWithInstance(actualSessionId, foundInstance.instanceId);
        logger.info(`已将MCP ${mcpName} 关联到会话 ${actualSessionId}`);
      }
    }

    // 如果没有找到，或者是匿名用户，尝试在所有会话中查找（向后兼容）
    if (!foundMcp) {
      Object.keys(sessions).forEach(sid => {
        if (
          sid !== actualSessionId &&
          sessions[sid].mcpSessions &&
          sessions[sid].mcpSessions[mcpName]
        ) {
          // 对于已认证用户，只从同一用户的会话中查找
          if (userId && !userId.startsWith('anonymous-')) {
            if (sessions[sid].userId === userId) {
              foundMcp = true;
              foundSessionId = sid;
            }
          } else {
            // 匿名用户可以从任何会话查找（保持现有行为）
            foundMcp = true;
            foundSessionId = sid;
          }
        }
      });

      if (foundMcp && foundSessionId) {
        logger.info(`在会话 ${foundSessionId} 中找到了名为 ${mcpName} 的MCP，使用此会话`);

        // 将MCP从其他会话复制到当前会话
        const mcpInfo = sessions[foundSessionId].mcpSessions[mcpName];
        sessions[actualSessionId].mcpSessions = sessions[actualSessionId].mcpSessions || {};

        // 创建MCP会话对象，确保保留所有必要的属性
        const mcpSessionObj = { ...mcpInfo }; // 先复制所有基本属性

        // 针对不同类型的MCP复制特定属性
        if (mcpInfo.clientType === 'stdio' && mcpInfo.process) {
          // 特别确保process对象被正确复制
          mcpSessionObj.process = mcpInfo.process;
          logger.info(
            `从会话 ${foundSessionId} 复制MCP ${mcpName} 的进程对象到会话 ${actualSessionId}`,
          );
        }

        // 保存到会话
        sessions[actualSessionId].mcpSessions[mcpName] = mcpSessionObj;

        // 如果有instanceId，关联会话与实例
        if (mcpInfo.instanceId) {
          registry.associateSessionWithInstance(actualSessionId, mcpInfo.instanceId);
          logger.info(`已将MCP实例 ${mcpInfo.instanceId} 关联到会话 ${actualSessionId}`);
        }
      }
    }

    if (!foundMcp) {
      return res.status(400).json({
        success: false,
        error: `找不到名为 ${mcpName} 的MCP会话`,
      });
    }
  }

  try {
    // 确保参数是一个有效的对象
    const safeParams = params && typeof params === 'object' ? params : {};

    // 调用工具
    const result = await mcpToolAdapter(actualSessionId, mcpName, tool, safeParams);

    logger.info(`工具调用成功: ${tool}，结果:`, result);

    // 如果使用的是重定向的会话ID，在返回结果中包含
    const response = {
      success: true,
      result,
    };

    if (actualSessionId !== sessionId) {
      response.sessionId = actualSessionId;
    }

    res.json(response);
  } catch (error) {
    logger.error(`工具调用失败: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `工具调用失败: ${error.message}`,
    });
  }
});

// 初始化聊天历史
function initChatHistory(sessionId) {
  if (!chatHistories[sessionId]) {
    chatHistories[sessionId] = [];
  }
  return chatHistories[sessionId];
}

// 聊天API端点
app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  logger.info(`收到聊天请求`, {
    sessionId,
    messageLength: message ? message.length : 0,
  });

  if (!sessionId || !message) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!message) missingParams.push('message');

    logger.error(`聊天API - 缺少必要参数`, { missingParams });
    return res.status(400).json({
      success: false,
      error: `缺少必要参数: ${missingParams.join(', ')}`,
    });
  }

  // 检查会话是否存在
  if (!sessions[sessionId]) {
    logger.error(`聊天API - 会话不存在`, { sessionId });
    return res.status(404).json({
      success: false,
      error: '会话不存在',
    });
  }

  try {
    // 初始化或获取聊天历史
    const chatHistory = initChatHistory(sessionId);

    // 添加用户消息到历史
    chatHistory.push({
      role: 'user',
      content: message,
    });

    // 准备工具列表
    const allTools = [];
    const mcpSessions = sessions[sessionId].mcpSessions;

    // 收集所有MCP工具并转换为OpenAI格式
    for (const mcpName in mcpSessions) {
      const mcpSession = mcpSessions[mcpName];
      if (mcpSession.tools && mcpSession.tools.length > 0) {
        const openaiTools = openai.convertMcpToolsToOpenAIFormat(mcpSession.tools);
        allTools.push(...openaiTools);
      }
    }

    logger.info(`为会话准备工具完成`, { sessionId, toolCount: allTools.length });

    // 调用OpenAI API
    const response = await openai.callChatCompletion(
      chatHistory,
      allTools.length > 0 ? allTools : null,
    );

    // 处理OpenAI响应，包括可能的函数调用
    const processedResponse = await openai.handleFunctionCalling(
      response,
      sessionId,
      mcpSessions,
      mcpToolAdapter,
    );

    // 根据响应类型处理
    if (processedResponse.type === 'text') {
      // 添加助手回复到聊天历史
      chatHistory.push({
        role: 'assistant',
        content: processedResponse.content,
      });

      res.json({
        success: true,
        type: 'text',
        content: processedResponse.content,
      });
    } else if (processedResponse.type === 'function_call') {
      // 处理函数调用的情况

      // 记录函数调用到聊天历史
      chatHistory.push({
        role: 'assistant',
        content: null,
        tool_calls: processedResponse.calls,
      });

      // 添加函数结果到聊天历史
      for (const result of processedResponse.results) {
        chatHistory.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.result,
        });
      }

      // 继续与模型对话，将函数结果传回
      const followUpResponse = await openai.callChatCompletion(chatHistory);

      // 确保返回的是文本内容
      if (
        followUpResponse.choices &&
        followUpResponse.choices[0] &&
        followUpResponse.choices[0].message
      ) {
        const finalContent = followUpResponse.choices[0].message.content;

        // 添加最终回复到聊天历史
        chatHistory.push({
          role: 'assistant',
          content: finalContent,
        });

        res.json({
          success: true,
          type: 'function_result',
          function_calls: processedResponse.calls,
          results: processedResponse.results,
          final_response: finalContent,
        });
      } else {
        throw new Error('无法获取模型的最终回复');
      }
    }
  } catch (error) {
    logger.error('聊天API错误', { sessionId, error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: `聊天失败: ${error.message}`,
    });
  }
});

// 获取聊天历史API端点
app.get('/api/chat/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: '缺少会话ID',
    });
  }

  if (!chatHistories[sessionId]) {
    return res.json({
      success: true,
      history: [],
    });
  }

  res.json({
    success: true,
    history: chatHistories[sessionId],
  });
});

// 清除聊天历史 DELETE API端点 - 查询参数形式
app.delete('/api/chat', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: '缺少会话ID',
    });
  }

  if (chatHistories[sessionId]) {
    delete chatHistories[sessionId];
  }

  res.json({
    success: true,
    message: '聊天历史已清除',
  });
});

// 清除聊天历史API端点 - 路径参数形式 (保留兼容性)
app.delete('/api/chat/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: '缺少会话ID',
    });
  }

  if (chatHistories[sessionId]) {
    delete chatHistories[sessionId];
  }

  res.json({
    success: true,
    message: '聊天历史已清除',
  });
});

app.delete('/api/mcp', (req, res) => {
  // 从req.query中获取参数，因为DELETE请求通常不支持正确解析请求体
  const { sessionId, name } = req.query;

  // 如果无法从query中获取，尝试从body中获取（兼容现有代码）
  const sessId = sessionId || (req.body && req.body.sessionId);
  const mcpName = name || (req.body && req.body.name);

  logger.info(`接收到DELETE MCP请求`, {
    sessionId: sessId,
    mcpName,
    query: req.query,
  });

  if (!sessId || !mcpName) {
    logger.warn(`DELETE MCP请求缺少参数`, {
      sessionId: sessId,
      mcpName,
      query: req.query,
    });
    return res.status(400).json({
      success: false,
      error: '缺少必要参数: sessionId或name',
    });
  }

  try {
    // 检查会话是否存在
    const sessionExists = !!sessions[sessId];
    const mcpSessionsExists = sessionExists && !!sessions[sessId].mcpSessions;
    const mcpExists = mcpSessionsExists && !!sessions[sessId].mcpSessions[mcpName];

    logger.info(`DELETE MCP请求检查存在状态`, {
      sessionId: sessId,
      mcpName,
      sessionExists,
      mcpSessionsExists,
      mcpExists,
    });

    if (!sessionExists || !mcpSessionsExists || !mcpExists) {
      logger.warn(`DELETE MCP请求 - MCP会话不存在`, {
        sessionId: sessId,
        mcpName,
        sessionExists,
        mcpSessionsExists,
        mcpExists,
      });
      return res.status(400).json({
        success: false,
        error: 'MCP会话不存在',
      });
    }

    const mcpInfo = sessions[sessId].mcpSessions[mcpName];
    const instanceId = mcpInfo.instanceId;

    logger.info(`准备删除MCP`, {
      sessionId: sessId,
      mcpName,
      instanceId,
    });

    // 如果有实例ID，先更新实例状态为断开连接
    if (instanceId) {
      const instance = registry.getInstanceDetail(instanceId);
      if (instance && instance.mcpSession) {
        instance.mcpSession.status = 'disconnected';
        logger.info(`已更新MCP实例状态为disconnected`, {
          sessionId: sessId,
          instanceId,
          mcpName,
        });
      }
    }

    // 从会话中移除MCP引用
    delete sessions[sessId].mcpSessions[mcpName];

    // 释放实例（但不销毁，实例会在空闲一段时间后被自动回收）
    if (instanceId) {
      logger.info(`释放MCP实例`, {
        sessionId: sessId,
        instanceId,
      });
      mcpPool.releaseMcpInstance(sessId, instanceId);
    }

    // 通知所有连接的客户端
    logger.info(`通知客户端MCP已断开连接`, {
      sessionId: sessId,
      mcpName,
    });
    io.to(sessId).emit('mcp_disconnected', { name: mcpName });

    res.json({ success: true });
  } catch (error) {
    logger.error(`断开MCP连接错误`, {
      sessionId: sessId,
      mcpName,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: `无法断开MCP连接: ${error.message}`,
    });
  }
});

app.get('/api/mcp', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({
      success: false,
      error: '会话不存在',
    });
  }

  // 获取用户ID
  const userId = sessions[sessionId].userId;
  const mcpList = [];

  // 添加当前会话的MCP
  Object.values(sessions[sessionId].mcpSessions || {}).forEach(mcp => {
    mcpList.push({
      name: mcp.name,
      clientType: mcp.clientType,
      tools: mcp.tools,
      status: mcp.status,
      command: mcp.command,
      url: mcp.url,
      isExternal: mcp.isExternal,
      fromCurrentSession: true,
    });
  });

  // 添加用户在其他会话中的MCP（如果当前会话中没有）
  if (userId && !userId.startsWith('anonymous-')) {
    const userInstances = registry.findUserInstances(userId);

    userInstances.forEach(instance => {
      // 检查该实例是否已经在当前会话的列表中
      const instanceName = instance.mcpSession?.name;
      const alreadyInList = mcpList.some(mcp => mcp.name === instanceName);

      // 检查MCP实例状态是否为已断开连接
      const isDisconnected = instance.mcpSession?.status === 'disconnected';

      // 只添加没有断开连接的MCP实例
      if (instanceName && !alreadyInList && !isDisconnected) {
        mcpList.push({
          name: instanceName,
          clientType: instance.mcpSession.clientType,
          tools: instance.mcpSession.tools,
          status: instance.mcpSession.status,
          command: instance.mcpSession.command,
          url: instance.mcpSession.url,
          isExternal: instance.mcpSession.isExternal || true,
          fromOtherSession: true, // 标记来自其他会话
        });
      }
    });

    logger.info(`为用户 ${userId} 返回 ${mcpList.length} 个MCP实例（包括跨会话实例）`);
  }

  res.json({ success: true, mcps: mcpList });
});

// 测试OpenAI函数调用的API端点
app.post('/api/test/function-call', async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数: sessionId和message',
    });
  }

  try {
    // 检查会话是否存在
    if (!sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }

    logger.info('开始测试函数调用', { sessionId, messageLength: message.length });

    // 准备工具列表
    const allTools = [];
    const mcpSessions = sessions[sessionId].mcpSessions;

    // 收集所有MCP工具并转换为OpenAI格式
    for (const mcpName in mcpSessions) {
      const mcpSession = mcpSessions[mcpName];
      if (mcpSession.tools && mcpSession.tools.length > 0) {
        const openaiTools = openai.convertMcpToolsToOpenAIFormat(mcpSession.tools);
        allTools.push(...openaiTools);
      }
    }

    logger.info('为测试准备工具完成', { sessionId, toolCount: allTools.length });

    // 仅使用工具，构建消息
    const messages = [
      {
        role: 'system',
        content:
          '你是一个能够调用工具的AI助手。当用户请求需要使用工具解决的任务时，请优先使用可用的工具。',
      },
      {
        role: 'user',
        content: message,
      },
    ];

    // 强制使用函数调用(如果有工具的话)
    const toolChoice = allTools.length > 0 ? 'auto' : 'none';

    // 调用OpenAI API
    const response = await openai.callChatCompletion(
      messages,
      allTools.length > 0 ? allTools : null,
      toolChoice,
    );

    // 处理OpenAI响应
    const processedResponse = await openai.handleFunctionCalling(
      response,
      sessionId,
      mcpSessions,
      mcpToolAdapter,
    );

    // 处理函数调用结果并获取最终答案
    if (processedResponse.type === 'function_call') {
      logger.info('函数调用成功，准备获取最终回答', {
        sessionId,
        callCount: processedResponse.calls.length,
      });

      // 添加函数调用到消息历史
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: processedResponse.calls,
      });

      // 添加所有工具调用结果到消息历史
      for (const result of processedResponse.results) {
        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.result,
        });
      }

      // 再次调用OpenAI，将工具结果传回给模型
      logger.info('向OpenAI发送工具调用结果', { sessionId });
      const followUpResponse = await openai.callChatCompletion(messages);

      // 确保返回的是文本内容
      if (
        followUpResponse.choices &&
        followUpResponse.choices[0] &&
        followUpResponse.choices[0].message
      ) {
        const finalContent = followUpResponse.choices[0].message.content;

        // 添加最终回复
        messages.push({
          role: 'assistant',
          content: finalContent,
        });

        // 返回完整结果
        return res.json({
          success: true,
          response: {
            type: 'function_result',
            function_calls: processedResponse.calls,
            results: processedResponse.results,
            final_response: finalContent,
            messages: messages,
          },
        });
      } else {
        throw new Error('无法获取模型的最终回复');
      }
    }

    // 返回处理结果(非函数调用情况)
    res.json({
      success: true,
      response: {
        type: 'text',
        content: processedResponse.content,
        messages: messages,
      },
    });
  } catch (error) {
    logger.error('测试函数调用失败', { sessionId, error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: `测试失败: ${error.message}`,
    });
  }
});

// WebSocket连接
io.on('connection', socket => {
  console.log('客户端已连接:', socket.id);

  socket.on('join_session', sessionId => {
    if (sessions[sessionId]) {
      socket.join(sessionId);
      console.log(`客户端 ${socket.id} 加入会话 ${sessionId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('客户端已断开连接:', socket.id);
  });
});

// 添加MCP池状态API
app.get('/api/mcp/pool', (req, res) => {
  try {
    const stats = mcpPool.getPoolStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('获取MCP池状态错误:', error);
    res.status(500).json({
      success: false,
      error: `获取MCP池状态失败: ${error.message}`,
    });
  }
});

// 添加MCP实例列表API
app.get('/api/mcp/instances', (req, res) => {
  try {
    const instances = registry.getAllInstances();
    res.json({
      success: true,
      instances,
    });
  } catch (error) {
    console.error('获取MCP实例列表错误:', error);
    res.status(500).json({
      success: false,
      error: `获取MCP实例列表失败: ${error.message}`,
    });
  }
});

// 连接到已有的MCP实例
app.post('/api/mcp/connect-instance', async (req, res) => {
  try {
    const { sessionId, instanceId } = req.body;
    logger.info(`接收到连接实例请求`, { sessionId, instanceId });

    if (!sessionId || !instanceId) {
      logger.error(`连接实例请求缺少必要参数`, { sessionId, instanceId });
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: sessionId或instanceId',
      });
    }

    // 获取实例详情
    const instance = registry.getInstanceDetail(instanceId);
    logger.info(`查询实例详情`, { instanceId, found: !!instance });

    if (!instance) {
      logger.error(`找不到指定ID的实例`, { instanceId });
      return res.status(404).json({
        success: false,
        error: `找不到指定ID的实例: ${instanceId}`,
      });
    }

    // 检查实例的详细信息
    logger.info(`实例详情`, {
      instanceId,
      userId: instance.userId,
      status: instance.mcpSession?.status,
      sessions: Array.from(instance.sessions || []),
    });

    // 检查会话是否存在
    if (!sessions[sessionId]) {
      logger.info(`连接实例 - 会话不存在，自动创建新会话`, { sessionId });
      sessions[sessionId] = createSession('anonymous');
    }

    // 关联会话和实例
    const associationResult = registry.associateSessionWithInstance(sessionId, instanceId);
    logger.info(`关联会话和实例结果`, { sessionId, instanceId, success: associationResult });

    if (!associationResult) {
      return res.status(500).json({
        success: false,
        error: '关联会话和实例失败',
      });
    }

    // 如果会话中还没有这个MCP名称的连接
    const mcpName = instance.mcpSession.name;
    if (!sessions[sessionId].mcpSessions[mcpName]) {
      // 创建MCP连接记录
      sessions[sessionId].mcpSessions[mcpName] = {
        name: mcpName,
        instanceId: instanceId,
        tools: instance.mcpSession.tools || [],
        clientType: instance.mcpSession.clientType,
        status: 'connected',
        isFromOtherSession: true, // 标记为从其他会话共享的
      };

      logger.info(`会话已连接到MCP实例`, {
        sessionId,
        mcpName,
        instanceId,
      });
    }

    res.json({
      success: true,
      mcp: sessions[sessionId].mcpSessions[mcpName],
    });
  } catch (error) {
    logger.error('连接MCP实例错误:', error);
    console.error('连接MCP实例错误:', error);
    res.status(500).json({
      success: false,
      error: `连接MCP实例失败: ${error.message}`,
    });
  }
});

// 添加获取预定义MCP服务器列表的API
app.get('/api/mcp/predefined', (req, res) => {
  try {
    res.json({
      success: true,
      servers: Object.keys(predefinedMcpServers).map(key => ({
        id: key,
        name: key,
        description: predefinedMcpServers[key].description || `预定义MCP服务器: ${key}`,
      })),
    });
  } catch (error) {
    console.error('获取预定义MCP服务器列表错误:', error);
    res.status(500).json({
      success: false,
      error: `获取预定义MCP服务器列表失败: ${error.message}`,
    });
  }
});

// 添加更新预定义MCP服务器配置的API
app.post('/api/mcp/predefined/update', (req, res) => {
  try {
    const { config } = req.body;

    if (!config || !config.mcpServers) {
      return res.status(400).json({
        success: false,
        error: '无效的配置格式，必须包含mcpServers对象',
      });
    }

    // 更新预定义服务器配置
    predefinedMcpServers = config.mcpServers;

    // 保存到配置文件
    try {
      const configDir = path.join(__dirname, '../config');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(configDir, 'mcp-servers.json'),
        JSON.stringify({ mcpServers: predefinedMcpServers }, null, 2),
        'utf8',
      );

      logger.info(`已更新预定义MCP服务器配置`, {
        servers: Object.keys(predefinedMcpServers),
      });
    } catch (writeError) {
      logger.error(`保存MCP服务器配置失败`, { error: writeError.message });
    }

    res.json({
      success: true,
      servers: Object.keys(predefinedMcpServers),
    });
  } catch (error) {
    console.error('更新预定义MCP服务器配置错误:', error);
    res.status(500).json({
      success: false,
      error: `更新预定义MCP服务器配置失败: ${error.message}`,
    });
  }
});

// 获取系统Python路径API
app.get('/api/system/python-paths', async (req, res) => {
  try {
    const pythonPaths = [];

    // 检查常见的Python路径
    const commonPaths = [
      '/opt/homebrew/bin/python3', // Homebrew on Apple Silicon
      '/usr/local/bin/python3', // Homebrew on Intel Mac
      '/usr/bin/python3', // System Python on Intel Mac
    ];

    // 检查每个路径是否存在
    for (const path of commonPaths) {
      try {
        await fs.promises.access(path, fs.constants.X_OK);
        pythonPaths.push(path);

        // 如果路径存在，添加到结果中
        pythonPaths.push(path);
      } catch (err) {
        // 路径不存在或不可执行，继续尝试下一个
        logger.debug(`Python路径不可用: ${path}`);
      }
    }

    res.json({
      success: true,
      pythonPaths,
    });
  } catch (error) {
    console.error('获取系统Python路径错误:', error);
    res.status(500).json({
      success: false,
      error: `获取系统Python路径失败: ${error.message}`,
    });
  }
});

// 启动服务器
server.listen(PORT, () => {
  logger.info(`服务器已启动，监听端口: ${PORT}`);
  logger.info(`访问 http://localhost:${PORT} 查看服务`);

  // 记录环境信息
  logger.info('服务器环境信息', {
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'development',
  });
});

// 确保这个通配符路由在所有API路由之后
app.get('*', (req, res) => {
  // 跳过API路由(这里是安全检查，通常不会执行到这里)
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API路由不存在' });
  }
  res.sendFile(path.join(__dirname, '../frontend/out/index.html'));
});

// 获取聊天历史 GET API端点 - 处理查询参数形式
app.get('/api/chat', (req, res) => {
  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: '缺少会话ID',
    });
  }

  if (!chatHistories[sessionId]) {
    return res.json({
      success: true,
      messages: [],
    });
  }

  // 将聊天历史记录转换为前端需要的消息格式
  const messages = chatHistories[sessionId].map((entry, index) => {
    return {
      id: `msg-${index}`,
      role: entry.role,
      content: entry.content || '',
      time: entry.time || new Date().toISOString(),
      functionCalls: entry.tool_calls?.map(tool => ({
        name: tool.function?.name || '',
        params: tool.function?.arguments ? JSON.parse(tool.function.arguments) : {},
      })),
    };
  });

  res.json({
    success: true,
    messages: messages,
  });
});
