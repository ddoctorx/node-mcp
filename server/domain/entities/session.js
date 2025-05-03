// domain/entities/session.js

class Session {
  constructor(id, userId, createAt = new Date()) {
    if (!id) {
      throw new Error('Session ID不能为空');
    }

    this.id = id;
    this.userId = userId || `anonymous-${this._generateAnonymousId()}`;
    this.mcpSessions = new Map(); // 使用Map替代对象，便于迭代和管理
    this.createAt = createAt;
    this._dirty = false; // 标记是否有未保存的修改
  }

  /**
   * 添加MCP连接到会话
   * @param {string} name - MCP名称
   * @param {Object} mcpInfo - MCP连接信息，包含instanceId, isNew, mcp等
   */
  addMcpConnection(name, mcpInfo) {
    if (!name) {
      throw new Error('MCP名称不能为空');
    }

    this.mcpSessions.set(name, {
      ...mcpInfo,
      connectedAt: new Date(),
    });
    this._dirty = true;
  }

  /**
   * 移除MCP连接
   * @param {string} name - MCP名称
   */
  removeMcpConnection(name) {
    if (this.mcpSessions.has(name)) {
      this.mcpSessions.delete(name);
      this._dirty = true;
    }
  }

  /**
   * 获取MCP连接信息
   * @param {string} name - MCP名称
   * @returns {Object|undefined} MCP连接信息
   */
  getMcpConnection(name) {
    return this.mcpSessions.get(name);
  }

  /**
   * 检查是否有指定的MCP连接
   * @param {string} name - MCP名称
   * @returns {boolean}
   */
  hasMcpConnection(name) {
    return this.mcpSessions.has(name);
  }

  /**
   * 获取所有MCP连接
   * @returns {Array} MCP连接列表
   */
  getAllMcpConnections() {
    return Array.from(this.mcpSessions.entries()).map(([name, info]) => ({
      name,
      ...info,
    }));
  }

  /**
   * 更新MCP连接状态
   * @param {string} name - MCP名称
   * @param {string} status - 新状态
   */
  updateMcpStatus(name, status) {
    const connection = this.mcpSessions.get(name);
    if (connection) {
      connection.status = status;
      connection.lastUpdated = new Date();
      this._dirty = true;
    }
  }

  /**
   * 获取会话统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      id: this.id,
      userId: this.userId,
      createdAt: this.createdAt,
      mcpConnectionCount: this.mcpSessions.size,
      connectedMcps: Array.from(this.mcpSessions.keys()),
    };
  }

  /**
   * 检查是否为匿名用户
   * @returns {boolean}
   */
  isAnonymous() {
    return this.userId.startsWith('anonymous-');
  }

  /**
   * 克隆会话到JSON序列化的格式
   * @returns {Object} 可序列化的会话对象
   */
  toPlainObject() {
    return {
      id: this.id,
      userId: this.userId,
      mcpSessions: Object.fromEntries(this.mcpSessions),
      createdAt: this.createdAt,
    };
  }

  /**
   * 从普通对象创建Session实例
   * @param {Object} plainObject - 普通的会话对象
   * @returns {Session} Session实例
   */
  static fromPlainObject(plainObject) {
    const session = new Session(plainObject.id, plainObject.userId, plainObject.createdAt);

    if (plainObject.mcpSessions) {
      Object.entries(plainObject.mcpSessions).forEach(([name, info]) => {
        session.addMcpConnection(name, info);
      });
    }

    session._dirty = false; // 刚加载的数据标记为未修改
    return session;
  }

  /**
   * 生成匿名用户ID
   * @private
   */
  _generateAnonymousId() {
    return Math.random().toString(36).substr(2, 9);
  }
}

module.exports = Session;
