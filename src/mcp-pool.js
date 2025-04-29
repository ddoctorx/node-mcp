// MCP服务池管理器
// 负责MCP服务实例的创建、复用和管理

const { v4: uuidv4 } = require('uuid');
const registry = require('./registry');
const { spawn } = require('child_process');
const axios = require('axios');

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
  };
}

// 获取或创建MCP实例
async function getOrCreateMcpInstance(sessionId, name, config, clientType) {
  console.log(`尝试为会话 ${sessionId} 获取或创建MCP实例: ${name}`);

  // 检查是否有匹配的实例可用
  const existingInstance = registry.findMatchingInstance(config);

  if (existingInstance) {
    console.log(`找到匹配的MCP实例 [${existingInstance.instanceId}]，准备复用`);

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
  console.log(`没有找到匹配的MCP实例，创建新实例: ${name}`);

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

    registry.registerInstance(instanceId, config, mcpSession);

    // 关联会话
    registry.associateSessionWithInstance(sessionId, instanceId);

    console.log(`已创建并注册新的MCP实例 [${instanceId}]: ${name}`);

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
    console.error(`创建MCP实例失败:`, error);
    return {
      success: false,
      error: `创建MCP实例失败: ${error.message}`,
    };
  }
}

// 释放会话对MCP实例的使用
function releaseMcpInstance(sessionId, instanceId) {
  return registry.dissociateSessionFromInstance(sessionId, instanceId);
}

// 移除并清理MCP实例
async function removeMcpInstance(instanceId) {
  const instance = registry.getInstanceDetail(instanceId);

  if (!instance) {
    console.warn(`尝试移除不存在的MCP实例: ${instanceId}`);
    return {
      success: false,
      error: '实例不存在',
    };
  }

  try {
    // 清理实例资源
    if (instance.mcpSession.clientType === 'stdio' && instance.mcpSession.process) {
      // 终止子进程
      instance.mcpSession.process.kill();
    } else if (instance.mcpSession.clientType === 'sse' && instance.mcpSession.heartbeatInterval) {
      // 清除心跳检测
      clearInterval(instance.mcpSession.heartbeatInterval);
    }

    // 从注册表中移除
    registry.removeInstance(instanceId);

    return {
      success: true,
    };
  } catch (error) {
    console.error(`移除MCP实例失败: ${instanceId}`, error);
    return {
      success: false,
      error: `移除实例失败: ${error.message}`,
    };
  }
}

// 获取池统计信息
function getPoolStats() {
  const instances = registry.getAllInstances();

  const stats = {
    totalInstances: instances.length,
    activeInstances: instances.filter(i => i.sessionCount > 0).length,
    idleInstances: instances.filter(i => i.sessionCount === 0).length,
    byType: {
      stdio: instances.filter(i => i.type === 'stdio').length,
      sse: instances.filter(i => i.type === 'sse').length,
    },
  };

  return stats;
}

module.exports = {
  init,
};
