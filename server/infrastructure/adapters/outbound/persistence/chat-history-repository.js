// src/infrastructure/adapters/outbound/persistence/chat-history-repository.js

const ChatHistoryRepositoryPort = require('../../../../application/ports/outbound/chat-history-repository-port');

/**
 * 内存聊天历史仓储
 * 提供聊天历史的内存存储实现
 */
class InMemoryChatHistoryRepository extends ChatHistoryRepositoryPort {
  constructor() {
    super();
    // 聊天历史存储: sessionId -> Array<Message>
    this._chatHistories = new Map();
  }

  /**
   * 保存聊天消息
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   * @returns {Promise<void>}
   */
  async saveMessage(sessionId, message) {
    if (!sessionId) {
      throw new Error('sessionId不能为空');
    }
    if (!message) {
      throw new Error('message不能为空');
    }

    const formattedMessage = this._formatMessage(message);

    if (!this._chatHistories.has(sessionId)) {
      this._chatHistories.set(sessionId, []);
    }

    this._chatHistories.get(sessionId).push(formattedMessage);
  }

  /**
   * 获取聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Array<Object>>} 消息列表
   */
  async getHistory(sessionId) {
    if (!sessionId) {
      throw new Error('sessionId不能为空');
    }

    return this._chatHistories.get(sessionId) || [];
  }

  /**
   * 清除聊天历史
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async clearHistory(sessionId) {
    if (!sessionId) {
      throw new Error('sessionId不能为空');
    }

    this._chatHistories.delete(sessionId);
  }

  /**
   * 批量保存消息
   * @param {string} sessionId - 会话ID
   * @param {Array<Object>} messages - 消息列表
   * @returns {Promise<void>}
   */
  async saveMessages(sessionId, messages) {
    if (!sessionId) {
      throw new Error('sessionId不能为空');
    }
    if (!Array.isArray(messages)) {
      throw new Error('messages必须是数组');
    }

    if (!this._chatHistories.has(sessionId)) {
      this._chatHistories.set(sessionId, []);
    }

    const history = this._chatHistories.get(sessionId);
    const formattedMessages = messages.map(msg => this._formatMessage(msg));
    history.push(...formattedMessages);
  }

  /**
   * 格式化消息对象
   * @private
   */
  _formatMessage(message) {
    const formattedMessage = {
      role: message.role || 'user',
      content: message.content || null,
      time: message.time || new Date().toISOString(),
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    // 复制额外字段
    if (message.tool_calls) {
      formattedMessage.tool_calls = message.tool_calls;
    }
    if (message.tool_call_id) {
      formattedMessage.tool_call_id = message.tool_call_id;
    }
    if (message.functionCalls) {
      formattedMessage.functionCalls = message.functionCalls;
    }

    return formattedMessage;
  }

  /**
   * 获取最近的消息
   * @param {string} sessionId - 会话ID
   * @param {number} limit - 限制数量
   * @returns {Promise<Array<Object>>} 消息列表
   */
  async getRecentMessages(sessionId, limit = 10) {
    const history = await this.getHistory(sessionId);
    return history.slice(-limit);
  }

  /**
   * 搜索消息
   * @param {string} sessionId - 会话ID
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array<Object>>} 匹配的消息列表
   */
  async searchMessages(sessionId, query) {
    const history = await this.getHistory(sessionId);
    if (!query) return history;

    const lowercaseQuery = query.toLowerCase();
    return history.filter(
      message => message.content && message.content.toLowerCase().includes(lowercaseQuery),
    );
  }

  /**
   * 获取统计信息
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 统计信息
   */
  async getStats(sessionId) {
    const history = await this.getHistory(sessionId);

    const stats = {
      totalMessages: history.length,
      messagesByRole: {},
      messagesByDate: {},
      averageMessageLength: 0,
      hasToolCalls: false,
    };

    let totalLength = 0;

    history.forEach(message => {
      // 按角色统计
      stats.messagesByRole[message.role] = (stats.messagesByRole[message.role] || 0) + 1;

      // 按日期统计
      const date = message.time.split('T')[0];
      stats.messagesByDate[date] = (stats.messagesByDate[date] || 0) + 1;

      // 计算平均长度
      if (message.content) {
        totalLength += message.content.length;
      }

      // 检查是否有工具调用
      if (message.tool_calls || message.functionCalls) {
        stats.hasToolCalls = true;
      }
    });

    if (history.length > 0) {
      stats.averageMessageLength = Math.round(totalLength / history.length);
    }

    return stats;
  }

  /**
   * 导出聊天历史为JSON
   * @param {string} sessionId - 会话ID
   * @returns {Promise<string>} JSON字符串
   */
  async exportToJson(sessionId) {
    const history = await this.getHistory(sessionId);
    return JSON.stringify(history, null, 2);
  }

  /**
   * 从JSON导入聊天历史
   * @param {string} sessionId - 会话ID
   * @param {string} jsonData - JSON字符串
   * @returns {Promise<void>}
   */
  async importFromJson(sessionId, jsonData) {
    const messages = JSON.parse(jsonData);
    if (!Array.isArray(messages)) {
      throw new Error('无效的JSON格式');
    }

    // 清除现有历史
    await this.clearHistory(sessionId);

    // 导入新消息
    await this.saveMessages(sessionId, messages);
  }

  /**
   * 获取总统计信息
   * @returns {Promise<Object>} 总统计信息
   */
  async getTotalStats() {
    const stats = {
      totalSessions: this._chatHistories.size,
      totalMessages: 0,
      averageMessagesPerSession: 0,
      sessionsWithToolCalls: 0,
    };

    let messageCount = 0;
    let sessionsWithTools = 0;

    for (const [sessionId, history] of this._chatHistories.entries()) {
      messageCount += history.length;

      if (history.some(msg => msg.tool_calls || msg.functionCalls)) {
        sessionsWithTools++;
      }
    }

    stats.totalMessages = messageCount;
    if (stats.totalSessions > 0) {
      stats.averageMessagesPerSession = Math.round(messageCount / stats.totalSessions);
    }
    stats.sessionsWithToolCalls = sessionsWithTools;

    return stats;
  }

  /**
   * 清空所有聊天历史（用于测试）
   * @returns {Promise<void>}
   */
  async clear() {
    this._chatHistories.clear();
  }
}

module.exports = InMemoryChatHistoryRepository;
