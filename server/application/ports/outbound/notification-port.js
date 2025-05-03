// src/application/ports/outbound/notification-port.js

/**
 * 通知服务出站端口
 * 定义系统通知操作的接口
 */
class NotificationPort {
  /**
   * 发送会话通知
   * @param {string} sessionId - 会话ID
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   * @returns {Promise<void>}
   */
  async notifySession(sessionId, event, data) {
    throw new Error('Not implemented');
  }

  /**
   * 发送MCP连接状态通知
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {string} status - 状态
   * @returns {Promise<void>}
   */
  async notifyMcpStatus(sessionId, mcpName, status) {
    throw new Error('Not implemented');
  }

  /**
   * 发送全局通知
   * @param {string} event - 事件类型
   * @param {Object} data - 事件数据
   * @returns {Promise<void>}
   */
  async notifyGlobal(event, data) {
    throw new Error('Not implemented');
  }
}

module.exports = NotificationPort;
