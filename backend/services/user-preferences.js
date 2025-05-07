// backend/services/user-preferences.js
// 用户偏好管理服务

const { logger } = require('../utils/logger');

// 存储用户授权偏好的内存映射
// 格式: { sessionId: { functionName1: true, functionName2: true, ... } }
const autoConfirmPreferences = {};

// 添加自动确认函数偏好
function addAutoConfirmFunction(sessionId, functionName) {
  if (!sessionId || !functionName) {
    logger.warn('添加自动确认函数偏好失败: 缺少必要参数', { sessionId, functionName });
    return false;
  }

  if (!autoConfirmPreferences[sessionId]) {
    autoConfirmPreferences[sessionId] = {};
  }

  autoConfirmPreferences[sessionId][functionName] = true;
  logger.info(`已将函数 ${functionName} 添加到会话 ${sessionId} 的自动确认列表`);
  return true;
}

// 检查函数是否已被用户设置为自动确认
function isAutoConfirmFunction(sessionId, functionName) {
  if (!sessionId || !functionName) return false;

  return !!(autoConfirmPreferences[sessionId] && autoConfirmPreferences[sessionId][functionName]);
}

// 获取会话的所有自动确认函数
function getSessionAutoConfirmFunctions(sessionId) {
  if (!sessionId) return [];

  return autoConfirmPreferences[sessionId] ? Object.keys(autoConfirmPreferences[sessionId]) : [];
}

// 清除会话的所有偏好设置
function clearSessionPreferences(sessionId) {
  if (sessionId && autoConfirmPreferences[sessionId]) {
    delete autoConfirmPreferences[sessionId];
    logger.info(`已清除会话 ${sessionId} 的所有偏好设置`);
    return true;
  }
  return false;
}

module.exports = {
  addAutoConfirmFunction,
  isAutoConfirmFunction,
  getSessionAutoConfirmFunctions,
  clearSessionPreferences,
};
