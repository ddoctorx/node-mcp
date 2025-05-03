// src/infrastructure/adapters/outbound/notification/socket-notifier.js

const NotificationPort = require('../../../../application/ports/outbound/notification-port');

/**
 * Socket通知服务适配器
 * 通过WebSocket发送实时通知
 */
class SocketNotifier extends NotificationPort {
  /**
   * @param {SocketIO.Server} io - Socket.IO服务器实例
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(io, logger) {
    super();
    this.io = io;
    this.logger = logger;
  }

  /**
   * 发送会话通知
   * @param {string} sessionId - 会话ID
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   * @returns {Promise<void>}
   */
  async notifySession(sessionId, event, data) {
    if (!sessionId) {
      this.logger.error('会话ID不能为空');
      return;
    }

    this.logger.debug(`发送会话通知: ${event}`, {
      sessionId,
      event,
      dataType: typeof data,
    });

    try {
      this.io.to(sessionId).emit(event, data);
      this.logger.debug(`已发送会话通知`, { sessionId, event });
    } catch (error) {
      this.logger.error(`发送会话通知失败`, {
        sessionId,
        event,
        error: error.message,
      });
    }
  }

  /**
   * 发送MCP连接状态通知
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {string} status - 状态
   * @returns {Promise<void>}
   */
  async notifyMcpStatus(sessionId, mcpName, status) {
    const event = 'mcp_status_changed';
    const data = {
      name: mcpName,
      status: status,
    };

    this.logger.info(`发送MCP状态通知: ${mcpName} - ${status}`, {
      sessionId,
      mcpName,
      status,
    });

    await this.notifySession(sessionId, event, data);
  }

  /**
   * 发送MCP已连接通知
   * @param {string} sessionId - 会话ID
   * @param {Object} mcpInfo - MCP信息
   * @returns {Promise<void>}
   */
  async notifyMcpConnected(sessionId, mcpInfo) {
    const event = 'mcp_connected';

    this.logger.info(`发送MCP连接通知`, {
      sessionId,
      mcpName: mcpInfo.name,
    });

    await this.notifySession(sessionId, event, mcpInfo);
  }

  /**
   * 发送MCP已断开通知
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @returns {Promise<void>}
   */
  async notifyMcpDisconnected(sessionId, mcpName) {
    const event = 'mcp_disconnected';
    const data = { name: mcpName };

    this.logger.info(`发送MCP断开通知`, {
      sessionId,
      mcpName,
    });

    await this.notifySession(sessionId, event, data);
  }

  /**
   * 发送全局通知
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   * @returns {Promise<void>}
   */
  async notifyGlobal(event, data) {
    this.logger.debug(`发送全局通知: ${event}`, {
      event,
      dataType: typeof data,
    });

    try {
      this.io.emit(event, data);
      this.logger.debug(`已发送全局通知`, { event });
    } catch (error) {
      this.logger.error(`发送全局通知失败`, {
        event,
        error: error.message,
      });
    }
  }

  /**
   * 发送实例池统计更新通知
   * @param {Object} stats - 统计信息
   * @returns {Promise<void>}
   */
  async notifyPoolStatsUpdate(stats) {
    const event = 'pool_stats_update';

    this.logger.debug(`发送池统计更新通知`, { stats });
    await this.notifyGlobal(event, stats);
  }

  /**
   * 发送系统状态通知
   * @param {Object} status - 系统状态
   * @returns {Promise<void>}
   */
  async notifySystemStatus(status) {
    const event = 'system_status';

    this.logger.debug(`发送系统状态通知`, { status });
    await this.notifyGlobal(event, status);
  }

  /**
   * 获取连接到指定会话的客户端数量
   * @param {string} sessionId - 会话ID
   * @returns {Promise<number>} 连接的客户端数量
   */
  async getSessionClientCount(sessionId) {
    try {
      const room = this.io.sockets.adapter.rooms.get(sessionId);
      const count = room ? room.size : 0;

      this.logger.debug(`会话客户端数量`, {
        sessionId,
        count,
      });

      return count;
    } catch (error) {
      this.logger.error(`获取会话客户端数量失败`, {
        sessionId,
        error: error.message,
      });
      return 0;
    }
  }

  /**
   * 检查会话是否有活动连接
   * @param {string} sessionId - 会话ID
   * @returns {Promise<boolean>} 是否有活动连接
   */
  async hasActiveConnections(sessionId) {
    const count = await this.getSessionClientCount(sessionId);
    return count > 0;
  }

  /**
   * 关闭指定会话的所有连接
   * @param {string} sessionId - 会话ID
   * @returns {Promise<void>}
   */
  async closeSessionConnections(sessionId) {
    try {
      const sockets = await this.io.in(sessionId).fetchSockets();

      for (const socket of sockets) {
        socket.disconnect(true);
      }

      this.logger.info(`已关闭会话的所有连接`, {
        sessionId,
        count: sockets.length,
      });
    } catch (error) {
      this.logger.error(`关闭会话连接失败`, {
        sessionId,
        error: error.message,
      });
    }
  }
}

module.exports = SocketNotifier;
