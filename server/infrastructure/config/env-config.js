// src/infrastructure/config/env-config.js

require('dotenv').config();

/**
 * 环境配置管理
 * 负责加载和管理应用程序环境变量配置
 */
class EnvConfig {
  /**
   * 构造函数
   */
  constructor() {
    this._config = this._loadConfig();
    this._validate();
  }

  /**
   * 加载配置
   * @private
   * @returns {Object} 配置对象
   */
  _loadConfig() {
    return {
      // 服务器配置
      server: {
        port: process.env.PORT || '3000',
        nodeEnv: process.env.NODE_ENV || 'development',
        host: process.env.HOST || '0.0.0.0',
      },

      // OpenAI配置
      openai: {
        apiKey: process.env.OPENAI_API_KEY,
        apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      },

      // 日志配置
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        directory: process.env.LOG_DIR || 'logs',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING !== 'false',
        consoleFormat: process.env.CONSOLE_FORMAT || 'combined',
      },

      // MCP配置
      mcp: {
        maxInstances: parseInt(process.env.MCP_MAX_INSTANCES || '50'),
        defaultTimeout: parseInt(process.env.MCP_DEFAULT_TIMEOUT || '30000'),
        allowedExecutables: process.env.MCP_ALLOWED_EXECUTABLES
          ? process.env.MCP_ALLOWED_EXECUTABLES.split(',')
          : [
              'node',
              'npm',
              'npx',
              'python',
              'python3',
              'docker',
              'uvx',
              'pip',
              'pip3',
              'git',
              'sh',
              'bash',
            ],
        configPath: process.env.MCP_CONFIG_PATH || 'config/mcp-servers.json',
      },

      // 生命周期配置
      lifecycle: {
        checkInterval: parseInt(process.env.LIFECYCLE_CHECK_INTERVAL || '60000'), // 1分钟
        idleTimeout: parseInt(process.env.LIFECYCLE_IDLE_TIMEOUT || '300000'), // 5分钟
        maxLifetime: parseInt(process.env.LIFECYCLE_MAX_LIFETIME || '86400000'), // 24小时
        autoCleanup: process.env.LIFECYCLE_AUTO_CLEANUP !== 'false',
      },

      // WebSocket配置
      websocket: {
        enable: process.env.WEBSOCKET_ENABLE !== 'false',
        corsOrigin: process.env.WEBSOCKET_CORS_ORIGIN || '*',
        pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '20000'),
        pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000'),
      },

      // 安全配置
      security: {
        trustProxy: process.env.TRUST_PROXY === 'true',
        corsEnabled: process.env.CORS_ENABLED !== 'false',
        helmet: {
          enable: process.env.HELMET_ENABLE !== 'false',
          contentSecurityPolicy: process.env.CSP_ENABLE !== 'false',
        },
      },

      // 数据存储配置
      storage: {
        chatHistoryMaxSize: parseInt(process.env.CHAT_HISTORY_MAX_SIZE || '1000'),
        sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400000'), // 24小时
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '3600000'), // 1小时
      },

      // 路径配置
      paths: {
        frontend: process.env.FRONTEND_PATH || 'frontend/out',
        public: process.env.PUBLIC_PATH || 'public',
        repos: process.env.REPOS_PATH || 'repos',
        venvs: process.env.VENVS_PATH || 'venvs',
      },

      // 性能配置
      performance: {
        maxRequestSize: process.env.MAX_REQUEST_SIZE || '100mb',
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
        enableCompression: process.env.ENABLE_COMPRESSION !== 'false',
      },
    };
  }

  /**
   * 验证配置
   * @private
   */
  _validate() {
    const validation = {
      errors: [],
      warnings: [],
    };

    // 验证关键配置
    if (!this._config.openai.apiKey) {
      validation.warnings.push('OpenAI API key未设置，某些功能可能无法正常工作');
    }

    // 验证端口范围
    const port = parseInt(this._config.server.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      validation.errors.push('服务器端口必须在1-65535范围内');
    }

    // 验证超时设置
    if (this._config.mcp.defaultTimeout < 1000) {
      validation.warnings.push('MCP默认超时时间太短，可能导致操作失败');
    }

    // 如果有错误，抛出异常
    if (validation.errors.length > 0) {
      throw new Error(`环境配置错误: ${validation.errors.join('; ')}`);
    }

    // 输出警告信息
    if (validation.warnings.length > 0) {
      console.warn('环境配置警告:', validation.warnings.join('; '));
    }
  }

  /**
   * 获取完整配置
   * @returns {Object} 配置对象
   */
  getConfig() {
    return { ...this._config };
  }

  /**
   * 获取服务器配置
   * @returns {Object} 服务器配置
   */
  getServerConfig() {
    return this._config.server;
  }

  /**
   * 获取OpenAI配置
   * @returns {Object} OpenAI配置
   */
  getOpenAIConfig() {
    return this._config.openai;
  }

  /**
   * 获取日志配置
   * @returns {Object} 日志配置
   */
  getLoggingConfig() {
    return this._config.logging;
  }

  /**
   * 获取MCP配置
   * @returns {Object} MCP配置
   */
  getMcpConfig() {
    return this._config.mcp;
  }

  /**
   * 获取生命周期配置
   * @returns {Object} 生命周期配置
   */
  getLifecycleConfig() {
    return this._config.lifecycle;
  }

  /**
   * 获取WebSocket配置
   * @returns {Object} WebSocket配置
   */
  getWebSocketConfig() {
    return this._config.websocket;
  }

  /**
   * 获取安全配置
   * @returns {Object} 安全配置
   */
  getSecurityConfig() {
    return this._config.security;
  }

  /**
   * 获取特定路径配置
   * @param {string} key - 路径键名
   * @returns {string} 路径值
   */
  getPath(key) {
    return this._config.paths[key];
  }

  /**
   * 是否为生产环境
   * @returns {boolean} 是否为生产环境
   */
  isProduction() {
    return this._config.server.nodeEnv === 'production';
  }

  /**
   * 是否为开发环境
   * @returns {boolean} 是否为开发环境
   */
  isDevelopment() {
    return this._config.server.nodeEnv === 'development';
  }

  /**
   * 获取数字配置值（带单位）
   * @param {string} key - 配置键名
   * @returns {number} 数字值
   */
  getNumericValue(key) {
    const value = process.env[key];
    if (!value) return 0;

    const match = value.match(/^(\d+)([smhd])?$/);
    if (!match) return parseInt(value);

    const [, num, unit] = match;
    const number = parseInt(num);

    switch (unit) {
      case 's':
        return number * 1000;
      case 'm':
        return number * 60 * 1000;
      case 'h':
        return number * 60 * 60 * 1000;
      case 'd':
        return number * 24 * 60 * 60 * 1000;
      default:
        return number;
    }
  }

  /**
   * 获取布尔配置值
   * @param {string} key - 配置键名
   * @param {boolean} defaultValue - 默认值
   * @returns {boolean} 布尔值
   */
  getBooleanValue(key, defaultValue = false) {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * 设置环境变量（用于测试）
   * @param {string} key - 键名
   * @param {string} value - 值
   */
  setEnv(key, value) {
    process.env[key] = value;
    this._config = this._loadConfig();
    this._validate();
  }

  /**
   * 创建配置实例
   * @static
   * @returns {EnvConfig} 配置实例
   */
  static createInstance() {
    return new EnvConfig();
  }
}

// 创建单例实例
const instance = new EnvConfig();

module.exports = instance;
