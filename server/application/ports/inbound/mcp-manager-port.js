// src/application/ports/inbound/mcp-manager-port.js

/**
 * MCP管理入站端口
 * 定义MCP管理的使用接口
 */
class McpManagerPort {
  /**
   * 连接到MCP服务
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @param {Object} config - MCP配置
   * @param {string} clientType - 客户端类型（stdio|sse）
   * @param {string} [userId] - 用户ID（可选，可从会话获取）
   * @returns {Promise<{success: boolean, mcp?: Object, error?: string}>}
   */
  async connectMcp(sessionId, name, config, clientType, userId) {
    throw new Error('Not implemented');
  }

  /**
   * 断开MCP连接
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async disconnectMcp(sessionId, name) {
    throw new Error('Not implemented');
  }

  /**
   * 调用MCP工具
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async callMcpTool(sessionId, mcpName, toolName, params) {
    throw new Error('Not implemented');
  }

  /**
   * 获取会话的MCP列表
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, mcps?: Array<Object>, error?: string}>}
   */
  async getSessionMcps(sessionId) {
    throw new Error('Not implemented');
  }

  /**
   * 获取MCP实例状态
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, instance?: Object, error?: string}>}
   */
  async getMcpInstanceStatus(instanceId) {
    throw new Error('Not implemented');
  }

  /**
   * 连接到已有的MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, mcp?: Object, error?: string}>}
   */
  async connectToExistingInstance(sessionId, instanceId) {
    throw new Error('Not implemented');
  }
}

module.exports = McpManagerPort;
