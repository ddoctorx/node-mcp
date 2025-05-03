// src/application/services/mcp-manager-service.js

const McpManagerPort = require('../ports/inbound/mcp-manager-port');
const McpConfig = require('../../domain/value-objects/mcp-config');

/**
 * MCP管理服务
 * 负责MCP连接、工具调用和实例管理
 */
class McpManagerService extends McpManagerPort {
  /**
   * @param {SessionManagerService} sessionManager - 会话管理服务
   * @param {McpPoolService} mcpPool - MCP池服务
   * @param {McpConnectorFactory} connectorFactory - MCP连接器工厂
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(sessionManager, mcpPool, connectorFactory, logger) {
    super();
    this.sessionManager = sessionManager;
    this.mcpPool = mcpPool;
    this.connectorFactory = connectorFactory;
    this.logger = logger;
  }

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
    this.logger.info(`连接MCP: ${name}`, { sessionId, clientType });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      // 如果没有提供userId，从会话中获取
      const actualUserId = userId || session.userId;

      // 使用MCP池获取或创建实例
      const result = await this.mcpPool.getOrCreateMcpInstance(
        sessionId,
        name,
        config,
        clientType,
        actualUserId,
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // 在会话中添加MCP连接
      await this.sessionManager.updateMcpConnection(sessionId, name, {
        instanceId: result.instanceId,
        isNew: result.isNew,
        mcp: result.mcp,
      });

      return {
        success: true,
        mcp: result.mcp,
      };
    } catch (error) {
      this.logger.error(`连接MCP失败: ${error.message}`, { sessionId, name });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 断开MCP连接
   * @param {string} sessionId - 会话ID
   * @param {string} name - MCP名称
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async disconnectMcp(sessionId, name) {
    this.logger.info(`断开MCP: ${name}`, { sessionId });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      const mcpConnection = session.getMcpConnection(name);
      if (!mcpConnection) {
        throw new Error(`MCP连接不存在: ${name}`);
      }

      // 释放实例（但不销毁）
      this.mcpPool.releaseMcpInstance(sessionId, mcpConnection.instanceId);

      // 从会话中移除MCP引用
      await this.sessionManager.removeMcpConnection(sessionId, name);

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(`断开MCP失败: ${error.message}`, { sessionId, name });
      return {
        success: false,
        error: error.message,
      };
    }
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
    const startTime = Date.now();
    this.logger.info(`调用MCP工具: ${mcpName}.${toolName}`, {
      sessionId,
      params,
    });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      const mcpConnection = session.getMcpConnection(mcpName);
      if (!mcpConnection) {
        throw new Error(`MCP连接不存在: ${mcpName}`);
      }

      // 获取实例详情
      const instance = this.mcpPool.getInstanceDetail(mcpConnection.instanceId);
      if (!instance) {
        throw new Error(`MCP实例不存在: ${mcpConnection.instanceId}`);
      }

      // 获取工具定义
      const toolDef = instance.tools.find(t => t.name === toolName);
      if (!toolDef) {
        throw new Error(`工具不存在: ${toolName}`);
      }

      // 确保参数是对象
      const safeParams = params && typeof params === 'object' ? params : {};

      // 创建连接器并调用工具
      const connector = this.connectorFactory.createConnector(instance.clientType);
      const result = await connector.callTool(instance, toolName, safeParams);

      const responseTime = Date.now() - startTime;
      this.logger.info(`工具调用成功: ${mcpName}.${toolName}`, {
        sessionId,
        responseTime,
      });

      return {
        success: true,
        result,
      };
    } catch (error) {
      this.logger.error(`工具调用失败: ${error.message}`, {
        sessionId,
        mcpName,
        toolName,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取会话的MCP列表
   * @param {string} sessionId - 会话ID
   * @returns {Promise<{success: boolean, mcps?: Array<Object>, error?: string}>}
   */
  async getSessionMcps(sessionId) {
    this.logger.debug(`获取会话MCP列表`, { sessionId });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      const mcps = [];
      const connections = session.getAllMcpConnections();

      for (const connection of connections) {
        const instance = this.mcpPool.getInstanceDetail(connection.instanceId);
        if (instance) {
          mcps.push({
            name: connection.name,
            clientType: instance.clientType,
            tools: instance.tools,
            status: instance.status,
            command: instance.command,
            url: instance.url,
            isExternal: instance.isExternal,
            fromCurrentSession: true,
          });
        }
      }

      // 添加用户在其他会话中的MCP（如果是认证用户）
      if (session.userId && !session.userId.startsWith('anonymous-')) {
        const userInstances = this.mcpPool.getUserInstances(session.userId);

        for (const instance of userInstances) {
          const alreadyInList = mcps.some(mcp => mcp.name === instance.mcpSession.name);
          const isDisconnected = instance.mcpSession.status === 'disconnected';

          if (!alreadyInList && !isDisconnected) {
            mcps.push({
              name: instance.mcpSession.name,
              clientType: instance.mcpSession.clientType,
              tools: instance.mcpSession.tools,
              status: instance.mcpSession.status,
              command: instance.mcpSession.command,
              url: instance.mcpSession.url,
              isExternal: instance.mcpSession.isExternal || true,
              fromOtherSession: true,
            });
          }
        }
      }

      return {
        success: true,
        mcps,
      };
    } catch (error) {
      this.logger.error(`获取MCP列表失败: ${error.message}`, { sessionId });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取MCP实例状态
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, instance?: Object, error?: string}>}
   */
  async getMcpInstanceStatus(instanceId) {
    this.logger.debug(`获取MCP实例状态`, { instanceId });

    try {
      const instance = this.mcpPool.getInstanceDetail(instanceId);
      if (!instance) {
        throw new Error(`实例不存在: ${instanceId}`);
      }

      return {
        success: true,
        instance: {
          instanceId: instance.instanceId,
          name: instance.name,
          status: instance.status,
          clientType: instance.clientType,
          tools: instance.tools,
          sessionCount: instance.sessionCount,
          sessionIds: instance.sessionIds,
          lastUsedTime: instance.lastUsedTime,
          createdTime: instance.createdTime,
        },
      };
    } catch (error) {
      this.logger.error(`获取实例状态失败: ${error.message}`, { instanceId });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 连接到已有的MCP实例
   * @param {string} sessionId - 会话ID
   * @param {string} instanceId - 实例ID
   * @returns {Promise<{success: boolean, mcp?: Object, error?: string}>}
   */
  async connectToExistingInstance(sessionId, instanceId) {
    this.logger.info(`连接到已有实例`, { sessionId, instanceId });

    try {
      // 获取会话
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('会话不存在');
      }

      // 获取实例详情
      const instance = this.mcpPool.getInstanceDetail(instanceId);
      if (!instance) {
        throw new Error(`实例不存在: ${instanceId}`);
      }

      // 关联会话和实例
      const associationResult = this.instanceRegistry.associateSession(sessionId, instanceId);
      if (!associationResult) {
        throw new Error('关联会话和实例失败');
      }

      // 更新会话的MCP连接
      await this.sessionManager.updateMcpConnection(sessionId, instance.name, {
        instanceId: instanceId,
        name: instance.name,
        clientType: instance.clientType,
        tools: instance.tools,
        status: instance.status,
        command: instance.command,
        args: instance.args,
        env: instance.env,
        url: instance.url,
        isExternal: instance.isExternal,
        isFromOtherSession: true,
      });

      return {
        success: true,
        mcp: {
          name: instance.name,
          clientType: instance.clientType,
          tools: instance.tools,
          status: instance.status,
        },
      };
    } catch (error) {
      this.logger.error(`连接到已有实例失败: ${error.message}`, {
        sessionId,
        instanceId,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 创建配置安全的工具调用适配器
   * @param {string} sessionId - 会话ID
   * @param {string} mcpName - MCP名称
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<any>} 工具执行结果
   */
  async mcpToolAdapter(sessionId, mcpName, toolName, params) {
    const result = await this.callMcpTool(sessionId, mcpName, toolName, params);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.result;
  }
}

module.exports = McpManagerService;
