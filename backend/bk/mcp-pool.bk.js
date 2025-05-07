// mcp-pool.js
// MCP服务池管理器
// 负责MCP服务实例的创建、复用和管理

const { v4: uuidv4 } = require('uuid');
const registry = require('../core/registry');
const { spawn } = require('child_process');
const axios = require('axios');
const { logger, mcpRegistry } = require('../utils/logger');

// 存储创建MCP实例的工厂函数
let mcpFactoryFunctions = {
  stdio: null,
  sse: null,
};

// 初始化服务池
function init({ createStdioMcp, createSseMcp }) {
  mcpFactoryFunctions.stdio = createStdioMcp;
  mcpFactoryFunctions.sse = createSseMcp;

  return {
    getOrCreateMcpInstance,
    releaseMcpInstance,
    removeMcpInstance,
    getPoolStats,
    getUserInstances,
  };
}

// 获取用户的所有MCP实例
function getUserInstances(userId) {
  if (!userId) return [];
  return registry.findUserInstances(userId);
}

// 获取或创建MCP实例
async function getOrCreateMcpInstance(sessionId, name, config, clientType, userId = 'anonymous') {
  logger.info(`尝试获取或创建MCP实例`, {
    sessionId,
    userId,
    mcpName: name,
    clientType,
  });
  mcpRegistry.configReceived(name, config);

  // 检查是否有匹配的实例可用
  const existingInstance = registry.findMatchingInstance(config);

  if (existingInstance) {
    logger.info(`找到匹配的MCP实例，准备复用`, {
      sessionId,
      userId,
      instanceId: existingInstance.instanceId,
      mcpName: name,
    });

    // 将新会话关联到该实例
    registry.associateSessionWithInstance(sessionId, existingInstance.instanceId);

    // 返回实例信息
    return {
      success: true,
      isNew: false,
      instanceId: existingInstance.instanceId,
      mcp: {
        name,
        clientType: existingInstance.mcpSession.clientType,
        command: existingInstance.mcpSession.command,
        args: existingInstance.mcpSession.args,
        env: existingInstance.mcpSession.env,
        url: existingInstance.mcpSession.url,
        tools: existingInstance.mcpSession.tools,
        status: existingInstance.mcpSession.status,
      },
    };
  }

  // 没有找到可用实例，创建新的实例
  logger.info(`没有找到匹配的MCP实例，创建新实例`, {
    sessionId,
    userId,
    mcpName: name,
  });

  try {
    // 根据类型选择创建方法
    let factoryFunction;
    if (clientType === 'stdio') {
      factoryFunction = mcpFactoryFunctions.stdio;
    } else if (clientType === 'sse') {
      factoryFunction = mcpFactoryFunctions.sse;
    } else {
      throw new Error(`不支持的MCP类型: ${clientType}`);
    }

    if (!factoryFunction) {
      throw new Error(`MCP工厂函数未初始化: ${clientType}`);
    }

    // 生成实例ID
    const instanceId = uuidv4();

    // 创建实例
    const result = await factoryFunction(config, instanceId);

    if (!result.success) {
      throw new Error(result.error || '创建MCP实例失败');
    }

    // 注册实例
    const mcpSession = {
      name,
      ...result.mcpSession,
    };

    registry.registerInstance(instanceId, config, mcpSession, userId);
    mcpRegistry.registered(name, instanceId, config);

    // 关联会话
    registry.associateSessionWithInstance(sessionId, instanceId);

    logger.info(`已创建并注册新的MCP实例`, {
      sessionId,
      userId,
      instanceId,
      mcpName: name,
      clientType,
    });

    // 返回实例信息
    return {
      success: true,
      isNew: true,
      instanceId: instanceId,
      mcp: {
        name,
        clientType: mcpSession.clientType,
        command: mcpSession.command,
        args: mcpSession.args,
        env: mcpSession.env,
        url: mcpSession.url,
        tools: mcpSession.tools,
        status: mcpSession.status,
      },
    };
  } catch (error) {
    logger.error(`创建MCP实例失败`, {
      sessionId,
      userId,
      mcpName: name,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      error: `创建MCP实例失败: ${error.message}`,
    };
  }
}

// 释放会话对MCP实例的使用
function releaseMcpInstance(sessionId, instanceId) {
  logger.info(`释放会话对MCP实例的使用`, { sessionId, instanceId });
  return registry.dissociateSessionFromInstance(sessionId, instanceId);
}

// 从池中移除MCP实例
function removeMcpInstance(instanceId) {
  logger.info(`从池中移除MCP实例`, { instanceId });
  return registry.removeInstance(instanceId);
}

// 获取池统计信息
function getPoolStats() {
  return registry.getStats();
}

module.exports = {
  init,
};
