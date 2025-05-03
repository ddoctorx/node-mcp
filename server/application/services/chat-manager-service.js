// src/application/services/chat-manager-service.js

const ChatManagerPort = require('../ports/inbound/chat-manager-port');

/**
 * 聊天管理服务
 * 负责处理聊天对话、管理聊天历史和协调函数调用
 */
class ChatManagerService extends ChatManagerPort {
  /**
   * @param {SessionManagerService} sessionManager - 会话管理服务
   * @param {McpManagerService} mcpManager - MCP管理服务
   * @param {ChatServicePort} chatService - 聊天服务
   * @param {ChatHistoryRepositoryPort} historyRepository - 聊天历史仓储
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(sessionManager, mcpManager, chatService, historyRepository, logger) {
    super();
    this.sessionManager = sessionManager;
    this.mcpManager = mcpManager;
    this.chatService = chatService;
    this.historyRepository = historyRepository;
    this.logger = logger;
  }

  /**
   * 处理聊天消息
   * @param {string} sessionId - 会话ID
   * @param {string} message - 用户消息
   * @returns {Promise<{success: boolean, response?: Object, error?: string}>}
   */
  async processChat(sessionId, message) {
    this.logger.info(`处理聊天消息`, { sessionId, messageLength: message.length });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      // 获取历史对话
      const chatHistory = await this.historyRepository.getHistory(sessionId);

      // 添加用户消息到历史
      const userMessage = {
        role: 'user',
        content: message,
      };
      await this.historyRepository.saveMessage(sessionId, userMessage);

      // 获取可用的MCP工具
      const mcpResult = await this.mcpManager.getSessionMcps(sessionId);
      if (!mcpResult.success) {
        throw new Error(`获取MCP列表失败: ${mcpResult.error}`);
      }

      const tools = this._extractMcpTools(mcpResult.mcps);

      // 准备聊天服务请求
      const callHistory = [...chatHistory, userMessage];

      // 调用聊天服务（如 OpenAI）
      const response = await this.chatService.callChatCompletion(
        callHistory,
        tools.length > 0 ? tools : null,
      );

      // 处理响应，包括可能的函数调用
      const processedResponse = await this.chatService.handleFunctionCalling(
        response,
        sessionId,
        this._buildMcpSessions(mcpResult.mcps),
        (mcpName, toolName, params) => {
          return this._toolCallHandler(sessionId, mcpName, toolName, params);
        },
      );

      // 保存响应到历史
      await this._saveResponse(sessionId, processedResponse);

      return {
        success: true,
        response: processedResponse,
      };
    } catch (error) {
      this.logger.error('聊天处理失败', { sessionId, error: error.message, stack: error.stack });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, history?: Array<Object>, error?: string}>}
   */
  async getChatHistory(sessionId) {
    this.logger.debug(`获取聊天历史`, { sessionId });

    try {
      // 验证会话存在
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      const history = await this.historyRepository.getHistory(sessionId);

      // 格式化历史消息
      const formattedHistory = history.map((entry, index) => {
        const message = {
          id: entry.id || `msg-${index}`,
          role: entry.role,
          content: entry.content || '',
          time: entry.time || new Date().toISOString(),
        };

        // 处理工具调用信息
        if (entry.tool_calls) {
          message.functionCalls = entry.tool_calls.map(tool => ({
            name: tool.function?.name || '',
            params: tool.function?.arguments ? JSON.parse(tool.function.arguments) : {},
          }));
        }

        return message;
      });

      return {
        success: true,
        history: formattedHistory,
      };
    } catch (error) {
      this.logger.error('获取聊天历史失败', { sessionId, error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 清除聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async clearChatHistory(sessionId) {
    this.logger.info(`清除聊天历史`, { sessionId });

    try {
      // 验证会话存在
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      await this.historyRepository.clearHistory(sessionId);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('清除聊天历史失败', { sessionId, error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 测试函数调用
   * @param {string} sessionId - 会话ID
   * @param {string} message - 测试消息
   * @returns {Promise<{success: boolean, response?: Object, error?: string}>}
   */
  async testFunctionCall(sessionId, message) {
    this.logger.info('开始测试函数调用', { sessionId, messageLength: message.length });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      // 准备工具列表
      const mcpResult = await this.mcpManager.getSessionMcps(sessionId);
      if (!mcpResult.success) {
        throw new Error(`获取MCP列表失败: ${mcpResult.error}`);
      }

      const tools = this._extractMcpTools(mcpResult.mcps);

      this.logger.info('为测试准备工具完成', { sessionId, toolCount: tools.length });

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

      // 强制使用函数调用（如果有工具的话）
      const toolChoice = tools.length > 0 ? 'auto' : 'none';

      // 调用聊天服务
      const response = await this.chatService.callChatCompletion(
        messages,
        tools.length > 0 ? tools : null,
        toolChoice,
      );

      // 处理函数调用响应
      const processedResponse = await this.chatService.handleFunctionCalling(
        response,
        sessionId,
        this._buildMcpSessions(mcpResult.mcps),
        (mcpName, toolName, params) => {
          return this._toolCallHandler(sessionId, mcpName, toolName, params);
        },
      );

      // 处理函数调用结果并获取最终答案
      if (processedResponse.type === 'function_call') {
        this.logger.info('函数调用成功，准备获取最终回答', {
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

        // 再次调用聊天服务，获取最终回答
        const followUpResponse = await this.chatService.callChatCompletion(messages);

        if (followUpResponse.choices?.[0]?.message?.content) {
          const finalContent = followUpResponse.choices[0].message.content;

          return {
            success: true,
            response: {
              type: 'function_result',
              function_calls: processedResponse.calls,
              results: processedResponse.results,
              final_response: finalContent,
              messages: messages,
            },
          };
        } else {
          throw new Error('无法获取模型的最终回复');
        }
      }

      // 返回处理结果（非函数调用情况）
      return {
        success: true,
        response: {
          type: 'text',
          content: processedResponse.content,
          messages: messages,
        },
      };
    } catch (error) {
      this.logger.error('测试函数调用失败', {
        sessionId,
        error: error.message,
        stack: error.stack,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 提取MCP工具列表并转换为可用格式
   * @private
   */
  _extractMcpTools(mcps) {
    const tools = [];

    for (const mcp of mcps) {
      if (mcp.tools && mcp.tools.length > 0) {
        const openaiTools = this.chatService.convertMcpToolsToServiceFormat(mcp.tools);
        tools.push(...openaiTools);
      }
    }

    return tools;
  }

  /**
   * 构建MCP会话映射
   * @private
   */
  _buildMcpSessions(mcps) {
    const mcpSessions = {};

    for (const mcp of mcps) {
      mcpSessions[mcp.name] = {
        name: mcp.name,
        clientType: mcp.clientType,
        tools: mcp.tools,
        status: mcp.status,
      };
    }

    return mcpSessions;
  }

  /**
   * 工具调用处理器
   * @private
   */
  async _toolCallHandler(sessionId, mcpName, toolName, params) {
    const result = await this.mcpManager.callMcpTool(sessionId, mcpName, toolName, params);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.result;
  }

  /**
   * 保存响应到历史
   * @private
   */
  async _saveResponse(sessionId, response) {
    if (response.type === 'text') {
      await this.historyRepository.saveMessage(sessionId, {
        role: 'assistant',
        content: response.content,
      });
    } else if (response.type === 'function_call') {
      // 保存助手的工具调用消息
      await this.historyRepository.saveMessage(sessionId, {
        role: 'assistant',
        content: null,
        tool_calls: response.calls,
      });

      // 保存所有工具执行结果
      for (const result of response.results) {
        await this.historyRepository.saveMessage(sessionId, {
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.result,
        });
      }
    }
  }
}

module.exports = ChatManagerService;
