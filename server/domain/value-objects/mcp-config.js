// src/domain/value-objects/mcp-config.js

/**
 * MCP配置值对象 - 不可变的MCP配置
 * 支持多种配置格式，并提供统一的接口
 */
class McpConfig {
  /**
   * @private
   * @param {string} type - 配置类型 ('stdio' | 'sse')
   * @param {Object} details - 配置详情
   */
  constructor(type, details) {
    this._type = type;
    this._details = Object.freeze({ ...details });
    this._validateConfig();
  }

  /**
   * 创建stdio类型配置
   * @static
   * @param {string} command - 命令
   * @param {Array<string>} args - 参数列表
   * @param {Object} [env] - 环境变量
   * @param {Object} [setup] - 安装配置
   * @returns {McpConfig}
   */
  static stdio(command, args, env = {}, setup = null) {
    return new McpConfig('stdio', { command, args, env, setup });
  }

  /**
   * 创建SSE类型配置
   * @static
   * @param {string} url - SSE服务URL
   * @returns {McpConfig}
   */
  static sse(url) {
    return new McpConfig('sse', { url });
  }

  /**
   * 从原始配置创建config对象
   * @static
   * @param {string|Object} rawConfig - 原始配置
   * @returns {McpConfig}
   */
  static from(rawConfig) {
    if (typeof rawConfig === 'string') {
      // 解析字符串配置："command arg1 arg2"
      return this._fromCommandString(rawConfig);
    }

    if (rawConfig.command && Array.isArray(rawConfig.args)) {
      // Stdio配置
      return this.stdio(rawConfig.command, rawConfig.args, rawConfig.env, rawConfig.setup);
    } else if (rawConfig.url) {
      // SSE配置
      return this.sse(rawConfig.url);
    }

    throw new Error('无效的MCP配置格式');
  }

  /**
   * 获取配置类型
   * @returns {string}
   */
  get type() {
    return this._type;
  }

  /**
   * 获取配置详情
   * @returns {Object}
   */
  get details() {
    return this._details;
  }

  /**
   * 生成唯一签名
   * @returns {string}
   */
  generateSignature() {
    const crypto = require('crypto');
    let signatureData = '';

    if (this._type === 'stdio') {
      const { command, args, env } = this._details;
      // 将环境变量排序以确保签名一致性
      const envString = JSON.stringify(env || {}, Object.keys(env || {}).sort());
      signatureData = `${command}|${args.join('|')}|${envString}`;
    } else if (this._type === 'sse') {
      signatureData = this._details.url;
    }

    return crypto.createHash('md5').update(signatureData).digest('hex');
  }

  /**
   * 比较是否与另一个配置相等
   * @param {McpConfig} other - 另一个配置
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof McpConfig)) {
      return false;
    }

    if (this._type !== other._type) {
      return false;
    }

    if (this._type === 'stdio') {
      return (
        this._details.command === other._details.command &&
        JSON.stringify(this._details.args) === JSON.stringify(other._details.args) &&
        JSON.stringify(this._details.env) === JSON.stringify(other._details.env)
      );
    } else {
      return this._details.url === other._details.url;
    }
  }

  /**
   * 转换为普通对象
   * @returns {Object}
   */
  toPlainObject() {
    return {
      type: this._type,
      ...this._details,
    };
  }

  /**
   * 检查是否需要setup
   * @returns {boolean}
   */
  hasSetup() {
    return this._type === 'stdio' && !!this._details.setup;
  }

  /**
   * 从命令字符串解析配置
   * @private
   * @static
   */
  static _fromCommandString(commandString) {
    const parts = commandString.trim().split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    return this.stdio(command, args);
  }

  /**
   * 验证配置是否有效
   * @private
   */
  _validateConfig() {
    if (this._type === 'stdio') {
      if (!this._details.command) {
        throw new Error('stdio配置必须包含command');
      }
      if (!Array.isArray(this._details.args)) {
        throw new Error('stdio配置的args必须是数组');
      }
    } else if (this._type === 'sse') {
      if (!this._details.url) {
        throw new Error('sse配置必须包含url');
      }
      if (typeof this._details.url !== 'string') {
        throw new Error('sse配置的url必须是字符串');
      }
    } else {
      throw new Error(`不支持的配置类型: ${this._type}`);
    }
  }
}

module.exports = McpConfig;
