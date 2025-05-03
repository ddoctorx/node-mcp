// src/application/services/pool-manager-service.js

const PoolManagerPort = require('../ports/inbound/pool-manager-port');

/**
 * 池管理服务
 * 负责管理MCP实例池的统计、清理和配置
 */
class PoolManagerService extends PoolManagerPort {
  /**
   * @param {McpPoolService} mcpPool - MCP池服务
   * @param {LifecycleService} lifecycleService - 生命周期服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(mcpPool, lifecycleService, logger) {
    super();
    this.mcpPool = mcpPool;
    this.lifecycleService = lifecycleService;
    this.logger = logger;
  }

  /**
   * 获取池统计信息
   * @returns {Promise<{success: boolean, stats?: Object, error?: string}>}
   */
  async getPoolStats() {
    try {
      const poolStats = this.mcpPool.getPoolStats();
      const lifecycleStats = this.lifecycleService.getStats();

      return {
        success: true,
        stats: {
          pool: poolStats,
          lifecycle: lifecycleStats,
        },
      };
    } catch (error) {
      this.logger.error('获取池统计失败', { error: error.message });
      return {
        success: false,
        error: `获取池统计失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取所有实例列表
   * @returns {Promise<{success: boolean, instances?: Array<Object>, error?: string}>}
   */
  async getAllInstances() {
    try {
      const allInstances = this.mcpPool.getAllInstances();

      return {
        success: true,
        instances: allInstances,
      };
    } catch (error) {
      this.logger.error('获取实例列表失败', { error: error.message });
      return {
        success: false,
        error: `获取实例列表失败: ${error.message}`,
      };
    }
  }

  /**
   * 强制清理空闲实例
   * @returns {Promise<{success: boolean, cleaned?: number, error?: string}>}
   */
  async cleanupIdleInstances() {
    try {
      const cleaned = await this.mcpPool.cleanupIdleInstances();

      return {
        success: true,
        cleaned,
      };
    } catch (error) {
      this.logger.error('清理空闲实例失败', { error: error.message });
      return {
        success: false,
        error: `清理空闲实例失败: ${error.message}`,
      };
    }
  }

  /**
   * 更新生命周期配置
   * @param {Object} config - 新的配置
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateLifecycleConfig(config) {
    try {
      this.lifecycleService.updateConfig(config);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('更新生命周期配置失败', { error: error.message });
      return {
        success: false,
        error: `更新生命周期配置失败: ${error.message}`,
      };
    }
  }
}

module.exports = PoolManagerService;
