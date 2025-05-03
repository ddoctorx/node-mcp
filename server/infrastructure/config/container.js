// src/infrastructure/config/container.js

const path = require('path');

// 环境配置
const envConfig = require('./env-config');

// 基础服务
const WinstonLogger = require('../logging/winston-logger');
const IdGeneratorPort = require('../../application/ports/outbound/id-generator-port');
const TimerServicePort = require('../../application/ports/outbound/timer-service-port');

// 持久化
const InMemorySessionRepository = require('../adapters/outbound/persistence/in-memory-session-repository');
const InMemoryChatHistoryRepository = require('../adapters/outbound/persistence/chat-history-repository');

// 领域服务
const InstanceRegistry = require('../../domain/services/instance-registry');

// 应用服务
const SessionManagerService = require('../../application/services/session-manager-service');
const McpManagerService = require('../../application/services/mcp-manager-service');
const ChatManagerService = require('../../application/services/chat-manager-service');
const McpPoolService = require('../../application/services/mcp-pool-service');
const LifecycleService = require('../../application/services/lifecycle-service');
const PoolManagerService = require('../../application/services/pool-manager-service');
const ProxyManagerService = require('../../application/services/proxy-manager-service');

// 基础设施适配器
const McpConnectorFactory = require('../adapters/outbound/mcp/mcp-connector-factory');
const { ChatServiceFactory } = require('../adapters/outbound/chat/chat-service-adapter');
const SocketNotifier = require('../adapters/outbound/notification/socket-notifier');

// HTTP控制器
const SessionController = require('../adapters/inbound/http/session-controller');
const McpController = require('../adapters/inbound/http/mcp-controller');
const ChatController = require('../adapters/inbound/http/chat-controller');
const ProxyController = require('../adapters/inbound/http/proxy-controller');
const PoolController = require('../adapters/inbound/http/pool-controller');

// WebSocket适配器
const WebSocketAdapter = require('../adapters/inbound/websocket/websocket-adapter');
const SessionNotifier = require('../adapters/inbound/websocket/session-notifier');

// 配置服务
const McpConfigLoader = require('./mcp-config-loader');
const PredefinedServers = require('./predefined-servers');

/**
 * 依赖注入容器
 * 负责创建和管理应用的所有依赖关系
 */
class Container {
  constructor() {
    this._dependencies = {};
    this._initialized = false;
  }

  /**
   * 初始化容器
   * @param {Object} [options] - 初始化选项
   * @returns {Promise<void>}
   */
  async initialize(options = {}) {
    if (this._initialized) {
      return;
    }

    // 创建基础服务
    await this._createBaseServices();

    // 创建持久化服务
    await this._createPersistenceServices();

    // 创建领域服务
    await this._createDomainServices();

    // 创建MCP核心服务
    await this._createMcpServices();

    // 创建应用服务
    await this._createApplicationServices();

    // 创建配置服务
    await this._createConfigServices();

    // 创建基础设施适配器
    await this._createInfrastructureAdapters();

    // 创建HTTP控制器（最后创建，因为依赖于应用服务）
    await this._createControllers();

    this._initialized = true;
  }

  /**
   * 创建基础服务
   * @private
   */
  async _createBaseServices() {
    // 日志服务
    this._dependencies.logger = new WinstonLogger({
      level: envConfig.getLoggingConfig().level,
      logDir: envConfig.getLoggingConfig().directory,
    });

    // ID生成器
    this._dependencies.idGenerator = {
      generate: () => require('uuid').v4(),
      generateWithPrefix: prefix => `${prefix}-${require('uuid').v4()}`,
    };

    // 定时器服务
    this._dependencies.timerService = {
      setInterval: (callback, interval) => setInterval(callback, interval),
      clearInterval: timer => clearInterval(timer),
      setTimeout: (callback, timeout) => setTimeout(callback, timeout),
      clearTimeout: timer => clearTimeout(timer),
    };
  }

  /**
   * 创建持久化服务
   * @private
   */
  async _createPersistenceServices() {
    this._dependencies.sessionRepository = new InMemorySessionRepository();
    this._dependencies.chatHistoryRepository = new InMemoryChatHistoryRepository();
  }

  /**
   * 创建领域服务
   * @private
   */
  async _createDomainServices() {
    this._dependencies.instanceRegistry = new InstanceRegistry();
  }

  /**
   * 创建MCP服务
   * @private
   */
  async _createMcpServices() {
    // MCP连接器工厂
    this._dependencies.mcpConnectorFactory = new McpConnectorFactory(this._dependencies.logger);

    // MCP池服务
    this._dependencies.mcpPoolService = new McpPoolService(
      this._dependencies.instanceRegistry,
      this._dependencies.mcpConnectorFactory,
      this._dependencies.idGenerator,
      this._dependencies.logger,
    );
  }

  /**
   * 创建应用服务
   * @private
   */
  async _createApplicationServices() {
    // 会话管理服务
    this._dependencies.sessionManager = new SessionManagerService(
      this._dependencies.sessionRepository,
      this._dependencies.idGenerator,
      this._dependencies.logger,
      this._dependencies.instanceRegistry,
    );

    // MCP管理服务
    this._dependencies.mcpManager = new McpManagerService(
      this._dependencies.sessionManager,
      this._dependencies.mcpPoolService,
      this._dependencies.mcpConnectorFactory,
      this._dependencies.logger,
    );

    // 聊天服务（外部依赖）
    this._dependencies.chatService = ChatServiceFactory.createChatService(
      envConfig.getOpenAIConfig(),
      this._dependencies.logger,
    );

    // 聊天管理服务
    this._dependencies.chatManager = new ChatManagerService(
      this._dependencies.sessionManager,
      this._dependencies.mcpManager,
      this._dependencies.chatService,
      this._dependencies.chatHistoryRepository,
      this._dependencies.logger,
    );

    // 生命周期服务
    this._dependencies.lifecycleService = new LifecycleService(
      this._dependencies.instanceRegistry,
      this._dependencies.timerService,
      this._dependencies.logger,
      envConfig.getLifecycleConfig(),
    );

    // 池管理服务
    this._dependencies.poolManager = new PoolManagerService(
      this._dependencies.mcpPoolService,
      this._dependencies.lifecycleService,
      this._dependencies.logger,
    );
  }

  /**
   * 创建配置服务
   * @private
   */
  async _createConfigServices() {
    // MCP配置加载器
    this._dependencies.mcpConfigLoader = McpConfigLoader.create({
      configPath: envConfig.getMcpConfig().configPath,
      logger: this._dependencies.logger,
    });

    // 预定义服务器管理器
    this._dependencies.predefinedServers = PredefinedServers.create({
      configLoader: this._dependencies.mcpConfigLoader,
      logger: this._dependencies.logger,
    });
  }

  /**
   * 创建基础设施适配器
   * @private
   */
  async _createInfrastructureAdapters() {
    // 创建WebSocket通知器（注意：需要在创建控制器时提供io实例）
    this._dependencies.createSocketNotifier = io => {
      if (!io) throw new Error('io实例是必需的');
      return new SocketNotifier(io, this._dependencies.logger);
    };

    // 代理管理服务
    this._dependencies.proxyManager = new ProxyManagerService(
      this._dependencies.mcpManager,
      this._dependencies.poolManager,
      this._dependencies.logger,
    );
  }

  /**
   * 创建控制器
   * @private
   */
  async _createControllers() {
    this._dependencies.controllers = {
      session: new SessionController(this._dependencies.sessionManager, this._dependencies.logger),
      mcp: new McpController(
        this._dependencies.mcpManager,
        this._dependencies.logger,
        this._dependencies.predefinedServers.getAll(),
      ),
      chat: new ChatController(this._dependencies.chatManager, this._dependencies.logger),
      proxy: new ProxyController(this._dependencies.proxyManager, this._dependencies.logger),
      pool: new PoolController(this._dependencies.poolManager, this._dependencies.logger),
    };
  }

  /**
   * 创建WebSocket适配器（需要在服务器启动时调用）
   * @param {SocketIO.Server} io - Socket.IO服务器实例
   */
  createWebSocketAdapters(io) {
    if (!io) throw new Error('io实例是必需的');

    // 创建Socket通知器
    this._dependencies.socketNotifier = this._dependencies.createSocketNotifier(io);

    // 创建WebSocket适配器
    this._dependencies.wsAdapter = WebSocketAdapter.create(io, {
      sessionManager: this._dependencies.sessionManager,
      notifier: this._dependencies.socketNotifier,
      logger: this._dependencies.logger,
    });

    // 创建会话通知器
    this._dependencies.sessionNotifier = SessionNotifier.create({
      socketNotifier: this._dependencies.socketNotifier,
      wsAdapter: this._dependencies.wsAdapter,
      logger: this._dependencies.logger,
    });
  }

  /**
   * 获取依赖
   * @param {string} name - 依赖名称
   * @returns {any} 依赖实例
   */
  get(name) {
    if (!this._initialized) {
      throw new Error('容器尚未初始化');
    }

    if (!this._dependencies[name]) {
      throw new Error(`未找到依赖: ${name}`);
    }

    return this._dependencies[name];
  }

  /**
   * 获取所有依赖
   * @returns {Object} 所有依赖的拷贝
   */
  getAll() {
    if (!this._initialized) {
      throw new Error('容器尚未初始化');
    }

    return { ...this._dependencies };
  }

  /**
   * 关闭容器（清理资源）
   * @returns {Promise<void>}
   */
  async shutdown() {
    // 停止生命周期服务
    if (this._dependencies.lifecycleService) {
      this._dependencies.lifecycleService.stopCleanupScheduler();
    }

    // 断开所有WebSocket连接
    if (this._dependencies.wsAdapter) {
      // TODO: 实现更全面的清理逻辑
    }

    this._initialized = false;
  }
}

// 创建全局容器实例
const container = new Container();

module.exports = container;
