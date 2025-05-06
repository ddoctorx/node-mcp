// 服务器启动脚本
const { app, server, io } = require('./app');
const { logger } = require('./utils/logger');

// 捕获终止信号
process.on('SIGINT', () => {
  logger.info('收到SIGINT信号，优雅关闭服务器...');
  shutdown();
});

process.on('SIGTERM', () => {
  logger.info('收到SIGTERM信号，优雅关闭服务器...');
  shutdown();
});

// 定义一个标志，防止多次调用shutdown
let isShuttingDown = false;

// 优雅关闭函数
function shutdown() {
  // 如果已经在关闭过程中，则直接返回
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('开始关闭服务器...');

  // 先关闭Socket.IO连接
  if (io) {
    io.close(() => {
      logger.info('Socket.IO服务已关闭');

      // 然后关闭HTTP服务器
      server.close(() => {
        logger.info('HTTP服务器已关闭');

        // 清理其他资源
        try {
          // 清理MCP池和生命周期管理器
          if (global.mcpPool) {
            logger.info('正在清理MCP服务池...');
            global.mcpPool.shutdown && global.mcpPool.shutdown();
          }

          if (global.lifecycleController) {
            logger.info('正在停止生命周期管理器...');
            global.lifecycleController.stop && global.lifecycleController.stop();
          }

          logger.info('所有资源已清理完毕，服务器安全关闭');
          process.exit(0);
        } catch (error) {
          logger.error('清理资源时出错', { error: error.message });
          process.exit(1);
        }
      });
    });
  } else {
    // 如果没有Socket.IO，直接关闭HTTP服务器
    server.close(() => {
      logger.info('HTTP服务器已关闭');
      process.exit(0);
    });
  }

  // 如果10秒内没有关闭，则强制退出
  setTimeout(() => {
    logger.error('无法在规定时间内关闭，强制退出');
    process.exit(1);
  }, 10000);
}
