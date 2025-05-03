// src/infrastructure/adapters/inbound/http/session-controller.js

/**
 * 会话控制器
 * 处理会话管理相关的HTTP请求
 */
class SessionController {
  /**
   * @param {SessionManagerService} sessionManager - 会话管理服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(sessionManager, logger) {
    this.sessionManager = sessionManager;
    this.logger = logger;

    // 绑定this上下文，确保在路由中正确工作
    this.createSession = this.createSession.bind(this);
    this.getSession = this.getSession.bind(this);
    this.deleteSession = this.deleteSession.bind(this);
    this.listUserSessions = this.listUserSessions.bind(this);
    this.cleanupExpiredSessions = this.cleanupExpiredSessions.bind(this);
  }

  /**
   * 创建新会话 - POST /api/session
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async createSession(req, res) {
    try {
      const { userId } = req.body;

      this.logger.info('接收到创建会话请求', { userId });

      const result = await this.sessionManager.createSession(userId);

      this.logger.info('会话创建成功', {
        sessionId: result.sessionId,
        userId: result.userId,
      });

      res.json({
        success: true,
        sessionId: result.sessionId,
        userId: result.userId,
      });
    } catch (error) {
      this.logger.error('创建会话失败', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: `创建会话失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取会话信息 - GET /api/session/:sessionId
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getSession(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      const session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
        });
      }

      res.json({
        success: true,
        session: {
          sessionId: session.id,
          userId: session.userId,
          createdAt: session.createdAt,
          mcpConnections: session.getAllMcpConnections().length,
        },
      });
    } catch (error) {
      this.logger.error('获取会话失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取会话失败: ${error.message}`,
      });
    }
  }

  /**
   * 删除会话 - DELETE /api/session/:sessionId
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async deleteSession(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      await this.sessionManager.deleteSession(sessionId);

      this.logger.info('会话删除成功', { sessionId });

      res.json({
        success: true,
        message: '会话已删除',
      });
    } catch (error) {
      this.logger.error('删除会话失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `删除会话失败: ${error.message}`,
      });
    }
  }

  /**
   * 列出用户的所有会话 - GET /api/session/user/:userId
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async listUserSessions(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: '缺少用户ID',
        });
      }

      const sessions = await this.sessionManager.listUserSessions(userId);

      res.json({
        success: true,
        sessions,
      });
    } catch (error) {
      this.logger.error('列出用户会话失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `列出用户会话失败: ${error.message}`,
      });
    }
  }

  /**
   * 清理过期会话（管理接口） - POST /api/session/cleanup
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async cleanupExpiredSessions(req, res) {
    try {
      const { maxAge } = req.body;

      const cleanedCount = await this.sessionManager.cleanupExpiredSessions(maxAge);

      this.logger.info('清理过期会话完成', { cleanedCount });

      res.json({
        success: true,
        message: `清理了 ${cleanedCount} 个过期会话`,
        cleanedCount,
      });
    } catch (error) {
      this.logger.error('清理过期会话失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `清理过期会话失败: ${error.message}`,
      });
    }
  }
}

module.exports = SessionController;
