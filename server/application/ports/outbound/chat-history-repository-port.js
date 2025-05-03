// src/application/ports/outbound/chat-history-repository-port.js

/**
 * 聊天历史仓储出站端口
 * 定义聊天历史存储操作的接口
 */
class ChatHistoryRepositoryPort {
  /**
   * 保存聊天消息
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   * @returns {Promise<void>}
   */
  async saveMessage(sessionId, message) {
    throw new Error('Not implemented');
  }

  /**
   * 获取聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Array<Object>>} 消息列表
   */
  async getHistory(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 清除聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async clearHistory(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 批量保存消息
   * @param {string} sessionId - 会话ID
   * @param {Array<Object>} messages - 消息列表
   * @returns {Promise<void>}
   */
  async saveMessages(sessionId, messages) {
    throw new Error('Not implemented');
  }
}

module.exports = ChatHistoryRepositoryPort;
