// 主应用入口文件
// 初始化服务器并配置各个模块

// 加载环境变量，必须在最顶部
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

// 导入自定义模块
const { logger } = require('./utils/logger');
const setupRoutes = require('./routes');
const mcpPoolModule = require('./services/mcp-pool');
const lifecycleManager = require('./services/lifecycle-manager');
const proxy = require('./middlewares/proxy');
const mcpFactories = require('./services/mcp-factories');

// 创建Express应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 配置参数
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// 预定义的MCP服务器配置
let predefinedMcpServers = {};
// 尝试加载MCP服务器配置文件
try {
  const configPath = path.join(__dirname, '../config/mcp-servers.json');
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    if (config.mcpServers) {
      predefinedMcpServers = config.mcpServers;
      logger.info(`已加载预定义MCP服务器配置`, {
        servers: Object.keys(predefinedMcpServers),
      });
    }
  }
} catch (error) {
  logger.error(`加载MCP服务器配置失败`, { error: error.message });
}

// 初始化MCP服务池
const mcpPool = mcpPoolModule.init({
  createStdioMcp: mcpFactories.createStdioMcpFactory,
  createSseMcp: mcpFactories.createSseMcpFactory,
});
logger.info('MCP服务池已初始化');

// 保存mcpPool到registry，供其他模块使用
const registry = require('./core/registry');
registry.setMcpPool(mcpPool);
// 保持向后兼容，也保存到global对象
global.mcpPool = mcpPool;
logger.info('MCP服务池已保存到registry和global对象');

// 初始化生命周期管理器
const lifecycleController = lifecycleManager.init(
  {
    // 默认配置
    checkInterval: 60 * 1000, // 1分钟检查一次
    idleTimeout: 5 * 60 * 1000, // 5分钟无活动则回收
    autoCleanup: true,
  },
  // 终止实例的回调函数
  async (instanceId, mcpSession) => {
    return await mcpPool.removeMcpInstance(instanceId);
  },
);
// 将生命周期控制器保存到全局对象，供API路由使用
global.lifecycleController = lifecycleController;
logger.info('生命周期管理器已初始化并保存到全局对象', {
  checkInterval: '60秒',
  idleTimeout: '5分钟',
  autoCleanup: true,
});

// 创建并集成反向代理路由
const proxyRouter = proxy.createProxyRouter();
app.use('/api/proxy', proxyRouter);
logger.info('反向代理路由已创建并集成');

// 配置API路由
setupRoutes(app);
logger.info('API路由已配置');

// Socket.IO连接处理
io.on('connection', socket => {
  logger.info('新的Socket.IO连接', { socketId: socket.id });

  // 处理断开连接
  socket.on('disconnect', () => {
    logger.info('Socket.IO连接断开', { socketId: socket.id });
  });

  // 可以添加其他Socket.IO事件处理...
});

// 启动服务器
server.listen(PORT, () => {
  logger.info(`服务器已启动，监听端口: ${PORT}`);
  logger.info(`API地址: http://localhost:${PORT}/api`);
});

// 错误处理
process.on('uncaughtException', error => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason: reason.message || reason, stack: reason.stack });
});

module.exports = { app, server, io };
