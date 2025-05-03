// src/application/ports/outbound/mcp-connector-port.js

/**
 * MCP连接器出站端口
 * 定义MCP服务连接操作的接口
 */
class McpConnectorPort {
  /**
   * 连接到MCP服务
   * @param {Object} config - MCP配置对象
   * @returns {Promise<Object>} MCP会话信息
   */
  async connect(config) {
    throw new Error('Not implemented');
  }

  /**
   * 断开MCP服务连接
   * @param {Object} instance - MCP实例
   * @returns {Promise<void>}
   */
  async disconnect(instance) {
    throw new Error('Not implemented');
  }

  /**
   * 调用MCP工具
   * @param {Object} instance - MCP实例
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<any>} 工具执行结果
   */
  async callTool(instance, toolName, params) {
    throw new Error('Not implemented');
  }

  /**
   * 获取MCP工具列表
   * @param {Object} instance - MCP实例
   * @returns {Promise<Array<Object>>} 工具列表
   */
  async getTools(instance) {
    throw new Error('Not implemented');
  }

  /**
   * 检查连接状态
   * @param {Object} instance - MCP实例
   * @returns {Promise<boolean>} 是否连接
   */
  async checkConnection(instance) {
    throw new Error('Not implemented');
  }
}

module.exports = McpConnectorPort;
