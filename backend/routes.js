// API路由配置

const express = require('express');
const sessionController = require('./controllers/session-controller');
const chatController = require('./controllers/chat-controller');
const mcpController = require('./controllers/mcp-controller');

// 会话验证中间件
const validateSession = (req, res, next) => {
  const sessionId = req.headers['x-session-id'] || req.params.sessionId;
  if (!sessionId) {
    return res.status(401).json({
      success: false,
      error: '缺少会话ID',
    });
  }

  req.sessionId = sessionId;
  next();
};

function setupRoutes(app) {
  // 会话相关路由
  app.post('/api/sessions', sessionController.createSession);
  app.get('/api/sessions/:sessionId', validateSession, sessionController.getSessionInfo);
  app.delete('/api/sessions/:sessionId', validateSession, sessionController.deleteSession);
  app.get('/api/sessions/:sessionId/history', validateSession, sessionController.getChatHistory);
  app.delete(
    '/api/sessions/:sessionId/history',
    validateSession,
    sessionController.clearChatHistory,
  );
  app.get('/api/users/:userId/sessions', sessionController.getUserSessions);

  // 聊天相关路由
  app.post('/api/sessions/:sessionId/messages', validateSession, chatController.sendMessage);
  app.post('/api/sessions/:sessionId/tools', validateSession, chatController.callTool);
  app.get('/api/sessions/:sessionId/tools', validateSession, chatController.getAvailableTools);

  // MCP相关路由
  app.post('/api/sessions/:sessionId/mcp', validateSession, mcpController.connectMcp);
  app.delete('/api/sessions/:sessionId/mcp', validateSession, mcpController.disconnectMcp);
  app.get('/api/sessions/:sessionId/mcp', validateSession, mcpController.getSessionMcps);
  app.get('/api/mcp/instances', mcpController.getAllInstances);
  app.get('/api/mcp/instances/:instanceId', mcpController.getInstanceDetail);
  app.get('/api/mcp/stats', mcpController.getPoolStats);
  app.post('/api/mcp/diagnose', mcpController.diagnoseMcpCommand);

  // 代理路由在app.js中单独配置

  return app;
}

module.exports = setupRoutes;
