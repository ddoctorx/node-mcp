// backend/services/lifecycle-manager.js
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
function init(config = {}, terminateCallback, healthCheckCallback = null) {
  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    healthCheckCallback,
    healthCheckTimeout: config.healthCheckTimeout || 5000,
  };
  terminateInstanceCallback = terminateCallback;

  if (mergedConfig.autoCleanup) {
    startCleanupScheduler(mergedConfig);
  }

  return {
    startCleanup: () => startCleanupScheduler(mergedConfig),
    stopCleanup: stopCleanupScheduler,
    runCleanupNow: () => cleanupIdleInstances(mergedConfig),
    runHealthCheck: () => checkAllInstancesHealth(mergedConfig),
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
// async function cleanupIdleInstances(config) {
//   logger.info('执行MCP实例空闲清理检查...');

//   try {
//     // 获取空闲实例
//     const idleInstances = registry.getIdleInstances(config.idleTimeout);

//     if (idleInstances.length === 0) {
//       logger.info('没有发现空闲的MCP实例');
//       return;
//     }

//     logger.info(`发现 ${idleInstances.length} 个空闲MCP实例需要清理`);

//     // 依次终止每个空闲实例
//     for (const instance of idleInstances) {
//       try {
//         logger.info(`正在终止空闲MCP实例 [${instance.instanceId}] ${instance.mcpSession.name}`);

//         if (typeof terminateInstanceCallback === 'function') {
//           await terminateInstanceCallback(instance.instanceId, instance.mcpSession);
//         }

//         // 从注册表中移除实例
//         registry.removeInstance(instance.instanceId);

//         logger.info(`已成功清理空闲MCP实例 [${instance.instanceId}]`);
//       } catch (err) {
//         logger.error(`清理MCP实例 [${instance.instanceId}] 失败:`, { error: err.message });
//       }
//     }
//   } catch (err) {
//     logger.error('MCP实例清理过程中发生错误:', { error: err.message });
//   }
// }

async function cleanupIdleInstances(config) {
  logger.info('执行MCP实例空闲清理检查...');

  try {
    // 获取空闲实例
    const idleInstances = registry.getIdleInstances(config.idleTimeout);

    // 获取超过最大生命期的实例
    const oldInstances = registry.getOldInstances(config.maxLifetime);

    // 合并两个集合并去重
    const allInstancesToCleanup = [...idleInstances];

    // 添加超过生命期的实例（避免重复）
    oldInstances.forEach(instance => {
      if (!allInstancesToCleanup.some(i => i.instanceId === instance.instanceId)) {
        allInstancesToCleanup.push(instance);
      }
    });

    if (allInstancesToCleanup.length === 0) {
      logger.info('没有发现需要清理的MCP实例');
      return;
    }

    logger.info(
      `发现 ${allInstancesToCleanup.length} 个MCP实例需要清理 (${idleInstances.length}个空闲, ${oldInstances.length}个超过生命期)`,
    );

    // 依次终止每个实例
    for (const instance of allInstancesToCleanup) {
      try {
        const reason = idleInstances.includes(instance) ? '空闲' : '超过最大生命期';
        logger.info(
          `正在终止${reason}的MCP实例 [${instance.instanceId}] ${instance.mcpSession.name}`,
        );

        // if (typeof terminateInstanceCallback === 'function') {
        //   await terminateInstanceCallback(instance.instanceId, instance.mcpSession);
        // }

        if (typeof terminateInstanceCallback === 'function') {
          // 使用超时包装的终止函数
          await terminateWithTimeout(
            instance.instanceId,
            instance.mcpSession,
            config.terminationTimeout || 10000,
          ).catch(async error => {
            // 如果是超时错误，尝试强制移除
            logger.warn(`终止实例[${instance.instanceId}]超时，尝试强制移除`, {
              error: error.message,
            });
            // 即使终止操作超时，也移除实例记录
            registry.removeInstance(instance.instanceId);
            throw error; // 重新抛出以便外层catch记录
          });
        }

        // 从注册表中移除实例
        registry.removeInstance(instance.instanceId);

        logger.info(`已成功清理MCP实例 [${instance.instanceId}]`);
      } catch (err) {
        logger.error(`清理MCP实例 [${instance.instanceId}] 失败:`, {
          instanceId: instance.instanceId,
          error: err.message,
          stack: err.stack,
        });
      }
    }
  } catch (err) {
    logger.error('MCP实例清理过程中发生错误:', { error: err.message });
  }
}

async function terminateWithTimeout(instanceId, mcpSession, timeout = 10000) {
  return Promise.race([
    terminateInstanceCallback(instanceId, mcpSession),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`终止实例[${instanceId}]操作超时`)), timeout);
    }),
  ]);
}

async function checkInstanceHealth(instance, config) {
  // 基础健康检查：检查实例是否超过最大生命期
  const now = Date.now();
  const age = now - instance.createdTime;

  if (age > config.maxLifetime) {
    return {
      healthy: false,
      reason: 'MAX_LIFETIME_EXCEEDED',
      details: { age, maxLifetime: config.maxLifetime },
    };
  }

  // 如果有健康检查回调，使用它检查实例健康状态
  if (typeof config.healthCheckCallback === 'function') {
    try {
      const healthResult = await Promise.race([
        config.healthCheckCallback(instance.instanceId, instance.mcpSession),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('健康检查超时')), config.healthCheckTimeout || 5000),
        ),
      ]);

      if (!healthResult || !healthResult.healthy) {
        return {
          healthy: false,
          reason: 'HEALTH_CHECK_FAILED',
          details: healthResult?.details || { error: '实例健康检查失败' },
        };
      }
    } catch (error) {
      return {
        healthy: false,
        reason: 'HEALTH_CHECK_ERROR',
        details: { error: error.message },
      };
    }
  }

  return { healthy: true };
}

// 检查所有实例健康状态的方法
async function checkAllInstancesHealth(config) {
  logger.info('执行MCP实例健康检查...');

  try {
    // 获取所有实例
    const allInstances = Object.values(registry.getAllInstances());

    if (allInstances.length === 0) {
      logger.info('没有实例需要检查健康状态');
      return { healthy: 0, unhealthy: 0, details: [] };
    }

    logger.info(`开始检查 ${allInstances.length} 个MCP实例的健康状态`);

    const results = [];
    let healthyCount = 0;
    let unhealthyCount = 0;

    // 检查每个实例的健康状态
    for (const instance of allInstances) {
      try {
        const healthResult = await checkInstanceHealth(instance, config);

        if (healthResult.healthy) {
          healthyCount++;
        } else {
          unhealthyCount++;
          logger.warn(`实例 [${instance.instanceId}] 健康检查失败: ${healthResult.reason}`, {
            details: healthResult.details,
          });

          // 如果设置了自动终止不健康的实例
          if (config.autoTerminateUnhealthy) {
            logger.info(`准备终止不健康的实例 [${instance.instanceId}]`);

            // 尝试终止实例
            if (typeof terminateInstanceCallback === 'function') {
              try {
                await terminateWithTimeout(
                  instance.instanceId,
                  instance.mcpSession,
                  config.terminationTimeout || 10000,
                );

                // 从注册表中移除实例
                registry.removeInstance(instance.instanceId);
                logger.info(`已成功终止不健康的实例 [${instance.instanceId}]`);
              } catch (err) {
                logger.error(`终止不健康实例 [${instance.instanceId}] 失败:`, {
                  error: err.message,
                });
              }
            }
          }
        }

        results.push({
          instanceId: instance.instanceId,
          healthy: healthResult.healthy,
          reason: healthResult.reason,
          details: healthResult.details,
        });
      } catch (err) {
        logger.error(`检查实例 [${instance.instanceId}] 健康状态时出错:`, {
          error: err.message,
        });
        results.push({
          instanceId: instance.instanceId,
          healthy: false,
          reason: 'CHECK_ERROR',
          details: { error: err.message },
        });
        unhealthyCount++;
      }
    }

    logger.info(`健康检查完成: ${healthyCount} 个健康, ${unhealthyCount} 个不健康`);

    return {
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      details: results,
    };
  } catch (err) {
    logger.error('MCP实例健康检查过程中发生错误:', { error: err.message });
    return {
      healthy: 0,
      unhealthy: 0,
      error: err.message,
      details: [],
    };
  }
}

module.exports = {
  init,
};
