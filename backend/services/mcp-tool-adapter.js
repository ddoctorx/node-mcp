// MCP工具适配器
// 处理不同类型MCP工具的调用逻辑

const { callRemoteMcpTool, callSseMcpTool } = require('./mcp-factories');
const sessionManager = require('./session-manager');
const { logger, mcpTool } = require('../utils/logger');

// MCP工具调用适配器
async function mcpToolAdapter(sessionId, mcpName, toolName, params) {
  const startTime = Date.now();

  try {
    // 记录工具调用开始
    mcpTool.callStarted(sessionId, mcpName, toolName, params);

    // 获取会话和MCP实例
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    const mcpSession = session.mcpSessions[mcpName];
    if (!mcpSession) {
      throw new Error(`MCP不存在: ${mcpName}`);
    }

    // 检查MCP状态
    if (mcpSession.status !== 'connected') {
      logger.error(`MCP状态异常，无法调用工具`, {
        sessionId,
        mcpName,
        status: mcpSession.status || 'unknown',
      });
      throw new Error(
        `MCP未连接或状态异常: ${mcpName}, 当前状态: ${mcpSession.status || 'unknown'}`,
      );
    }

    // 检查工具是否存在
    const toolExists = mcpSession.tools && mcpSession.tools.some(tool => tool.name === toolName);
    if (!toolExists) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    // 针对stdio类型，预先验证process对象
    if (mcpSession.clientType === 'stdio' && !mcpSession.process) {
      logger.error(`stdio类型MCP缺少有效进程对象`, {
        sessionId,
        mcpName,
        mcpInfo: {
          clientType: mcpSession.clientType,
          status: mcpSession.status,
          hasTools: mcpSession.tools ? mcpSession.tools.length : 0,
        },
      });

      // 增强：尝试从注册表获取进程对象
      if (mcpSession.instanceId) {
        const registry = require('../core/registry');
        const instance = registry.getInstanceDetail(mcpSession.instanceId);

        if (instance && instance.mcpSession && instance.mcpSession.process) {
          logger.info(`从注册表恢复进程对象到会话 ${sessionId} 的MCP ${mcpName}`);
          mcpSession.process = instance.mcpSession.process;
        } else {
          logger.error(`无法从注册表获取进程对象`, {
            sessionId,
            mcpName,
            instanceId: mcpSession.instanceId,
            hasInstance: !!instance,
          });
          throw new Error(`MCP会话没有有效的进程对象: ${mcpName}`);
        }
      } else {
        throw new Error(`MCP会话没有有效的进程对象: ${mcpName}`);
      }
    }

    let result;
    // 根据MCP类型调用相应的工具方法
    if (mcpSession.clientType === 'stdio') {
      result = await callRemoteMcpTool(mcpSession, toolName, params);
    } else if (mcpSession.clientType === 'sse') {
      result = await callSseMcpTool(mcpSession, toolName, params);
    } else {
      throw new Error(`不支持的MCP类型: ${mcpSession.clientType}`);
    }

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // 记录工具调用完成
    mcpTool.callCompleted(sessionId, mcpName, toolName, responseTime, result);

    return result;
  } catch (error) {
    // 记录工具调用失败
    mcpTool.callFailed(sessionId, mcpName, toolName, error);

    // 重新抛出错误
    throw error;
  }
}

// 查找工具所在的MCP
function findMcpForTool(sessionId, toolName) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return null;

  for (const mcpName in session.mcpSessions) {
    const mcpSession = session.mcpSessions[mcpName];
    if (mcpSession.tools && mcpSession.tools.some(tool => tool.name === toolName)) {
      return {
        mcpName,
        mcpSession,
      };
    }
  }

  return null;
}

// 获取会话中所有可用的工具
function getAllAvailableTools(sessionId) {
  const session = sessionManager.getSession(sessionId);
  if (!session) return [];

  const tools = [];
  for (const mcpName in session.mcpSessions) {
    const mcpSession = session.mcpSessions[mcpName];
    if (mcpSession.tools && Array.isArray(mcpSession.tools)) {
      tools.push(
        ...mcpSession.tools.map(tool => ({
          ...tool,
          mcpName,
        })),
      );
    }
  }

  return tools;
}

module.exports = {
  mcpToolAdapter,
  findMcpForTool,
  getAllAvailableTools,
};
