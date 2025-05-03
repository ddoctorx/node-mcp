// src/application/ports/outbound/logger-port.js

/**
 * 日志服务出站端口
 * 定义日志操作的接口
 */
class LoggerPort {
  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {...any} meta - 附加信息
   * @returns {void}
   */
  info(message, ...meta) {
    throw new Error('Not implemented');
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {...any} meta - 附加信息
   * @returns {void}
   */
  error(message, ...meta) {
    throw new Error('Not implemented');
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {...any} meta - 附加信息
   * @returns {void}
   */
  debug(message, ...meta) {
    throw new Error('Not implemented');
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {...any} meta - 附加信息
   * @returns {void}
   */
  warn(message, ...meta) {
    throw new Error('Not implemented');
  }
}

module.exports = LoggerPort;
