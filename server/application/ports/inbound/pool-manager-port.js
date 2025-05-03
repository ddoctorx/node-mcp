// src/application/ports/inbound/pool-manager-port.js

/**
 * 池管理入站端口
 * 定义MCP池管理的使用接口
 */
class PoolManagerPort {
  /**
   * 获取池统计信息
   * @returns {Promise<{success: boolean, stats?: Object, error?: string}>}
   */
  async getPoolStats() {
    throw new Error('Not implemented');
  }

  /**
   * 获取所有实例列表
   * @returns {Promise<{success: boolean, instances?: Array<Object>, error?: string}>}
   */
  async getAllInstances() {
    throw new Error('Not implemented');
  }

  /**
   * 强制清理空闲实例
   * @returns {Promise<{success: boolean, cleaned?: number, error?: string}>}
   */
  async cleanupIdleInstances() {
    throw new Error('Not implemented');
  }

  /**
   * 更新生命周期配置
   * @param {Object} config - 新的配置
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updateLifecycleConfig(config) {
    throw new Error('Not implemented');
  }
}

module.exports = PoolManagerPort;
