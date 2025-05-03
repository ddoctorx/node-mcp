// src/application/ports/inbound/proxy-manager-port.js

/**
 * 代理管理入站端口
 * 定义代理功能的使用接口
 */
class ProxyManagerPort {
  /**
   * 代理连接MCP服务
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @param {string} clientType - 客户端类型
   * @param {Object} config - MCP配置
   * @returns {Promise<{success: boolean, result?: Object, error?: string}>}
   */
  async proxyConnect(sessionId, name, clientType, config) {
    throw new Error('Not implemented');
  }

  /**
   * 代理调用MCP工具
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @param {string} tool - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async proxyCall(sessionId, instanceId, tool, params) {
    throw new Error('Not implemented');
  }

  /**
   * 代理断开连接
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async proxyDisconnect(sessionId, instanceId) {
    throw new Error('Not implemented');
  }
}

module.exports = ProxyManagerPort;
