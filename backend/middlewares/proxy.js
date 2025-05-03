// MCP反向代理
// 处理客户端与MCP实例池之间的通信

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const registry = require('../core/registry');
const { logger } = require('../utils/logger');

// 从registry获取mcpPool
const getMcpPool = () => (registry.getMcpPool ? registry.getMcpPool() : global.mcpPool);

// 创建代理路由
function createProxyRouter() {
  const router = express.Router();

  // 会话验证中间件
  const validateSession = (req, res, next) => {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: '缺少会话ID',
      });
    }

    req.sessionId = sessionId;
    next();
  };

  // MCP连接端点
  router.post('/connect', validateSession, async (req, res) => {
    const { name, clientType, config } = req.body;
    const sessionId = req.sessionId;

    if (!name || !clientType || !config) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: name、clientType或config',
      });
    }

    try {
      // 获取mcpPool实例
      const mcpPool = getMcpPool();
      if (!mcpPool || typeof mcpPool.getOrCreateMcpInstance !== 'function') {
        return res.status(500).json({
          success: false,
          error: 'MCP池服务未正确初始化',
        });
      }

      // 使用MCP池获取或创建实例
      const result = await mcpPool.getOrCreateMcpInstance(sessionId, name, config, clientType);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('代理连接MCP失败:', { error: error.message });
      res.status(500).json({
        success: false,
        error: `连接MCP失败: ${error.message}`,
      });
    }
  });

  // 工具调用端点
  router.post('/call', validateSession, async (req, res) => {
    const { instanceId, tool, params } = req.body;
    const sessionId = req.sessionId;

    if (!instanceId || !tool) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: instanceId或tool',
      });
    }

    try {
      // 获取实例详情
      const instance = registry.getInstanceDetail(instanceId);
      if (!instance) {
        return res.status(404).json({
          success: false,
          error: `找不到MCP实例: ${instanceId}`,
        });
      }

      // 检查会话是否关联到此实例
      if (!instance.sessions.has(sessionId)) {
        // 关联会话到实例
        registry.associateSessionWithInstance(sessionId, instanceId);
      }

      // 更新最后使用时间
      instance.lastUsedTime = Date.now();

      // 检查工具是否存在
      const toolDef = instance.mcpSession.tools.find(t => t.name === tool);
      if (!toolDef) {
        return res.status(404).json({
          success: false,
          error: `实例 ${instanceId} 没有名为 ${tool} 的工具`,
        });
      }

      // 调用工具
      let result;
      if (instance.mcpSession.clientType === 'stdio') {
        result = await callRemoteMcpTool(instance.mcpSession, tool, params || {});
      } else if (instance.mcpSession.clientType === 'sse') {
        result = await callSseMcpTool(instance.mcpSession, tool, params || {});
      } else {
        throw new Error(`不支持的MCP类型: ${instance.mcpSession.clientType}`);
      }

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('代理调用MCP工具失败:', { error: error.message });
      res.status(500).json({
        success: false,
        error: `调用工具失败: ${error.message}`,
      });
    }
  });

  // 断开连接端点
  router.post('/disconnect', validateSession, async (req, res) => {
    const { instanceId } = req.body;
    const sessionId = req.sessionId;

    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: '缺少实例ID',
      });
    }

    try {
      // 获取mcpPool实例
      const mcpPool = getMcpPool();
      if (!mcpPool || typeof mcpPool.releaseMcpInstance !== 'function') {
        return res.status(500).json({
          success: false,
          error: 'MCP池服务未正确初始化',
        });
      }

      // 释放实例（但不销毁）
      const result = mcpPool.releaseMcpInstance(sessionId, instanceId);

      res.json({
        success: true,
      });
    } catch (error) {
      logger.error('代理断开MCP连接失败:', { error: error.message });
      res.status(500).json({
        success: false,
        error: `断开连接失败: ${error.message}`,
      });
    }
  });

  // 获取实例状态端点
  router.get('/instance/:instanceId', validateSession, (req, res) => {
    const { instanceId } = req.params;

    try {
      const instance = registry.getInstanceDetail(instanceId);
      if (!instance) {
        return res.status(404).json({
          success: false,
          error: `找不到实例: ${instanceId}`,
        });
      }

      res.json({
        success: true,
        instance: {
          instanceId: instance.instanceId,
          name: instance.mcpSession.name,
          status: instance.mcpSession.status,
          clientType: instance.mcpSession.clientType,
          tools: instance.mcpSession.tools,
          sessionCount: instance.sessions.size,
          lastUsedTime: instance.lastUsedTime,
          createdTime: instance.createdTime,
        },
      });
    } catch (error) {
      logger.error('获取实例状态失败:', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取实例状态失败: ${error.message}`,
      });
    }
  });

  // 获取可用实例列表端点
  router.get('/instances', validateSession, (req, res) => {
    try {
      const instances = registry.getAllInstances();

      res.json({
        success: true,
        instances,
      });
    } catch (error) {
      logger.error('获取实例列表失败:', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取实例列表失败: ${error.message}`,
      });
    }
  });

  return router;
}

module.exports = {
  createProxyRouter,
};
