// src/application/ports/outbound/session-repository-port.js

/**
 * 会话仓储出站端口
 * 定义会话持久化操作的接口
 */
class SessionRepositoryPort {
  /**
   * 保存会话
   * @param {Object} session - 会话实体
   * @returns {Promise<void>}
   */
  async save(session) {
    throw new Error('Not implemented');
  }

  /**
   * 根据ID查找会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object|null>} 会话实体，如果不存在返回null
   */
  async findById(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async remove(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 根据用户ID查找会话
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Object>>} 会话列表
   */
  async findByUserId(userId) {
    throw new Error('Not implemented');
  }

  /**
   * 检查会话是否存在
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>}
   */
  async exists(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 清空所有会话（用于测试）
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('Not implemented');
  }
}

module.exports = SessionRepositoryPort;
