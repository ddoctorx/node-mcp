/**
 * 自动确认函数的路由配置
 */

const express = require('express');
const router = express.Router();
const autoConfirmController = require('../controllers/auto-confirm');

// 添加自动确认函数
router.post('/sessions/:sessionId/auto-confirm', autoConfirmController.addAutoConfirmFunction);

// 获取会话所有自动确认的函数
router.get('/sessions/:sessionId/auto-confirm', autoConfirmController.getAutoConfirmFunctions);

// 检查函数是否被自动确认
router.get(
  '/sessions/:sessionId/auto-confirm/:functionName',
  autoConfirmController.checkAutoConfirmFunction,
);

// 删除自动确认函数
router.delete(
  '/sessions/:sessionId/auto-confirm/:functionName',
  autoConfirmController.removeAutoConfirmFunction,
);

module.exports = router;
