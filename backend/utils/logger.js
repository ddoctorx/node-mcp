const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 自定义日志格式
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}][${level.toUpperCase()}] ${message}${metaStr}`;
  }),
);

// 创建Winston日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
          return `[${timestamp}][${level.toUpperCase()}] ${message}${metaStr}`;
        }),
      ),
    }),
    // 记录到文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  ],
});

// MCP注册相关日志
const mcpRegistry = {
  registered: (mcpName, instanceId, config) => {
    logger.info(`MCP注册成功: ${mcpName} [${instanceId}]`, {
      event: 'mcp_registered',
      mcpName,
      instanceId,
      config: sanitizeConfig(config),
    });
  },
  configReceived: (mcpName, config) => {
    logger.debug(`MCP配置接收: ${mcpName}`, {
      event: 'mcp_config_received',
      mcpName,
      config: sanitizeConfig(config),
    });
  },
};

// OpenAI API调用日志
const openai = {
  requestStarted: (requestId, messages, tools) => {
    logger.info(`OpenAI API请求开始[${requestId}]`, {
      event: 'openai_request_started',
      requestId,
      model: 'gpt-4.1',
      messageCount: messages.length,
      toolCount: tools ? tools.length : 0,
    });
    logger.debug(`OpenAI API请求详情[${requestId}]`, {
      event: 'openai_request_detail',
      requestId,
      messages,
      tools,
    });
  },
  requestCompleted: (requestId, responseTime, status) => {
    logger.info(`OpenAI API请求完成[${requestId}] 耗时: ${responseTime}ms`, {
      event: 'openai_request_completed',
      requestId,
      responseTime,
      status,
    });
  },
  requestFailed: (requestId, error) => {
    logger.error(`OpenAI API请求失败[${requestId}]`, {
      event: 'openai_request_failed',
      requestId,
      error: error.message,
      stack: error.stack,
    });
  },
  responseReceived: (requestId, data) => {
    logger.debug(`OpenAI API响应数据[${requestId}]`, {
      event: 'openai_response_received',
      requestId,
      data,
    });
  },
};

// MCP工具调用日志
const mcpTool = {
  callStarted: (sessionId, mcpName, toolName, params) => {
    logger.info(`MCP工具调用开始: ${mcpName}.${toolName}`, {
      event: 'mcp_tool_call_started',
      sessionId,
      mcpName,
      toolName,
      params,
    });
  },
  callCompleted: (sessionId, mcpName, toolName, responseTime, result) => {
    logger.info(`MCP工具调用完成: ${mcpName}.${toolName} 耗时: ${responseTime}ms`, {
      event: 'mcp_tool_call_completed',
      sessionId,
      mcpName,
      toolName,
      responseTime,
    });
    logger.debug(`MCP工具调用结果: ${mcpName}.${toolName}`, {
      event: 'mcp_tool_call_result',
      sessionId,
      mcpName,
      toolName,
      result,
    });
  },
  callFailed: (sessionId, mcpName, toolName, error) => {
    logger.error(`MCP工具调用失败: ${mcpName}.${toolName}`, {
      event: 'mcp_tool_call_failed',
      sessionId,
      mcpName,
      toolName,
      error: error.message,
      stack: error.stack,
    });
  },
};

// 函数调用处理日志
const functionCalling = {
  detected: (requestId, toolCalls) => {
    logger.info(`检测到函数调用请求[${requestId}]`, {
      event: 'function_calling_detected',
      requestId,
      toolCallCount: toolCalls.length,
    });
    logger.debug(`函数调用详情[${requestId}]`, {
      event: 'function_calling_detail',
      requestId,
      toolCalls,
    });
  },
  completed: (requestId, results) => {
    logger.info(`函数调用完成[${requestId}]`, {
      event: 'function_calling_completed',
      requestId,
      resultCount: results.length,
    });
  },
};

// 工具函数 - 清理配置中的敏感信息
function sanitizeConfig(config) {
  if (!config) return null;

  const sanitized = { ...config };

  // 删除或遮盖敏感信息
  if (sanitized.env) {
    const sanitizedEnv = { ...sanitized.env };

    // 遮盖可能包含敏感信息的环境变量
    ['API_KEY', 'SECRET', 'PASSWORD', 'TOKEN'].forEach(sensitive => {
      Object.keys(sanitizedEnv).forEach(key => {
        if (key.toUpperCase().includes(sensitive)) {
          sanitizedEnv[key] = '******';
        }
      });
    });

    sanitized.env = sanitizedEnv;
  }

  return sanitized;
}

module.exports = {
  logger,
  mcpRegistry,
  openai,
  mcpTool,
  functionCalling,
};
