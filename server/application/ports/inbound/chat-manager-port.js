// src/application/ports/inbound/chat-manager-port.js

/**
 * 聊天管理入站端口
 * 定义聊天功能的使用接口
 */
class ChatManagerPort {
  /**
   * 处理聊天消息
   * @param {string} sessionId - 会话ID
   * @param {string} message - 用户消息
   * @returns {Promise<{success: boolean, response?: Object, error?: string}>}
   */
  async processChat(sessionId, message) {
    throw new Error('Not implemented');
  }

  /**
   * 获取聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, history?: Array<Object>, error?: string}>}
   */
  async getChatHistory(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 清除聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async clearChatHistory(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 测试函数调用
   * @param {string} sessionId - 会话ID
   * @param {string} message - 测试消息
   * @returns {Promise<{success: boolean, response?: Object, error?: string}>}
   */
  async testFunctionCall(sessionId, message) {
    throw new Error('Not implemented');
  }
}

module.exports = ChatManagerPort;
