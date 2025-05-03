// src/infrastructure/config/lifecycle-config.js

const LifecycleService = require('../../application/services/lifecycle-service');
const LifecycleAdapter = require('../adapters/outbound/lifecycle/lifecycle-adapter');

/**
 * 创建生命周期服务管理器
 * @param {Object} dependencies - 依赖项
 * @returns {Object} 生命周期管理接口
 */
function createLifecycleManager(dependencies) {
  const { instanceRegistry, timerService, logger, config } = dependencies;

  const lifecycleService = new LifecycleService(instanceRegistry, timerService, logger, config);

  return lifecycleService;
}

/**
 * 创建与原始代码兼容的生命周期管理器
 * @param {Object} config - 配置选项
 * @param {Function} terminateCallback - 终止回调
 * @returns {Object} 生命周期控制接口
 */
function createCompatibleLifecycleManager(config, terminateCallback) {
  return LifecycleAdapter.init(config, terminateCallback);
}

module.exports = {
  createLifecycleManager,
  createCompatibleLifecycleManager,
};
