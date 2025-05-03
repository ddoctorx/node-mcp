// src/infrastructure/adapters/inbound/http/chat-controller.js

/**
 * 聊天控制器
 * 处理聊天相关的HTTP请求
 */
class ChatController {
  /**
   * @param {ChatManagerService} chatManager - 聊天管理服务
   * @param {LoggerPort} logger - 日志服务
   */
  constructor(chatManager, logger) {
    this.chatManager = chatManager;
    this.logger = logger;

    // 绑定this上下文
    this.sendMessage = this.sendMessage.bind(this);
    this.getHistory = this.getHistory.bind(this);
    this.clearHistory = this.clearHistory.bind(this);
    this.testFunctionCall = this.testFunctionCall.bind(this);
  }

  /**
   * 发送聊天消息 - POST /api/chat
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async sendMessage(req, res) {
    try {
      const { sessionId, message } = req.body;

      this.logger.info('接收到聊天请求', {
        sessionId,
        messageLength: message ? message.length : 0,
      });

      if (!sessionId || !message) {
        const missingParams = [];
        if (!sessionId) missingParams.push('sessionId');
        if (!message) missingParams.push('message');

        return res.status(400).json({
          success: false,
          error: `缺少必要参数: ${missingParams.join(', ')}`,
        });
      }

      const result = await this.chatManager.processChat(sessionId, message);

      if (!result.success) {
        return res.status(500).json(result);
      }

      // 格式化响应
      const formattedResponse = this._formatChatResponse(result.response);

      res.json({
        success: true,
        ...formattedResponse,
      });
    } catch (error) {
      this.logger.error('聊天API错误', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: `聊天失败: ${error.message}`,
      });
    }
  }

  /**
   * 获取聊天历史 - GET /api/chat
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async getHistory(req, res) {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      const result = await this.chatManager.getChatHistory(sessionId);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        messages: result.history,
      });
    } catch (error) {
      this.logger.error('获取聊天历史失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `获取聊天历史失败: ${error.message}`,
      });
    }
  }

  /**
   * 清除聊天历史 - DELETE /api/chat
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async clearHistory(req, res) {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      const result = await this.chatManager.clearChatHistory(sessionId);

      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        message: '聊天历史已清除',
      });
    } catch (error) {
      this.logger.error('清除聊天历史失败', { error: error.message });
      res.status(500).json({
        success: false,
        error: `清除聊天历史失败: ${error.message}`,
      });
    }
  }

  /**
   * 测试函数调用 - POST /api/test/function-call
   * @param {Request} req - Express请求对象
   * @param {Response} res - Express响应对象
   */
  async testFunctionCall(req, res) {
    try {
      const { sessionId, message } = req.body;

      if (!sessionId || !message) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数: sessionId和message',
        });
      }

      this.logger.info('开始测试函数调用', { sessionId, messageLength: message.length });

      const result = await this.chatManager.testFunctionCall(sessionId, message);

      if (!result.success) {
        return res.status(500).json(result);
      }

      // 返回测试结果
      res.json({
        success: true,
        ...result.response,
      });
    } catch (error) {
      this.logger.error('测试函数调用失败', { error: error.message, stack: error.stack });
      res.status(500).json({
        success: false,
        error: `测试失败: ${error.message}`,
      });
    }
  }

  /**
   * 格式化聊天响应
   * @private
   */
  _formatChatResponse(response) {
    if (response.type === 'text') {
      return {
        type: 'text',
        content: response.content,
      };
    } else if (response.type === 'function_call') {
      return {
        type: 'function_result',
        function_calls: response.calls,
        results: response.results,
        // 如果有完整对话处理，返回最终响应
        final_response: response.final_response,
      };
    }

    return response;
  }
}

module.exports = ChatController;
