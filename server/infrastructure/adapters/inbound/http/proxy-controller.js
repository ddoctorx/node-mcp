// src/infrastructure/adapters/inbound/http/proxy-controller.js

/**
 * 代理控制器
 * 处理客户端与MCP实例池之间通信的HTTP请求
 */
class ProxyController {
  /**
   * @param {ProxyManagerService} proxyManager - 代理管理服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(proxyManager, logger) {
    this.proxyManager = proxyManager;
    this.logger = logger;

    // 绑定this上下文
    this.connect = this.connect.bind(this);
    this.call = this.call.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.getInstanceStatus = this.getInstanceStatus.bind(this);
    this.getAllInstances = this.getAllInstances.bind(this);
  }

  /**
   * 连接到MCP服务 - POST /api/proxy/connect
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async connect(req, res) {
    try {
      const { name, clientType, config } = req.body;
      const sessionId = this._getSessionId(req);

      this.logger.info('接收到代理连接请求', {
        sessionId,
        name,
        clientType,
      });

      if (!sessionId || !name || !clientType || !config) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!name) missingParams.push('name');
        if (!clientType) missingParams.push('clientType');
        if (!config) missingParams.push('config');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      const result = await this.proxyManager.proxyConnect(sessionId, name, clientType, config);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('代理连接失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `连接MCP失败: ${error.message}`,
      });
    }
  }

  /**
   * 调用MCP工具 - POST /api/proxy/call
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async call(req, res) {
    try {
      const { instanceId, tool, params } = req.body;
      const sessionId = this._getSessionId(req);

      this.logger.info('接收到代理调用请求', {
        sessionId,
        instanceId,
        tool,
      });

      if (!sessionId || !instanceId || !tool) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!instanceId) missingParams.push('instanceId');
        if (!tool) missingParams.push('tool');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      const result = await this.proxyManager.proxyCall(sessionId, instanceId, tool, params || {});

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('代理调用失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `调用工具失败: ${error.message}`,
      });
    }
  }

  /**
   * 断开连接 - POST /api/proxy/disconnect
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async disconnect(req, res) {
    try {
      const { instanceId } = req.body;
      const sessionId = this._getSessionId(req);

      this.logger.info('接收到代理断开请求', {
        sessionId,
        instanceId,
      });

      if (!sessionId || !instanceId) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!instanceId) missingParams.push('instanceId');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      const result = await this.proxyManager.proxyDisconnect(sessionId, instanceId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('代理断开失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `断开连接失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取实例状态 - GET /api/proxy/instance/:instanceId
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getInstanceStatus(req, res) {
    try {
      const { instanceId } = req.params;
      const sessionId = this._getSessionId(req);

      if (!sessionId || !instanceId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID或实例ID',
        });
      }

      // 直接调用MCP管理器的实例状态方法
      const result = await this.proxyManager.getMcpInstanceStatus(instanceId);

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
   * 获取所有实例 - GET /api/proxy/instances
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getAllInstances(req, res) {
    try {
      const result = await this.proxyManager.getAllInstances();

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      this.logger.error('获取实例列表失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取实例列表失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取会话ID
   * @private
   * @param {Request} req - Express请求对象
   * @returns {string|null} 会话ID
   */
  _getSessionId(req) {
    // 从header或查询参数中获取会话ID
    return req.headers['x-session-id'] || req.query.sessionId;
  }

  /**
   * 创建路由器
   * @static
   * @param {ProxyController} controller - 控制器实例
   * @returns {Router} Express路由器
   */
  static createRouter(controller) {
    const router = require('express').Router();

    // 会话验证中间件
    const validateSession = (req, res, next) => {
      const sessionId = controller._getSessionId(req);
      if (!sessionId) {
        return res.status(401).json({
          success: false,
          error: '缺少会话ID',
        });
      }
      next();
    };

    // 应用中间件到所有路由
    router.use(validateSession);

    // 定义路由
    router.post('/connect', controller.connect);
    router.post('/call', controller.call);
    router.post('/disconnect', controller.disconnect);
    router.get('/instance/:instanceId', controller.getInstanceStatus);
    router.get('/instances', controller.getAllInstances);

    return router;
  }
}

module.exports = ProxyController;
