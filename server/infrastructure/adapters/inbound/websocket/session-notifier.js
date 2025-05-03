// src/infrastructure/adapters/inbound/websocket/session-notifier.js

/**
 * 会话通知器
 * 处理会话级别的WebSocket通知逻辑
 */
class SessionNotifier {
  /**
   * @param {SocketNotifier} socketNotifier - Socket通知服务
   * @param {WebSocketAdapter} wsAdapter - WebSocket适配器
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(socketNotifier, wsAdapter, logger) {
    this.socketNotifier = socketNotifier;
    this.wsAdapter = wsAdapter;
    this.logger = logger;
  }

  /**
   * 发送系统通知
   * @param {string} sessionId - 会话ID
   * @param {string} message - 通知消息
   * @param {Object} [data] - 附加数据
   */
  async notifySystem(sessionId, message, data = {}) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'system_notification', {
        type: 'system',
        message,
        timestamp: new Date().toISOString(),
        ...data,
      });

      this.logger.debug('发送系统通知成功', { sessionId, message });
    } catch (error) {
      this.logger.error('发送系统通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 发送错误通知
   * @param {string} sessionId - 会话ID
   * @param {string} errorMessage - 错误消息
   * @param {Object} [context] - 错误上下文
   */
  async notifyError(sessionId, errorMessage, context = {}) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'error_notification', {
        type: 'error',
        message: errorMessage,
        timestamp: new Date().toISOString(),
        context,
      });

      this.logger.debug('发送错误通知成功', { sessionId, errorMessage });
    } catch (error) {
      this.logger.error('发送错误通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 发送会话状态更新通知
   * @param {string} sessionId - 会话ID
   * @param {Object} statusUpdate - 状态更新信息
   */
  async notifySessionStatus(sessionId, statusUpdate) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'session_status_update', {
        sessionId,
        ...statusUpdate,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('发送会话状态更新成功', { sessionId, statusUpdate });
    } catch (error) {
      this.logger.error('发送会话状态更新失败', { sessionId, error: error.message });
    }
  }

  /**
   * 发送聊天新消息通知
   * @param {string} sessionId - 会话ID
   * @param {Object} message - 消息对象
   */
  async notifyNewChatMessage(sessionId, message) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'new_chat_message', {
        sessionId,
        message,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('发送新聊天消息通知成功', { sessionId });
    } catch (error) {
      this.logger.error('发送新聊天消息通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 发送MCP状态变更通知
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {string} status - 新状态
   * @param {Object} [details] - 附加详情
   */
  async notifyMcpStatusChange(sessionId, mcpName, status, details = {}) {
    try {
      await this.socketNotifier.notifyMcpStatus(sessionId, mcpName, status);

      // 发送详细变更通知
      await this.socketNotifier.notifySession(sessionId, 'mcp_status_change_detail', {
        mcpName,
        status,
        details,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('发送MCP状态变更通知成功', { sessionId, mcpName, status });
    } catch (error) {
      this.logger.error('发送MCP状态变更通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 发送处理进度通知
   * @param {string} sessionId - 会话ID
   * @param {string} taskName - 任务名称
   * @param {number} progress - 进度百分比（0-100）
   * @param {Object} [details] - 进度详情
   */
  async notifyProgress(sessionId, taskName, progress, details = {}) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'task_progress', {
        taskName,
        progress,
        details,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('发送进度通知成功', { sessionId, taskName, progress });
    } catch (error) {
      this.logger.error('发送进度通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 群发会话通知
   * @param {Array<string>} sessionIds - 会话ID列表
   * @param {string} event - 事件名称
   * @param {Object} data - 通知数据
   */
  async notifyMultipleSessions(sessionIds, event, data) {
    try {
      const promises = sessionIds.map(sessionId =>
        this.socketNotifier.notifySession(sessionId, event, data),
      );

      await Promise.all(promises);

      this.logger.debug('群发会话通知成功', { sessionCount: sessionIds.length, event });
    } catch (error) {
      this.logger.error('群发会话通知失败', { error: error.message });
    }
  }

  /**
   * 发送会话关闭通知
   * @param {string} sessionId - 会话ID
   * @param {string} reason - 关闭原因
   */
  async notifySessionClose(sessionId, reason) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'session_closing', {
        sessionId,
        reason,
        timestamp: new Date().toISOString(),
      });

      // 等待一段时间确保通知发送
      await new Promise(resolve => setTimeout(resolve, 500));

      // 关闭连接
      await this.wsAdapter.disconnectSession(sessionId, reason);

      this.logger.info('会话关闭通知已发送', { sessionId, reason });
    } catch (error) {
      this.logger.error('发送会话关闭通知失败', { sessionId, error: error.message });
    }
  }

  /**
   * 获取会话连接状态
   * @param {string} sessionId - 会话ID
   * @returns {Promise<Object>} 连接状态信息
   */
  async getSessionConnectionStatus(sessionId) {
    try {
      const connectionCount = this.wsAdapter.getSessionConnectionCount(sessionId);
      const isActive = connectionCount > 0;

      return {
        sessionId,
        connectionCount,
        isActive,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('获取会话连接状态失败', { sessionId, error: error.message });
      return {
        sessionId,
        connectionCount: 0,
        isActive: false,
        error: error.message,
      };
    }
  }

  /**
   * 发送实时诊断信息
   * @param {string} sessionId - 会话ID
   * @param {Object} diagnosticData - 诊断数据
   */
  async notifyDiagnostic(sessionId, diagnosticData) {
    try {
      await this.socketNotifier.notifySession(sessionId, 'diagnostic_info', {
        type: 'diagnostic',
        data: diagnosticData,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug('发送诊断信息成功', { sessionId });
    } catch (error) {
      this.logger.error('发送诊断信息失败', { sessionId, error: error.message });
    }
  }

  /**
   * 创建通知器实例
   * @static
   * @param {Object} dependencies - 依赖注入对象
   * @returns {SessionNotifier} 通知器实例
   */
  static create(dependencies) {
    const { socketNotifier, wsAdapter, logger } = dependencies;

    return new SessionNotifier(socketNotifier, wsAdapter, logger);
  }
}

module.exports = SessionNotifier;
