// MCP实例生命周期管理器
// 负责自动清理空闲的MCP服务实例，防止资源浪费

const registry = require('../core/registry');
const { logger } = require('../utils/logger');

// 默认配置
const DEFAULT_CONFIG = {
  // 检查间隔（毫秒）
  checkInterval: 60 * 1000, // 1分钟
  // 空闲超时（毫秒）- 实例在这段时间内没有会话使用则被回收
  idleTimeout: 5 * 60 * 1000, // 5分钟
  // 最大生命周期（毫秒）- 实例总生存时间
  maxLifetime: 24 * 60 * 60 * 1000, // 24小时
  // 是否启用自动清理
  autoCleanup: true,
};

// 存储定时器ID
let cleanupIntervalId = null;

// 存储实例终止回调函数
let terminateInstanceCallback = null;

// 初始化生命周期管理器
function init(config = {}, terminateCallback) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  terminateInstanceCallback = terminateCallback;

  if (mergedConfig.autoCleanup) {
    startCleanupScheduler(mergedConfig);
  }

  return {
    startCleanup: () => startCleanupScheduler(mergedConfig),
    stopCleanup: stopCleanupScheduler,
    runCleanupNow: () => cleanupIdleInstances(mergedConfig),
    updateConfig: newConfig => {
      Object.assign(mergedConfig, newConfig);

      // 重新启动调度器以应用新配置
      if (cleanupIntervalId) {
        stopCleanupScheduler();
        if (mergedConfig.autoCleanup) {
          startCleanupScheduler(mergedConfig);
        }
      }
    },
  };
}

// 启动清理调度器
function startCleanupScheduler(config) {
  // 避免重复启动
  if (cleanupIntervalId) {
    stopCleanupScheduler();
  }

  logger.info(
    `启动MCP实例生命周期管理器，检查间隔: ${config.checkInterval}ms, 空闲超时: ${config.idleTimeout}ms`,
  );

  // 先进行一次清理
  cleanupIdleInstances(config);

  // 创建新的定时器
  cleanupIntervalId = setInterval(() => {
    cleanupIdleInstances(config);
  }, config.checkInterval);

  // 确保定时器不阻止进程退出
  if (cleanupIntervalId.unref) {
    cleanupIntervalId.unref();
  }
}

// 停止清理调度器
function stopCleanupScheduler() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('已停止MCP实例生命周期管理器');
  }
}

// 清理空闲实例
async function cleanupIdleInstances(config) {
  logger.info('执行MCP实例空闲清理检查...');

  try {
    // 获取空闲实例
    const idleInstances = registry.getIdleInstances(config.idleTimeout);

    if (idleInstances.length === 0) {
      logger.info('没有发现空闲的MCP实例');
      return;
    }

    logger.info(`发现 ${idleInstances.length} 个空闲MCP实例需要清理`);

    // 依次终止每个空闲实例
    for (const instance of idleInstances) {
      try {
        logger.info(`正在终止空闲MCP实例 [${instance.instanceId}] ${instance.mcpSession.name}`);

        if (typeof terminateInstanceCallback === 'function') {
          await terminateInstanceCallback(instance.instanceId, instance.mcpSession);
        }

        // 从注册表中移除实例
        registry.removeInstance(instance.instanceId);

        logger.info(`已成功清理空闲MCP实例 [${instance.instanceId}]`);
      } catch (err) {
        logger.error(`清理MCP实例 [${instance.instanceId}] 失败:`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error('MCP实例清理过程中发生错误:', { error: err.message });
  }
}

module.exports = {
  init,
};
