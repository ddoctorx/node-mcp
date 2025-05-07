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
    // 设置超时 - 增加到30秒
    const timeout = setTimeout(() => {
      reject(new Error('获取工具列表超时'));
    }, 30000); // 从20秒增加到30秒

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

    // 添加更详细的日志
    logger.info('等待FastMCP服务器启动并输出工具列表...');

    // 监听进程输出
    const dataHandler = data => {
      buffer += data.toString();
      logger.debug(`接收到MCP数据: ${data.toString()}`);

      // 增加调试输出
      if (buffer.includes('tools') || buffer.includes('jsonrpc')) {
        logger.info('接收到可能包含工具列表的数据');
      }

      try {
        // 先尝试逐行处理JSON数据
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

            // 检查是否包含工具列表 - 直接格式
            if (response.tools && Array.isArray(response.tools)) {
              logger.info(`发现FastMCP直接格式的工具列表，包含 ${response.tools.length} 个工具`);
              toolsReceived = true;
              clearTimeout(timeout);

              // 清理事件监听器
              childProcess.stdout.removeAllListeners('data');
              childProcess.stderr.removeAllListeners('data');
              childProcess.removeAllListeners('error');
              childProcess.removeAllListeners('exit');

              resolve(response.tools);
              return;
            }

            // 检查是否包含JSON-RPC格式的工具列表
            if (
              response.jsonrpc === '2.0' &&
              response.result &&
              response.result.tools &&
              Array.isArray(response.result.tools)
            ) {
              logger.info(
                `发现JSON-RPC格式的工具列表，包含 ${response.result.tools.length} 个工具`,
              );
              toolsReceived = true;
              clearTimeout(timeout);

              // 清理事件监听器
              childProcess.stdout.removeAllListeners('data');
              childProcess.stderr.removeAllListeners('data');
              childProcess.removeAllListeners('error');
              childProcess.removeAllListeners('exit');

              resolve(response.result.tools);
              return;
            }

            // 处理工具列表响应 - 其他格式
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

            // 兼容性检查：某些MCP可能不完全遵循JSON-RPC协议
            if (response.methods || response.functions) {
              logger.info(`检测到兼容性格式的工具列表`);

              let compatTools = [];
              // 处理methods格式
              if (Array.isArray(response.methods)) {
                compatTools = response.methods.map(method => ({
                  name: method.name || method,
                  description: method.description || `${method.name || method} tool`,
                  parameters: method.parameters || {},
                }));
              }
              // 处理functions格式
              else if (Array.isArray(response.functions)) {
                compatTools = response.functions.map(func => ({
                  name: func.name || func,
                  description: func.description || `${func.name || func} tool`,
                  parameters: func.parameters || {},
                }));
              }

              if (compatTools.length > 0) {
                toolsReceived = true;
                clearTimeout(timeout);

                // 彻底清理所有事件监听器
                childProcess.stdout.removeAllListeners('data');
                childProcess.stderr.removeAllListeners('data');
                childProcess.removeAllListeners('error');
                childProcess.removeAllListeners('exit');

                logger.info(`成功获取兼容性工具列表:`, compatTools);
                resolve(compatTools);
                return;
              }
            }
          } catch (lineError) {
            logger.debug(`尝试解析行失败: ${line}`);
          }
        }

        // 尝试在整个缓冲区中寻找JSON对象
        if (!toolsReceived && buffer.includes('{') && buffer.includes('}')) {
          try {
            // 提取可能的JSON字符串 - 寻找第一个{和对应的最后一个}
            const start = buffer.indexOf('{');
            let end = -1;
            let bracketCount = 0;

            for (let i = start; i < buffer.length; i++) {
              if (buffer[i] === '{') bracketCount++;
              if (buffer[i] === '}') bracketCount--;

              if (bracketCount === 0) {
                end = i + 1;
                break;
              }
            }

            if (end > start) {
              const jsonString = buffer.substring(start, end);
              logger.debug(`尝试解析整个JSON对象: ${jsonString}`);

              try {
                const obj = JSON.parse(jsonString);

                // 尝试从不同格式中提取工具列表
                if (obj.tools && Array.isArray(obj.tools)) {
                  logger.info(`在完整JSON中找到工具列表，包含 ${obj.tools.length} 个工具`);
                  toolsReceived = true;
                  clearTimeout(timeout);

                  // 清理事件监听器
                  childProcess.stdout.removeAllListeners('data');
                  childProcess.stderr.removeAllListeners('data');
                  childProcess.removeAllListeners('error');
                  childProcess.removeAllListeners('exit');

                  resolve(obj.tools);
                  return;
                } else if (obj.result && obj.result.tools && Array.isArray(obj.result.tools)) {
                  logger.info(
                    `在完整JSON中找到JSON-RPC格式的工具列表，包含 ${obj.result.tools.length} 个工具`,
                  );
                  toolsReceived = true;
                  clearTimeout(timeout);

                  // 清理事件监听器
                  childProcess.stdout.removeAllListeners('data');
                  childProcess.stderr.removeAllListeners('data');
                  childProcess.removeAllListeners('error');
                  childProcess.removeAllListeners('exit');

                  resolve(obj.result.tools);
                  return;
                }
              } catch (jsonError) {
                logger.debug(`解析完整JSON对象失败: ${jsonError.message}`);
              }
            }
          } catch (e) {
            logger.debug(`提取JSON对象失败: ${e.message}`);
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
      // 如果进程退出但没有错误并且有输出，可能是在显示工具列表后正常退出
      if (code === 0 && !toolsReceived && buffer.length > 0) {
        // 最后尝试从缓冲区提取工具列表
        logger.info('进程已退出，尝试从现有输出中解析工具列表');

        try {
          // 查找可能的JSON对象
          const jsonMatches = buffer.match(/\{.*\}/g) || [];

          for (const jsonStr of jsonMatches) {
            try {
              const obj = JSON.parse(jsonStr);

              if (obj.tools && Array.isArray(obj.tools)) {
                logger.info(`在进程退出后找到工具列表，包含 ${obj.tools.length} 个工具`);
                toolsReceived = true;
                clearTimeout(timeout);
                resolve(obj.tools);
                return;
              } else if (obj.result && obj.result.tools && Array.isArray(obj.result.tools)) {
                logger.info(
                  `在进程退出后找到JSON-RPC格式的工具列表，包含 ${obj.result.tools.length} 个工具`,
                );
                toolsReceived = true;
                clearTimeout(timeout);
                resolve(obj.result.tools);
                return;
              }
            } catch (e) {
              logger.debug(`解析JSON匹配失败: ${e.message}`);
            }
          }
        } catch (e) {
          logger.debug(`进程退出后解析失败: ${e.message}`);
        }
      }

      if (code !== 0 && !toolsReceived) {
        clearTimeout(timeout);
        childProcess.stdout.removeListener('data', dataHandler);
        childProcess.stderr.removeListener('data', errorHandler);
        reject(new Error(`进程非正常退出，退出码: ${code}`));
      }
    });

    // 修改：不再主动发送初始化请求，而是等待FastMCP自动输出工具列表
    // 只在前 10 秒内不发送请求，充分给FastMCP时间输出工具列表
    setTimeout(() => {
      if (!toolsReceived) {
        logger.info('在10秒内未收到自动工具列表，尝试发送initialize请求...');

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

          // 等待2秒后再发送工具列表请求
          setTimeout(() => {
            if (!toolsReceived) {
              logger.info('发送工具列表请求...');
              const toolsListRequest = {
                jsonrpc: '2.0',
                id: toolsListRequestId,
                method: 'tools/list',
                params: {},
              };

              try {
                childProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
                logger.info('已发送工具列表请求');
              } catch (e) {
                logger.error('发送工具列表请求失败:', e);
              }
            }
          }, 2000);
        } catch (writeError) {
          logger.error('无法发送初始化请求:', writeError);
        }
      }
    }, 10000); // 给进程10秒时间自动输出工具列表

    // 如果在更长时间后仍未收到工具列表，尝试获取空工具列表来避免超时
    setTimeout(() => {
      if (!toolsReceived) {
        logger.warn('工具列表获取时间过长，尝试返回空工具列表');
        toolsReceived = true;
        clearTimeout(timeout);

        // 清理事件监听器
        childProcess.stdout.removeListener('data', dataHandler);
        childProcess.stderr.removeListener('data', errorHandler);

        // 返回空工具列表
        resolve([]);
      }
    }, 25000); // 在25秒后如果仍未获取到工具列表，返回空列表
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

    // 增强对进程对象的检查
    if (!mcpSession.process) {
      // 尝试记录更详细的错误信息以便调试
      logger.error(`MCP会话没有有效的进程对象`, {
        mcpSessionInfo: {
          clientType: mcpSession.clientType || 'unknown',
          status: mcpSession.status || 'unknown',
          hasTools: Array.isArray(mcpSession.tools) && mcpSession.tools.length > 0,
          isExternal: mcpSession.isExternal || false,
          command: mcpSession.command || 'none',
        },
      });

      if (mcpSession.clientType === 'sse') {
        // 如果是SSE类型，提示使用不同的调用方法
        return reject(new Error('SSE类型的MCP会话不能使用stdio调用方法，请检查MCP配置'));
      }

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
    // 命令白名单检查
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
      'python3.11',
      'python3.12',
      'python3.13',
      'python3.10',
      'python3.9',
      'python3.8',
    ];

    // 获取基础命令名（不含路径）
    const baseCmd = config.command.split('/').pop().split('\\').pop();

    // 允许直接执行js文件
    if (!allowedExecutables.includes(baseCmd) && !baseCmd.endsWith('.js')) {
      logger.error(`命令不在允许列表中: ${baseCmd}`);
      return {
        success: false,
        error: `命令 ${baseCmd} 不在允许的列表中。允许的命令: ${allowedExecutables.join(', ')}`,
      };
    }

    // 准备启动进程
    const args = config.args || [];

    // 创建环境变量对象，结合默认环境和配置环境
    const env = {
      ...process.env, // 包含默认环境变量
      ...config.env, // 添加配置的环境变量
      MCP_INSTANCE_ID: instanceId, // 注入实例ID
      PATH: process.env.PATH, // 确保PATH环境变量被正确传递
    };

    // 设置spawn选项
    const spawnOptions = {
      env,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      shell: true, // 始终使用shell执行命令
    };

    // 如果配置中指定了工作目录，则使用它
    if (config.workingDir) {
      logger.info(`使用工作目录: ${config.workingDir}`);
      spawnOptions.cwd = config.workingDir;
    }

    // 启动子进程
    logger.info(`启动子进程: ${config.command} ${args.join(' ')}`);
    const childProcess = spawn(config.command, args, spawnOptions);

    // 记录进程PID
    logger.info(`MCP进程已启动，PID: ${childProcess.pid}, 实例ID: ${instanceId}`);

    // 退出事件处理
    childProcess.on('exit', (code, signal) => {
      logger.info(`MCP进程退出，实例ID: ${instanceId}, 退出码: ${code}, 信号: ${signal}`);
    });

    // 错误事件处理
    childProcess.on('error', error => {
      logger.error(`MCP进程错误，实例ID: ${instanceId}`, { error: error.message });
    });

    // 调试输出
    childProcess.stdout.on('data', data => {
      logger.debug(`MCP[${instanceId}] stdout: ${data.toString().trim()}`);
    });

    childProcess.stderr.on('data', data => {
      logger.debug(`MCP[${instanceId}] stderr: ${data.toString().trim()}`);
    });

    // 增加工具列表获取超时时间
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
        workingDir: config.workingDir,
        process: childProcess,
        tools: tools || [],
        status: 'connected',
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
        // 检查setup命令是否存在
        let setupCommand = config.setup.command;
        let setupArgs = config.setup.args || [];
        let useVirtualEnv = false;
        let venvPath = '';

        // 为Git仓库创建工作目录
        let workingDir = null;
        if (setupCommand === 'git' && setupArgs.includes('clone')) {
          logger.info(`检测到Git克隆操作，将创建工作目录`);

          try {
            // 为每个仓库实例创建唯一的工作目录
            const reposBasePath = path.join(__dirname, '../../repos');

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
            config.workingDir = workingDir;
            logger.info(`将设置MCP命令工作目录为: ${workingDir}`);
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
            const venvBasePath = path.join(__dirname, '../../venvs');

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
              shell: true, // 确保在所有平台上使用shell
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

        // 对于所有平台，始终使用shell执行命令
        const spawnOptions = {
          shell: true, // 确保在所有平台上使用shell
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
                // 如果是Git克隆，确保传递工作目录
                if (workingDir && setupCommand === 'git') {
                  // 确保config中有workingDir
                  if (!config.workingDir) {
                    config.workingDir = workingDir;
                  }
                  logger.info(`Git克隆成功，将使用工作目录: ${workingDir}`);
                }

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

    // 创建MCP进程
    return createMcpProcess(config, instanceId);
  } catch (error) {
    logger.error(`创建MCP进程失败`, { error: error.message });
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
        status: 'connected',
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
