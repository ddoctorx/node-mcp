// src/infrastructure/adapters/outbound/lifecycle/lifecycle-adapter.js

/**
 * 生命周期管理适配器
 * 提供与原始代码兼容的接口，同时使用六边形架构的服务层
 */
class LifecycleAdapter {
  /**
   * @param {LifecycleService} lifecycleService - 生命周期服务
   */
  constructor(lifecycleService) {
    this.lifecycleService = lifecycleService;
  }

  /**
   * 初始化生命周期管理器
   * @static
   * @param {Object} [config] - 配置选项
   * @param {Function} [terminateCallback] - 终止实例回调
   * @returns {Object} 控制接口
   */
  static init(config = {}, terminateCallback) {
    // 默认配置与原始代码一致
    const defaultConfig = {
      checkInterval: 60 * 1000, // 1分钟
      idleTimeout: 5 * 60 * 1000, // 5分钟
      maxLifetime: 24 * 60 * 60 * 1000, // 24小时
      autoCleanup: true,
    };

    const mergedConfig = { ...defaultConfig, ...config };

    // 从依赖注入容器或全局配置获取服务
    const lifecycleService = this._getLifecycleService(mergedConfig);

    const adapter = new LifecycleAdapter(lifecycleService);

    // 启动生命周期管理并返回控制接口
    return adapter.lifecycleService.start(terminateCallback);
  }

  /**
   * 获取生命周期服务实例
   * @private
   * @static
   */
  static _getLifecycleService(config) {
    // 这里假设有一个全局的依赖注入容器
    const container = global.__dep_injection_container__ || global.container;

    if (container && container.getLifecycleService) {
      return container.getLifecycleService(config);
    }

    throw new Error('无法获取生命周期服务，请检查依赖注入配置');
  }
}

module.exports = LifecycleAdapter;
