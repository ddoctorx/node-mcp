// src/application/services/lifecycle-service.js

/**
 * 生命周期管理服务
 * 负责MCP实例的生命周期管理，包括空闲清理和生命周期配置
 */
class LifecycleService {
  /**
   * @param {InstanceRegistry} instanceRegistry - 实例注册器
   * @param {TimerServicePort} timerService - 定时器服务
   * @param {LoggerPort} logger - 日志服务
   * @param {Object} [defaultConfig] - 默认配置
   */
  constructor(instanceRegistry, timerService, logger, defaultConfig = {}) {
    this.instanceRegistry = instanceRegistry;
    this.timerService = timerService;
    this.logger = logger;
    this.config = this._getDefaultConfig(defaultConfig);
    this.cleanupTimer = null;
    this.isRunning = false;
    this.terminateCallback = null;
  }

  /**
   * 启动生命周期管理
   * @param {Function} [terminateCallback] - 实例终止回调函数
   * @returns {Object} 控制接口
   */
  start(terminateCallback) {
    this.terminateCallback = terminateCallback;

    this.logger.info('启动MCP实例生命周期管理器', this.config);

    if (this.config.autoCleanup) {
      this.startCleanupScheduler();
    }

    return {
      startCleanup: () => this.startCleanupScheduler(),
      stopCleanup: () => this.stopCleanupScheduler(),
      runCleanupNow: () => this.cleanupIdleInstances(),
      updateConfig: newConfig => this.updateConfig(newConfig),
    };
  }

  /**
   * 启动清理调度器
   */
  startCleanupScheduler() {
    if (this.isRunning) {
      this.stopCleanupScheduler();
    }

    this.logger.info(
      `启动MCP实例生命周期管理器，检查间隔: ${this.config.checkInterval}ms, 空闲超时: ${this.config.idleTimeout}ms`,
    );

    // 先进行一次清理
    this.cleanupIdleInstances();

    // 创建定时任务
    this.cleanupTimer = this.timerService.setInterval(() => {
      this.cleanupIdleInstances();
    }, this.config.checkInterval);

    this.isRunning = true;
  }

  /**
   * 停止清理调度器
   */
  stopCleanupScheduler() {
    if (this.cleanupTimer) {
      this.timerService.clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.isRunning = false;
      this.logger.info('已停止MCP实例生命周期管理器');
    }
  }

  /**
   * 清理空闲实例
   * @returns {Promise<number>} 清理的实例数量
   */
  async cleanupIdleInstances() {
    this.logger.info('执行MCP实例空闲清理检查...');

    try {
      // 获取空闲实例
      const idleInstances = this.instanceRegistry.getIdleInstances(this.config.idleTimeout);

      if (idleInstances.length === 0) {
        this.logger.info('没有发现空闲的MCP实例');
        return 0;
      }

      this.logger.info(`发现 ${idleInstances.length} 个空闲MCP实例需要清理`);

      let cleanedCount = 0;

      // 依次终止每个空闲实例
      for (const instance of idleInstances) {
        try {
          this.logger.info(
            `正在终止空闲MCP实例 [${instance.instanceId}] ${instance.mcpSession.name}`,
          );

          // 调用终止回调（如果提供）
          if (typeof this.terminateCallback === 'function') {
            await this.terminateCallback(instance.instanceId, instance.mcpSession);
          }

          // 标记实例为终止状态
          instance.terminate();

          // 从注册表中移除实例
          this.instanceRegistry.remove(instance.instanceId);

          cleanedCount++;
          this.logger.info(`已成功清理空闲MCP实例 [${instance.instanceId}]`);
        } catch (err) {
          this.logger.error(`清理MCP实例 [${instance.instanceId}] 失败:`, err);
        }
      }

      return cleanedCount;
    } catch (err) {
      this.logger.error('MCP实例清理过程中发生错误:', err);
      return 0;
    }
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // 重新启动调度器以应用新配置
    if (this.isRunning) {
      this.stopCleanupScheduler();
      if (this.config.autoCleanup) {
        this.startCleanupScheduler();
      }
    }

    this.logger.info('已更新生命周期管理器配置', this.config);
  }

  /**
   * 检查实例最大生命周期
   * @returns {Promise<number>} 终止的实例数量
   */
  async checkMaxLifetime() {
    const allInstances = this.instanceRegistry.getAllInstances();
    const now = Date.now();
    let terminatedCount = 0;

    for (const instance of allInstances) {
      if (now - instance.createdTime > this.config.maxLifetime) {
        try {
          this.logger.info(`实例 [${instance.instanceId}] 超过最大生命周期，正在终止`);

          if (typeof this.terminateCallback === 'function') {
            await this.terminateCallback(instance.instanceId, instance.mcpSession);
          }

          instance.terminate();
          this.instanceRegistry.remove(instance.instanceId);
          terminatedCount++;
        } catch (err) {
          this.logger.error(`终止超期实例 [${instance.instanceId}] 失败:`, err);
        }
      }
    }

    return terminatedCount;
  }

  /**
   * 获取生命周期统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const registryStats = this.instanceRegistry.getStats();
    return {
      ...registryStats,
      isRunning: this.isRunning,
      config: { ...this.config },
      nextCleanupTime: this.isRunning ? Date.now() + this.config.checkInterval : null,
    };
  }

  /**
   * 设置终止回调
   * @param {Function} callback - 终止回调函数
   */
  setTerminateCallback(callback) {
    this.terminateCallback = callback;
  }

  /**
   * 获取默认配置
   * @private
   */
  _getDefaultConfig(userConfig) {
    return {
      checkInterval: 60 * 1000, // 1分钟
      idleTimeout: 5 * 60 * 1000, // 5分钟
      maxLifetime: 24 * 60 * 60 * 1000, // 24小时
      autoCleanup: true,
      ...userConfig,
    };
  }

  /**
   * 立即检查所有健康状态
   * @returns {Promise<Object>} 健康检查结果
   */
  async performHealthCheck() {
    const allInstances = this.instanceRegistry.getAllInstances();
    const healthReport = {
      timestamp: new Date().toISOString(),
      totalInstances: allInstances.length,
      healthy: 0,
      unhealthy: 0,
      idle: 0,
      issues: [],
    };

    for (const instance of allInstances) {
      const details = instance.getDetails();

      if (instance.isAvailable()) {
        healthReport.healthy++;
      } else {
        healthReport.unhealthy++;
        healthReport.issues.push({
          instanceId: instance.instanceId,
          status: details.status,
          age: Date.now() - instance.createdTime,
        });
      }

      if (instance.isIdle(this.config.idleTimeout)) {
        healthReport.idle++;
      }
    }

    return healthReport;
  }
}

module.exports = LifecycleService;
