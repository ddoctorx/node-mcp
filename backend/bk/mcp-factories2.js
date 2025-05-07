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
    // 设置超时 - 增加到60秒，给Python进程更多启动时间
    const timeout = setTimeout(() => {
      reject(new Error('获取工具列表超时'));
    }, 60000);

    let buffer = '';
    let errorBuffer = '';
    let toolsReceived = false;
    let initRequestId = 1;
    let toolsListRequestId = 2;

    // 添加调试计时器，便于排查问题
    const startTime = Date.now();
    const logTiming = message => {
      const elapsed = Date.now() - startTime;
      logger.info(`[${elapsed}ms] ${message}`);
    };

    // 监听stderr以捕获错误和可能的输出
    const errorHandler = data => {
      const errorStr = data.toString();
      errorBuffer += errorStr;

      // 特殊处理：Python MCP服务器可能会将输出写入stderr
      if (
        errorStr.includes('tools') ||
        errorStr.includes('mcp.server') ||
        errorStr.includes('crawl4ai') ||
        errorStr.includes('{') ||
        errorStr.includes('[')
      ) {
        logTiming(`在stderr中发现可能的工具列表或有用信息: ${errorStr.substring(0, 100)}`);
        // 将错误输出也添加到主缓冲区进行解析
        processBuffer(errorStr);

        // 检查是否包含错误消息，这可能表明需要安装依赖
        if (errorStr.includes('Missing dependencies') || errorStr.includes('ImportError')) {
          logger.error(`Python依赖缺失: ${errorStr}`);
        }
      } else {
        logger.error(`工具列表获取错误输出: ${errorStr}`);
      }
    };

    // 添加更详细的日志
    logTiming('等待MCP服务器启动并输出工具列表...');

    // 缓冲区处理函数 - 提取为独立函数以便复用
    const processBuffer = newData => {
      if (toolsReceived) return;

      buffer += newData;

      // 检测是否包含工具列表相关关键词
      if (
        (buffer.includes('"tools"') ||
          buffer.includes('"result"') ||
          buffer.includes('"name":"crawl_webpage"') || // 检查特定的工具名
          buffer.includes('MCP服务器启动，可用工具')) &&
        buffer.includes('{') &&
        buffer.includes('}')
      ) {
        logTiming('检测到可能包含工具列表的数据');

        try {
          // 尝试查找完整的JSON对象
          const jsonObjects = findJsonObjects(buffer);

          // 处理每个JSON对象
          for (const jsonStr of jsonObjects) {
            try {
              const obj = JSON.parse(jsonStr);

              // 检查各种可能的工具列表格式
              if (obj.tools && Array.isArray(obj.tools) && obj.tools.length > 0) {
                logTiming(`成功解析工具列表，直接格式，包含 ${obj.tools.length} 个工具`);
                extractAndResolveTools(obj.tools);
                return;
              } else if (
                obj.result &&
                obj.result.tools &&
                Array.isArray(obj.result.tools) &&
                obj.result.tools.length > 0
              ) {
                logTiming(`成功解析工具列表，JSON-RPC格式，包含 ${obj.result.tools.length} 个工具`);
                extractAndResolveTools(obj.result.tools);
                return;
              }
              // 检查mcp.server格式 - inputSchema代替parameters
              else if (
                obj.result &&
                Array.isArray(obj.result) &&
                obj.result.length > 0 &&
                obj.result[0].name &&
                obj.result[0].inputSchema
              ) {
                // 转换inputSchema到parameters格式
                const tools = obj.result.map(tool => ({
                  name: tool.name,
                  description: tool.description || `${tool.name} tool`,
                  parameters: tool.inputSchema || {},
                }));
                logTiming(`成功解析工具列表，mcp.server格式，包含 ${tools.length} 个工具`);
                extractAndResolveTools(tools);
                return;
              }
              // 检查其他可能的格式
              else if (obj.methods && Array.isArray(obj.methods) && obj.methods.length > 0) {
                const tools = obj.methods.map(method => ({
                  name: method.name || method,
                  description: method.description || `${method.name || method} tool`,
                  parameters: method.parameters || {},
                }));
                logTiming(`成功解析工具列表，methods格式，包含 ${tools.length} 个工具`);
                extractAndResolveTools(tools);
                return;
              } else if (
                obj.functions &&
                Array.isArray(obj.functions) &&
                obj.functions.length > 0
              ) {
                const tools = obj.functions.map(func => ({
                  name: func.name || func,
                  description: func.description || `${func.name || func} tool`,
                  parameters: func.parameters || {},
                }));
                logTiming(`成功解析工具列表，functions格式，包含 ${tools.length} 个工具`);
                extractAndResolveTools(tools);
                return;
              }
              // 检查是否有name和inputSchema等特征字段，可能是单个工具定义
              else if (
                Array.isArray(obj) &&
                obj.length > 0 &&
                obj[0].name &&
                (obj[0].inputSchema || obj[0].parameters)
              ) {
                const tools = obj.map(tool => ({
                  name: tool.name,
                  description: tool.description || `${tool.name} tool`,
                  parameters: tool.inputSchema || tool.parameters || {},
                }));
                logTiming(`成功解析工具列表，数组格式，包含 ${tools.length} 个工具`);
                extractAndResolveTools(tools);
                return;
              }
            } catch (jsonError) {
              logger.debug(`解析单个JSON对象失败: ${jsonError.message}`);
            }
          }
        } catch (e) {
          logger.debug(`提取JSON对象失败: ${e.message}`);
        }
      }
    };

    // 寻找缓冲区中的所有JSON对象
    const findJsonObjects = text => {
      const results = [];
      let startIndex = 0;

      // 持续查找所有可能的JSON对象
      while (startIndex < text.length) {
        const objectStart = text.indexOf('{', startIndex);
        if (objectStart === -1) break;

        let bracketCount = 0;
        let objectEnd = -1;

        for (let i = objectStart; i < text.length; i++) {
          if (text[i] === '{') bracketCount++;
          if (text[i] === '}') bracketCount--;

          if (bracketCount === 0) {
            objectEnd = i + 1;
            break;
          }
        }

        if (objectEnd > objectStart) {
          results.push(text.substring(objectStart, objectEnd));
          startIndex = objectEnd;
        } else {
          startIndex = objectStart + 1;
        }
      }

      // 也尝试查找JSON数组
      startIndex = 0;
      while (startIndex < text.length) {
        const arrayStart = text.indexOf('[', startIndex);
        if (arrayStart === -1) break;

        let bracketCount = 0;
        let arrayEnd = -1;

        for (let i = arrayStart; i < text.length; i++) {
          if (text[i] === '[') bracketCount++;
          if (text[i] === ']') bracketCount--;

          if (bracketCount === 0) {
            arrayEnd = i + 1;
            break;
          }
        }

        if (arrayEnd > arrayStart) {
          results.push(text.substring(arrayStart, arrayEnd));
          startIndex = arrayEnd;
        } else {
          startIndex = arrayStart + 1;
        }
      }

      return results;
    };

    // 提取并解析工具列表，避免代码重复
    const extractAndResolveTools = tools => {
      if (toolsReceived) return; // 防止重复处理

      // 修复工具格式，确保符合OpenAI API要求
      const fixedTools = tools.map(tool => {
        // 如果参数存在但缺少顶级type字段，添加它
        if (tool.parameters && !tool.parameters.type) {
          return {
            ...tool,
            parameters: {
              type: 'object', // 添加必要的顶级type字段
              ...tool.parameters,
            },
          };
        }
        // 如果有inputSchema但没有parameters，转换格式
        else if (tool.inputSchema && !tool.parameters) {
          return {
            ...tool,
            parameters: {
              type: 'object',
              ...tool.inputSchema,
            },
          };
        }
        return tool;
      });

      toolsReceived = true;
      clearTimeout(timeout);

      // 彻底清理所有事件监听器
      childProcess.stdout.removeAllListeners('data');
      childProcess.stderr.removeAllListeners('data');
      childProcess.removeAllListeners('error');
      childProcess.removeAllListeners('exit');

      logger.info(`成功获取工具列表，工具数量: ${fixedTools.length}`);
      resolve(fixedTools);
    };

    // 监听进程输出
    const dataHandler = data => {
      const chunk = data.toString();
      logTiming(`接收到MCP数据块: ${chunk.length} 字节`);
      processBuffer(chunk);
    };

    childProcess.stdout.on('data', dataHandler);
    childProcess.stderr.on('data', errorHandler);

    // 添加进程错误和退出处理
    childProcess.on('error', err => {
      logTiming(`获取工具列表时进程错误: ${err.message}`);
      clearTimeout(timeout);
      childProcess.stdout.removeListener('data', dataHandler);
      childProcess.stderr.removeListener('data', errorHandler);
      reject(new Error(`获取工具列表时进程错误: ${err.message}`));
    });

    childProcess.on('exit', (code, signal) => {
      logTiming(`MCP进程已退出，退出码: ${code}, 信号: ${signal}`);

      // 如果进程退出但没有错误并且有输出，可能是在显示工具列表后正常退出
      if (!toolsReceived && buffer.length > 0) {
        // 最后尝试从缓冲区提取工具列表
        logTiming('进程已退出，尝试从现有输出中解析工具列表');
        processBuffer(''); // 传入空字符串，促使处理现有的缓冲区

        // 如果还是没有找到，尝试解析完整的缓冲区
        if (!toolsReceived) {
          try {
            // 最后尝试直接将整个缓冲区当作JSON对象解析
            if (buffer.includes('{') && buffer.includes('}')) {
              // 提取第一个完整的对象
              const startIndex = buffer.indexOf('{');
              const endIndex = buffer.lastIndexOf('}') + 1;
              if (startIndex >= 0 && endIndex > startIndex) {
                const jsonStr = buffer.substring(startIndex, endIndex);
                try {
                  const lastObj = JSON.parse(jsonStr);
                  if (lastObj.tools && Array.isArray(lastObj.tools)) {
                    logTiming(`在最后尝试中找到工具列表，包含 ${lastObj.tools.length} 个工具`);
                    extractAndResolveTools(lastObj.tools);
                    return;
                  }
                } catch (e) {
                  logger.debug(`最后解析尝试失败: ${e.message}`);
                }
              }
            }
          } catch (e) {
            logger.debug(`解析完整缓冲区失败: ${e.message}`);
          }
        }
      }

      // 仍未找到，检查退出码
      if (code !== 0 && !toolsReceived) {
        clearTimeout(timeout);
        childProcess.stdout.removeListener('data', dataHandler);
        childProcess.stderr.removeListener('data', errorHandler);
        reject(new Error(`进程非正常退出，退出码: ${code}`));
      }
    });

    // 等待10秒后发送初始化请求
    setTimeout(() => {
      if (!toolsReceived) {
        logTiming('10秒内未收到自动工具列表，尝试发送initialize请求...');

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
          logTiming('已发送初始化请求');

          // 等待2秒后再发送工具列表请求
          setTimeout(() => {
            if (!toolsReceived) {
              logTiming('发送tools/list工具列表请求...');
              const toolsListRequest = {
                jsonrpc: '2.0',
                id: toolsListRequestId,
                method: 'tools/list',
                params: {},
              };

              try {
                childProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');
                logTiming('已发送工具列表请求');
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

    // 如果在30秒后仍未收到工具列表，尝试根据错误输出创建硬编码工具列表
    setTimeout(() => {
      if (!toolsReceived) {
        logTiming('30秒内未收到工具列表，检查是否可以从错误输出中识别crawl4ai_mcp_server');

        // 检查错误输出，判断是否为crawl4ai_mcp_server
        if (
          errorBuffer.includes('crawl4ai') ||
          errorBuffer.includes('MCP服务器启动') ||
          errorBuffer.includes('Crawl4AI MCP服务器')
        ) {
          logTiming('检测到crawl4ai_mcp_server，使用预定义工具列表');

          // 为crawl4ai_mcp_server定义硬编码工具列表
          const crawl4aiTools = [
            {
              name: 'crawl_webpage',
              description: '爬取单个网页并返回其内容为markdown格式。',
              parameters: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '要爬取的网页URL',
                  },
                  include_images: {
                    type: 'boolean',
                    description: '是否在结果中包含图像',
                    default: true,
                  },
                  bypass_cache: {
                    type: 'boolean',
                    description: '是否绕过缓存',
                    default: false,
                  },
                },
                required: ['url'],
              },
            },
            {
              name: 'crawl_website',
              description: '从给定URL开始爬取网站，最多爬取指定深度和页面数量。',
              parameters: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '爬取起始URL',
                  },
                  max_depth: {
                    type: 'integer',
                    description: '最大爬取深度',
                    default: 1,
                  },
                  max_pages: {
                    type: 'integer',
                    description: '最大爬取页面数量',
                    default: 5,
                  },
                  include_images: {
                    type: 'boolean',
                    description: '是否在结果中包含图像',
                    default: true,
                  },
                },
                required: ['url'],
              },
            },
            {
              name: 'extract_structured_data',
              description: '使用CSS选择器从网页中提取结构化数据。',
              parameters: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '要提取数据的网页URL',
                  },
                  schema: {
                    type: 'object',
                    description: '定义提取的schema',
                  },
                  css_selector: {
                    type: 'string',
                    description: '用于定位特定页面部分的CSS选择器',
                    default: 'body',
                  },
                },
                required: ['url'],
              },
            },
            {
              name: 'save_as_markdown',
              description: '爬取网页并将内容保存为Markdown文件。',
              parameters: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '要爬取的网页URL',
                  },
                  filename: {
                    type: 'string',
                    description: '保存Markdown的文件名',
                  },
                  include_images: {
                    type: 'boolean',
                    description: '是否包含图像',
                    default: true,
                  },
                },
                required: ['url', 'filename'],
              },
            },
          ];

          extractAndResolveTools(crawl4aiTools);
        } else {
          // 如果不是特定服务器，返回空工具列表
          logTiming('无法识别MCP服务器类型，返回空工具列表');
          extractAndResolveTools([]);
        }
      }
    }, 30000);

    // 50秒后的最终超时处理，确保不会永久阻塞
    setTimeout(() => {
      if (!toolsReceived) {
        logTiming('工具列表获取时间过长，返回空工具列表');
        toolsReceived = true;
        clearTimeout(timeout);

        // 清理事件监听器
        childProcess.stdout.removeListener('data', dataHandler);
        childProcess.stderr.removeListener('data', errorHandler);

        // 返回空工具列表
        resolve([]);
      }
    }, 50000);
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

    // 增加超时时间到180秒 - 特别是爬虫类工具需要更长时间
    const timeout = setTimeout(() => {
      logger.error(`工具调用超时: ${toolName}`);
      cleanup();
      reject(new Error('工具调用超时'));
    }, 180000); // 从120秒增加到180秒

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

    // 添加调试计时器，便于排查问题
    const startTime = Date.now();
    const logTiming = message => {
      const elapsed = Date.now() - startTime;
      logger.info(`[${toolName}:${elapsed}ms] ${message}`);
    };

    // 监听进程的错误输出
    const errorHandler = data => {
      const errorData = data.toString();
      errorOutput += errorData;
      logger.error(`工具 ${toolName} 错误输出:`, errorData);

      // 特殊处理：某些Python服务可能将正常输出写入stderr
      if (
        errorData.includes('success') ||
        errorData.includes('"url"') ||
        errorData.includes('"markdown"') ||
        errorData.includes('content')
      ) {
        logTiming(`检测到可能在stderr中的有效结果数据`);
        dataHandler(data); // 将错误输出也传给数据处理器处理
      }
    };

    // 清理函数，确保只执行一次
    const cleanup = () => {
      if (!responseReceived) {
        responseReceived = true;
        clearTimeout(timeout);

        try {
          mcpSession.process.stdout.removeListener('data', dataHandler);
          mcpSession.process.stderr.removeListener('data', errorHandler);
        } catch (e) {
          logger.error(`移除事件监听器失败: ${e.message}`);
        }
      }
    };

    // 寻找缓冲区中的所有JSON对象
    const findJsonObjects = text => {
      const results = [];
      let startIndex = 0;

      // 持续查找所有可能的JSON对象
      while (startIndex < text.length) {
        const objectStart = text.indexOf('{', startIndex);
        if (objectStart === -1) break;

        let bracketCount = 0;
        let objectEnd = -1;

        for (let i = objectStart; i < text.length; i++) {
          if (text[i] === '{') bracketCount++;
          if (text[i] === '}') bracketCount--;

          if (bracketCount === 0) {
            objectEnd = i + 1;
            break;
          }
        }

        if (objectEnd > objectStart) {
          results.push(text.substring(objectStart, objectEnd));
          startIndex = objectEnd;
        } else {
          startIndex = objectStart + 1;
        }
      }

      // 也尝试查找JSON数组
      startIndex = 0;
      while (startIndex < text.length) {
        const arrayStart = text.indexOf('[', startIndex);
        if (arrayStart === -1) break;

        let bracketCount = 0;
        let arrayEnd = -1;

        for (let i = arrayStart; i < text.length; i++) {
          if (text[i] === '[') bracketCount++;
          if (text[i] === ']') bracketCount--;

          if (bracketCount === 0) {
            arrayEnd = i + 1;
            break;
          }
        }

        if (arrayEnd > arrayStart) {
          results.push(text.substring(arrayStart, arrayEnd));
          startIndex = arrayEnd;
        } else {
          startIndex = arrayStart + 1;
        }
      }

      return results;
    };

    // 解析工具响应的函数
    const processResponse = jsonStr => {
      try {
        const response = JSON.parse(jsonStr);

        // 检查是否是标准JSON-RPC响应
        if (response.jsonrpc === '2.0' && response.id === requestId) {
          logTiming(`找到匹配的JSON-RPC响应，ID: ${requestId}`);

          if (response.error) {
            logger.error(`工具 ${toolName} 返回错误:`, response.error);
            return { success: false, error: response.error.message || '工具调用失败' };
          } else if (response.result !== undefined) {
            logTiming(`工具 ${toolName} 调用成功，返回结果`);
            return { success: true, result: response.result };
          }
        }

        // 检查是否是mcp.server格式的文本内容响应
        if (Array.isArray(response) && response.length > 0 && response[0].type === 'text') {
          logTiming(`发现mcp.server格式的文本内容响应`);

          try {
            // 尝试解析文本内容是否是JSON字符串
            const textContent = response[0].text;
            const parsedContent = JSON.parse(textContent);
            return { success: true, result: parsedContent };
          } catch (e) {
            // 如果不是JSON，直接返回文本内容
            return {
              success: true,
              result: {
                text: response[0].text,
                type: 'text',
              },
            };
          }
        }

        // 检查是否是直接的成功/失败响应
        // 许多MCP工具会直接返回结果对象，而不是按JSON-RPC格式包装
        if (response.success !== undefined) {
          logTiming(`发现直接格式的响应`);
          if (response.success === false && response.error) {
            return { success: false, error: response.error };
          }
          return { success: true, result: response };
        }

        // 如果是简单对象且没有特定格式，也视为成功结果
        if (typeof response === 'object' && !response.jsonrpc) {
          logTiming(`找到无格式的对象响应，视为有效结果`);
          return { success: true, result: response };
        }

        // 没有找到有效响应
        return null;
      } catch (e) {
        logger.debug(`解析JSON失败: ${e.message}, 内容: ${jsonStr.substring(0, 100)}`);
        return null;
      }
    };

    // 监听进程输出
    const dataHandler = data => {
      if (responseReceived) return; // 如果已经收到响应，忽略后续输出

      const chunk = data.toString();
      buffer += chunk;
      logTiming(`收到数据: ${chunk.length} 字节`);

      try {
        // 尝试找到完整的JSON对象
        const jsonObjects = findJsonObjects(buffer);

        for (const jsonStr of jsonObjects) {
          const result = processResponse(jsonStr);

          if (result) {
            cleanup();

            if (result.success) {
              resolve(result.result);
            } else {
              reject(new Error(result.error || '工具调用失败'));
            }
            return;
          }
        }

        // 尝试逐行解析 - 可能有多行输出
        const lines = buffer.split('\n').filter(line => line.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.startsWith('{') && !line.startsWith('[')) continue;

          const result = processResponse(line);
          if (result) {
            cleanup();

            if (result.success) {
              resolve(result.result);
            } else {
              reject(new Error(result.error || '工具调用失败'));
            }
            return;
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

    // 增加进程退出处理
    const exitHandler = (code, signal) => {
      if (!responseReceived) {
        logTiming(`进程退出但未收到响应，退出码: ${code}, 信号: ${signal}`);

        // 如果缓冲区中有数据，尝试最后解析
        if (buffer.length > 0) {
          try {
            // 尝试提取最后的JSON对象
            const start = buffer.lastIndexOf('{');
            const end = buffer.lastIndexOf('}') + 1;
            const arrayStart = buffer.lastIndexOf('[');
            const arrayEnd = buffer.lastIndexOf(']') + 1;

            // 尝试解析对象
            if (start >= 0 && end > start) {
              const lastJson = buffer.substring(start, end);
              logTiming(`尝试解析最后的JSON对象: ${lastJson.substring(0, 50)}...`);

              try {
                const lastObj = JSON.parse(lastJson);

                if (lastObj.success !== undefined || lastObj.result !== undefined) {
                  logTiming(`在进程退出后找到有效结果`);
                  cleanup();
                  resolve(lastObj);
                  return;
                }
              } catch (e) {
                logger.debug(`最后JSON对象解析失败: ${e.message}`);
              }
            }

            // 尝试解析数组
            if (arrayStart >= 0 && arrayEnd > arrayStart) {
              const lastArray = buffer.substring(arrayStart, arrayEnd);
              logTiming(`尝试解析最后的JSON数组: ${lastArray.substring(0, 50)}...`);

              try {
                const lastArr = JSON.parse(lastArray);
                if (Array.isArray(lastArr) && lastArr.length > 0) {
                  logTiming(`在进程退出后找到有效数组结果`);
                  cleanup();
                  resolve(lastArr);
                  return;
                }
              } catch (e) {
                logger.debug(`最后JSON数组解析失败: ${e.message}`);
              }
            }
          } catch (e) {
            logger.debug(`退出处理解析失败: ${e.message}`);
          }
        }

        // 如果仍然没有结果
        if (code === 0) {
          // 如果是成功退出，尝试将整个缓冲区作为结果
          if (buffer.trim()) {
            logTiming(`进程成功退出，返回缓冲区作为结果`);
            cleanup();
            resolve({ success: true, rawOutput: buffer.trim() });
          } else {
            cleanup();
            reject(new Error(`工具执行完成但未返回结果`));
          }
        } else {
          cleanup();
          reject(new Error(`工具进程异常退出，退出码: ${code}，错误: ${errorOutput}`));
        }
      }
    };

    mcpSession.process.on('exit', exitHandler);

    // 发送请求
    try {
      mcpSession.process.stdin.write(JSON.stringify(request) + '\n');
      logTiming(`已发送工具请求`);
    } catch (writeError) {
      clearTimeout(timeout);
      mcpSession.process.stdout.removeListener('data', dataHandler);
      mcpSession.process.stderr.removeListener('data', errorHandler);
      mcpSession.process.removeListener('exit', exitHandler);
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

    // 记录实例信息
    logger.info(`准备启动MCP进程，实例ID: ${instanceId}`, {
      command: config.command,
      args: args.join(' '),
      workingDir: config.workingDir || '默认',
      instanceId,
    });

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
      const output = data.toString().trim();
      if (output) {
        logger.debug(
          `MCP[${instanceId}] stdout: ${output.substring(0, 500)}${
            output.length > 500 ? '...' : ''
          }`,
        );
      }
    });

    childProcess.stderr.on('data', data => {
      const output = data.toString().trim();
      if (output) {
        logger.debug(
          `MCP[${instanceId}] stderr: ${output.substring(0, 500)}${
            output.length > 500 ? '...' : ''
          }`,
        );
      }
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
        instanceId: instanceId, // 添加实例ID到会话对象中
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

            // 检查目录是否已存在，如果存在则先删除
            if (fs.existsSync(workingDir)) {
              logger.info(`工作目录已存在，先删除: ${workingDir}`);
              try {
                // 使用递归删除目录
                fs.rmSync(workingDir, { recursive: true, force: true });
                logger.info(`已删除现有目录: ${workingDir}`);
              } catch (rmError) {
                logger.error(`删除目录失败: ${rmError.message}`);
                // 使用时间戳创建新的唯一目录
                const timestamp = Date.now();
                workingDir = path.join(reposBasePath, `${instanceId}-${timestamp}`);
                logger.info(`改用带时间戳的工作目录: ${workingDir}`);
              }
            }

            // 创建目录
            fs.mkdirSync(workingDir, { recursive: true });

            // 修改运行命令的工作目录
            config.workingDir = workingDir;
            logger.info(`将设置MCP命令工作目录为: ${workingDir}`);

            // 修改克隆命令，增加目标目录参数
            // 分析克隆命令，找到仓库URL的位置
            const cloneUrlIndex = setupArgs.findIndex(
              arg => arg.includes('http') || arg.includes('git@'),
            );

            if (cloneUrlIndex !== -1 && cloneUrlIndex === setupArgs.length - 1) {
              // 如果URL是最后一个参数，添加目标目录
              setupArgs.push('.');
              logger.info(`修改git clone命令，添加目标目录参数: ${setupArgs.join(' ')}`);
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

        // 检测crawl4ai_mcp_server，确保安装所有必要的依赖
        let isCrawl4aiServer = false;
        if (config.args && config.args.join(' ').includes('crawl4ai_mcp_server')) {
          isCrawl4aiServer = true;
          logger.info(`检测到crawl4ai_mcp_server，将安装特定依赖`);
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

            // 检查虚拟环境是否已存在
            if (fs.existsSync(venvPath)) {
              logger.info(`虚拟环境已存在，先删除: ${venvPath}`);
              try {
                fs.rmSync(venvPath, { recursive: true, force: true });
                logger.info(`已删除现有虚拟环境: ${venvPath}`);
              } catch (rmError) {
                logger.error(`删除虚拟环境失败: ${rmError.message}`);
                // 使用时间戳创建新的唯一虚拟环境
                const timestamp = Date.now();
                venvPath = path.join(venvBasePath, `${instanceId}-${timestamp}`);
                logger.info(`改用带时间戳的虚拟环境: ${venvPath}`);
              }
            }

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

            // 如果是crawl4ai_mcp_server，确保安装所有必需的依赖
            if (isCrawl4aiServer) {
              // 创建一个包含所有必需依赖的列表
              const requiredPackages = [
                'crawl4ai>=0.9.0',
                'mcp>=1.0.0',
                'pydantic>=2.0.0',
                'httpx>=0.24.0',
              ];

              // 获取用户原始要安装的包
              let userPackages = [];
              const installIndex = originalSetupArgs.indexOf('install');
              if (installIndex !== -1 && installIndex < originalSetupArgs.length - 1) {
                userPackages = originalSetupArgs.slice(installIndex + 1);
              }

              // 合并用户包和必需包，去除重复项
              const allPackages = [...new Set([...userPackages, ...requiredPackages])];
              setupArgs = ['-m', 'pip', 'install', ...allPackages];

              logger.info(`为crawl4ai_mcp_server安装依赖: ${setupArgs.join(' ')}`);
            } else {
              // 否则保持原来的包安装逻辑
              // 如果安装命令是python -m pip install xxx，保持这种格式
              if (originalSetupArgs.includes('-m') && originalSetupArgs.includes('pip')) {
                // 保持原来的参数不变，因为我们已经修改了setupCommand指向虚拟环境的Python
                setupArgs = originalSetupArgs;
              } else {
                // 否则重构为使用pip模块
                const packageIndex = originalSetupArgs.indexOf('install') + 1;
                setupArgs = ['-m', 'pip', 'install'];

                if (packageIndex > 0 && packageIndex < originalSetupArgs.length) {
                  setupArgs = [...setupArgs, ...originalSetupArgs.slice(packageIndex)];
                }
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
          env: {
            ...process.env,
            MCP_INSTANCE_ID: instanceId, // 确保传递实例ID到子进程环境变量
            PYTHONUNBUFFERED: '1', // 设置Python不缓冲输出
          }, // 继承环境变量
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

                // 设置环境变量，确保Python不缓冲输出
                if (!venvConfig.env) venvConfig.env = {};
                venvConfig.env.MCP_INSTANCE_ID = instanceId;
                venvConfig.env.PYTHONUNBUFFERED = '1'; // 确保Python输出不缓冲

                logger.info(
                  `使用虚拟环境中的Python执行MCP: ${venvPythonPath}, 实例ID: ${instanceId}`,
                );
                resolve(createMcpProcess(venvConfig, instanceId));
              } else {
                // 如果是Git克隆，确保传递工作目录
                if (workingDir && setupCommand === 'git') {
                  // 确保config中有workingDir
                  if (!config.workingDir) {
                    config.workingDir = workingDir;
                  }

                  // 确保环境变量中有实例ID和Python不缓冲设置
                  if (!config.env) config.env = {};
                  config.env.MCP_INSTANCE_ID = instanceId;
                  config.env.PYTHONUNBUFFERED = '1'; // 确保Python输出不缓冲

                  logger.info(`Git克隆成功，将使用工作目录: ${workingDir}, 实例ID: ${instanceId}`);
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

    // 确保环境变量中有实例ID
    if (!config.env) config.env = {};
    config.env.MCP_INSTANCE_ID = instanceId;
    config.env.PYTHONUNBUFFERED = '1'; // 确保Python输出不缓冲

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
