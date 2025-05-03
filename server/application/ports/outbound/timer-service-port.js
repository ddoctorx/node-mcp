// src/application/ports/outbound/timer-service-port.js

/**
 * 定时器服务出站端口
 * 定义定时器操作的接口
 */
class TimerServicePort {
  /**
   * 设置定时器
   * @param {Function} callback - 回调函数
   * @param {number} interval - 间隔时间（毫秒）
   * @returns {Object} 定时器对象
   */
  setInterval(callback, interval) {
    throw new Error('Not implemented');
  }

  /**
   * 清除定时器
   * @param {Object} timer - 定时器对象
   * @returns {void}
   */
  clearInterval(timer) {
    throw new Error('Not implemented');
  }

  /**
   * 设置超时器
   * @param {Function} callback - 回调函数
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Object} 超时器对象
   */
  setTimeout(callback, timeout) {
    throw new Error('Not implemented');
  }

  /**
   * 清除超时器
   * @param {Object} timer - 超时器对象
   * @returns {void}
   */
  clearTimeout(timer) {
    throw new Error('Not implemented');
  }
}

module.exports = TimerServicePort;
