// src/infrastructure/adapters/outbound/chat/claude-service.js

const ChatServicePort = require('../../../../application/ports/outbound/chat-service-port');

/**
 * Claude聊天服务实现
 */
class ClaudeService extends ChatServicePort {
  constructor(logger, config) {
    super();
    this.logger = logger;
    this.config = config;
  }

  async callChatCompletion(messages, tools = null, toolChoice = 'auto') {
    // Claude API调用实现
    // ...
  }

  // 其他接口实现...
}

// 在chat-service-adapter.js中添加:
// case 'claude':
//   return new ClaudeService(this.logger, this.config);
