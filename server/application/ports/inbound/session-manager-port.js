// src/application/ports/inbound/session-manager-port.js

/**
 * 会话管理入站端口
 * 定义会话管理的使用接口
 */
class SessionManagerPort {
  /**
   * 创建新会话
   * @param {string} userId - 用户ID（可选）
   * @returns {Promise<{sessionId: string, userId: string}>}
   */
  async createSession(userId) {
    throw new Error('Not implemented');
  }

  /**
   * 获取会话信息
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object|null>} 会话信息，如果不存在返回null
   */
  async getSession(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 列出用户的所有会话
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Object>>} 会话列表
   */
  async listUserSessions(userId) {
    throw new Error('Not implemented');
  }
}

module.exports = SessionManagerPort;
