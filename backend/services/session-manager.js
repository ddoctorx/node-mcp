// 会话管理服务
// 负责创建、管理和存储用户会话

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const registry = require('../core/registry');

// 存储所有会话
const sessions = {};

// 用户映射 - 存储用户拥有的会话
const userSessions = {};

// 存储聊天历史
const chatHistories = {};

// 创建新会话
function createSession(userId) {
  const sessionId = uuidv4();

  // 使用真实的用户ID，如果没有则生成一个
  const actualUserId = userId || `anonymous-${uuidv4()}`;

  sessions[sessionId] = {
    id: sessionId,
    userId: actualUserId,
    mcpSessions: {},
    createdAt: new Date(),
  };

  // 将会话添加到用户的会话列表中
  if (!userSessions[actualUserId]) {
    userSessions[actualUserId] = new Set();
  }
  userSessions[actualUserId].add(sessionId);

  // 加载用户在其他会话中的MCP实例
  if (actualUserId && !actualUserId.startsWith('anonymous-')) {
    logger.info(`开始为用户[${actualUserId}]加载实例到会话[${sessionId}]`);

    const userInstances = registry.findUserInstances(actualUserId);
    userInstances.forEach(instance => {
      logger.debug(`准备加载实例[${instance.instanceId}]到会话[${sessionId}]`);

      // 将实例关联到新会话
      if (instance.mcpSession) {
        sessions[sessionId].mcpSessions[instance.mcpSession.name] = {
          instanceId: instance.instanceId,
          name: instance.mcpSession.name,
          clientType: instance.mcpSession.clientType,
          tools: instance.mcpSession.tools,
          status: instance.mcpSession.status,
          command: instance.mcpSession.command,
          args: instance.mcpSession.args,
          env: instance.mcpSession.env,
          url: instance.mcpSession.url,
          isExternal: instance.mcpSession.isExternal || true,
        };
        registry.associateSessionWithInstance(sessionId, instance.instanceId);
      }
    });

    logger.info(
      `已加载用户 ${actualUserId} 的 ${userInstances.length} 个MCP实例到新会话 ${sessionId}`,
    );
  }

  // 初始化聊天历史
  initChatHistory(sessionId);

  return { sessionId, userId: actualUserId };
}

// 获取会话信息
function getSession(sessionId) {
  return sessions[sessionId];
}

// 获取用户所有会话
function getUserSessions(userId) {
  if (!userId || !userSessions[userId]) return [];
  return Array.from(userSessions[userId]).map(sessionId => sessions[sessionId]);
}

// 删除会话
function deleteSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return false;

  // 从用户会话映射中移除
  if (session.userId && userSessions[session.userId]) {
    userSessions[session.userId].delete(sessionId);
    if (userSessions[session.userId].size === 0) {
      delete userSessions[session.userId];
    }
  }

  // 清理聊天历史
  if (chatHistories[sessionId]) {
    delete chatHistories[sessionId];
  }

  // 删除会话
  delete sessions[sessionId];

  return true;
}

// 连接MCP到会话
function connectMcpToSession(sessionId, instanceId, mcpSession) {
  const session = sessions[sessionId];
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  session.mcpSessions[mcpSession.name] = {
    instanceId,
    name: mcpSession.name,
    clientType: mcpSession.clientType,
    tools: mcpSession.tools,
    status: mcpSession.status,
    command: mcpSession.command,
    args: mcpSession.args,
    env: mcpSession.env,
    url: mcpSession.url,
  };

  // 关联会话到实例
  registry.associateSessionWithInstance(sessionId, instanceId);

  return true;
}

// 从会话断开MCP
function disconnectMcpFromSession(sessionId, name) {
  const session = sessions[sessionId];
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  if (!session.mcpSessions[name]) {
    throw new Error(`会话没有名为 ${name} 的MCP`);
  }

  const instanceId = session.mcpSessions[name].instanceId;

  // 解除关联
  registry.dissociateSessionFromInstance(sessionId, instanceId);

  // 从会话中移除
  delete session.mcpSessions[name];

  return true;
}

// 检查MCP是否连接到会话
function isMcpConnectedToSession(sessionId, name) {
  const session = sessions[sessionId];
  return session && session.mcpSessions[name] !== undefined;
}

// 获取会话中的所有MCP
function getSessionMcps(sessionId) {
  const session = sessions[sessionId];
  if (!session) return {};
  return session.mcpSessions;
}

// 初始化聊天历史
function initChatHistory(sessionId) {
  if (!chatHistories[sessionId]) {
    chatHistories[sessionId] = [];
  }
  return chatHistories[sessionId];
}

// 添加消息到聊天历史
function addMessageToChatHistory(sessionId, message) {
  if (!chatHistories[sessionId]) {
    initChatHistory(sessionId);
  }

  chatHistories[sessionId].push({
    ...message,
    timestamp: new Date(),
  });

  // 限制历史记录大小，最多保留100条消息
  if (chatHistories[sessionId].length > 100) {
    chatHistories[sessionId] = chatHistories[sessionId].slice(-100);
  }

  return chatHistories[sessionId];
}

// 获取聊天历史
function getChatHistory(sessionId) {
  return chatHistories[sessionId] || [];
}

// 清除聊天历史
function clearChatHistory(sessionId) {
  if (chatHistories[sessionId]) {
    chatHistories[sessionId] = [];
  }
  return true;
}

module.exports = {
  createSession,
  getSession,
  getUserSessions,
  deleteSession,
  connectMcpToSession,
  disconnectMcpFromSession,
  isMcpConnectedToSession,
  getSessionMcps,
  initChatHistory,
  addMessageToChatHistory,
  getChatHistory,
  clearChatHistory,
};
