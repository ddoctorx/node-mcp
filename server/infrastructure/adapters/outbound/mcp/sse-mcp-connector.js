// src/infrastructure/adapters/outbound/mcp/sse-mcp-connector.js

const axios = require('axios');
const McpConnectorPort = require('../../../../application/ports/outbound/mcp-connector-port');

/**
 * SSE MCP连接器
 * 通过HTTP/SSE方式连接MCP服务
 */
class SseMcpConnector extends McpConnectorPort {
  /**
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(logger) {
    super();
    this.logger = logger;
  }

  /**
   * 连接到MCP服务
   * @param {Object} config - MCP配置对象
   * @returns {Promise<Object>} MCP会话信息
   */
  async connect(config) {
    try {
      const url = typeof config === 'string' ? config : config.url;

      if (!url) {
        throw new Error('缺少URL参数');
      }

      this.logger.info(`尝试连接到SSE MCP服务器: ${url}`);

      // 验证服务器是否可用
      await this._validateServer(url);

      // 获取工具列表
      const tools = await this.getTools({ url });

      // 设置心跳检测
      const heartbeatInterval = this._setupHeartbeat(url);

      // 创建MCP会话信息
      const mcpSession = {
        url,
        clientType: 'sse',
        tools,
        status: 'connected',
        createdAt: new Date(),
        isExternal: true,
        lastPingTime: Date.now(),
        heartbeatInterval,
      };

      this.logger.info(`SSE MCP实例创建成功`);
      return mcpSession;
    } catch (error) {
      this.logger.error('SSE MCP连接错误:', error);
      throw new Error(`无法连接到SSE MCP: ${error.message}`);
    }
  }

  /**
   * 断开MCP服务连接
   * @param {Object} instance - MCP实例
   * @returns {Promise<void>}
   */
  async disconnect(instance) {
    if (instance.heartbeatInterval) {
      clearInterval(instance.heartbeatInterval);
      this.logger.info(`已停止SSE服务器心跳检测: ${instance.url}`);
    }
  }

  /**
   * 调用MCP工具
   * @param {Object} instance - MCP实例
   * @param {string} toolName - 工具名称
   * @param {Object} params - 工具参数
   * @returns {Promise<any>} 工具执行结果
   */
  async callTool(instance, toolName, params) {
    this.logger.info(`准备调用SSE MCP工具: ${toolName}`, { params });

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE工具调用超时'));
      }, 30000);

      try {
        // 生成请求ID
        const requestId = `req_${Date.now()}`;

        // 构建请求
        const requestBody = {
          id: requestId,
          tool: toolName,
          params: params || {},
        };

        this.logger.debug(`发送SSE工具调用请求: ${instance.url}/call`, requestBody);

        // 发送POST请求到SSE服务器的工具调用端点
        const response = await axios.post(`${instance.url}/call`, requestBody, {
          timeout: 25000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        clearTimeout(timeout);

        this.logger.debug(`收到SSE工具调用响应:`, response.data);

        if (
          response.data &&
          (response.data.result !== undefined || response.data.error !== undefined)
        ) {
          if (response.data.error) {
            this.logger.error(`SSE工具 ${toolName} 返回错误:`, response.data.error);
            reject(new Error(response.data.error || '工具调用失败'));
          } else {
            this.logger.info(`SSE工具 ${toolName} 调用成功`);
            resolve(response.data.result);
          }
        } else {
          reject(new Error('无效的SSE响应格式'));
        }
      } catch (error) {
        clearTimeout(timeout);
        this.logger.error(`调用SSE工具 ${toolName} 失败:`, error.message);
        reject(new Error(`SSE工具调用失败: ${error.message}`));
      }
    });
  }

  /**
   * 获取MCP工具列表
   * @param {Object} instance - MCP实例
   * @returns {Promise<Array<Object>>} 工具列表
   */
  async getTools(instance) {
    const url = instance.url;
    this.logger.info(`尝试从SSE服务器获取工具列表: ${url}`);

    try {
      const response = await axios.get(`${url}/tools`, {
        timeout: 8000,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.data && response.data.tools) {
        this.logger.info(`成功获取到SSE服务器工具列表: ${JSON.stringify(response.data.tools)}`);
        return response.data.tools;
      } else {
        this.logger.error('SSE服务器返回的数据不包含工具列表');
        throw new Error('无效的工具列表响应');
      }
    } catch (error) {
      this.logger.error(`从SSE服务器获取工具列表失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查连接状态
   * @param {Object} instance - MCP实例
   * @returns {Promise<boolean>} 是否连接
   */
  async checkConnection(instance) {
    try {
      const response = await axios.get(`${instance.url}/ping`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * 验证服务器可用性
   * @private
   */
  async _validateServer(url) {
    try {
      this.logger.debug(`验证SSE服务器可用性: ${url}`);

      const pingResponse = await axios.get(`${url}/ping`, {
        timeout: 5000,
      });

      this.logger.info(`SSE服务器ping成功，状态: ${pingResponse.status}`);

      if (pingResponse.status !== 200) {
        throw new Error(`服务器响应异常状态码: ${pingResponse.status}`);
      }
    } catch (error) {
      this.logger.error(`SSE服务器ping失败: ${error.message}`);
      throw new Error(`无法连接到SSE服务器: ${error.message}`);
    }
  }

  /**
   * 设置心跳检测
   * @private
   */
  _setupHeartbeat(url) {
    this.logger.info(`设置SSE服务器心跳检测: ${url}`);

    const heartbeatInterval = setInterval(async () => {
      try {
        await axios.get(`${url}/ping`, { timeout: 5000 });
        this.logger.debug(`SSE服务器心跳检测成功: ${url}`);
      } catch (error) {
        this.logger.error(`SSE服务器心跳检测失败: ${error.message}`);
      }
    }, 30000); // 每30秒检查一次

    // 确保定时器不阻止进程退出
    if (heartbeatInterval.unref) {
      heartbeatInterval.unref();
    }

    return heartbeatInterval;
  }

  /**
   * 创建请求ID
   * @private
   */
  _createRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 格式化请求数据
   * @private
   */
  _formatRequestData(tool, params) {
    return {
      tool,
      params: params || {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 处理响应数据
   * @private
   */
  _handleResponse(response) {
    if (!response.data) {
      throw new Error('空响应数据');
    }

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    if (response.data.result === undefined) {
      throw new Error('响应中缺少结果数据');
    }

    return response.data.result;
  }

  /**
   * 设置请求头
   * @private
   */
  _getRequestHeaders() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'MCP-Client/1.0.0',
    };
  }

  /**
   * 获取超时配置
   * @private
   */
  _getTimeoutConfig() {
    return {
      short: 5000, // ping等快速请求
      medium: 8000, // 获取工具列表
      long: 30000, // 调用工具
    };
  }
}

module.exports = SseMcpConnector;
