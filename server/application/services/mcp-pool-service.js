// src/application/services/mcp-pool-service.js

const McpConfig = require('../../domain/value-objects/mcp-config');

/**
 * MCP池服务
 * 负责MCP实例的创建、复用和管理
 */
class McpPoolService {
  /**
   * @param {InstanceRegistry} instanceRegistry - 实例注册器
   * @param {McpConnectorFactory} connectorFactory - MCP连接器工厂
   * @param {IdGeneratorPort} idGenerator - ID生成器
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(instanceRegistry, connectorFactory, idGenerator, logger) {
    this.instanceRegistry = instanceRegistry;
    this.connectorFactory = connectorFactory;
    this.idGenerator = idGenerator;
    this.logger = logger;
  }

  /**
   * 获取或创建MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @param {Object} config - MCP配置
   * @param {string} clientType - 客户端类型
   * @param {string} userId - 用户ID
   * @returns {Promise<Object>} 实例信息
   */
  async getOrCreateMcpInstance(sessionId, name, config, clientType, userId = 'anonymous') {
    this.logger.info(`尝试获取或创建MCP实例`, {
      sessionId,
      userId,
      mcpName: name,
      clientType,
    });

    try {
      // 创建配置对象
      const mcpConfig = this._createMcpConfig(config, clientType);

      // 检查是否有匹配的实例可用
      const existingInstance = this.instanceRegistry.findMatching(mcpConfig);

      if (existingInstance) {
        this.logger.info(`找到匹配的MCP实例，准备复用`, {
          sessionId,
          userId,
          instanceId: existingInstance.instanceId,
          mcpName: name,
        });

        // 将新会话关联到该实例
        this.instanceRegistry.associateSession(sessionId, existingInstance.instanceId);

        // 返回实例信息
        return {
          success: true,
          isNew: false,
          instanceId: existingInstance.instanceId,
          mcp: this._buildMcpInfo(name, existingInstance.mcpSession),
        };
      }

      // 没有找到可用实例，创建新的实例
      return await this._createNewInstance(sessionId, name, mcpConfig, clientType, userId);
    } catch (error) {
      this.logger.error(`创建MCP实例失败`, {
        sessionId,
        userId,
        mcpName: name,
        error: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        error: `创建MCP实例失败: ${error.message}`,
      };
    }
  }

  /**
   * 释放会话对MCP实例的使用
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功释放
   */
  releaseMcpInstance(sessionId, instanceId) {
    this.logger.info(`释放会话对MCP实例的使用`, { sessionId, instanceId });
    return this.instanceRegistry.dissociateSession(sessionId, instanceId);
  }

  /**
   * 从池中移除MCP实例
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功移除
   */
  removeMcpInstance(instanceId) {
    this.logger.info(`从池中移除MCP实例`, { instanceId });

    // 获取实例详情
    const instance = this.instanceRegistry.getById(instanceId);
    if (!instance) {
      return false;
    }

    // 断开连接
    try {
      const connector = this.connectorFactory.createConnector(instance.mcpSession.clientType);
      connector.disconnect(instance);
    } catch (error) {
      this.logger.error(`断开MCP实例连接失败:`, { instanceId, error: error.message });
    }

    // 从注册表中移除
    return this.instanceRegistry.remove(instanceId);
  }

  /**
   * 获取池统计信息
   * @returns {Object} 统计信息
   */
  getPoolStats() {
    return this.instanceRegistry.getStats();
  }

  /**
   * 获取用户的MCP实例
   * @param {string} userId - 用户ID
   * @returns {Array<Object>} 实例列表
   */
  getUserInstances(userId) {
    if (!userId) return [];
    return this.instanceRegistry.findUserInstances(userId);
  }

  /**
   * 获取实例详情
   * @param {string} instanceId - 实例ID
   * @returns {Object|null} 实例详情
   */
  getInstanceDetail(instanceId) {
    const instance = this.instanceRegistry.getById(instanceId);
    return instance ? instance.getDetails() : null;
  }

  /**
   * 清理空闲实例
   * @param {number} idleTimeout - 空闲超时时间（毫秒）
   * @returns {Promise<number>} 清理的实例数量
   */
  async cleanupIdleInstances(idleTimeout = 5 * 60 * 1000) {
    this.logger.info('执行MCP实例空闲清理检查...');

    const idleInstances = this.instanceRegistry.getIdleInstances(idleTimeout);

    if (idleInstances.length === 0) {
      this.logger.info('没有发现空闲的MCP实例');
      return 0;
    }

    this.logger.info(`发现 ${idleInstances.length} 个空闲MCP实例需要清理`);

    let cleanedCount = 0;
    for (const instance of idleInstances) {
      try {
        this.logger.info(
          `正在终止空闲MCP实例 [${instance.instanceId}] ${instance.mcpSession.name}`,
        );

        // 断开实例连接
        const connector = this.connectorFactory.createConnector(instance.mcpSession.clientType);
        await connector.disconnect(instance);

        // 从注册表中移除实例
        this.instanceRegistry.remove(instance.instanceId);
        cleanedCount++;

        this.logger.info(`已成功清理空闲MCP实例 [${instance.instanceId}]`);
      } catch (err) {
        this.logger.error(`清理MCP实例 [${instance.instanceId}] 失败:`, err);
      }
    }

    return cleanedCount;
  }

  /**
   * 创建MCP配置对象
   * @private
   */
  _createMcpConfig(config, clientType) {
    if (clientType === 'stdio') {
      if (config.command && config.args) {
        return McpConfig.stdio(config.command, config.args, config.env, config.setup);
      } else if (typeof config === 'string') {
        return McpConfig.from(config);
      }
    } else if (clientType === 'sse') {
      if (config.url) {
        return McpConfig.sse(config.url);
      }
    }

    throw new Error('无效的MCP配置格式');
  }

  /**
   * 创建新的MCP实例
   * @private
   */
  async _createNewInstance(sessionId, name, mcpConfig, clientType, userId) {
    this.logger.info(`没有找到匹配的MCP实例，创建新实例`, {
      sessionId,
      userId,
      mcpName: name,
    });

    // 生成实例ID
    const instanceId = this.idGenerator.generate();

    // 创建连接器
    const connector = this.connectorFactory.createConnector(clientType);

    // 连接到MCP服务
    const mcpSession = await connector.connect(mcpConfig);

    // 添加名称到会话信息
    const enrichedMcpSession = {
      name,
      ...mcpSession,
    };

    // 注册实例
    this.instanceRegistry.register(instanceId, mcpConfig, enrichedMcpSession, userId);

    // 关联会话
    this.instanceRegistry.associateSession(sessionId, instanceId);

    this.logger.info(`已创建并注册新的MCP实例`, {
      sessionId,
      userId,
      instanceId,
      mcpName: name,
      clientType,
    });

    // 返回实例信息
    return {
      success: true,
      isNew: true,
      instanceId: instanceId,
      mcp: this._buildMcpInfo(name, enrichedMcpSession),
    };
  }

  /**
   * 构建MCP信息
   * @private
   */
  _buildMcpInfo(name, mcpSession) {
    return {
      name,
      clientType: mcpSession.clientType,
      command: mcpSession.command,
      args: mcpSession.args,
      env: mcpSession.env,
      url: mcpSession.url,
      tools: mcpSession.tools,
      status: mcpSession.status,
    };
  }
}

module.exports = McpPoolService;
