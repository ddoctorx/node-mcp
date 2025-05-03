// src/application/ports/outbound/config-loader-port.js

/**
 * 配置加载器出站端口
 * 定义配置加载操作的接口
 */
class ConfigLoaderPort {
  /**
   * 加载MCP服务器配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadMcpServers() {
    throw new Error('Not implemented');
  }

  /**
   * 保存MCP服务器配置
   * @param {Object} config - 配置对象
   * @returns {Promise<void>}
   */
  async saveMcpServers(config) {
    throw new Error('Not implemented');
  }

  /**
   * 获取环境配置
   * @returns {Promise<Object>} 环境配置
   */
  async getEnvConfig() {
    throw new Error('Not implemented');
  }

  /**
   * 获取系统路径
   * @param {string} type - 路径类型（如'python','node'）
   * @returns {Promise<Array<string>>} 路径列表
   */
  async getSystemPaths(type) {
    throw new Error('Not implemented');
  }
}

module.exports = ConfigLoaderPort;
