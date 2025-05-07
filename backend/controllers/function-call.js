/**
 * 函数调用控制器
 * 处理AI工具函数的调用和确认
 */

const sessions = require('../services/session-service');
const mcpService = require('../services/mcp-service');

/**
 * 执行函数调用
 * POST /api/sessions/:sessionId/execute-function
 */
async function executeFunction(req, res) {
  try {
    const { sessionId } = req.params;
    const { function_calls, bypass_confirmation } = req.body;

    if (
      !sessionId ||
      !function_calls ||
      !Array.isArray(function_calls) ||
      function_calls.length === 0
    ) {
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

    // 获取函数名称
    const functionName = function_calls[0].function?.name;
    if (!functionName) {
      return res.status(400).json({
        success: false,
        error: '无效的函数调用格式',
      });
    }

    // 检查是否需要用户确认
    // bypass_confirmation参数允许前端跳过确认检查
    if (!bypass_confirmation) {
      // 检查是否已自动确认
      const isAutoConfirmed =
        session.autoConfirmedFunctions && session.autoConfirmedFunctions.includes(functionName);

      if (!isAutoConfirmed) {
        // 返回需要用户确认的信息
        return res.json({
          success: false,
          error: 'needs_confirmation',
          message: '需要用户确认此操作',
          function_name: functionName,
        });
      }
    }

    // 执行函数调用
    const results = [];

    for (const call of function_calls) {
      try {
        // 调用MCP服务，执行工具函数
        const result = await mcpService.executeToolFunction(
          sessionId,
          call.function.name,
          JSON.parse(call.function.arguments || '{}'),
        );

        results.push({
          tool_call_id: call.id,
          function_name: call.function.name,
          result: typeof result === 'object' ? JSON.stringify(result) : result,
        });
      } catch (toolError) {
        console.error(`工具 ${call.function.name} 执行失败:`, toolError);
        results.push({
          tool_call_id: call.id,
          function_name: call.function.name,
          result: JSON.stringify({ error: toolError.message }),
        });
      }
    }

    // 调用OpenAI获取最终回答
    let finalResponse = null;
    try {
      finalResponse = await mcpService.generateFinalResponse(sessionId, function_calls, results);
    } catch (aiError) {
      console.error('获取AI最终回答失败:', aiError);
    }

    return res.json({
      success: true,
      results: results,
      final_response: finalResponse,
    });
  } catch (error) {
    console.error('执行函数调用失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

/**
 * 根据工具调用结果获取最终回答
 * POST /api/sessions/:sessionId/tool-results
 */
async function getToolResults(req, res) {
  try {
    const { sessionId } = req.params;
    const { function_calls, results } = req.body;

    if (!sessionId || !function_calls || !results) {
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

    // 调用OpenAI获取最终回答
    const finalResponse = await mcpService.generateFinalResponse(
      sessionId,
      function_calls,
      results,
    );

    return res.json({
      success: true,
      response: finalResponse,
    });
  } catch (error) {
    console.error('获取工具结果失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

module.exports = {
  executeFunction,
  getToolResults,
};
