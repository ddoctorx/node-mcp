// src/domain/services/instance-registry.js

const McpInstance = require('../entities/mcp-instance');
const McpConfig = require('../value-objects/mcp-config');

/**
 * 实例注册服务
 * 领域服务，负责MCP实例的注册、查找和管理
 */
class InstanceRegistry {
  constructor() {
    this._instances = new Map(); // signature -> McpInstance
    this._instanceMap = new Map(); // instanceId -> signature
    this._userInstances = new Map(); // userId -> Set<signature>
  }

  /**
   * 注册一个新的MCP服务实例
   * @param {string} instanceId - 实例ID
   * @param {McpConfig} config - MCP配置
   * @param {Object} mcpSession - MCP会话信息
   * @param {string} userId - 用户ID
   * @returns {McpInstance} 注册后的实例
   */
  register(instanceId, config, mcpSession, userId = 'anonymous') {
    if (!(config instanceof McpConfig)) {
      throw new Error('config必须是McpConfig实例');
    }

    const signature = config.generateSignature();

    if (this._instances.has(signature)) {
      // 如果已存在同样配置的实例，则返回它而不创建新的
      return this._instances.get(signature);
    }

    const instance = new McpInstance(instanceId, config, mcpSession, userId);

    this._instances.set(signature, instance);
    this._instanceMap.set(instanceId, signature);
    this._addUserInstance(userId, signature);

    return instance;
  }

  /**
   * 查找匹配的MCP服务实例
   * @param {McpConfig} config - MCP配置
   * @returns {McpInstance|undefined} 匹配的实例
   */
  findMatching(config) {
    if (!(config instanceof McpConfig)) {
      throw new Error('config必须是McpConfig实例');
    }

    const signature = config.generateSignature();
    return this._instances.get(signature);
  }

  /**
   * 根据实例ID获取实例
   * @param {string} instanceId - 实例ID
   * @returns {McpInstance|undefined} 实例详情
   */
  getById(instanceId) {
    const signature = this._instanceMap.get(instanceId);
    if (!signature) return undefined;
    return this._instances.get(signature);
  }

  /**
   * 查找用户的所有MCP服务实例
   * @param {string} userId - 用户ID
   * @returns {Array<McpInstance>} 实例列表
   */
  findUserInstances(userId) {
    const signatures = this._userInstances.get(userId);
    if (!signatures) return [];

    const instances = [];
    for (const signature of signatures) {
      const instance = this._instances.get(signature);
      if (instance && !instance.isTerminated()) {
        instances.push(instance);
      }
    }

    return instances;
  }

  /**
   * 关联会话与MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功关联
   */
  associateSession(sessionId, instanceId) {
    const instance = this.getById(instanceId);
    if (!instance) return false;

    instance.addSession(sessionId);
    return true;
  }

  /**
   * 解除会话与MCP实例的关联
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功解除关联
   */
  dissociateSession(sessionId, instanceId) {
    const instance = this.getById(instanceId);
    if (!instance) return false;

    instance.removeSession(sessionId);
    return true;
  }

  /**
   * 获取所有空闲的MCP服务实例
   * @param {number} idleTimeout - 空闲超时时间（毫秒）
   * @returns {Array<McpInstance>} 空闲实例列表
   */
  getIdleInstances(idleTimeout = 5 * 60 * 1000) {
    const idleInstances = [];

    for (const instance of this._instances.values()) {
      if (instance.isIdle(idleTimeout) && !instance.isTerminated()) {
        idleInstances.push(instance);
      }
    }

    return idleInstances;
  }

  /**
   * 移除指定的MCP服务实例
   * @param {string} instanceId - 实例ID
   * @returns {boolean} 是否成功移除
   */
  remove(instanceId) {
    const signature = this._instanceMap.get(instanceId);
    if (!signature) return false;

    const instance = this._instances.get(signature);
    if (!instance) return false;

    // 从用户映射中移除
    const userId = instance.userId;
    const userSignatures = this._userInstances.get(userId);
    if (userSignatures) {
      userSignatures.delete(signature);
      if (userSignatures.size === 0) {
        this._userInstances.delete(userId);
      }
    }

    // 移除实例
    this._instances.delete(signature);
    this._instanceMap.delete(instanceId);

    return true;
  }

  /**
   * 获取所有实例信息
   * @returns {Array<Object>} 实例信息列表
   */
  getAllInstances() {
    const instances = [];

    for (const instance of this._instances.values()) {
      instances.push(instance.getDetails());
    }

    return instances;
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const allInstances = Array.from(this._instances.values());
    return {
      totalInstances: allInstances.length,
      activeInstances: allInstances.filter(inst => inst.isAvailable()).length,
      idleInstances: allInstances.filter(inst => inst.isIdle(5 * 60 * 1000)).length,
      totalUsers: this._userInstances.size,
      userStats: this._getUserStats(),
    };
  }

  /**
   * 清空所有实例
   * 主要用于重置或测试
   */
  clear() {
    this._instances.clear();
    this._instanceMap.clear();
    this._userInstances.clear();
  }

  /**
   * 添加用户实例映射
   * @private
   */
  _addUserInstance(userId, signature) {
    if (!this._userInstances.has(userId)) {
      this._userInstances.set(userId, new Set());
    }
    this._userInstances.get(userId).add(signature);
  }

  /**
   * 获取用户统计信息
   * @private
   */
  _getUserStats() {
    const stats = {};
    for (const [userId, signatures] of this._userInstances.entries()) {
      stats[userId] = {
        instanceCount: signatures.size,
        activeInstances: 0,
        idleInstances: 0,
      };

      for (const signature of signatures) {
        const instance = this._instances.get(signature);
        if (instance) {
          if (instance.isAvailable()) {
            stats[userId].activeInstances++;
          } else if (instance.isIdle(5 * 60 * 1000)) {
            stats[userId].idleInstances++;
          }
        }
      }
    }
    return stats;
  }
}

module.exports = InstanceRegistry;
