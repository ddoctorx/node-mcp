// src/application/services/proxy-manager-service.js

const ProxyManagerPort = require('../ports/inbound/proxy-manager-port');

/**
 * 代理管理服务
 * 处理代理连接、调用和断开的逻辑
 */
class ProxyManagerService extends ProxyManagerPort {
  /**
   * @param {McpManagerService} mcpManager - MCP管理服务
   * @param {PoolManagerService} poolManager - 池管理服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(mcpManager, poolManager, logger) {
    super();
    this.mcpManager = mcpManager;
    this.poolManager = poolManager;
    this.logger = logger;
  }

  /**
   * 代理连接MCP服务
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @param {string} clientType - 客户端类型
   * @param {Object} config - MCP配置
   * @returns {Promise<{success: boolean, result?: Object, error?: string}>}
   */
  async proxyConnect(sessionId, name, clientType, config) {
    this.logger.info('代理连接MCP', { sessionId, name, clientType });

    try {
      // 使用MCP管理器获取或创建实例
      const result = await this.mcpManager.connectMcp(sessionId, name, config, clientType);

      if (!result.success) {
        return result;
      }

      // 返回代理可以使用的信息
      return {
        success: true,
        result: {
          name: result.mcp.name,
          clientType: result.mcp.clientType,
          tools: result.mcp.tools,
          status: result.mcp.status,
        },
      };
    } catch (error) {
      this.logger.error('代理连接失败', { sessionId, name, error: error.message });
      return {
        success: false,
        error: `代理连接失败: ${error.message}`,
      };
    }
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
    this.logger.info('代理调用工具', { sessionId, instanceId, tool });

    try {
      // 获取实例详情以找到MCP名称
      const instance = await this.poolManager.getInstanceDetail(instanceId);
      if (!instance) {
        return {
          success: false,
          error: `找不到MCP实例: ${instanceId}`,
        };
      }

      // 确保会话关联到此实例
      const associationResult = await this.mcpManager.connectToExistingInstance(
        sessionId,
        instanceId,
      );
      if (!associationResult.success) {
        return {
          success: false,
          error: `无法关联会话到实例: ${associationResult.error}`,
        };
      }

      // 调用工具
      const result = await this.mcpManager.callMcpTool(sessionId, instance.name, tool, params);

      return result;
    } catch (error) {
      this.logger.error('代理调用失败', { sessionId, instanceId, tool, error: error.message });
      return {
        success: false,
        error: `代理调用失败: ${error.message}`,
      };
    }
  }

  /**
   * 代理断开连接
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async proxyDisconnect(sessionId, instanceId) {
    this.logger.info('代理断开连接', { sessionId, instanceId });

    try {
      // 获取实例详情
      const instance = await this.poolManager.getInstanceDetail(instanceId);
      if (!instance) {
        return {
          success: false,
          error: `找不到MCP实例: ${instanceId}`,
        };
      }

      // 断开MCP连接
      const result = await this.mcpManager.disconnectMcp(sessionId, instance.name);

      return result;
    } catch (error) {
      this.logger.error('代理断开失败', { sessionId, instanceId, error: error.message });
      return {
        success: false,
        error: `代理断开失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取MCP实例状态
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, instance?: Object, error?: string}>}
   */
  async getMcpInstanceStatus(instanceId) {
    return this.mcpManager.getMcpInstanceStatus(instanceId);
  }

  /**
   * 获取所有实例
   * @returns {Promise<{success: boolean, instances?: Array<Object>, error?: string}>}
   */
  async getAllInstances() {
    try {
      const result = await this.poolManager.getAllInstances();

      return {
        success: true,
        instances: result.instances,
      };
    } catch (error) {
      this.logger.error('获取实例列表失败', { error: error.message });
      return {
        success: false,
        error: `获取实例列表失败: ${error.message}`,
      };
    }
  }
}

module.exports = ProxyManagerService;
