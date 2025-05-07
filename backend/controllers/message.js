/**
 * 消息控制器
 * 处理用户消息和AI回复，支持函数调用的自动确认
 */

const sessions = require('../services/session-service');
const openaiService = require('../services/openai-service');
const functionCallController = require('./function-call');

/**
 * 处理用户消息
 * POST /api/sessions/:sessionId/messages
 */
async function handleMessage(req, res) {
  try {
    const { sessionId } = req.params;
    const { message, autoExecuteFunctions } = req.body;

    if (!sessionId || !message) {
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

    // 保存用户消息到历史记录
    await sessions.addMessageToHistory(sessionId, {
      type: 'user',
      content: message[message.length - 1].content, // 获取最后一条消息
      timestamp: new Date(),
    });

    // 调用OpenAI API获取回复
    const aiResponse = await openaiService.getChatCompletion(message, sessionId);

    // 处理不同类型的响应
    if (aiResponse.type === 'text') {
      // 普通文本响应，保存到历史记录
      await sessions.addMessageToHistory(sessionId, {
        type: 'assistant',
        content: aiResponse.content,
        timestamp: new Date(),
      });

      // 返回文本响应
      return res.json({
        success: true,
        response: {
          type: 'text',
          content: aiResponse.content,
        },
      });
    } else if (aiResponse.type === 'function_call') {
      // 函数调用响应
      const firstCall =
        aiResponse.calls && aiResponse.calls.length > 0 ? aiResponse.calls[0] : null;

      if (!firstCall) {
        return res.status(500).json({
          success: false,
          error: '无效的函数调用格式',
        });
      }

      // 保存函数调用到历史记录
      await sessions.addMessageToHistory(sessionId, {
        type: 'function_call',
        content: JSON.stringify(aiResponse),
        timestamp: new Date(),
      });

      // 检查是否需要自动执行函数
      // 前端可以通过autoExecuteFunctions=false显式禁用自动执行
      if (autoExecuteFunctions !== false) {
        // 检查函数是否已被自动确认
        const functionName = firstCall.function?.name;
        const isAutoConfirmed =
          session.autoConfirmedFunctions && session.autoConfirmedFunctions.includes(functionName);

        if (isAutoConfirmed) {
          console.log(`函数 ${functionName} 已被自动确认，直接执行`);

          // 直接调用函数执行控制器
          const execResult = await functionCallController.executeFunction(
            {
              params: { sessionId },
              body: {
                function_calls: aiResponse.calls,
                bypass_confirmation: true, // 跳过确认检查
              },
            },
            {
              status: () => ({
                json: data => data,
              }),
              json: data => data,
            },
          );

          if (execResult.success) {
            // 函数执行成功，包含结果和最终回答
            return res.json({
              success: true,
              response: {
                type: 'function_result',
                calls: aiResponse.calls,
                results: execResult.results,
                final_response: execResult.final_response,
              },
            });
          }
        }
      }

      // 如果没有自动执行或自动执行失败，返回函数调用信息，由前端处理确认
      return res.json({
        success: true,
        response: aiResponse,
      });
    } else {
      // 其他类型的响应
      return res.json({
        success: true,
        response: aiResponse,
      });
    }
  } catch (error) {
    console.error('处理消息失败:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误',
    });
  }
}

module.exports = {
  handleMessage,
};
