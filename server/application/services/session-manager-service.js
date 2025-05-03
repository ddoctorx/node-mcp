// src/application/services/session-manager-service.js

const Session = require('../../domain/entities/session');
const SessionManagerPort = require('../ports/inbound/session-manager-port');

/**
 * 会话管理服务
 * 负责会话的创建、管理和生命周期控制
 */
class SessionManagerService extends SessionManagerPort {
  /**
   * @param {SessionRepositoryPort} sessionRepository - 会话仓储
   * @param {IdGeneratorPort} idGenerator - ID生成器
   * @param {LoggerPort} logger - 日志服务
   * @param {InstanceRegistry} instanceRegistry - 实例注册器（用于跨会话共享MCP）
   */
  constructor(sessionRepository, idGenerator, logger, instanceRegistry) {
    super();
    this.sessionRepository = sessionRepository;
    this.idGenerator = idGenerator;
    this.logger = logger;
    this.instanceRegistry = instanceRegistry;
  }

  /**
   * 创建新会话
   * @param {string} [userId] - 用户ID（可选）
   * @returns {Promise<{sessionId: string, userId: string}>}
   */
  async createSession(userId) {
    const sessionId = this.idGenerator.generate();
    const actualUserId = userId || `anonymous-${this.idGenerator.generate()}`;

    const session = new Session(sessionId, actualUserId);

    // 如果是已认证用户，从其他会话加载MCP实例
    if (userId && !userId.startsWith('anonymous-')) {
      await this._loadUserMcpInstances(session);
    }

    await this.sessionRepository.save(session);

    this.logger.info('已创建新会话', {
      sessionId,
      userId: actualUserId,
      mcpConnections: session.getAllMcpConnections().length,
    });

    return {
      sessionId,
      userId: actualUserId,
    };
  }

  /**
   * 获取会话信息
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Session|null>} 会话实体，如果不存在返回null
   */
  async getSession(sessionId) {
    const session = await this.sessionRepository.findById(sessionId);

    if (session) {
      this.logger.debug('获取会话成功', { sessionId });
    } else {
      this.logger.debug('会话不存在', { sessionId });
    }

    return session;
  }

  /**
   * 删除会话
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId) {
    const session = await this.sessionRepository.findById(sessionId);

    if (session) {
      // 释放所有MCP连接
      const connections = session.getAllMcpConnections();
      for (const connection of connections) {
        if (connection.instanceId) {
          this.instanceRegistry.dissociateSession(sessionId, connection.instanceId);
        }
      }
    }

    await this.sessionRepository.remove(sessionId);

    this.logger.info('已删除会话', { sessionId });
  }

  /**
   * 列出用户的所有会话
   * @param {string} userId - 用户ID
   * @returns {Promise<Array<Object>>} 会话列表
   */
  async listUserSessions(userId) {
    const sessions = await this.sessionRepository.findByUserId(userId);

    return sessions.map(session => ({
      sessionId: session.id,
      userId: session.userId,
      createdAt: session.createdAt,
      mcpConnectionCount: session.getAllMcpConnections().length,
    }));
  }

  /**
   * 加载用户的MCP实例到会话
   * @private
   */
  async _loadUserMcpInstances(session) {
    this.logger.info(`开始为用户[${session.userId}]加载实例到会话[${session.id}]`);

    const userInstances = this.instanceRegistry.findUserInstances(session.userId);

    for (const instance of userInstances) {
      if (instance.mcpSession && instance.isAvailable()) {
        this.logger.debug(`准备加载实例[${instance.instanceId}]到会话[${session.id}]`);

        session.addMcpConnection(instance.mcpSession.name, {
          instanceId: instance.instanceId,
          name: instance.mcpSession.name,
          clientType: instance.mcpSession.clientType,
          tools: instance.mcpSession.tools,
          status: instance.mcpSession.status,
          command: instance.mcpSession.command,
          args: instance.mcpSession.args,
          env: instance.mcpSession.env,
          url: instance.mcpSession.url,
          isExternal: instance.mcpSession.isExternal || true,
        });

        // 关联会话与实例
        this.instanceRegistry.associateSession(session.id, instance.instanceId);
      }
    }

    this.logger.info(
      `已加载用户 ${session.userId} 的 ${userInstances.length} 个MCP实例到新会话 ${session.id}`,
    );
  }

  /**
   * 更新会话的MCP连接
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {Object} mcpConnection - MCP连接信息
   * @returns {Promise<void>}
   */
  async updateMcpConnection(sessionId, mcpName, mcpConnection) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    session.addMcpConnection(mcpName, mcpConnection);
    await this.sessionRepository.save(session);

    this.logger.debug(`已更新会话的MCP连接`, {
      sessionId,
      mcpName,
      instanceId: mcpConnection.instanceId,
    });
  }

  /**
   * 移除会话的MCP连接
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @returns {Promise<void>}
   */
  async removeMcpConnection(sessionId, mcpName) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    session.removeMcpConnection(mcpName);
    await this.sessionRepository.save(session);

    this.logger.debug(`已移除会话的MCP连接`, {
      sessionId,
      mcpName,
    });
  }

  /**
   * 获取会话的MCP连接
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @returns {Promise<Object|null>} MCP连接信息
   */
  async getMcpConnection(sessionId, mcpName) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return session.getMcpConnection(mcpName);
  }

  /**
   * 列出会话的所有MCP连接
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Array<Object>>} MCP连接列表
   */
  async listMcpConnections(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return [];
    }

    return session.getAllMcpConnections();
  }

  /**
   * 清理过期的匿名会话
   * @param {number} maxAge - 最大存活时间（毫秒）
   * @returns {Promise<number>} 清理的会话数量
   */
  async cleanupExpiredSessions(maxAge = 24 * 60 * 60 * 1000) {
    // 默认24小时
    this.logger.info('开始清理过期的匿名会话', { maxAge });

    const allSessions = await this.sessionRepository.getAllSessions();
    const now = Date.now();
    let cleanedCount = 0;

    for (const session of allSessions) {
      if (session.isAnonymous() && now - session.createdAt.getTime() > maxAge) {
        await this.deleteSession(session.id);
        cleanedCount++;
      }
    }

    this.logger.info(`清理了 ${cleanedCount} 个过期的匿名会话`);
    return cleanedCount;
  }
}

module.exports = SessionManagerService;
