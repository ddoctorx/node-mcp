// src/infrastructure/config/predefined-servers.js

const fs = require('fs');
const path = require('path');

/**
 * 预定义服务器配置管理
 * 负责管理预定义的MCP服务器配置
 */
class PredefinedServers {
  /**
   * @param {McpConfigLoader} configLoader - 配置加载器
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(configLoader, logger) {
    this.configLoader = configLoader;
    this.logger = logger;
    this.servers = this._getBuiltInServers();
    this._loadCustomServers();
  }

  /**
   * 获取所有预定义服务器
   * @returns {Object} 服务器配置对象
   */
  getAll() {
    return { ...this.servers };
  }

  /**
   * 获取特定预定义服务器
   * @param {string} id - 服务器ID
   * @returns {Object|null} 服务器配置
   */
  get(id) {
    return this.servers[id] || null;
  }

  /**
   * 检查服务器是否存在
   * @param {string} id - 服务器ID
   * @returns {boolean} 是否存在
   */
  has(id) {
    return id in this.servers;
  }

  /**
   * 添加自定义服务器配置
   * @param {string} id - 服务器ID
   * @param {Object} config - 服务器配置
   * @returns {Promise<boolean>} 是否成功添加
   */
  async add(id, config) {
    try {
      if (this.has(id)) {
        this.logger.warn(`预定义服务器 "${id}" 已存在，将覆盖`);
      }

      this._validateServerConfig(config);
      this.servers[id] = config;

      await this._saveCustomServers();
      this.logger.info(`成功添加预定义服务器: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`添加预定义服务器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 移除预定义服务器
   * @param {string} id - 服务器ID
   * @returns {Promise<boolean>} 是否成功移除
   */
  async remove(id) {
    try {
      if (!this.has(id)) {
        return false;
      }

      // 不允许删除内置服务器
      if (this._isBuiltInServer(id)) {
        this.logger.warn(`不能删除内置服务器: ${id}`);
        return false;
      }

      delete this.servers[id];
      await this._saveCustomServers();
      this.logger.info(`成功移除预定义服务器: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`移除预定义服务器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 更新所有服务器配置
   * @param {Object} config - 完整配置对象
   * @returns {Promise<boolean>} 是否成功更新
   */
  async updateAll(config) {
    try {
      if (!config || !config.mcpServers) {
        throw new Error('无效的配置格式');
      }

      // 验证配置
      for (const [id, server] of Object.entries(config.mcpServers)) {
        this._validateServerConfig(server);
      }

      // 保留内置服务器，仅更新自定义服务器
      const builtInServers = this._getBuiltInServers();
      this.servers = {
        ...builtInServers,
        ...config.mcpServers,
      };

      await this._saveCustomServers();
      this.logger.info('成功更新预定义服务器配置');
      return true;
    } catch (error) {
      this.logger.error(`更新预定义服务器配置失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取服务器列表（用于前端展示）
   * @returns {Array<Object>} 服务器列表
   */
  getList() {
    return Object.entries(this.servers).map(([id, config]) => ({
      id,
      name: config.name || id,
      description: config.description,
      isBuiltIn: this._isBuiltInServer(id),
      clientType: 'stdio', // 预定义服务器都是stdio类型
      hasSetup: !!config.setup,
    }));
  }

  /**
   * 获取内置服务器配置
   * @private
   * @returns {Object} 内置服务器配置
   */
  _getBuiltInServers() {
    return {
      fetch: {
        name: 'Fetch MCP Server',
        description: '提供网络请求和网页抓取功能的MCP服务器',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        env: {},
        setup: {
          command: 'pip',
          args: ['install', 'mcp-server-fetch'],
        },
      },
      git: {
        name: 'Git MCP Server',
        description: '提供Git操作功能的MCP服务器',
        command: 'uvx',
        args: ['mcp-server-git'],
        env: {},
        setup: {
          command: 'pip',
          args: ['install', 'mcp-server-git'],
        },
      },
      filesystem: {
        name: 'Filesystem MCP Server',
        description: '提供文件系统操作功能的MCP服务器',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem', './'],
        env: {},
      },
      github: {
        name: 'GitHub MCP Server',
        description: '提供GitHub API操作功能的MCP服务器',
        command: 'npm',
        args: ['start', '-w', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: 'your-github-token',
        },
      },
      memory: {
        name: 'Memory MCP Server',
        description: '提供知识库和记忆功能的MCP服务器',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        env: {},
      },
      postgres: {
        name: 'PostgreSQL MCP Server',
        description: '提供PostgreSQL数据库操作的MCP服务器',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
          POSTGRES_CONNECTION_STRING: 'postgres://user:password@localhost:5432/database',
        },
      },
      puppeteer: {
        name: 'Puppeteer MCP Server',
        description: '提供浏览器自动化功能的MCP服务器',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        env: {},
      },
      slack: {
        name: 'Slack MCP Server',
        description: '提供Slack消息操作功能的MCP服务器',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: {
          SLACK_BOT_TOKEN: 'your-slack-bot-token',
        },
      },
      sqlite: {
        name: 'SQLite MCP Server',
        description: '提供SQLite数据库操作的MCP服务器',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite'],
        env: {},
      },
      'stock-data': {
        name: 'Stock Data MCP Server',
        description: '提供股票数据查询功能的MCP服务器',
        command: 'python3',
        args: ['-m', 'src.index'],
        env: {},
        setup: {
          command: 'pip',
          args: ['install', '-e', '.'],
        },
      },
    };
  }

  /**
   * 判断是否为内置服务器
   * @private
   * @param {string} id - 服务器ID
   * @returns {boolean} 是否为内置服务器
   */
  _isBuiltInServer(id) {
    return id in this._getBuiltInServers();
  }

  /**
   * 加载自定义服务器配置
   * @private
   */
  async _loadCustomServers() {
    try {
      const config = await this.configLoader.loadMcpServers();
      if (config && config.mcpServers) {
        // 合并自定义配置，但不覆盖内置服务器
        Object.entries(config.mcpServers).forEach(([id, server]) => {
          if (!this._isBuiltInServer(id)) {
            this.servers[id] = server;
          }
        });
      }
    } catch (error) {
      this.logger.error(`加载自定义服务器配置失败: ${error.message}`);
    }
  }

  /**
   * 保存自定义服务器配置
   * @private
   */
  async _saveCustomServers() {
    try {
      // 提取自定义服务器（非内置）
      const customServers = {};
      Object.entries(this.servers).forEach(([id, server]) => {
        if (!this._isBuiltInServer(id)) {
          customServers[id] = server;
        }
      });

      // 保存配置
      await this.configLoader.saveMcpServers({
        mcpServers: customServers,
      });
    } catch (error) {
      this.logger.error(`保存自定义服务器配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证服务器配置
   * @private
   * @param {Object} config - 服务器配置
   * @throws {Error} 如果配置无效
   */
  _validateServerConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('配置必须是对象类型');
    }

    if (!config.command) {
      throw new Error('配置必须包含command字段');
    }

    if (!Array.isArray(config.args)) {
      throw new Error('args必须是数组类型');
    }

    if (config.env && typeof config.env !== 'object') {
      throw new Error('env必须是对象类型');
    }

    if (config.setup) {
      if (!config.setup.command || !Array.isArray(config.setup.args)) {
        throw new Error('setup必须包含command和args字段');
      }
    }
  }

  /**
   * 创建预定义服务器管理器实例
   * @static
   * @param {Object} dependencies - 依赖项
   * @returns {PredefinedServers} 管理器实例
   */
  static create(dependencies) {
    const { configLoader, logger } = dependencies;
    return new PredefinedServers(configLoader, logger);
  }
}

module.exports = PredefinedServers;
