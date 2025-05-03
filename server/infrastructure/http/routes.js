// src/infrastructure/http/routes.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

// 路由中间件
const middleware = require('./middleware');

// 控制器
const SessionController = require('../adapters/inbound/http/session-controller');
const McpController = require('../adapters/inbound/http/mcp-controller');
const ChatController = require('../adapters/inbound/http/chat-controller');
const ProxyController = require('../adapters/inbound/http/proxy-controller');
const PoolController = require('../adapters/inbound/http/pool-controller');

/**
 * 设置应用路由
 * @param {Object} dependencies - 依赖注入容器
 * @returns {express.Router} 路由器
 */
function setupRoutes(dependencies) {
  const router = express.Router();
  const { logger } = dependencies;

  // 应用安全中间件
  router.use(helmet());

  // 启用 CORS
  router.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    }),
  );

  // 启用压缩
  router.use(compression());

  // 请求日志中间件
  router.use(middleware.requestLogger(logger));

  // 错误处理中间件
  router.use(middleware.errorHandler(logger));

  // 设置API路由
  setupApiRoutes(router, dependencies);

  // 健康检查端点
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // 404处理
  router.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
    });
  });

  return router;
}

/**
 * 设置API路由
 * @private
 * @param {express.Router} router - Express路由器
 * @param {Object} dependencies - 依赖注入容器
 */
function setupApiRoutes(router, dependencies) {
  const { logger, controllers } = dependencies;

  // 创建API子路由器
  const apiRouter = express.Router();

  // 应用API级别的中间件
  apiRouter.use(express.json());
  apiRouter.use(express.urlencoded({ extended: true }));

  // 会话管理路由
  apiRouter.use('/session', setupSessionRoutes(controllers.session));

  // MCP管理路由
  apiRouter.use('/mcp', setupMcpRoutes(controllers.mcp));

  // 聊天管理路由
  apiRouter.use('/chat', setupChatRoutes(controllers.chat));

  // 代理路由
  apiRouter.use('/proxy', setupProxyRoutes(controllers.proxy));

  // 池管理路由
  apiRouter.use('/pool', setupPoolRoutes(controllers.pool));

  // 系统路由
  apiRouter.use('/system', setupSystemRoutes(dependencies));

  // 测试路由（开发环境）
  if (process.env.NODE_ENV !== 'production') {
    apiRouter.use('/test', setupTestRoutes(dependencies));
  }

  // 将API路由挂载到主路由器
  router.use('/api', apiRouter);
}

/**
 * 设置会话路由
 * @private
 * @param {SessionController} controller - 控制器实例
 * @returns {express.Router} 路由器
 */
function setupSessionRoutes(controller) {
  const router = express.Router();

  // 创建会话
  router.post('/', controller.createSession);

  // 获取会话信息
  router.get('/:sessionId', controller.getSession);

  // 删除会话
  router.delete('/:sessionId', controller.deleteSession);

  // 列出用户会话
  router.get('/user/:userId', controller.listUserSessions);

  // 清理过期会话
  router.post('/cleanup', controller.cleanupExpiredSessions);

  return router;
}

/**
 * 设置MCP路由
 * @private
 * @param {McpController} controller - 控制器实例
 * @returns {express.Router} 路由器
 */
function setupMcpRoutes(controller) {
  const router = express.Router();

  // 添加MCP连接
  router.post('/', controller.addMcp);

  // 移除MCP连接
  router.delete('/', controller.removeMcp);

  // 获取MCP列表
  router.get('/', controller.getMcps);

  // 获取预定义服务器列表
  router.get('/predefined', controller.getPredefinedServers);

  // 更新预定义服务器配置
  router.post('/predefined/update', controller.updatePredefinedServers);

  // 调用MCP工具
  router.post('/call', controller.callMcpTool);

  // 获取MCP实例状态
  router.get('/instance/:instanceId', controller.getMcpInstanceStatus);

  // 连接到已有实例
  router.post('/connect-instance', controller.connectToExistingInstance);

  return router;
}

/**
 * 设置聊天路由
 * @private
 * @param {ChatController} controller - 控制器实例
 * @returns {express.Router} 路由器
 */
function setupChatRoutes(controller) {
  const router = express.Router();

  // 发送聊天消息
  router.post('/', controller.sendMessage);

  // 获取聊天历史 (使用query参数)
  router.get('/', controller.getHistory);

  // 清除聊天历史 (使用query参数)
  router.delete('/', controller.clearHistory);

  // 兼容路径参数方式的聊天历史
  router.get('/history/:sessionId', (req, res) => {
    req.query.sessionId = req.params.sessionId;
    controller.getHistory(req, res);
  });

  router.delete('/history/:sessionId', (req, res) => {
    req.query.sessionId = req.params.sessionId;
    controller.clearHistory(req, res);
  });

  return router;
}

/**
 * 设置代理路由
 * @private
 * @param {ProxyController} controller - 控制器实例
 * @returns {express.Router} 路由器
 */
function setupProxyRoutes(controller) {
  return ProxyController.createRouter(controller);
}

/**
 * 设置池路由
 * @private
 * @param {PoolController} controller - 控制器实例
 * @returns {express.Router} 路由器
 */
function setupPoolRoutes(controller) {
  return PoolController.createRouter(controller);
}

/**
 * 设置系统路由
 * @private
 * @param {Object} dependencies - 依赖注入容器
 * @returns {express.Router} 路由器
 */
function setupSystemRoutes(dependencies) {
  const router = express.Router();
  const { mcpConfigLoader, logger } = dependencies;

  // 获取系统Python路径
  router.get('/python-paths', async (req, res) => {
    try {
      const pythonPaths = await mcpConfigLoader.getSystemPaths('python');
      res.json({
        success: true,
        pythonPaths,
      });
    } catch (error) {
      logger.error('获取Python路径失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取Python路径失败: ${error.message}`,
      });
    }
  });

  // 获取系统信息
  router.get('/info', async (req, res) => {
    try {
      const envConfig = await mcpConfigLoader.getEnvConfig();
      res.json({
        success: true,
        info: envConfig,
      });
    } catch (error) {
      logger.error('获取系统信息失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取系统信息失败: ${error.message}`,
      });
    }
  });

  return router;
}

/**
 * 设置测试路由（仅开发环境）
 * @private
 * @param {Object} dependencies - 依赖注入容器
 * @returns {express.Router} 路由器
 */
function setupTestRoutes(dependencies) {
  const router = express.Router();
  const { controllers } = dependencies;

  // 测试函数调用
  router.post('/function-call', controllers.chat.testFunctionCall);

  return router;
}

module.exports = setupRoutes;
