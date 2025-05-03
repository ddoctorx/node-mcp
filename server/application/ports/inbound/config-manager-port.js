// src/application/ports/inbound/config-manager-port.js

/**
 * 配置管理入站端口
 * 定义配置管理的使用接口
 */
class ConfigManagerPort {
  /**
   * 获取预定义MCP服务器列表
   * @returns {Promise<{success: boolean, servers?: Array<Object>, error?: string}>}
   */
  async getPredefinedServers() {
    throw new Error('Not implemented');
  }

  /**
   * 更新预定义MCP服务器配置
   * @param {Object} config - 服务器配置
   * @returns {Promise<{success: boolean, servers?: Array<string>, error?: string}>}
   */
  async updatePredefinedServers(config) {
    throw new Error('Not implemented');
  }

  /**
   * 获取系统Python路径
   * @returns {Promise<{success: boolean, pythonPaths?: Array<string>, error?: string}>}
   */
  async getSystemPythonPaths() {
    throw new Error('Not implemented');
  }
}

module.exports = ConfigManagerPort;
