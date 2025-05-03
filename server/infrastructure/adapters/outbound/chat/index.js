// src/infrastructure/adapters/outbound/chat/index.js

module.exports = {
  OpenAIService: require('./openai-service'),
  ChatServiceAdapter: require('./chat-service-adapter').ChatServiceAdapter,
  ChatServiceFactory: require('./chat-service-adapter').ChatServiceFactory,
  LegacyChatAdapter: require('./legacy-chat-adapter'),
};
