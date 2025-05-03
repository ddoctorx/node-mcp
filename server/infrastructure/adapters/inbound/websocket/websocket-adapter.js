// src/infrastructure/adapters/inbound/websocket/websocket-adapter.js

/**
 * WebSocket适配器
 * 处理实时WebSocket连接和通信
 */
class WebSocketAdapter {
  /**
   * @param {SocketIO.Server} io - Socket.IO服务器实例
   * @param {SessionManagerService} sessionManager - 会话管理服务
   * @param {SocketNotifier} notifier - Socket通知服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(io, sessionManager, notifier, logger) {
    this.io = io;
    this.sessionManager = sessionManager;
    this.notifier = notifier;
    this.logger = logger;
    this._setupMiddleware();
    this._setupHandlers();
  }

  /**
   * 设置中间件
   * @private
   */
  _setupMiddleware() {
    // 连接认证中间件
    this.io.use(async (socket, next) => {
      const sessionId = socket.handshake.auth?.sessionId;

      if (!sessionId) {
        this.logger.error('WebSocket连接缺少会话ID', { socketId: socket.id });
        return next(new Error('缺少会话ID'));
      }

      // 验证会话是否存在
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        this.logger.error('WebSocket连接使用无效会话ID', { socketId: socket.id, sessionId });
        return next(new Error('无效的会话ID'));
      }

      socket.sessionId = sessionId;
      next();
    });
  }

  /**
   * 设置事件处理器
   * @private
   */
  _setupHandlers() {
    this.io.on('connection', socket => {
      this._onConnection(socket);
    });
  }

  /**
   * 处理新连接
   * @private
   * @param {Socket} socket - Socket.IO客户端
   */
  _onConnection(socket) {
    const { sessionId } = socket;

    this.logger.info('WebSocket客户端已连接', {
      socketId: socket.id,
      sessionId,
    });

    // 加入会话房间
    socket.join(sessionId);

    // 设置客户端事件处理器
    this._setupClientEvents(socket);

    // 处理断开连接
    socket.on('disconnect', reason => {
      this._onDisconnect(socket, reason);
    });

    // 处理错误
    socket.on('error', error => {
      this._onError(socket, error);
    });

    // 发送连接成功通知
    socket.emit('connected', {
      sessionId,
      message: '已连接到服务器',
      time: new Date().toISOString(),
    });
  }

  /**
   * 设置客户端事件处理器
   * @private
   * @param {Socket} socket - Socket.IO客户端
   */
  _setupClientEvents(socket) {
    const { sessionId } = socket;

    // 加入特定的房间
    socket.on('join_room', roomId => {
      socket.join(roomId);
      this.logger.info('客户端加入房间', {
        socketId: socket.id,
        sessionId,
        roomId,
      });
    });

    // 离开特定的房间
    socket.on('leave_room', roomId => {
      socket.leave(roomId);
      this.logger.info('客户端离开房间', {
        socketId: socket.id,
        sessionId,
        roomId,
      });
    });

    // 获取会话状态
    socket.on('get_session_status', async () => {
      try {
        const session = await this.sessionManager.getSession(sessionId);
        socket.emit('session_status', {
          sessionId,
          status: session ? 'active' : 'inactive',
          userId: session?.userId,
          createdAt: session?.createdAt,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // 刷新会话连接
    socket.on('refresh_session', async () => {
      try {
        const session = await this.sessionManager.getSession(sessionId);
        if (!session) {
          socket.emit('error', { message: '会话不存在' });
          return;
        }

        socket.emit('session_refreshed', {
          sessionId,
          userId: session.userId,
          time: new Date().toISOString(),
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });
  }

  /**
   * 处理断开连接
   * @private
   * @param {Socket} socket - Socket.IO客户端
   * @param {string} reason - 断开原因
   */
  _onDisconnect(socket, reason) {
    const { sessionId } = socket;

    this.logger.info('WebSocket客户端已断开连接', {
      socketId: socket.id,
      sessionId,
      reason,
    });

    // 清理可能的会话状态（如果需要）
    this._cleanupSocketState(socket);
  }

  /**
   * 处理错误
   * @private
   * @param {Socket} socket - Socket.IO客户端
   * @param {Error} error - 错误对象
   */
  _onError(socket, error) {
    const { sessionId } = socket;

    this.logger.error('WebSocket错误', {
      socketId: socket.id,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * 清理Socket状态
   * @private
   * @param {Socket} socket - Socket.IO客户端
   */
  _cleanupSocketState(socket) {
    // 如果需要的话，可以在这里添加清理逻辑
    // 例如：取消某些订阅、清理缓存等
  }

  /**
   * 向特定会话发送消息
   * @param {string} sessionId - 会话ID
   * @param {string} event - 事件名称
   * @param {any} data - 数据
   */
  sendToSession(sessionId, event, data) {
    this.io.to(sessionId).emit(event, data);
  }

  /**
   * 广播消息到所有连接的客户端
   * @param {string} event - 事件名称
   * @param {any} data - 数据
   */
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  /**
   * 获取会话的连接数
   * @param {string} sessionId - 会话ID
   * @returns {number} 连接数
   */
  getSessionConnectionCount(sessionId) {
    const room = this.io.sockets.adapter.rooms.get(sessionId);
    return room ? room.size : 0;
  }

  /**
   * 断开会话的所有连接
   * @param {string} sessionId - 会话ID
   * @param {string} reason - 断开原因
   */
  async disconnectSession(sessionId, reason = 'server_request') {
    try {
      const sockets = await this.io.in(sessionId).fetchSockets();

      for (const socket of sockets) {
        socket.disconnect(true);
      }

      this.logger.info('已断开会话的所有连接', {
        sessionId,
        reason,
        count: sockets.length,
      });
    } catch (error) {
      this.logger.error('断开会话连接失败', {
        sessionId,
        error: error.message,
      });
    }
  }

  /**
   * 向特定房间发送消息
   * @param {string} roomId - 房间ID
   * @param {string} event - 事件名称
   * @param {any} data - 数据
   */
  sendToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  /**
   * 创建适配器实例
   * @static
   * @param {SocketIO.Server} io - Socket.IO服务器实例
   * @param {Object} dependencies - 依赖注入对象
   * @returns {WebSocketAdapter} 适配器实例
   */
  static create(io, dependencies) {
    const { sessionManager, notifier, logger } = dependencies;

    return new WebSocketAdapter(io, sessionManager, notifier, logger);
  }
}

module.exports = WebSocketAdapter;
