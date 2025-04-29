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
const tools = require('./tools');
const openai = require('./openai');
const axios = require('axios');

// 导入新架构组件
const registry = require('./registry');
const mcpPoolModule = require('./mcp-pool');
const lifecycleManager = require('./lifecycle-manager');
const proxy = require('./proxy');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// 存储所有会话
const sessions = {};

// 存储聊天历史
const chatHistories = {};

// 初始化MCP服务池
const mcpPool = mcpPoolModule.init({
  createStdioMcp: createStdioMcpFactory,
  createSseMcp: createSseMcpFactory,
});

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

// 创建并集成反向代理路由
const proxyRouter = proxy.createProxyRouter(mcpPool);
app.use('/api/proxy', proxyRouter);

// 创建新会话
function createSession(userId) {
  const sessionId = uuidv4();
  sessions[sessionId] = {
    id: sessionId,
    userId,
    mcpSessions: {},
    createdAt: new Date(),
  };
  return sessionId;
}

// 从MCP进程获取工具列表
async function getToolsFromProcess(process) {
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
              process.stdin.write(JSON.stringify(toolsListRequest) + '\n');
              console.log('已发送工具列表请求');
              continue;
            }

            // 处理工具列表响应
            if (response.id === toolsListRequestId && response.result && response.result.tools) {
              toolsReceived = true;
              clearTimeout(timeout);

              // 彻底清理所有事件监听器
              process.stdout.removeAllListeners('data');
              process.stderr.removeAllListeners('data');
              process.removeAllListeners('error');
              process.removeAllListeners('exit');

              console.log(`成功获取工具列表:`, response.result.tools);
              resolve(response.result.tools);
              return;
            }

            // 向后兼容：检查是否包含工具列表（直接格式）
            if (response.tools) {
              toolsReceived = true;
              clearTimeout(timeout);

              // 彻底清理所有事件监听器
              process.stdout.removeAllListeners('data');
              process.stderr.removeAllListeners('data');
              process.removeAllListeners('error');
              process.removeAllListeners('exit');

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

    process.stdout.on('data', dataHandler);
    process.stderr.on('data', errorHandler);

    // 添加进程错误和退出处理
    process.on('error', err => {
      clearTimeout(timeout);
      process.stdout.removeListener('data', dataHandler);
      process.stderr.removeListener('data', errorHandler);
      reject(new Error(`获取工具列表时进程错误: ${err.message}`));
    });

    process.on('exit', code => {
      if (code !== 0 && !toolsReceived) {
        clearTimeout(timeout);
        process.stdout.removeListener('data', dataHandler);
        process.stderr.removeListener('data', errorHandler);
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
          process.stdin.write(JSON.stringify(initRequest) + '\n');
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

    // 监听进程的错误输出
    const errorHandler = data => {
      const errorData = data.toString();
      errorOutput += errorData;
      console.error(`工具 ${toolName} 错误输出:`, errorData);
    };

    // 监听进程输出
    const dataHandler = data => {
      const chunk = data.toString();
      buffer += chunk;
      console.log(`收到工具 ${toolName} 输出:`, chunk);

      try {
        // 尝试逐行解析 - 可能有多行输出
        const lines = buffer.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (!line.startsWith('{')) continue;

          try {
            const response = JSON.parse(line);

            // 检查是否是当前请求的响应
            if (response.id === requestId) {
              clearTimeout(timeout);
              mcpSession.process.stdout.removeListener('data', dataHandler);
              mcpSession.process.stderr.removeListener('data', errorHandler);

              if (response.error) {
                console.error(`工具 ${toolName} 返回错误:`, response.error);
                reject(new Error(response.error.message || '工具调用失败'));
              } else if (response.result) {
                console.log(`工具 ${toolName} 调用成功:`, response.result);
                resolve(response.result);
              } else {
                reject(new Error('无效的工具调用响应'));
              }
              return;
            }
          } catch (lineError) {
            // 这行不是有效的JSON或不匹配当前请求，继续
            console.log(`解析输出行失败: ${line}`);
          }
        }

        // 清除已处理的数据
        buffer = lines[lines.length - 1] || '';
      } catch (e) {
        console.log(`解析输出失败，继续等待: ${e.message}`);
      }
    };

    // 设置错误处理
    mcpSession.process.on('error', error => {
      clearTimeout(timeout);
      mcpSession.process.stdout.removeListener('data', dataHandler);
      mcpSession.process.stderr.removeListener('data', errorHandler);
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
      clearTimeout(timeout);
      mcpSession.process.stdout.removeListener('data', dataHandler);
      mcpSession.process.stderr.removeListener('data', errorHandler);
      console.error(`向MCP发送请求失败:`, writeError);
      reject(new Error(`发送请求失败: ${writeError.message}`));
    }
  });
}

// 自动检测和添加本地工具
function getLocalTools() {
  return tools.getToolDefinitions();
}

// 从stdio创建MCP实例的工厂函数
async function createStdioMcpFactory(config, instanceId) {
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
    const allowedExecutables = ['node', 'npm', 'npx', 'python', 'python3', 'docker'];
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
      const process = spawn(executableCmd, args, { env });

      process.on('error', error => {
        console.error(`进程启动错误: ${error.message}`);
      });

      // 处理进程退出
      process.on('exit', code => {
        console.log(`MCP进程退出，退出码: ${code}`);
      });

      // 更详细的日志
      process.stdout.on('data', data => {
        console.log(`MCP 输出: ${data.toString()}`);
      });

      // 日志处理
      process.stderr.on('data', data => {
        console.error(`MCP错误输出: ${data}`);
      });

      // 尝试获取工具列表
      let toolsList;
      try {
        // 尝试从MCP服务获取工具列表
        console.log('等待获取工具列表...');
        toolsList = await getToolsFromProcess(process);
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
        process,
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
  const sessionId = createSession(userId || 'anonymous');
  res.json({ success: true, sessionId });
});

// 更新后的MCP API端点
app.post('/api/mcp', async (req, res) => {
  const { sessionId, name, clientType, url, command, args, env, fullCommand } = req.body;

  console.log('收到添加MCP请求:', {
    sessionId,
    name,
    clientType,
    url: url ? '有值' : undefined,
    command: command ? '有值' : undefined,
    args: args ? '有值' : undefined,
    env: env ? '有值' : undefined,
    fullCommand: fullCommand ? '有值' : undefined,
  });

  if (!sessionId || !name || !clientType) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!name) missingParams.push('name');
    if (!clientType) missingParams.push('clientType');

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
    actualSessionId = createSession('anonymous');
    console.log(`已创建新会话: ${actualSessionId}`);
  }

  let config;
  try {
    if (clientType === 'stdio') {
      // 检查是新的配置格式还是旧的命令字符串格式
      if (command && args) {
        // 新的配置格式
        console.log(`准备连接stdio MCP: ${name}, 命令: ${command}, 参数: ${args.join(' ')}`);
        config = { command, args, env };
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

    // 存储实例ID和名称的映射
    sessions[actualSessionId].mcpSessions[name] = {
      instanceId: poolResult.instanceId,
      name: name,
      ...poolResult.mcp,
    };

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
  console.log(
    `准备调用MCP工具: sessionId=${sessionId}, mcpName=${mcpName}, toolName=${toolName}, 参数:`,
    JSON.stringify(params, null, 2),
  );

  if (!sessions[sessionId] || !sessions[sessionId].mcpSessions[mcpName]) {
    console.error(`找不到MCP会话: ${mcpName}`);
    throw new Error(`找不到MCP会话: ${mcpName}`);
  }

  // 获取MCP会话信息
  const mcpInfo = sessions[sessionId].mcpSessions[mcpName];
  const instanceId = mcpInfo.instanceId;

  // 获取实例详情
  const instanceDetail = registry.getInstanceDetail(instanceId);
  if (!instanceDetail) {
    console.error(`找不到MCP实例: ${instanceId}`);
    throw new Error(`找不到MCP实例: ${instanceId}`);
  }

  const mcpSession = instanceDetail.mcpSession;

  // 获取工具定义，以检查参数规范
  const toolDef = mcpSession.tools.find(t => t.name === toolName);

  if (!toolDef) {
    console.error(`找不到工具定义: ${toolName}`);
    throw new Error(`在MCP ${mcpName} 中找不到工具 ${toolName}`);
  }

  // 确保参数是对象
  const safeParams = params && typeof params === 'object' ? params : {};

  // 记录工具定义信息，帮助调试
  console.log(`工具 ${toolName} 的定义:`, {
    名称: toolDef.name,
    描述: toolDef.description,
    参数规范: toolDef.parameters,
  });

  // 处理必需参数检查，确保工具执行正确
  if (toolDef.parameters && toolDef.parameters.required && toolDef.parameters.required.length > 0) {
    // 记录需要的必需参数
    console.log(`工具 ${toolName} 需要的必需参数:`, toolDef.parameters.required);

    // 检查必需参数是否提供
    const missingParams = toolDef.parameters.required.filter(
      param =>
        safeParams[param] === undefined || safeParams[param] === null || safeParams[param] === '',
    );

    if (missingParams.length > 0) {
      console.warn(`调用工具 ${toolName} 缺少必需参数: ${missingParams.join(', ')}`);
      // 添加更多详细的警告信息，但仍然允许工具自行处理
      console.warn(`缺少的参数可能导致工具无法正常工作，继续尝试调用`);

      // 对于图像生成等特殊工具，可以添加一些默认值
      if (toolName === 'image-gen' && missingParams.includes('prompt')) {
        console.warn(`图像生成工具缺少必要的prompt参数，返回错误信息`);
        return {
          error: '缺少必需参数',
          message: '图像生成需要提供prompt参数，请提供描述图像内容的文本',
        };
      }
    }
  }

  try {
    // 更新实例的最后使用时间
    instanceDetail.lastUsedTime = Date.now();

    if (mcpSession.isExternal) {
      if (mcpSession.clientType === 'stdio') {
        // 调用远程stdio MCP工具
        console.log(`调用外部stdio工具: ${toolName}，参数:`, JSON.stringify(safeParams, null, 2));
        return await callRemoteMcpTool(mcpSession, toolName, safeParams);
      } else if (mcpSession.clientType === 'sse') {
        // 调用远程SSE MCP工具
        console.log(`调用外部SSE工具: ${toolName}，参数:`, JSON.stringify(safeParams, null, 2));
        return await callSseMcpTool(mcpSession, toolName, safeParams);
      }
    }

    // 调用本地工具
    console.log(`调用本地工具: ${toolName}，参数:`, JSON.stringify(safeParams, null, 2));
    return await tools.executeToolCall(toolName, safeParams);
  } catch (error) {
    console.error(`调用工具 ${toolName} 时发生错误:`, error);
    throw error; // 继续抛出错误，让上层处理
  }
}

// 工具调用API端点
app.post('/api/mcp/call', async (req, res) => {
  const { sessionId, mcpName, tool, params } = req.body;

  console.log(`收到工具调用请求:`, {
    sessionId,
    mcpName,
    tool,
    params: params ? '参数存在' : '无参数',
  });

  if (params) {
    console.log(`工具调用参数详情:`, JSON.stringify(params, null, 2));
  }

  if (!sessionId || !mcpName || !tool) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!mcpName) missingParams.push('mcpName');
    if (!tool) missingParams.push('tool');

    console.error(`工具调用 - 缺少必要参数: ${missingParams.join(', ')}`);
    return res.status(400).json({
      success: false,
      error: `缺少必要参数: ${missingParams.join(', ')}`,
    });
  }

  // 检查会话是否存在，如果不存在则自动创建
  let actualSessionId = sessionId;
  if (!sessions[sessionId]) {
    console.log(`工具调用 - 会话 ${sessionId} 不存在，自动创建新会话`);
    actualSessionId = createSession('anonymous');
    console.log(`已创建新会话: ${actualSessionId}`);
  }

  // 检查MCP是否在此会话中
  if (!sessions[actualSessionId].mcpSessions || !sessions[actualSessionId].mcpSessions[mcpName]) {
    console.log(`在会话 ${actualSessionId} 中找不到MCP ${mcpName}，尝试查找其他会话`);

    // 尝试在其他会话中查找相同名称的MCP
    let foundMcp = false;
    let foundSessionId = null;

    Object.keys(sessions).forEach(sid => {
      if (sessions[sid].mcpSessions && sessions[sid].mcpSessions[mcpName]) {
        foundMcp = true;
        foundSessionId = sid;
      }
    });

    if (foundMcp) {
      console.log(`在会话 ${foundSessionId} 中找到了名为 ${mcpName} 的MCP，使用此会话`);
      actualSessionId = foundSessionId;
    } else {
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

    console.log(`工具调用成功: ${tool}，结果:`, result);

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
    console.error(`工具调用失败: ${error.message}`);
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

  console.log(`收到聊天请求:`, { sessionId, message: message ? '消息存在' : '无消息' });

  if (!sessionId || !message) {
    const missingParams = [];
    if (!sessionId) missingParams.push('sessionId');
    if (!message) missingParams.push('message');

    console.error(`聊天API - 缺少必要参数: ${missingParams.join(', ')}`);
    return res.status(400).json({
      success: false,
      error: `缺少必要参数: ${missingParams.join(', ')}`,
    });
  }

  // 检查会话是否存在
  if (!sessions[sessionId]) {
    console.error(`聊天API - 会话不存在: ${sessionId}`);
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

    console.log(`为会话 ${sessionId} 找到 ${allTools.length} 个工具`);

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
    console.error('聊天API错误:', error);
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

// 清除聊天历史API端点
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
  const { sessionId, name } = req.body;

  if (!sessionId || !name) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数',
    });
  }

  try {
    // 检查会话是否存在
    if (
      !sessions[sessionId] ||
      !sessions[sessionId].mcpSessions ||
      !sessions[sessionId].mcpSessions[name]
    ) {
      return res.status(400).json({
        success: false,
        error: 'MCP会话不存在',
      });
    }

    const mcpInfo = sessions[sessionId].mcpSessions[name];
    const instanceId = mcpInfo.instanceId;

    // 从会话中移除MCP引用
    delete sessions[sessionId].mcpSessions[name];

    // 释放实例（但不销毁，实例会在空闲一段时间后被自动回收）
    mcpPool.releaseMcpInstance(sessionId, instanceId);

    // 通知所有连接的客户端
    io.to(sessionId).emit('mcp_disconnected', { name });

    res.json({ success: true });
  } catch (error) {
    console.error('断开MCP连接错误:', error);
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

  const mcpList = Object.values(sessions[sessionId].mcpSessions).map(mcp => ({
    name: mcp.name,
    clientType: mcp.clientType,
    tools: mcp.tools,
    status: mcp.status,
    command: mcp.command,
    url: mcp.url,
    isExternal: mcp.isExternal,
  }));

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

    console.log('====== 测试函数调用 ======');
    console.log(`会话ID: ${sessionId}`);
    console.log(`消息: ${message}`);

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

    console.log(`找到 ${allTools.length} 个工具，可供函数调用`);

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
      console.log('函数调用成功，准备发送结果回OpenAI获取最终回答');

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
      console.log('向OpenAI发送工具调用结果...');
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
          type: 'function_result',
          function_calls: processedResponse.calls,
          results: processedResponse.results,
          final_response: finalContent,
          messages: messages,
        });
      } else {
        throw new Error('无法获取模型的最终回复');
      }
    }

    // 返回处理结果(非函数调用情况)
    res.json({
      success: true,
      type: 'text',
      content: processedResponse.content,
      response: processedResponse,
      messages: messages,
    });
  } catch (error) {
    console.error('测试函数调用失败:', error);
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

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器已启动，端口: ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 管理您的MCP`);
});
