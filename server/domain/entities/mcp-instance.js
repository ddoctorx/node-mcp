// src/domain/entities/mcp-instance.js

/**
 * MCP实例类 - 代表一个MCP服务实例
 * 负责管理MCP服务实例的生命周期和状态
 */
class McpInstance {
  /**
   * @param {string} instanceId - 实例唯一标识
   * @param {Object} config - MCP配置，用于生成签名
   * @param {Object} mcpSession - MCP会话信息
   * @param {string} userId - 创建实例的用户ID
   */

  constructor(instanceId, config, mcpSession, userId = 'anonymous') {
    if (!instanceId) {
      throw new Error('Instance ID不能为空');
    }

    if (!config) {
      throw new Error('MCP配置不能为空');
    }

    if (!mcpSession) {
      throw new Error('MCP会话信息不能为空');
    }

    this.instanceId = instanceId;
    this.config = this._ensureConfigFormat(config);
    this.signature = this._generateSignature(this.config);
    this.mcpSession = this._ensureSessionFormat(mcpSession);
    this.userId = userId;
    this.sessions = new Set();
    this.lastUsedTime = Date.now();
    this.createdTime = Date.now();
    this.usageCount = 0;
  }

  /**
   * 关联会话到此实例
   * @param {string} sessionId - 会话ID
   */
  addSession(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID不能为空');
    }

    this.sessions.add(sessionId);
    this.lastUsedTime = Date.now();
    this.usageCount += 1;
  }

  /**
   * 解除会话关联
   * @param {string} sessionId - 会话ID
   */
  removeSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * 检查实例是否空闲
   * @param {number} idleTimeout - 空闲超时时间（毫秒）
   * @returns {boolean} 是否空闲
   */
  isIdle(idleTimeout) {
    const now = Date.now();
    return this.sessions.size === 0 && now - this.lastUsedTime > idleTimeout;
  }

  /**
   * 更新MCP会话状态
   * @param {string} status - 新状态 ('connected', 'disconnected', 'failed', etc.)
   */
  updateStatus(status) {
    this.mcpSession.status = status;
    this.lastUsedTime = Date.now();
  }

  /**
   * 检查实例是否可用于连接
   * @returns {boolean}
   */
  isAvailable() {
    return this.mcpSession.status === 'connected' && !this.isTerminated();
  }

  /**
   * 检查实例是否已终止
   * @returns {boolean}
   */
  isTerminated() {
    return this.mcpSession.status === 'terminated' || this.mcpSession.status === 'failed';
  }

  /**
   * 标记实例为已终止
   */
  terminate() {
    this.mcpSession.status = 'terminated';
    this.sessions.clear();
  }

  /**
   * 获取实例详细信息
   * @returns {Object} 实例详情
   */
  getDetails() {
    return {
      instanceId: this.instanceId,
      signature: this.signature,
      type: this.mcpSession.clientType,
      name: this.mcpSession.name,
      userId: this.userId,
      sessionCount: this.sessions.size,
      sessionIds: Array.from(this.sessions),
      lastUsedTime: this.lastUsedTime,
      createdTime: this.createdTime,
      usageCount: this.usageCount,
      status: this.mcpSession.status,
      tools: this.mcpSession.tools,
    };
  }

  /**
   * 确保配置格式正确
   * @private
   */
  _ensureConfigFormat(config) {
    // 如果是字符串配置，转换为对象格式
    if (typeof config === 'string') {
      return { command: config };
    }

    // 验证必要的配置字段
    if (config.command && config.args) {
      // Stdio配置
      return {
        type: 'stdio',
        command: config.command,
        args: config.args,
        env: config.env || {},
      };
    } else if (config.url) {
      // SSE配置
      return {
        type: 'sse',
        url: config.url,
      };
    }

    return config;
  }

  /**
   * 确保会话格式正确
   * @private
   */
  _ensureSessionFormat(session) {
    return {
      name: session.name || 'unnamed-mcp',
      clientType: session.clientType || 'stdio',
      tools: session.tools || [],
      status: session.status || 'connected',
      command: session.command,
      args: session.args,
      env: session.env,
      url: session.url,
      process: session.process,
      isExternal: session.isExternal || false,
      createdAt: session.createdAt || new Date(),
      ...session,
    };
  }

  /**
   * 生成配置签名
   * @private
   */
  _generateSignature(config) {
    // 简化的签名生成，实际应使用crypto模块的hash
    const configString = JSON.stringify(
      {
        type: config.type,
        command: config.command,
        args: config.args,
        url: config.url,
        env: config.env,
      },
      Object.keys(config).sort(),
    );

    // 模拟MD5 hash（实际应替换为crypto.createHash）
    return 'sig_' + Buffer.from(configString).toString('base64').substr(0, 8);
  }

  /**
   * 从普通对象创建实例
   * @static
   */
  static fromPlainObject(plainObject) {
    const instance = new McpInstance(
      plainObject.instanceId,
      plainObject.config,
      plainObject.mcpSession,
      plainObject.userId,
    );

    instance.sessions = new Set(plainObject.sessions || []);
    instance.lastUsedTime = plainObject.lastUsedTime || Date.now();
    instance.createdTime = plainObject.createdTime || Date.now();
    instance.usageCount = plainObject.usageCount || 0;

    return instance;
  }

  /**
   * 转换为普通对象
   */
  toPlainObject() {
    return {
      instanceId: this.instanceId,
      config: this.config,
      signature: this.signature,
      mcpSession: { ...this.mcpSession },
      userId: this.userId,
      sessions: Array.from(this.sessions),
      lastUsedTime: this.lastUsedTime,
      createdTime: this.createdTime,
      usageCount: this.usageCount,
    };
  }
}

module.exports = McpInstance;
