// MCP控制器
// 处理MCP相关的HTTP请求

const sessionManager = require('../services/session-manager');
// 注意：mcpPool变量应该从全局应用程序上下文获取，而不是直接导入模块
// 修改为使用registry来获取全局初始化好的mcpPool实例
const registry = require('../core/registry');
const { logger } = require('../utils/logger');

// 从全局注册表获取mcpPool实例
const getMcpPool = () => (registry.getMcpPool ? registry.getMcpPool() : global.mcpPool);

// 连接MCP
async function connectMcp(req, res) {
  try {
    const { sessionId } = req.params;
    const { name, clientType, config, userId } = req.body;

    if (!name || !clientType || !config) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: name、clientType或config',
      });
    }

    // 检查会话是否存在
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    // 获取mcpPool全局实例
    const mcpPool = getMcpPool();
    if (!mcpPool || typeof mcpPool.getOrCreateMcpInstance !== 'function') {
      return res.status(500).json({
        success: false,
        error: 'MCP池服务未正确初始化',
      });
    }

    // 从池中获取或创建MCP实例
    const result = await mcpPool.getOrCreateMcpInstance(
      sessionId,
      name,
      config,
      clientType,
      userId || session.userId,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // 将实例与会话关联
    sessionManager.connectMcpToSession(sessionId, result.instanceId, result.mcp);

    res.json(result);
  } catch (error) {
    logger.error(`连接MCP失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `连接MCP失败: ${error.message}`,
    });
  }
}

// 断开MCP
function disconnectMcp(req, res) {
  try {
    const { sessionId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: name',
      });
    }

    // 检查会话是否存在
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    // 检查MCP是否存在
    if (!session.mcpSessions[name]) {
      return res.status(404).json({
        success: false,
        error: `MCP不存在: ${name}`,
      });
    }

    // 断开连接
    sessionManager.disconnectMcpFromSession(sessionId, name);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error(`断开MCP失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `断开MCP失败: ${error.message}`,
    });
  }
}

// 获取会话中的所有MCP
function getSessionMcps(req, res) {
  try {
    const { sessionId } = req.params;

    // 检查会话是否存在
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    const mcps = sessionManager.getSessionMcps(sessionId);

    // 为了安全，过滤掉进程对象和敏感信息
    const safeMcps = {};
    for (const name in mcps) {
      const mcp = mcps[name];
      safeMcps[name] = {
        instanceId: mcp.instanceId,
        name: mcp.name,
        clientType: mcp.clientType,
        status: mcp.status,
        tools: mcp.tools,
        url: mcp.url,
        command: mcp.command,
        args: mcp.args,
      };
    }

    res.json({
      success: true,
      mcps: safeMcps,
    });
  } catch (error) {
    logger.error(`获取会话MCP列表失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取会话MCP列表失败: ${error.message}`,
    });
  }
}

// 获取所有可用的MCP实例
function getAllInstances(req, res) {
  try {
    const instances = registry.getAllInstances();

    res.json({
      success: true,
      instances,
    });
  } catch (error) {
    logger.error(`获取所有MCP实例失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取所有MCP实例失败: ${error.message}`,
    });
  }
}

// 获取MCP实例详情
function getInstanceDetail(req, res) {
  try {
    const { instanceId } = req.params;
    const instance = registry.getInstanceDetail(instanceId);

    if (!instance) {
      return res.status(404).json({
        success: false,
        error: `实例不存在: ${instanceId}`,
      });
    }

    // 为了安全，过滤掉进程对象和敏感信息
    const safeInstance = {
      instanceId: instance.instanceId,
      signature: instance.signature,
      userId: instance.userId,
      sessionCount: instance.sessions.size,
      lastUsedTime: instance.lastUsedTime,
      createdTime: instance.createdTime,
      usageCount: instance.usageCount,
      mcpSession: {
        name: instance.mcpSession.name,
        clientType: instance.mcpSession.clientType,
        status: instance.mcpSession.status,
        tools: instance.mcpSession.tools,
        url: instance.mcpSession.url,
        command: instance.mcpSession.command,
        args: instance.mcpSession.args,
      },
    };

    res.json({
      success: true,
      instance: safeInstance,
    });
  } catch (error) {
    logger.error(`获取MCP实例详情失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取MCP实例详情失败: ${error.message}`,
    });
  }
}

// 获取池统计信息
function getPoolStats(req, res) {
  try {
    const mcpPool = getMcpPool();
    if (!mcpPool || typeof mcpPool.getPoolStats !== 'function') {
      return res.status(500).json({
        success: false,
        error: 'MCP池服务未正确初始化',
      });
    }

    const stats = mcpPool.getPoolStats();
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error(`获取MCP池统计信息失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取MCP池统计信息失败: ${error.message}`,
    });
  }
}

// 诊断命令是否可用
async function diagnoseMcpCommand(req, res) {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: command',
      });
    }

    logger.info(`诊断命令是否可用: ${command}`);

    // 使用which命令查找命令路径
    const { spawn } = require('child_process');
    const whichProcess = spawn('which', [command], {
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    whichProcess.stdout.on('data', data => {
      output += data.toString();
    });

    whichProcess.stderr.on('data', data => {
      errorOutput += data.toString();
    });

    const result = await new Promise(resolve => {
      whichProcess.on('close', code => {
        resolve({
          success: code === 0,
          path: output.trim(),
          error: errorOutput,
          exitCode: code,
        });
      });
    });

    // 尝试获取进程环境信息
    const processEnv = {};
    // 仅返回一些关键环境变量
    const keysToInclude = ['PATH', 'HOME', 'SHELL', 'USER'];
    keysToInclude.forEach(key => {
      if (process.env[key]) {
        processEnv[key] = process.env[key];
      }
    });

    res.json({
      success: true,
      command,
      result,
      env: processEnv,
    });
  } catch (error) {
    logger.error(`诊断命令失败`, { error: error.message });
    res.status(500).json({
      success: false,
      error: `诊断命令失败: ${error.message}`,
    });
  }
}

module.exports = {
  connectMcp,
  disconnectMcp,
  getSessionMcps,
  getAllInstances,
  getInstanceDetail,
  getPoolStats,
  diagnoseMcpCommand,
};
