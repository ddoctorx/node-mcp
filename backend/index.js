// 服务器启动脚本
const { app, server } = require('./app');
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

// 优雅关闭函数
function shutdown() {
  logger.info('开始关闭服务器...');

  server.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });

  // 如果10秒内没有关闭，则强制退出
  setTimeout(() => {
    logger.error('无法在规定时间内关闭，强制退出');
    process.exit(1);
  }, 10000);
}
