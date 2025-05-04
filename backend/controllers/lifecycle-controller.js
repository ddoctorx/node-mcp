// 生命周期控制器
// 管理MCP实例的生命周期和清理操作

const { logger } = require('../utils/logger');
const registry = require('../core/registry');

// 获取全局生命周期控制器实例
function getLifecycleController() {
  return global.lifecycleController || null;
}

/**
 * 手动触发清理空闲MCP实例
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 */
async function cleanupIdleInstances(req, res) {
  try {
    const lifecycleController = getLifecycleController();

    if (!lifecycleController || typeof lifecycleController.runCleanupNow !== 'function') {
      logger.error('生命周期控制器未正确初始化');
      return res.status(500).json({
        success: false,
        error: '生命周期控制器未正确初始化',
      });
    }

    logger.info('手动触发空闲MCP实例清理');

    // 获取清理前的实例数量
    const beforeStats = registry.getAllInstances().length;

    // 执行清理
    await lifecycleController.runCleanupNow();

    // 获取清理后的实例数量
    const afterStats = registry.getAllInstances().length;
    const cleanedCount = beforeStats - afterStats;

    logger.info(`空闲实例清理完成，已清理 ${cleanedCount} 个实例`, {
      before: beforeStats,
      after: afterStats,
    });

    res.json({
      success: true,
      cleanedCount,
      message: `已成功清理 ${cleanedCount} 个空闲实例`,
    });
  } catch (error) {
    logger.error('清理空闲实例时出错', { error: error.message });

    res.status(500).json({
      success: false,
      error: `清理空闲实例失败: ${error.message}`,
    });
  }
}

module.exports = {
  cleanupIdleInstances,
};
