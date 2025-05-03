// src/infrastructure/adapters/outbound/chat/legacy-chat-adapter.js

const { ChatServiceFactory } = require('./chat-service-adapter');

/**
 * 遗留代码兼容适配器
 * 提供与原始 openai.js 模块相同的接口
 */
class LegacyChatAdapter {
  /**
   * 创建遗留兼容的聊天服务
   * @param {LoggerPort} logger - 日志服务
   * @returns {Object} 兼容的API接口
   */
  static create(logger) {
    const service = ChatServiceFactory.createChatService({ provider: 'openai' }, logger);

    return {
      callChatCompletion: (...args) => service.callChatCompletion(...args),
      convertMcpToolsToOpenAIFormat: (...args) => service.convertMcpToolsToServiceFormat(...args),
      handleFunctionCalling: (...args) => service.handleFunctionCalling(...args),
    };
  }
}

module.exports = LegacyChatAdapter;
