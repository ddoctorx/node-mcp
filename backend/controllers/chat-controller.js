// 聊天控制器
// 处理聊天相关的HTTP请求

const openaiService = require('../services/openai');
const sessionManager = require('../services/session-manager');
const mcpToolAdapter = require('../services/mcp-tool-adapter');
const { logger } = require('../utils/logger');

// 发送消息
async function sendMessage(req, res) {
  try {
    const { sessionId } = req.params;
    const { message, toolChoice } = req.body;

    if (!message || !Array.isArray(message)) {
      return res.status(400).json({
        success: false,
        error: '无效的消息格式，应为消息数组',
      });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    // 获取所有可用工具
    const allTools = [];
    for (const mcpName in session.mcpSessions) {
      const mcpSession = session.mcpSessions[mcpName];
      if (mcpSession.tools && Array.isArray(mcpSession.tools)) {
        allTools.push(...openaiService.convertMcpToolsToOpenAIFormat(mcpSession.tools));
      }
    }

    logger.info(`发送消息到OpenAI`, {
      sessionId,
      messageCount: message.length,
      toolCount: allTools.length,
      toolChoice: toolChoice || 'auto',
    });

    // 保存用户消息到历史记录
    const lastMessage = message[message.length - 1];
    if (lastMessage.role === 'user') {
      sessionManager.addMessageToChatHistory(sessionId, {
        type: 'user',
        content: lastMessage.content,
      });
    }

    // 调用OpenAI
    const response = await openaiService.callChatCompletion(
      message,
      allTools.length > 0 ? allTools : null,
      toolChoice,
    );

    // 处理响应
    const processedResponse = await openaiService.handleFunctionCalling(
      response,
      sessionId,
      session.mcpSessions,
      mcpToolAdapter.mcpToolAdapter,
    );

    // 根据响应类型处理
    if (processedResponse.type === 'text') {
      // 保存AI文本回复到历史记录
      sessionManager.addMessageToChatHistory(sessionId, {
        type: 'assistant',
        content: processedResponse.content,
      });

      res.json({
        success: true,
        response: processedResponse,
      });
    } else if (processedResponse.type === 'function_call') {
      // 保存函数调用到历史记录
      sessionManager.addMessageToChatHistory(sessionId, {
        type: 'function_call',
        calls: processedResponse.calls,
        results: processedResponse.results,
      });

      logger.info(`工具调用完成，准备获取最终回答`, {
        sessionId,
        callCount: processedResponse.calls.length,
      });

      // 构建包含工具调用结果的消息历史
      const messagesWithToolResults = [...message];

      // 添加函数调用消息
      messagesWithToolResults.push({
        role: 'assistant',
        content: null,
        tool_calls: processedResponse.calls,
      });

      // 添加所有工具调用结果
      for (const result of processedResponse.results) {
        messagesWithToolResults.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          content: result.result,
        });
      }

      // 再次调用OpenAI，将工具结果传回给模型获取最终回答
      logger.info(`向OpenAI发送工具调用结果，获取最终回答`, { sessionId });
      const followUpResponse = await openaiService.callChatCompletion(messagesWithToolResults);

      // 确保返回的是文本内容
      if (
        followUpResponse.choices &&
        followUpResponse.choices[0] &&
        followUpResponse.choices[0].message
      ) {
        const finalContent = followUpResponse.choices[0].message.content;

        // 保存最终回复到历史记录
        sessionManager.addMessageToChatHistory(sessionId, {
          type: 'assistant',
          content: finalContent,
        });

        // 返回完整结果
        res.json({
          success: true,
          response: {
            type: 'function_result',
            function_calls: processedResponse.calls,
            results: processedResponse.results,
            final_response: finalContent,
          },
        });
      } else {
        throw new Error('无法获取模型的最终回复');
      }
    }
  } catch (error) {
    logger.error(`处理消息失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `处理消息失败: ${error.message}`,
    });
  }
}

// 调用单个工具
async function callTool(req, res) {
  try {
    const { sessionId } = req.params;
    const { mcpName, toolName, params } = req.body;

    if (!mcpName || !toolName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: mcpName或toolName',
      });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: `会话不存在: ${sessionId}`,
      });
    }

    if (!session.mcpSessions[mcpName]) {
      return res.status(404).json({
        success: false,
        error: `MCP不存在: ${mcpName}`,
      });
    }

    // 调用工具
    const result = await mcpToolAdapter.mcpToolAdapter(sessionId, mcpName, toolName, params || {});

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error(`调用工具失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `调用工具失败: ${error.message}`,
    });
  }
}

// 获取工具列表
function getAvailableTools(req, res) {
  try {
    const { sessionId } = req.params;
    const tools = mcpToolAdapter.getAllAvailableTools(sessionId);

    res.json({
      success: true,
      tools,
    });
  } catch (error) {
    logger.error(`获取工具列表失败`, { error: error.message });

    res.status(500).json({
      success: false,
      error: `获取工具列表失败: ${error.message}`,
    });
  }
}

module.exports = {
  sendMessage,
  callTool,
  getAvailableTools,
};
