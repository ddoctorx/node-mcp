// src/application/ports/outbound/id-generator-port.js

/**
 * ID生成器出站端口
 * 定义唯一ID生成操作的接口
 */
class IdGeneratorPort {
  /**
   * 生成唯一ID
   * @returns {string} 唯一ID
   */
  generate() {
    throw new Error('Not implemented');
  }

  /**
   * 生成带前缀的ID
   * @param {string} prefix - ID前缀
   * @returns {string} 带前缀的唯一ID
   */
  generateWithPrefix(prefix) {
    throw new Error('Not implemented');
  }
}

module.exports = IdGeneratorPort;
