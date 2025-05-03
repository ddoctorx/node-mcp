// src/infrastructure/server/server-setup.js

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

// 配置和依赖
const envConfig = require('../config/env-config');
const container = require('../config/container');
const setupRoutes = require('../http/routes');

/**
 * 服务器设置类
 * 负责配置和启动整个应用服务器
 */
class ServerSetup {
  /**
   * @param {Object} [options] - 服务器选项
   */
  constructor(options = {}) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, this._getSocketConfig());
    this.logger = null;
    this.config = envConfig;
    this.isInitialized = false;
  }

  /**
   * 初始化服务器
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // 初始化依赖容器
      await container.initialize();
      this.logger = container.get('logger');

      this.logger.info('初始化服务器...');

      // 配置Express应用
      this._configureExpress();

      // 设置路由
      this._setupRoutes();

      // 创建WebSocket适配器
      this._setupWebSocket();

      // 设置错误处理
      this._setupErrorHandling();

      this.isInitialized = true;
      this.logger.info('服务器初始化完成');
    } catch (error) {
      console.error('服务器初始化失败:', error);
      throw error;
    }
  }

  /**
   * 配置Express应用
   * @private
   */
  _configureExpress() {
    const config = this.config.getServerConfig();

    // 信任代理（用于正确获取IP地址）
    if (this.config.getSecurityConfig().trustProxy) {
      this.app.set('trust proxy', true);
    }

    // 设置视图引擎（如果需要）
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, '../../../views'));

    // 基础中间件
    this.app.use(express.json({ limit: this.config.getPerformanceConfig().maxRequestSize }));
    this.app.use(express.urlencoded({ extended: true }));

    // 静态文件服务
    this._setupStaticFiles();

    // 设置CORS和安全头
    this._setupSecurity();

    this.logger.info('Express配置完成');
  }

  /**
   * 设置静态文件服务
   * @private
   */
  _setupStaticFiles() {
    const frontendPath = this.config.getPath('frontend');
    const publicPath = this.config.getPath('public');

    // 服务前端构建文件
    if (frontendPath) {
      this.app.use(express.static(path.join(process.cwd(), frontendPath)));
    }

    // 服务公共资源
    this.app.use('/public', express.static(path.join(process.cwd(), publicPath)));

    this.logger.info('静态文件服务配置完成', { frontendPath, publicPath });
  }

  /**
   * 设置安全配置
   * @private
   */
  _setupSecurity() {
    const securityConfig = this.config.getSecurityConfig();
    const middleware = require('../http/middleware');

    // 安全头
    this.app.use(middleware.securityHeaders());

    // 限制请求大小
    this.app.use(middleware.requestSizeLimit(this.config.getPerformanceConfig().maxRequestSize));

    // 速率限制（根据环境调整）
    if (this.config.isProduction()) {
      this.app.use(
        middleware.rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 100,
        }),
      );
    }

    this.logger.info('安全配置完成');
  }

  /**
   * 设置路由
   * @private
   */
  _setupRoutes() {
    const router = setupRoutes(container.getAll());
    this.app.use(router);

    // 处理SPA路由（将所有未匹配的路由重定向到index.html）
    this.app.get('*', (req, res) => {
      const frontendPath = this.config.getPath('frontend');
      if (frontendPath) {
        res.sendFile(path.join(process.cwd(), frontendPath, 'index.html'));
      } else {
        res.status(404).json({ error: '未找到路由' });
      }
    });

    this.logger.info('路由配置完成');
  }

  /**
   * 设置WebSocket
   * @private
   */
  _setupWebSocket() {
    // 创建WebSocket适配器
    container.createWebSocketAdapters(this.io);

    // 获取WebSocket适配器
    const wsAdapter = container.get('wsAdapter');
    const sessionNotifier = container.get('sessionNotifier');

    this.logger.info('WebSocket配置完成');
  }

  /**
   * 设置错误处理
   * @private
   */
  _setupErrorHandling() {
    const middleware = require('../http/middleware');

    // 全局错误处理中间件
    this.app.use(middleware.errorHandler(this.logger));

    // 处理未捕获的异常
    process.on('uncaughtException', error => {
      this.logger.error('未捕获的异常', { error: error.message, stack: error.stack });
      this._gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('未处理的promise拒绝', { reason, promise });
    });

    // 优雅关闭
    this._setupGracefulShutdown();

    this.logger.info('错误处理配置完成');
  }

  /**
   * 设置优雅关闭
   * @private
   */
  _setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        this.logger.info(`收到${signal}信号，开始优雅关闭`);
        this._gracefulShutdown(signal);
      });
    });
  }

  /**
   * 执行优雅关闭
   * @private
   * @param {string} signal - 信号名称
   */
  async _gracefulShutdown(signal) {
    const shutdownTimeout = 10000; // 10秒超时
    let isShuttingDown = false;

    if (isShuttingDown) return;
    isShuttingDown = true;

    this.logger.info('开始执行优雅关闭...');

    // 设置关闭超时
    const timeout = setTimeout(() => {
      this.logger.error('关闭超时，强制退出');
      process.exit(1);
    }, shutdownTimeout);

    try {
      // 停止接收新请求
      this.server.close(() => {
        this.logger.info('HTTP服务器已关闭');
      });

      // 关闭WebSocket连接
      this.io.close(() => {
        this.logger.info('WebSocket服务器已关闭');
      });

      // 清理容器
      await container.shutdown();

      clearTimeout(timeout);
      this.logger.info('优雅关闭完成');
      process.exit(0);
    } catch (error) {
      this.logger.error('优雅关闭过程中出错', { error: error.message });
      clearTimeout(timeout);
      process.exit(1);
    }
  }

  /**
   * 启动服务器
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const port = this.config.getServerConfig().port;
    const host = this.config.getServerConfig().host;

    return new Promise((resolve, reject) => {
      this.server.listen(port, host, error => {
        if (error) {
          this.logger.error('服务器启动失败', { error: error.message });
          reject(error);
          return;
        }

        this.logger.info('服务器已启动', {
          host,
          port,
          env: this.config.getServerConfig().nodeEnv,
          url: `http://${host}:${port}`,
        });

        // 启动生命周期管理
        const lifecycleService = container.get('lifecycleService');
        const mcpPool = container.get('mcpPoolService');

        lifecycleService.start(async (instanceId, mcpSession) => {
          await mcpPool.removeMcpInstance(instanceId);
        });

        resolve();
      });
    });
  }

  /**
   * 获取服务器实例
   * @returns {http.Server} HTTP服务器实例
   */
  getServer() {
    return this.server;
  }

  /**
   * 获取Express应用
   * @returns {express.Application} Express应用实例
   */
  getApp() {
    return this.app;
  }

  /**
   * 获取Socket.IO服务器
   * @returns {SocketIO.Server} Socket.IO服务器实例
   */
  getIO() {
    return this.io;
  }

  /**
   * 获取Socket.IO配置
   * @private
   * @returns {Object} Socket.IO配置
   */
  _getSocketConfig() {
    const wsConfig = this.config.getWebSocketConfig();

    return {
      cors: {
        origin: wsConfig.corsOrigin,
        methods: ['GET', 'POST'],
      },
      pingTimeout: wsConfig.pingTimeout,
      pingInterval: wsConfig.pingInterval,
      transports: ['websocket', 'polling'],
    };
  }
}

// 创建服务器实例
const serverSetup = new ServerSetup();

module.exports = serverSetup;
