// src/infrastructure/adapters/outbound/chat/openai-service.js

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const ChatServicePort = require('../../../../application/ports/outbound/chat-service-port');

/**
 * OpenAI聊天服务适配器
 * 实现与OpenAI API的集成
 */
class OpenAIService extends ChatServicePort {
  /**
   * @param {LoggerPort} logger - 日志服务
   * @param {string} apiKey - OpenAI API密钥
   * @param {string} [apiUrl] - OpenAI API URL
   */
  constructor(logger, apiKey, apiUrl = 'https://api.openai.com/v1/chat/completions') {
    super();
    this.logger = logger;
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this.apiUrl = apiUrl;

    if (!this.apiKey) {
      this.logger.error('警告: 未设置OpenAI API密钥，请设置OPENAI_API_KEY环境变量');
      this.logger.error('当前环境变量:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        OPENAI_API_KEY_EXISTS: !!process.env.OPENAI_API_KEY,
      });
    }
  }

  /**
   * 调用聊天完成API
   * @param {Array<Object>} messages - 消息历史
   * @param {Array<Object>} [tools] - 可用工具列表
   * @param {string} [toolChoice] - 工具选择策略
   * @returns {Promise<Object>} 聊天响应
   */
  async callChatCompletion(messages, tools = null, toolChoice = 'auto') {
    const requestId = uuidv4();
    const startTime = Date.now();

    const apiKey = this.apiKey;

    if (!apiKey) {
      this.logger.error('无法获取OpenAI API密钥，请检查环境变量配置');
      throw new Error('未设置OpenAI API密钥，请设置OPENAI_API_KEY环境变量');
    }

    try {
      const requestOptions = {
        method: 'post',
        url: this.apiUrl,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          model: 'gpt-4.1',
          messages,
          temperature: 0.7,
        },
      };

      // 如果提供了工具，添加到请求中
      if (tools && tools.length > 0) {
        requestOptions.data.tools = tools;
        requestOptions.data.tool_choice = toolChoice;
      }

      // 记录请求开始
      this.logger.openai.requestStarted(requestId, messages, tools);

      // 详细记录请求数据
      this.logger.info(`OpenAI API请求数据[${requestId}]`, {
        event: 'openai_request_data',
        requestId,
        requestData: this._formatLogContent(requestOptions.data, 'request'),
      });

      const response = await axios(requestOptions);
      const responseTime = Date.now() - startTime;

      // 记录响应完成
      this.logger.openai.requestCompleted(requestId, responseTime, response.status);

      // 详细记录完整响应，但格式化后更友好
      this.logger.info(`OpenAI API响应数据概览[${requestId}]`, {
        event: 'openai_response_overview',
        requestId,
        responseData: this._formatLogContent(response.data, 'response'),
      });

      // 保留原有的详细日志，但仅在debug级别
      this.logger.openai.responseReceived(requestId, response.data);

      return response.data;
    } catch (error) {
      // 记录详细的错误信息
      this.logger.error(`OpenAI API调用详细错误[${requestId}]`, {
        event: 'openai_request_error_detail',
        requestId,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorMessage: error.message,
        errorData: error.response?.data,
      });

      // 记录请求失败
      this.logger.openai.requestFailed(requestId, error);

      throw new Error(
        `OpenAI API调用失败: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * 处理函数调用
   * @param {Object} response - AI服务响应
   * @param {string} sessionId - 会话ID
   * @param {Object} mcpSessions - MCP会话信息
   * @param {Function} toolCallHandler - 工具调用处理器
   * @returns {Promise<Object>} 处理后的响应
   */
  async handleFunctionCalling(response, sessionId, mcpSessions, toolCallHandler) {
    const requestId = uuidv4();

    if (!response.choices || !response.choices[0]) {
      this.logger.warn('收到无效的OpenAI响应，无法处理函数调用', { sessionId, requestId });
      return { type: 'text', content: '无法处理AI响应' };
    }

    const message = response.choices[0].message;

    // 如果有工具调用
    if (message.tool_calls && message.tool_calls.length > 0) {
      this.logger.functionCalling.detected(requestId, message.tool_calls);

      // 处理所有的工具调用
      const results = [];
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          let functionArgs = {};

          try {
            // 增强的参数解析逻辑
            if (toolCall.function.arguments && typeof toolCall.function.arguments === 'string') {
              // 去除可能的空白字符，确保JSON解析有效
              const trimmedArgs = toolCall.function.arguments.trim();

              // 记录函数调用参数
              this.logger.info(`函数调用参数[${requestId}][${functionName}]`, {
                event: 'function_call_args',
                requestId,
                functionName,
                rawArgs: trimmedArgs,
              });

              if (trimmedArgs === '') {
                this.logger.debug(`函数 "${functionName}" 提供了空参数字符串，使用空对象`, {
                  requestId,
                });
              } else if (trimmedArgs === '{}') {
                this.logger.debug(`函数 "${functionName}" 提供了空对象，使用空对象`, { requestId });
              } else {
                try {
                  functionArgs = JSON.parse(trimmedArgs);
                  this.logger.debug(`成功解析函数 "${functionName}" 的参数`, {
                    requestId,
                    functionArgs,
                  });
                } catch (jsonError) {
                  this.logger.error(`解析函数 "${functionName}" 参数失败`, {
                    requestId,
                    jsonError: jsonError.message,
                    trimmedArgs,
                  });
                  functionArgs = {}; // 解析失败时使用空对象
                }
              }
            } else {
              this.logger.debug(`函数 "${functionName}" 没有提供有效参数，使用空对象`, {
                requestId,
              });
            }

            // 检查必需参数是否存在
            for (const mcpName in mcpSessions) {
              const mcpSession = mcpSessions[mcpName];
              const toolDef = mcpSession.tools.find(t => t.name === functionName);

              if (toolDef && toolDef.parameters && toolDef.parameters.required) {
                const missingParams = toolDef.parameters.required.filter(
                  param => !functionArgs[param],
                );

                if (missingParams.length > 0) {
                  this.logger.warn(`函数 "${functionName}" 缺少必需参数`, {
                    requestId,
                    missingParams,
                  });
                }
              }
            }
          } catch (e) {
            this.logger.error('解析函数参数失败', {
              requestId,
              error: e.message,
              arguments: toolCall.function.arguments,
            });
          }

          // 查找对应的MCP和工具
          let foundTool = false;
          let toolResult = null;

          // 记录可用的MCP和工具
          this.logger.debug('当前可用的MCP服务', {
            requestId,
            services: Object.entries(mcpSessions).map(([name, session]) => ({
              name,
              toolCount: session.tools.length,
              tools: session.tools.map(t => t.name),
            })),
          });

          for (const mcpName in mcpSessions) {
            const mcpSession = mcpSessions[mcpName];
            const hasTool = mcpSession.tools.some(t => t.name === functionName);

            if (hasTool) {
              this.logger.debug(`在MCP "${mcpName}" 中找到工具 "${functionName}"`, { requestId });
              foundTool = true;

              try {
                this.logger.debug(`准备调用MCP "${mcpName}" 的工具 "${functionName}"`, {
                  requestId,
                  functionArgs,
                });

                const toolCallStart = Date.now();
                const toolCallResult = await toolCallHandler(mcpName, functionName, functionArgs);
                const toolCallTime = Date.now() - toolCallStart;

                // 记录工具调用结果
                this.logger.info(
                  `工具调用结果[${requestId}][${functionName}] 耗时: ${toolCallTime}ms`,
                  {
                    event: 'function_call_result',
                    requestId,
                    functionName,
                    duration: toolCallTime,
                    resultSummary:
                      typeof toolCallResult === 'object'
                        ? `对象 [${Object.keys(toolCallResult).length} 个属性]`
                        : `${typeof toolCallResult} [${String(toolCallResult).length} 字节]`,
                  },
                );

                // 使用OpenAI API期望的格式
                results.push({
                  tool_call_id: toolCall.id,
                  function_name: functionName,
                  result: JSON.stringify(toolCallResult),
                });

                this.logger.debug(`工具 "${functionName}" 调用成功`, {
                  requestId,
                  result: toolCallResult,
                });
              } catch (error) {
                this.logger.error(`工具 "${functionName}" 调用失败`, {
                  requestId,
                  error: error.message,
                });

                // 使用OpenAI API期望的格式
                results.push({
                  tool_call_id: toolCall.id,
                  function_name: functionName,
                  result: JSON.stringify({ error: error.message }),
                });
              }

              break;
            }
          }

          // 如果没有找到对应的工具
          if (!foundTool) {
            this.logger.warn(`未找到工具 "${functionName}"`, { requestId });

            // 使用OpenAI API期望的格式
            results.push({
              tool_call_id: toolCall.id,
              function_name: functionName,
              result: JSON.stringify({ error: `工具 "${functionName}" 不可用` }),
            });
          }
        }
      }

      this.logger.functionCalling.completed(requestId, results);

      // 返回函数调用结果
      return {
        type: 'function_call',
        calls: message.tool_calls,
        results: results,
      };
    }

    // 如果是普通文本响应
    return { type: 'text', content: message.content };
  }

  /**
   * 转换MCP工具格式
   * @param {Array<Object>} mcpTools - MCP工具列表
   * @returns {Array<Object>} 转换后的工具列表
   */
  convertMcpToolsToServiceFormat(mcpTools) {
    if (!mcpTools || !Array.isArray(mcpTools)) return [];

    return mcpTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || `执行${tool.name}操作`,
        parameters: tool.parameters || {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    }));
  }

  /**
   * 格式化日志输出的工具函数
   * @private
   */
  _formatLogContent(content, type = 'default') {
    try {
      if (typeof content === 'string') {
        return content;
      }

      if (type === 'request') {
        // 格式化请求消息，隐藏过长内容
        if (content.messages && Array.isArray(content.messages)) {
          return {
            ...content,
            messages: content.messages.map(msg => ({
              role: msg.role,
              content:
                typeof msg.content === 'string' && msg.content.length > 500
                  ? `${msg.content.substring(0, 500)}... [内容长度: ${msg.content.length}]`
                  : msg.content,
            })),
          };
        }
      } else if (type === 'response') {
        // 格式化响应消息，提取关键信息
        const formattedResponse = {
          model: content.model,
          usage: content.usage,
          choices: content.choices?.map(choice => ({
            index: choice.index,
            finish_reason: choice.finish_reason,
            message: choice.message
              ? {
                  role: choice.message.role,
                  content_length: choice.message.content ? choice.message.content.length : 0,
                  content_preview: choice.message.content
                    ? choice.message.content.length > 100
                      ? `${choice.message.content.substring(0, 100)}...`
                      : choice.message.content
                    : null,
                  has_tool_calls: choice.message.tool_calls ? choice.message.tool_calls.length : 0,
                }
              : null,
          })),
        };
        return formattedResponse;
      }
      return content;
    } catch (error) {
      this.logger.warn('格式化日志内容失败', { error: error.message });
      return content;
    }
  }
}

module.exports = OpenAIService;
