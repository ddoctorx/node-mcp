// src/infrastructure/adapters/outbound/notification/socket-setup.js

const socketIo = require('socket.io');

/**
 * Socket.IO设置和初始化
 */
class SocketSetup {
  /**
   * 设置WebSocket连接处理器
   * @param {SocketIO.Server} io - Socket.IO服务器实例
   * @param {NotificationPort} notifier - 通知服务
   * @param {LoggerPort} logger - 日志服务
   */
  static setupSocketHandlers(io, notifier, logger) {
    io.on('connection', socket => {
      logger.info('客户端已连接', { socketId: socket.id });

      // 处理加入会话房间
      socket.on('join_session', sessionId => {
        if (sessionId) {
          socket.join(sessionId);
          logger.info(`客户端加入会话房间`, {
            socketId: socket.id,
            sessionId,
          });
        }
      });

      // 处理离开会话房间
      socket.on('leave_session', sessionId => {
        if (sessionId) {
          socket.leave(sessionId);
          logger.info(`客户端离开会话房间`, {
            socketId: socket.id,
            sessionId,
          });
        }
      });

      // 处理断开连接
      socket.on('disconnect', reason => {
        logger.info('客户端已断开连接', {
          socketId: socket.id,
          reason,
        });
      });

      // 处理错误
      socket.on('error', error => {
        logger.error('WebSocket错误', {
          socketId: socket.id,
          error: error.message,
        });
      });
    });
  }

  /**
   * 创建Socket.IO服务器
   * @param {http.Server} server - HTTP服务器实例
   * @param {Object} [options] - Socket.IO选项
   * @returns {SocketIO.Server} Socket.IO服务器实例
   */
  static createSocketServer(server, options = {}) {
    const io = socketIo(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      ...options,
    });

    return io;
  }
}

module.exports = SocketSetup;
