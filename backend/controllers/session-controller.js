// 会话控制器
// 处理会话相关的HTTP请求

const sessionManager = require('../services/session-manager');
const { logger } = require('../utils/logger');

// 创建新会话
function createSession(req, res) {
  try {
    const { userId } = req.body;
    const result = sessionManager.createSession(userId);

    logger.info(`创建新会话成功`, { sessionId: result.sessionId, userId: result.userId });

    res.status(201).json({
      success: true,
      sessionId: result.sessionId,
      userId: result.userId,
    });
  } catch (error) {
    logger.error(`创建会话失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `创建会话失败: ${error.message}`,
    });
  }
}

// 获取会话信息
function getSessionInfo(req, res) {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    const sessionInfo = {
      id: session.id,
      userId: session.userId,
      createdAt: session.createdAt,
      mcpCount: Object.keys(session.mcpSessions).length,
      mcpList: Object.keys(session.mcpSessions),
    };

    res.json({
      success: true,
      session: sessionInfo,
    });
  } catch (error) {
    logger.error(`获取会话信息失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取会话信息失败: ${error.message}`,
    });
  }
}

// 删除会话
function deleteSession(req, res) {
  try {
    const { sessionId } = req.params;
    const result = sessionManager.deleteSession(sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    logger.info(`删除会话成功`, { sessionId });

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error(`删除会话失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `删除会话失败: ${error.message}`,
    });
  }
}

// 获取聊天历史
function getChatHistory(req, res) {
  try {
    const { sessionId } = req.params;
    const history = sessionManager.getChatHistory(sessionId);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    logger.error(`获取聊天历史失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取聊天历史失败: ${error.message}`,
    });
  }
}

// 清除聊天历史
function clearChatHistory(req, res) {
  try {
    const { sessionId } = req.params;
    sessionManager.clearChatHistory(sessionId);

    logger.info(`清除聊天历史成功`, { sessionId });

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error(`清除聊天历史失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `清除聊天历史失败: ${error.message}`,
    });
  }
}

// 获取用户会话列表
function getUserSessions(req, res) {
  try {
    const { userId } = req.params;
    const sessions = sessionManager.getUserSessions(userId);

    const sessionList = sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      mcpCount: Object.keys(session.mcpSessions).length,
      mcpList: Object.keys(session.mcpSessions),
    }));

    res.json({
      success: true,
      sessions: sessionList,
    });
  } catch (error) {
    logger.error(`获取用户会话列表失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取用户会话列表失败: ${error.message}`,
    });
  }
}

module.exports = {
  createSession,
  getSessionInfo,
  deleteSession,
  getChatHistory,
  clearChatHistory,
  getUserSessions,
};
