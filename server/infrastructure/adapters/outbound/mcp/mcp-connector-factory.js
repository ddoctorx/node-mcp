// src/infrastructure/adapters/outbound/mcp/mcp-connector-factory.js

const StdioMcpConnector = require('./stdio-mcp-connector');
const SseMcpConnector = require('./sse-mcp-connector');

/**
 * MCP连接器工厂
 * 根据配置类型创建相应的MCP连接器实例
 */
class McpConnectorFactory {
  /**
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(logger) {
    this.logger = logger;
    this._connectors = new Map();
    this._initConnectors();
  }

  /**
   * 创建MCP连接器
   * @param {string} clientType - 客户端类型（'stdio' | 'sse'）
   * @returns {McpConnectorPort} MCP连接器实例
   * @throws {Error} 当连接器类型不支持时
   */
  createConnector(clientType) {
    if (!clientType) {
      throw new Error('客户端类型不能为空');
    }

    const connectorClass = this._connectors.get(clientType.toLowerCase());

    if (!connectorClass) {
      const supportedTypes = Array.from(this._connectors.keys()).join(', ');
      throw new Error(`不支持的MCP类型: ${clientType}。支持的类型: ${supportedTypes}`);
    }

    this.logger.debug(`创建${clientType}类型的MCP连接器`);
    return new connectorClass(this.logger);
  }

  /**
   * 注册新的连接器类型
   * @param {string} type - 连接器类型
   * @param {Function} connectorClass - 连接器类
   */
  registerConnector(type, connectorClass) {
    if (!type || !connectorClass) {
      throw new Error('type和connectorClass都是必需的');
    }

    this._connectors.set(type.toLowerCase(), connectorClass);
    this.logger.info(`注册新的MCP连接器类型: ${type}`);
  }

  /**
   * 获取支持的连接器类型列表
   * @returns {Array<string>} 支持的类型列表
   */
  getSupportedTypes() {
    return Array.from(this._connectors.keys());
  }

  /**
   * 检查是否支持某种连接器类型
   * @param {string} type - 连接器类型
   * @returns {boolean} 是否支持
   */
  supports(type) {
    return this._connectors.has(type.toLowerCase());
  }

  /**
   * 创建带缓存的连接器
   * @param {string} clientType - 客户端类型
   * @returns {McpConnectorPort} MCP连接器实例
   */
  createConnectorWithCache(clientType) {
    const cacheKey = `connector_${clientType.toLowerCase()}`;

    if (!this._cache) {
      this._cache = new Map();
    }

    if (this._cache.has(cacheKey)) {
      this.logger.debug(`使用缓存的${clientType}连接器`);
      return this._cache.get(cacheKey);
    }

    const connector = this.createConnector(clientType);
    this._cache.set(cacheKey, connector);
    return connector;
  }

  /**
   * 初始化默认连接器
   * @private
   */
  _initConnectors() {
    this._connectors.set('stdio', StdioMcpConnector);
    this._connectors.set('sse', SseMcpConnector);
  }

  /**
   * 创建工厂的静态方法
   * @static
   * @param {LoggerPort} logger - 日志服务
   * @returns {McpConnectorFactory} 工厂实例
   */
  static create(logger) {
    return new McpConnectorFactory(logger);
  }
}

module.exports = McpConnectorFactory;
