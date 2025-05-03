// MCP实例工厂
// 负责创建不同类型的MCP实例

const { spawn } = require('child_process');
const axios = require('axios');
const { logger } = require('../utils/logger');
const path = require('path');
const os = require('os');
const fs = require('fs');

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
      logger.error(`工具列表获取错误输出: ${data.toString()}`);
    };

    // 监听进程输出
    const dataHandler = data => {
      buffer += data.toString();
      logger.debug(`接收到MCP数据: ${data.toString()}`);

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
            logger.debug(`解析的响应:`, response);

            // 处理初始化响应
            if (response.id === initRequestId) {
              logger.info('收到初始化响应，准备请求工具列表');
              // 发送获取工具列表的请求
              const toolsListRequest = {
                jsonrpc: '2.0',
                id: toolsListRequestId,
                method: 'tools/list',
                params: {},
              };
              childProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
              logger.info('已发送工具列表请求');
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

              logger.info(`成功获取工具列表:`, response.result.tools);
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

              logger.info(`成功获取工具列表（直接格式）:`, response.tools);
              resolve(response.tools);
              return;
            }
          } catch (lineError) {
            logger.debug(`尝试解析行失败: ${line}`);
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
          logger.debug(`解析输出失败，继续等待: ${e.message}`);
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
        logger.info('发送初始化请求...');

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
          logger.info('已发送初始化请求:', JSON.stringify(initRequest));
        } catch (writeError) {
          logger.error('无法发送初始化请求:', writeError);
        }
      }
    }, 2000); // 给进程2秒时间启动
  });
}

// 调用远程MCP工具
async function callRemoteMcpTool(mcpSession, toolName, params) {
  logger.debug(`准备调用远程MCP工具: ${toolName}, 参数:`, params);

  return new Promise((resolve, reject) => {
    // 检查MCP会话是否有效且有进程对象
    if (!mcpSession) {
      logger.error(`无效的MCP会话`);
      return reject(new Error('无效的MCP会话'));
    }

    if (!mcpSession.process) {
      logger.error(`MCP会话没有有效的进程对象`);
      return reject(new Error('MCP会话没有有效的进程对象'));
    }

    if (!toolName) {
      logger.error(`工具名称不能为空`);
      return reject(new Error('工具名称不能为空'));
    }

    // 确保params是对象
    const safeParams = params && typeof params === 'object' ? params : {};

    // 设置超时
    const timeout = setTimeout(() => {
      logger.error(`工具调用超时: ${toolName}`);
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

    logger.debug(`发送调用请求:`, JSON.stringify(request, null, 2));

    let buffer = '';
    let errorOutput = '';
    let responseReceived = false;

    // 监听进程的错误输出
    const errorHandler = data => {
      const errorData = data.toString();
      errorOutput += errorData;
      logger.error(`工具 ${toolName} 错误输出:`, errorData);
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
      logger.debug(`收到工具 ${toolName} 输出:`, chunk);

      try {
        // 尝试逐行解析 - 可能有多行输出
        const lines = buffer.split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.startsWith('{')) continue;

          try {
            const response = JSON.parse(line);
            logger.debug(`成功解析JSON响应:`, response);

            // 先处理标准JSON-RPC 2.0请求，ID匹配的情况
            if (response.jsonrpc === '2.0' && response.id === requestId) {
              logger.debug(`找到匹配的响应，ID: ${requestId}`);
              cleanup(); // 清理事件监听和超时

              if (response.error) {
                logger.error(`工具 ${toolName} 返回错误:`, response.error);
                reject(new Error(response.error.message || '工具调用失败'));
              } else if (response.result !== undefined) {
                logger.debug(`工具 ${toolName} 调用成功:`, response.result);
                resolve(response.result);
              } else {
                reject(new Error('无效的工具调用响应'));
              }
              return;
            }

            // 即使ID不匹配，也尝试处理兼容模式（重要！）
            // 这是针对market-trending和stock-quote等工具的特殊处理
            if (response.jsonrpc === '2.0' && response.result) {
              logger.debug(
                `收到带有结果的JSON-RPC响应，请求ID不匹配 (实际: ${response.id}, 预期: ${requestId})，但继续处理`,
              );

              // 特别处理特定工具类型
              if (
                (toolName === 'market-trending' || toolName === 'stock-quote') &&
                typeof response.result === 'object'
              ) {
                logger.info(`检测到${toolName}工具返回，使用兼容模式处理结果`);
                cleanup();
                resolve(response.result);
                return;
              }
            }
          } catch (lineError) {
            // 这行不是有效的JSON或不匹配当前请求，继续
            logger.debug(`解析输出行失败: ${line}, 错误: ${lineError.message}`);
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
              logger.debug(`尝试解析跨行JSON: ${jsonStr}`);

              const response = JSON.parse(jsonStr);

              // 处理标准JSON-RPC 2.0响应
              if (response.jsonrpc === '2.0') {
                if (response.id === requestId) {
                  logger.debug(`找到匹配的跨行响应，ID: ${requestId}`);
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
                  logger.info(`检测到${toolName}工具跨行响应，使用兼容模式处理结果`);
                  cleanup();
                  resolve(response.result);
                  return;
                }
              }
            }
          } catch (e) {
            logger.debug(`跨行JSON解析失败: ${e.message}`);
          }
        }

        // 如果没有找到匹配的响应，但是收到了错误输出
        if (errorOutput && !responseReceived) {
          // 不要立即拒绝，先继续等待
          logger.debug(`收到错误输出但继续等待响应: ${errorOutput}`);
        }
      } catch (e) {
        logger.error(`解析工具输出时出错: ${e.message}`);
      }
    };

    mcpSession.process.stdout.on('data', dataHandler);
    mcpSession.process.stderr.on('data', errorHandler);

    // 发送请求
    try {
      mcpSession.process.stdin.write(JSON.stringify(request) + '\n');
    } catch (writeError) {
      clearTimeout(timeout);
      mcpSession.process.stdout.removeListener('data', dataHandler);
      mcpSession.process.stderr.removeListener('data', errorHandler);
      reject(new Error(`发送工具请求失败: ${writeError.message}`));
    }
  });
}

// 创建MCP进程
async function createMcpProcess(config, instanceId) {
  logger.info(`创建MCP进程，配置:`, config);

  // 检查配置是否完整
  if (!config.command) {
    return {
      success: false,
      error: '缺少命令配置',
    };
  }

  try {
    // 准备启动进程
    const args = config.args || [];

    // 创建环境变量对象，结合默认环境和配置环境
    const env = {
      ...process.env, // 包含默认环境变量
      ...config.env, // 添加配置的环境变量
      MCP_INSTANCE_ID: instanceId, // 注入实例ID
    };

    // 启动子进程
    const childProcess = spawn(config.command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
    });

    // 退出事件处理
    childProcess.on('exit', (code, signal) => {
      logger.info(`MCP进程退出，实例ID: ${instanceId}, 退出码: ${code}, 信号: ${signal}`);
    });

    // 错误事件处理
    childProcess.on('error', error => {
      logger.error(`MCP进程错误，实例ID: ${instanceId}`, { error: error.message });
    });

    // 非阻塞方式获取工具列表
    logger.info(`开始从进程获取工具列表，实例ID: ${instanceId}`);
    const tools = await getToolsFromProcess(childProcess);
    logger.info(`获取工具列表成功，工具数量: ${tools.length}, 实例ID: ${instanceId}`);

    // 返回成功结果
    return {
      success: true,
      mcpSession: {
        clientType: 'stdio',
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        process: childProcess,
        tools: tools || [],
        status: 'ready',
      },
    };
  } catch (error) {
    logger.error(`创建MCP进程失败，实例ID: ${instanceId}`, { error: error.message });

    return {
      success: false,
      error: `创建MCP进程失败: ${error.message}`,
    };
  }
}

// 从SSE服务器获取工具列表
async function getToolsFromSseServer(url) {
  try {
    const toolsUrl = `${url}/tools/list`;
    logger.info(`从SSE服务器获取工具列表: ${toolsUrl}`);

    const response = await axios.get(toolsUrl);

    if (response.data && Array.isArray(response.data.tools)) {
      return response.data.tools;
    } else if (Array.isArray(response.data)) {
      return response.data;
    }

    throw new Error('返回的工具列表无效');
  } catch (error) {
    logger.error(`从SSE服务器获取工具列表失败: ${error.message}`);
    throw error;
  }
}

// 调用SSE MCP工具
async function callSseMcpTool(mcpSession, toolName, params) {
  if (!mcpSession || !mcpSession.url) {
    throw new Error('无效的SSE MCP会话或URL');
  }

  try {
    const toolUrl = `${mcpSession.url}/tools/call`;
    logger.debug(`调用SSE工具: ${toolName}, URL: ${toolUrl}`);

    const response = await axios.post(toolUrl, {
      name: toolName,
      arguments: params,
    });

    return response.data;
  } catch (error) {
    logger.error(`调用SSE工具失败: ${toolName}`, { error: error.message });
    throw new Error(`调用工具失败: ${error.message}`);
  }
}

// 创建标准I/O MCP工厂
async function createStdioMcpFactory(config, instanceId) {
  logger.info(`正在创建stdio类型MCP实例`, { config, instanceId });

  try {
    // 检查命令是否可执行
    if (!config.command) {
      throw new Error('配置缺少必要的command字段');
    }

    // 记录命令和参数
    logger.info(`准备执行命令: ${config.command} ${config.args ? config.args.join(' ') : ''}`);

    // 如果有setup，先执行setup
    if (config.setup && config.setup.command) {
      logger.info(
        `检测到setup配置，准备执行setup命令: ${config.setup.command} ${
          config.setup.args ? config.setup.args.join(' ') : ''
        }`,
      );

      try {
        // 创建一个临时目录用于MCP进程
        const tmpDir = path.join(os.tmpdir(), `mcp-${instanceId}`);
        logger.info(`为MCP实例创建临时目录: ${tmpDir}`);

        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }

        // 执行setup命令
        const setupProcess = spawn(config.setup.command, config.setup.args || [], {
          cwd: tmpDir,
          env: { ...process.env, ...(config.env || {}) },
          shell: true, // 使用shell执行命令，这样可以使用PATH环境变量
        });

        // 收集setup输出以便调试
        let setupOutput = '';
        let setupErrorOutput = '';

        setupProcess.stdout.on('data', data => {
          const output = data.toString();
          setupOutput += output;
          logger.debug(`Setup stdout: ${output}`);
        });

        setupProcess.stderr.on('data', data => {
          const errorOutput = data.toString();
          setupErrorOutput += errorOutput;
          logger.debug(`Setup stderr: ${errorOutput}`);
        });

        // 等待setup完成
        const setupResult = await new Promise((resolve, reject) => {
          setupProcess.on('close', code => {
            if (code === 0) {
              logger.info(`Setup命令成功完成`);
              resolve({ success: true });
            } else {
              logger.error(`Setup命令失败，退出码: ${code}`, {
                output: setupOutput,
                errorOutput: setupErrorOutput,
              });
              reject(
                new Error(
                  `Setup命令失败，退出码: ${code}\n输出: ${setupOutput}\n错误: ${setupErrorOutput}`,
                ),
              );
            }
          });

          setupProcess.on('error', err => {
            logger.error(`Setup命令执行错误`, { error: err.message });
            reject(new Error(`Setup命令执行错误: ${err.message}`));
          });
        });

        logger.info(`Setup完成，准备创建主MCP进程`);

        // 从临时目录创建主MCP进程
        const mcpProcess = spawn(config.command, config.args || [], {
          cwd: tmpDir,
          env: { ...process.env, ...(config.env || {}) },
          shell: true, // 使用shell执行命令
        });

        // 设置进程错误处理
        mcpProcess.on('error', err => {
          logger.error(`MCP进程启动错误`, { error: err.message });
        });

        // 收集初始化输出以便调试
        let initialOutput = '';
        let initialErrorOutput = '';

        const dataHandler = data => {
          const output = data.toString();
          initialOutput += output;
          logger.debug(`MCP初始化stdout: ${output}`);
        };

        const errorHandler = data => {
          const errorOutput = data.toString();
          initialErrorOutput += errorOutput;
          logger.error(`MCP初始化stderr: ${errorOutput}`);
        };

        mcpProcess.stdout.on('data', dataHandler);
        mcpProcess.stderr.on('data', errorHandler);

        // 等待进程稳定
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 如果进程已退出，则报错
        if (mcpProcess.exitCode !== null) {
          throw new Error(
            `MCP进程已退出，退出码: ${mcpProcess.exitCode}\n输出: ${initialOutput}\n错误: ${initialErrorOutput}`,
          );
        }

        // 获取MCP服务的工具列表
        logger.info(`尝试获取MCP工具列表`);
        const tools = await getToolsFromProcess(mcpProcess);

        // 创建MCP会话
        const mcpSession = {
          process: mcpProcess,
          tools,
          clientType: 'stdio',
          status: 'connected',
          command: config.command,
          args: config.args || [],
          env: config.env || {},
          cwd: tmpDir,
        };

        return {
          success: true,
          mcpSession,
        };
      } catch (setupError) {
        logger.error(`执行setup命令失败`, { error: setupError.message });
        throw new Error(`执行setup命令失败: ${setupError.message}`);
      }
    } else {
      // 直接创建MCP进程（无setup）
      logger.info(`未检测到setup配置，直接创建MCP进程`);

      // 创建进程
      const mcpProcess = spawn(config.command, config.args || [], {
        env: { ...process.env, ...(config.env || {}) },
        shell: true, // 使用shell执行命令
      });

      // 设置进程错误处理
      mcpProcess.on('error', err => {
        logger.error(`MCP进程启动错误`, { error: err.message });
      });

      // 收集初始化输出以便调试
      let initialOutput = '';
      let initialErrorOutput = '';

      const dataHandler = data => {
        const output = data.toString();
        initialOutput += output;
        logger.debug(`MCP初始化stdout: ${output}`);
      };

      const errorHandler = data => {
        const errorOutput = data.toString();
        initialErrorOutput += errorOutput;
        logger.error(`MCP初始化stderr: ${errorOutput}`);
      };

      mcpProcess.stdout.on('data', dataHandler);
      mcpProcess.stderr.on('data', errorHandler);

      // 等待进程稳定
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 如果进程已退出，则报错
      if (mcpProcess.exitCode !== null) {
        throw new Error(
          `MCP进程已退出，退出码: ${mcpProcess.exitCode}\n输出: ${initialOutput}\n错误: ${initialErrorOutput}`,
        );
      }

      // 获取MCP服务的工具列表
      logger.info(`尝试获取MCP工具列表`);
      const tools = await getToolsFromProcess(mcpProcess);

      // 创建MCP会话
      const mcpSession = {
        process: mcpProcess,
        tools,
        clientType: 'stdio',
        status: 'connected',
        command: config.command,
        args: config.args || [],
        env: config.env || {},
      };

      return {
        success: true,
        mcpSession,
      };
    }
  } catch (error) {
    logger.error(`创建MCP进程失败`, {
      error: error.message,
      command: config.command,
      args: config.args,
      setup: config.setup,
    });

    return {
      success: false,
      error: `创建MCP进程失败: ${error.message}`,
    };
  }
}

// 创建SSE MCP工厂
async function createSseMcpFactory(config, instanceId) {
  if (!config.url) {
    return {
      success: false,
      error: '缺少SSE服务器URL',
    };
  }

  try {
    // 获取工具列表
    const tools = await getToolsFromSseServer(config.url);

    return {
      success: true,
      mcpSession: {
        clientType: 'sse',
        url: config.url,
        tools: tools || [],
        status: 'ready',
      },
    };
  } catch (error) {
    logger.error(`创建SSE MCP实例失败: ${error.message}`);
    return {
      success: false,
      error: `创建SSE MCP实例失败: ${error.message}`,
    };
  }
}

module.exports = {
  createStdioMcpFactory,
  createSseMcpFactory,
  callRemoteMcpTool,
  callSseMcpTool,
};
