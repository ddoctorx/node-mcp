// src/infrastructure/adapters/outbound/chat/chat-service-adapter.js

const OpenAIService = require('./openai-service');

/**
 * 聊天服务适配器
 * 提供统一的聊天服务接口，支持多种聊天服务提供商
 */
class ChatServiceAdapter {
  /**
   * @param {string} provider - 服务提供商类型（'openai', 'claude', 等）
   * @param {Object} config - 配置选项
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(provider, config, logger) {
    this.provider = provider.toLowerCase();
    this.config = config;
    this.logger = logger;
    this.service = this._createService();
  }

  /**
   * 创建服务实例
   * @private
   */
  _createService() {
    switch (this.provider) {
      case 'openai':
        return new OpenAIService(this.logger, this.config.apiKey, this.config.apiUrl);
      // 可以在这里添加其他服务提供商
      // case 'claude':
      //   return new ClaudeService(this.logger, this.config);
      default:
        throw new Error(`不支持的聊天服务提供商: ${this.provider}`);
    }
  }

  /**
   * 调用聊天完成API
   * @param {Array<Object>} messages - 消息历史
   * @param {Array<Object>} [tools] - 可用工具列表
   * @param {string} [toolChoice] - 工具选择策略
   * @returns {Promise<Object>} 聊天响应
   */
  async callChatCompletion(messages, tools = null, toolChoice = 'auto') {
    return this.service.callChatCompletion(messages, tools, toolChoice);
  }

  /**
   * 处理函数调用
   * @param {Object} response - AI服务响应
   * @param {string} sessionId - 会话ID
   * @param {Object} mcpSessions - MCP会话信息
   * @param {Function} toolCallHandler - 工具调用处理器
   * @returns {Promise<Object>} 处理后的响应
   */
  async handleFunctionCalling(response, sessionId, mcpSessions, toolCallHandler) {
    return this.service.handleFunctionCalling(response, sessionId, mcpSessions, toolCallHandler);
  }

  /**
   * 转换MCP工具格式
   * @param {Array<Object>} mcpTools - MCP工具列表
   * @returns {Array<Object>} 转换后的工具列表
   */
  convertMcpToolsToServiceFormat(mcpTools) {
    return this.service.convertMcpToolsToServiceFormat(mcpTools);
  }

  /**
   * 切换服务提供商
   * @param {string} provider - 新的服务提供商
   * @param {Object} [config] - 新的配置选项
   */
  switchProvider(provider, config = null) {
    this.provider = provider.toLowerCase();
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.service = this._createService();
    this.logger.info(`已切换聊天服务提供商至: ${provider}`);
  }
}

/**
 * 聊天服务工厂
 * 用于创建聊天服务实例
 */
class ChatServiceFactory {
  /**
   * 创建聊天服务实例
   * @static
   * @param {Object} config - 配置选项
   * @param {LoggerPort} logger - 日志服务
   * @returns {ChatServiceAdapter} 聊天服务适配器
   */
  static createChatService(config, logger) {
    const provider = config.provider || 'openai';
    const serviceConfig = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      apiUrl: config.apiUrl,
      ...config,
    };

    return new ChatServiceAdapter(provider, serviceConfig, logger);
  }

  /**
   * 创建OpenAI服务（向下兼容）
   * @static
   * @param {LoggerPort} logger - 日志服务
   * @param {string} [apiKey] - API密钥
   * @param {string} [apiUrl] - API URL
   * @returns {OpenAIService} OpenAI服务实例
   */
  static createOpenAIService(logger, apiKey, apiUrl) {
    return new OpenAIService(logger, apiKey, apiUrl);
  }
}

module.exports = {
  ChatServiceAdapter,
  ChatServiceFactory,
};
