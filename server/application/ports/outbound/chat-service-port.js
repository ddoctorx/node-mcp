// src/application/ports/outbound/chat-service-port.js

/**
 * 聊天服务出站端口
 * 定义与外部聊天服务（如OpenAI）交互的接口
 */
class ChatServicePort {
  /**
   * 处理聊天请求
   * @param {Array<Object>} messages - 消息历史
   * @param {Array<Object>} [tools] - 可用工具列表
   * @param {string} [toolChoice] - 工具选择策略
   * @returns {Promise<Object>} 聊天响应
   */
  async callChatCompletion(messages, tools, toolChoice) {
    throw new Error('Not implemented');
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
    throw new Error('Not implemented');
  }

  /**
   * 转换MCP工具格式
   * @param {Array<Object>} mcpTools - MCP工具列表
   * @returns {Array<Object>} 转换后的工具列表
   */
  convertMcpToolsToServiceFormat(mcpTools) {
    throw new Error('Not implemented');
  }
}

module.exports = ChatServicePort;
