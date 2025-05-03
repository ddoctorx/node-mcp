// src/infrastructure/adapters/outbound/mcp/mcp-pool-adapter.js

/**
 * MCP池适配器
 * 提供与原始代码兼容的接口，同时使用六边形架构的服务层
 */
class McpPoolAdapter {
  /**
   * @param {McpPoolService} mcpPoolService - MCP池服务
   */
  constructor(mcpPoolService) {
    this.mcpPoolService = mcpPoolService;
  }

  /**
   * 获取或创建MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @param {Object} config - MCP配置
   * @param {string} clientType - 客户端类型
   * @returns {Promise<Object>} 实例信息
   */
  async getOrCreateMcpInstance(sessionId, name, config, clientType) {
    return this.mcpPoolService.getOrCreateMcpInstance(sessionId, name, config, clientType);
  }

  /**
   * 释放MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功
   */
  releaseMcpInstance(sessionId, instanceId) {
    return this.mcpPoolService.releaseMcpInstance(sessionId, instanceId);
  }

  /**
   * 移除MCP实例
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功
   */
  removeMcpInstance(instanceId) {
    return this.mcpPoolService.removeMcpInstance(instanceId);
  }

  /**
   * 获取池统计信息
   * @returns {Object} 统计信息
   */
  getPoolStats() {
    return this.mcpPoolService.getPoolStats();
  }

  /**
   * 获取用户的MCP实例
   * @param {string} userId - 用户ID
   * @returns {Array<Object>} 实例列表
   */
  getUserInstances(userId) {
    return this.mcpPoolService.getUserInstances(userId);
  }

  /**
   * 获取实例详情
   * @param {string} instanceId - 实例ID
   * @returns {Object|null} 实例详情
   */
  getInstanceDetail(instanceId) {
    return this.mcpPoolService.getInstanceDetail(instanceId);
  }

  /**
   * 清理空闲实例
   * @param {number} [idleTimeout] - 空闲超时时间（毫秒）
   * @returns {Promise<number>} 清理的实例数量
   */
  async cleanupIdleInstances(idleTimeout) {
    return this.mcpPoolService.cleanupIdleInstances(idleTimeout);
  }

  /**
   * 初始化方法 - 为了与原始代码兼容
   * @param {Object} config - 初始化配置
   * @returns {Object} 适配器接口
   */
  static init(config) {
    // 这个方法主要是为了兼容原始代码的 init 方法
    // 实际的初始化应该由依赖注入容器处理

    const { mcpPoolService } = config;
    const adapter = new McpPoolAdapter(mcpPoolService);

    return {
      getOrCreateMcpInstance: (...args) => adapter.getOrCreateMcpInstance(...args),
      releaseMcpInstance: (...args) => adapter.releaseMcpInstance(...args),
      removeMcpInstance: (...args) => adapter.removeMcpInstance(...args),
      getPoolStats: () => adapter.getPoolStats(),
      getUserInstances: (...args) => adapter.getUserInstances(...args),
      getInstanceDetail: (...args) => adapter.getInstanceDetail(...args),
      cleanupIdleInstances: (...args) => adapter.cleanupIdleInstances(...args),
    };
  }
}

module.exports = McpPoolAdapter;
