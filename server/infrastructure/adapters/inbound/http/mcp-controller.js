// src/infrastructure/adapters/inbound/http/mcp-controller.js

/**
 * MCP控制器
 * 处理MCP管理相关的HTTP请求
 */
class McpController {
  /**
   * @param {McpManagerService} mcpManager - MCP管理服务
   * @param {LoggerPort} logger - 日志服务
   * @param {Object} predefinedServers - 预定义MCP服务器配置
   */
  constructor(mcpManager, logger, predefinedServers = {}) {
    this.mcpManager = mcpManager;
    this.logger = logger;
    this.predefinedServers = predefinedServers;

    // 绑定this上下文
    this.addMcp = this.addMcp.bind(this);
    this.removeMcp = this.removeMcp.bind(this);
    this.callMcpTool = this.callMcpTool.bind(this);
    this.getMcps = this.getMcps.bind(this);
    this.getMcpInstanceStatus = this.getMcpInstanceStatus.bind(this);
    this.connectToExistingInstance = this.connectToExistingInstance.bind(this);
    this.getPredefinedServers = this.getPredefinedServers.bind(this);
    this.updatePredefinedServers = this.updatePredefinedServers.bind(this);
  }

  /**
   * 添加MCP连接 - POST /api/mcp
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async addMcp(req, res) {
    try {
      const {
        sessionId,
        name,
        clientType,
        url,
        command,
        args,
        env,
        fullCommand,
        predefinedServer,
        setup,
      } = req.body;

      this.logger.info('接收到添加MCP请求', {
        sessionId,
        name,
        clientType,
        predefinedServer,
      });

      // 参数验证
      if (!sessionId || !name) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!name) missingParams.push('name');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      let config;
      let actualClientType = clientType;

      // 检查是否使用预定义服务器
      if (predefinedServer && this.predefinedServers[predefinedServer]) {
        const serverConfig = this.predefinedServers[predefinedServer];
        this.logger.info(`使用预定义的MCP服务器: ${predefinedServer}`);

        actualClientType = 'stdio';
        config = {
          command: serverConfig.command,
          args: serverConfig.args || [],
          env: serverConfig.env || {},
          setup: serverConfig.setup,
        };
      } else if (actualClientType === 'stdio') {
        // 检查是新的配置格式还是旧的命令字符串格式
        if (command && args) {
          config = { command, args, env, setup };
        } else if (fullCommand) {
          config = fullCommand;
        } else {
          return res.status(400).json({
            success: false,
            error: 'stdio类型需要提供命令参数',
          });
        }
      } else if (actualClientType === 'sse') {
        if (!url) {
          return res.status(400).json({
            success: false,
            error: '缺少URL参数',
          });
        }
        config = { url };
      } else {
        return res.status(400).json({
          success: false,
          error: `不支持的MCP类型: ${actualClientType}`,
        });
      }

      // 连接MCP
      const result = await this.mcpManager.connectMcp(sessionId, name, config, actualClientType);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('处理MCP请求时出错', { error: error.message });
      res.status(500).json({
        success: false,
        error: `添加MCP服务失败: ${error.message}`,
      });
    }
  }

  /**
   * 移除MCP连接 - DELETE /api/mcp
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async removeMcp(req, res) {
    try {
      const { sessionId, name } = req.query;

      if (!sessionId || !name) {
        this.logger.warn('DELETE MCP请求缺少参数', { sessionId, name });
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: sessionId或name',
        });
      }

      const result = await this.mcpManager.disconnectMcp(sessionId, name);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json({ success: true });
    } catch (error) {
      this.logger.error('断开MCP连接错误', { error: error.message });
      res.status(500).json({
        success: false,
        error: `无法断开MCP连接: ${error.message}`,
      });
    }
  }

  /**
   * 调用MCP工具 - POST /api/mcp/call
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async callMcpTool(req, res) {
    try {
      const { sessionId, mcpName, tool, params } = req.body;

      this.logger.info('接收到工具调用请求', {
        sessionId,
        mcpName,
        tool,
      });

      if (!sessionId || !mcpName || !tool) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!mcpName) missingParams.push('mcpName');
        if (!tool) missingParams.push('tool');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      const result = await this.mcpManager.callMcpTool(sessionId, mcpName, tool, params || {});

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('工具调用失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `工具调用失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取MCP列表 - GET /api/mcp
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getMcps(req, res) {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      const result = await this.mcpManager.getSessionMcps(sessionId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('获取MCP列表失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取MCP列表失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取MCP实例状态 - GET /api/mcp/instance/:instanceId
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getMcpInstanceStatus(req, res) {
    try {
      const { instanceId } = req.params;

      if (!instanceId) {
        return res.status(400).json({
          success: false,
          error: '缺少实例ID',
        });
      }

      const result = await this.mcpManager.getMcpInstanceStatus(instanceId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('获取实例状态失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取实例状态失败: ${error.message}`,
      });
    }
  }

  /**
   * 连接到已有的MCP实例 - POST /api/mcp/connect-instance
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async connectToExistingInstance(req, res) {
    try {
      const { sessionId, instanceId } = req.body;

      this.logger.info('接收到连接实例请求', { sessionId, instanceId });

      if (!sessionId || !instanceId) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: sessionId或instanceId',
        });
      }

      const result = await this.mcpManager.connectToExistingInstance(sessionId, instanceId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('连接MCP实例错误', { error: error.message });
      res.status(500).json({
        success: false,
        error: `连接MCP实例失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取预定义MCP服务器列表 - GET /api/mcp/predefined
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  getPredefinedServers(req, res) {
    try {
      const servers = Object.keys(this.predefinedServers).map(key => ({
        id: key,
        name: key,
        description: this.predefinedServers[key].description || `预定义MCP服务器: ${key}`,
      }));

      res.json({
        success: true,
        servers,
      });
    } catch (error) {
      this.logger.error('获取预定义MCP服务器列表错误', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取预定义MCP服务器列表失败: ${error.message}`,
      });
    }
  }

  /**
   * 更新预定义MCP服务器配置 - POST /api/mcp/predefined/update
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  updatePredefinedServers(req, res) {
    try {
      const { config } = req.body;

      if (!config || !config.mcpServers) {
        return res.status(400).json({
          success: false,
          error: '无效的配置格式，必须包含mcpServers对象',
        });
      }

      // 更新预定义服务器配置（内存中）
      Object.assign(this.predefinedServers, config.mcpServers);

      this.logger.info('已更新预定义MCP服务器配置', {
        servers: Object.keys(this.predefinedServers),
      });

      res.json({
        success: true,
        servers: Object.keys(this.predefinedServers),
      });
    } catch (error) {
      this.logger.error('更新预定义MCP服务器配置错误', { error: error.message });
      res.status(500).json({
        success: false,
        error: `更新预定义MCP服务器配置失败: ${error.message}`,
      });
    }
  }
}

module.exports = McpController;
