// src/infrastructure/adapters/inbound/http/pool-controller.js

/**
 * 池控制器
 * 处理MCP池管理相关的HTTP请求
 */
class PoolController {
  /**
   * @param {PoolManagerService} poolManager - 池管理服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(poolManager, logger) {
    this.poolManager = poolManager;
    this.logger = logger;

    // 绑定this上下文
    this.getStats = this.getStats.bind(this);
    this.getAllInstances = this.getAllInstances.bind(this);
    this.cleanupIdle = this.cleanupIdle.bind(this);
    this.updateLifecycleConfig = this.updateLifecycleConfig.bind(this);
  }

  /**
   * 获取池统计信息 - GET /api/pool/stats
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getStats(req, res) {
    try {
      this.logger.info('获取MCP池统计信息');

      const result = await this.poolManager.getPoolStats();

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        stats: result.stats,
      });
    } catch (error) {
      this.logger.error('获取池统计失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取池统计失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取所有实例 - GET /api/pool/instances
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getAllInstances(req, res) {
    try {
      this.logger.info('获取所有MCP实例列表');

      const result = await this.poolManager.getAllInstances();

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        instances: result.instances,
      });
    } catch (error) {
      this.logger.error('获取实例列表失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取实例列表失败: ${error.message}`,
      });
    }
  }

  /**
   * 清理空闲实例 - POST /api/pool/cleanup
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async cleanupIdle(req, res) {
    try {
      this.logger.info('执行空闲实例清理');

      const result = await this.poolManager.cleanupIdleInstances();

      if (!result.success) {
        return res.status(500).json(result);
      }

      this.logger.info(`清理了${result.cleaned}个空闲实例`);

      res.json({
        success: true,
        cleaned: result.cleaned,
        message: `成功清理了${result.cleaned}个空闲实例`,
      });
    } catch (error) {
      this.logger.error('清理空闲实例失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `清理空闲实例失败: ${error.message}`,
      });
    }
  }

  /**
   * 更新生命周期配置 - PUT /api/pool/lifecycle
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async updateLifecycleConfig(req, res) {
    try {
      const { config } = req.body;

      this.logger.info('更新生命周期配置', { config });

      if (!config || typeof config !== 'object') {
        return res.status(400).json({
          success: false,
          error: '无效的配置格式，必须是对象',
        });
      }

      const result = await this.poolManager.updateLifecycleConfig(config);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({
        success: true,
        message: '生命周期配置已更新',
      });
    } catch (error) {
      this.logger.error('更新生命周期配置失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `更新生命周期配置失败: ${error.message}`,
      });
    }
  }

  /**
   * 创建路由器
   * @static
   * @param {PoolController} controller - 控制器实例
   * @returns {Router} Express路由器
   */
  static createRouter(controller) {
    const router = require('express').Router();

    // 定义路由
    router.get('/stats', controller.getStats);
    router.get('/instances', controller.getAllInstances);
    router.post('/cleanup', controller.cleanupIdle);
    router.put('/lifecycle', controller.updateLifecycleConfig);

    return router;
  }
}

module.exports = PoolController;
