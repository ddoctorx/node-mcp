// src/infrastructure/adapters/outbound/persistence/in-memory-session-repository.js

const SessionRepositoryPort = require('../../../../application/ports/outbound/session-repository-port');
const Session = require('../../../../domain/entities/session');

/**
 * 内存会话仓储
 * 提供会话的内存存储实现
 */
class InMemorySessionRepository extends SessionRepositoryPort {
  constructor() {
    super();
    // 主会话存储
    this._sessions = new Map();
    // 用户会话映射
    this._userSessions = new Map();
  }

  /**
   * 保存会话
   * @param {Session} session - 会话实体
   * @returns {Promise<void>}
   */
  async save(session) {
    if (!(session instanceof Session)) {
      throw new Error('session必须是Session实例');
    }

    // 保存到主存储
    this._sessions.set(session.id, session);

    // 更新用户会话映射
    this._addUserSession(session.userId, session.id);
  }

  /**
   * 根据ID查找会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Session|null>} 会话实体，如果不存在返回null
   */
  async findById(sessionId) {
    return this._sessions.get(sessionId) || null;
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async remove(sessionId) {
    const session = this._sessions.get(sessionId);

    if (session) {
      // 从主存储中移除
      this._sessions.delete(sessionId);

      // 从用户会话映射中移除
      const userSessionIds = this._userSessions.get(session.userId);
      if (userSessionIds) {
        userSessionIds.delete(sessionId);

        // 如果用户没有任何会话了，清理用户映射
        if (userSessionIds.size === 0) {
          this._userSessions.delete(session.userId);
        }
      }
    }
  }

  /**
   * 根据用户ID查找会话
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Session>>} 会话列表
   */
  async findByUserId(userId) {
    const sessionIds = this._userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    const sessions = [];
    for (const sessionId of sessionIds) {
      const session = this._sessions.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * 检查会话是否存在
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>}
   */
  async exists(sessionId) {
    return this._sessions.has(sessionId);
  }

  /**
   * 清空所有会话（用于测试）
   * @returns {Promise<void>}
   */
  async clear() {
    this._sessions.clear();
    this._userSessions.clear();
  }

  /**
   * 添加用户会话映射
   * @private
   */
  _addUserSession(userId, sessionId) {
    if (!this._userSessions.has(userId)) {
      this._userSessions.set(userId, new Set());
    }
    this._userSessions.get(userId).add(sessionId);
  }

  /**
   * 获取所有会话（调试用）
   * @returns {Promise<Array<Session>>}
   */
  async getAllSessions() {
    return Array.from(this._sessions.values());
  }

  /**
   * 获取仓储统计信息
   * @returns {Promise<Object>}
   */
  async getStats() {
    const stats = {
      totalSessions: this._sessions.size,
      totalUsers: this._userSessions.size,
      userStats: {},
    };

    // 计算每个用户的会话数
    for (const [userId, sessionIds] of this._userSessions.entries()) {
      stats.userStats[userId] = {
        sessionCount: sessionIds.size,
        sessionIds: Array.from(sessionIds),
      };
    }

    return stats;
  }

  /**
   * 批量保存会话
   * @param {Array<Session>} sessions - 会话列表
   * @returns {Promise<void>}
   */
  async saveMany(sessions) {
    for (const session of sessions) {
      await this.save(session);
    }
  }

  /**
   * 根据条件查找会话
   * @param {Function} predicate - 筛选条件函数
   * @returns {Promise<Array<Session>>}
   */
  async findWhere(predicate) {
    const results = [];
    for (const session of this._sessions.values()) {
      if (predicate(session)) {
        results.push(session);
      }
    }
    return results;
  }

  /**
   * 更新会话
   * @param {string} sessionId - 会话ID
   * @param {Function} updater - 更新函数，接收session并返回新的session
   * @returns {Promise<Session|null>}
   */
  async update(sessionId, updater) {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const updatedSession = updater(session);
    await this.save(updatedSession);
    return updatedSession;
  }
}

module.exports = InMemorySessionRepository;
