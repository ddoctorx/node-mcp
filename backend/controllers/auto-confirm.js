/**
 * 自动确认函数控制器
 * 用于处理用户标记为"始终同意"的函数调用
 */

const sessions = require('../services/session-service');

/**
 * 添加自动确认函数
 * POST /api/sessions/:sessionId/auto-confirm
 */
async function addAutoConfirmFunction(req, res) {
  try {
    const { sessionId } = req.params;
    const { functionName } = req.body;

    if (!sessionId || !functionName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
      });
    }

    // 获取会话
    const session = await sessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }

    // 初始化自动确认函数列表（如果不存在）
    if (!session.autoConfirmedFunctions) {
      session.autoConfirmedFunctions = [];
    }

    // 添加到自动确认列表（如果不存在）
    if (!session.autoConfirmedFunctions.includes(functionName)) {
      session.autoConfirmedFunctions.push(functionName);

      // 保存会话
      await sessions.updateSession(sessionId, session);
    }

    return res.json({
      success: true,
      message: `函数 ${functionName} 已设置为自动确认`,
    });
  } catch (error) {
    console.error('添加自动确认函数失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

/**
 * 检查函数是否被自动确认
 * GET /api/sessions/:sessionId/auto-confirm/:functionName
 */
async function checkAutoConfirmFunction(req, res) {
  try {
    const { sessionId, functionName } = req.params;

    if (!sessionId || !functionName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
      });
    }

    // 获取会话
    const session = await sessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }

    // 检查函数是否已自动确认
    const isAutoConfirmed =
      session.autoConfirmedFunctions && session.autoConfirmedFunctions.includes(functionName);

    return res.json({
      success: true,
      isAutoConfirmed,
    });
  } catch (error) {
    console.error('检查自动确认函数失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

/**
 * 获取会话所有自动确认的函数
 * GET /api/sessions/:sessionId/auto-confirm
 */
async function getAutoConfirmFunctions(req, res) {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: '缺少会话ID',
      });
    }

    // 获取会话
    const session = await sessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }

    // 返回自动确认函数列表
    return res.json({
      success: true,
      functions: session.autoConfirmedFunctions || [],
    });
  } catch (error) {
    console.error('获取自动确认函数列表失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

/**
 * 删除自动确认函数
 * DELETE /api/sessions/:sessionId/auto-confirm/:functionName
 */
async function removeAutoConfirmFunction(req, res) {
  try {
    const { sessionId, functionName } = req.params;

    if (!sessionId || !functionName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
      });
    }

    // 获取会话
    const session = await sessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
      });
    }

    // 如果存在自动确认函数列表
    if (session.autoConfirmedFunctions) {
      // 从列表中移除
      session.autoConfirmedFunctions = session.autoConfirmedFunctions.filter(
        fn => fn !== functionName,
      );

      // 保存会话
      await sessions.updateSession(sessionId, session);
    }

    return res.json({
      success: true,
      message: `函数 ${functionName} 已从自动确认列表中移除`,
    });
  } catch (error) {
    console.error('移除自动确认函数失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

module.exports = {
  addAutoConfirmFunction,
  checkAutoConfirmFunction,
  getAutoConfirmFunctions,
  removeAutoConfirmFunction,
};
