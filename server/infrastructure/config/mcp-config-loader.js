// src/infrastructure/config/mcp-config-loader.js

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ConfigLoaderPort = require('../../application/ports/outbound/config-loader-port');

/**
 * MCP配置加载器
 * 负责加载、保存和管理MCP服务器配置
 */
class McpConfigLoader extends ConfigLoaderPort {
  /**
   * @param {string} configPath - 配置文件路径
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(configPath, logger) {
    super();
    this.configPath = configPath;
    this.logger = logger;
    this.defaultConfigDir = 'config';
  }

  /**
   * 加载MCP服务器配置
   * @returns {Promise<Object>} 配置对象
   */
  async loadMcpServers() {
    try {
      const fullPath = path.resolve(this.configPath);

      this.logger.info(`尝试加载MCP配置文件: ${fullPath}`);

      // 确保配置目录存在
      const configDir = path.dirname(fullPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        this.logger.info(`已创建配置目录: ${configDir}`);
      }

      // 如果配置文件不存在，返回默认配置
      if (!fs.existsSync(fullPath)) {
        this.logger.info(`配置文件不存在，返回默认配置`);
        return this._getDefaultConfig();
      }

      // 读取配置文件
      const configData = fs.readFileSync(fullPath, 'utf8');
      const config = JSON.parse(configData);

      // 验证配置格式
      this._validateConfig(config);

      this.logger.info(
        `成功加载MCP配置，包含 ${Object.keys(config.mcpServers || {}).length} 个服务器`,
      );
      return config;
    } catch (error) {
      this.logger.error(`加载MCP配置失败: ${error.message}`);

      // 如果解析失败，返回默认配置
      if (error instanceof SyntaxError) {
        this.logger.warn('配置文件格式错误，返回默认配置');
        return this._getDefaultConfig();
      }

      throw error;
    }
  }

  /**
   * 保存MCP服务器配置
   * @param {Object} config - 配置对象
   * @returns {Promise<void>}
   */
  async saveMcpServers(config) {
    try {
      const fullPath = path.resolve(this.configPath);

      this.logger.info(`保存MCP配置到文件: ${fullPath}`);

      // 验证配置格式
      this._validateConfig(config);

      // 确保配置目录存在
      const configDir = path.dirname(fullPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // 保存配置文件
      fs.writeFileSync(fullPath, JSON.stringify(config, null, 2), 'utf8');

      this.logger.info(
        `成功保存MCP配置，包含 ${Object.keys(config.mcpServers || {}).length} 个服务器`,
      );
    } catch (error) {
      this.logger.error(`保存MCP配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取环境配置
   * @returns {Promise<Object>} 环境配置
   */
  async getEnvConfig() {
    try {
      return {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        nodeEnv: process.env.NODE_ENV || 'development',
        paths: {
          cwd: process.cwd(),
          home: process.env.HOME || process.env.USERPROFILE,
          temp: process.env.TMP || process.env.TMPDIR || '/tmp',
        },
      };
    } catch (error) {
      this.logger.error(`获取环境配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取系统路径
   * @param {string} type - 路径类型（如'python','node'）
   * @returns {Promise<Array<string>>} 路径列表
   */
  async getSystemPaths(type) {
    try {
      switch (type) {
        case 'python':
          return this._getPythonPaths();
        case 'node':
          return this._getNodePaths();
        case 'npm':
          return this._getNpmPaths();
        default:
          throw new Error(`不支持的路径类型: ${type}`);
      }
    } catch (error) {
      this.logger.error(`获取系统路径失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取Python路径
   * @private
   * @returns {Promise<Array<string>>} Python路径列表
   */
  async _getPythonPaths() {
    const paths = [];
    const possiblePaths = [
      '/opt/homebrew/bin/python3',
      '/opt/homebrew/opt/python/bin/python3',
      '/opt/homebrew/opt/python@3/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3',
      '/usr/bin/python',
      'python3',
      'python',
    ];

    for (const pythonPath of possiblePaths) {
      try {
        await this._checkExecutable(pythonPath);
        paths.push(pythonPath);
      } catch (err) {
        // 路径不可用，继续下一个
      }
    }

    return paths;
  }

  /**
   * 获取Node路径
   * @private
   * @returns {Promise<Array<string>>} Node路径列表
   */
  async _getNodePaths() {
    const paths = [];
    const possiblePaths = [
      process.execPath, // 当前Node路径
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
      'node',
    ];

    for (const nodePath of possiblePaths) {
      try {
        await this._checkExecutable(nodePath);
        paths.push(nodePath);
      } catch (err) {
        // 路径不可用
      }
    }

    return paths;
  }

  /**
   * 获取NPM路径
   * @private
   * @returns {Promise<Array<string>>} NPM路径列表
   */
  async _getNpmPaths() {
    const paths = [];
    const possiblePaths = ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm', 'npm'];

    for (const npmPath of possiblePaths) {
      try {
        await this._checkExecutable(npmPath);
        paths.push(npmPath);
      } catch (err) {
        // 路径不可用
      }
    }

    return paths;
  }

  /**
   * 检查可执行文件是否可用
   * @private
   * @param {string} execPath - 可执行文件路径
   * @returns {Promise<void>}
   */
  _checkExecutable(execPath) {
    return new Promise((resolve, reject) => {
      if (execPath.startsWith('/')) {
        // 绝对路径，直接检查文件存在
        try {
          fs.accessSync(execPath, fs.constants.X_OK);
          resolve();
        } catch (err) {
          reject(err);
        }
      } else {
        // 命令名，使用which/where检查
        const command = process.platform === 'win32' ? 'where' : 'which';
        const proc = spawn(command, [execPath]);

        proc.on('close', code => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`找不到可执行文件: ${execPath}`));
          }
        });

        proc.on('error', reject);
      }
    });
  }

  /**
   * 验证配置格式
   * @private
   * @param {Object} config - 配置对象
   * @throws {Error} 如果配置无效
   */
  _validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('配置必须是对象类型');
    }

    if (config.mcpServers && typeof config.mcpServers !== 'object') {
      throw new Error('mcpServers必须是对象类型');
    }

    // 验证每个MCP服务器配置
    if (config.mcpServers) {
      for (const [key, server] of Object.entries(config.mcpServers)) {
        if (!server.command && !server.url) {
          throw new Error(`MCP服务器 "${key}" 必须包含command或url`);
        }

        if (server.command && !Array.isArray(server.args)) {
          throw new Error(`MCP服务器 "${key}" 的args必须是数组`);
        }
      }
    }
  }

  /**
   * 获取默认配置
   * @private
   * @returns {Object} 默认配置对象
   */
  _getDefaultConfig() {
    return {
      mcpServers: {},
      metadata: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  /**
   * 合并配置
   * @param {Object} baseConfig - 基础配置
   * @param {Object} userConfig - 用户配置
   * @returns {Object} 合并后的配置
   */
  static mergeConfig(baseConfig, userConfig) {
    return {
      ...baseConfig,
      mcpServers: {
        ...baseConfig.mcpServers,
        ...userConfig.mcpServers,
      },
      metadata: {
        ...baseConfig.metadata,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  /**
   * 创建配置加载器实例
   * @static
   * @param {Object} dependencies - 依赖项
   * @returns {McpConfigLoader} 配置加载器实例
   */
  static create(dependencies) {
    const { configPath, logger } = dependencies;
    return new McpConfigLoader(configPath, logger);
  }
}

module.exports = McpConfigLoader;
