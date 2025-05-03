// src/infrastructure/logging/winston-logger.js

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const LoggerPort = require('../../application/ports/outbound/logger-port');

/**
 * Winston日志器适配器
 * 实现LoggerPort接口，提供日志功能
 */
class WinstonLogger extends LoggerPort {
  /**
   * @param {Object} [options] - 配置选项
   * @param {string} [options.level] - 日志级别
   * @param {string} [options.logDir] - 日志目录
   */
  constructor(options = {}) {
    super();

    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.logDir = options.logDir || path.join(__dirname, '../../../logs');

    this._ensureLogDirectory();
    this.logger = this._createWinstonLogger();
    this._setupSpecialLoggers();
  }

  /**
   * 记录信息日志
   */
  info(message, ...meta) {
    this.logger.info(message, ...meta);
  }

  /**
   * 记录错误日志
   */
  error(message, ...meta) {
    this.logger.error(message, ...meta);
  }

  /**
   * 记录调试日志
   */
  debug(message, ...meta) {
    this.logger.debug(message, ...meta);
  }

  /**
   * 记录警告日志
   */
  warn(message, ...meta) {
    this.logger.warn(message, ...meta);
  }

  /**
   * MCP注册相关日志
   */
  get mcpRegistry() {
    return {
      registered: (mcpName, instanceId, config) => {
        this.logger.info(`MCP注册成功: ${mcpName} [${instanceId}]`, {
          event: 'mcp_registered',
          mcpName,
          instanceId,
          config: this._sanitizeConfig(config),
        });
      },
      configReceived: (mcpName, config) => {
        this.logger.debug(`MCP配置接收: ${mcpName}`, {
          event: 'mcp_config_received',
          mcpName,
          config: this._sanitizeConfig(config),
        });
      },
    };
  }

  /**
   * OpenAI API调用日志
   */
  get openai() {
    return {
      requestStarted: (requestId, messages, tools) => {
        this.logger.info(`OpenAI API请求开始[${requestId}]`, {
          event: 'openai_request_started',
          requestId,
          model: 'gpt-4.1',
          messageCount: messages?.length || 0,
          toolCount: tools?.length || 0,
        });
        this.logger.debug(`OpenAI API请求详情[${requestId}]`, {
          event: 'openai_request_detail',
          requestId,
          messages,
          tools,
        });
      },
      requestCompleted: (requestId, responseTime, status) => {
        this.logger.info(`OpenAI API请求完成[${requestId}] 耗时: ${responseTime}ms`, {
          event: 'openai_request_completed',
          requestId,
          responseTime,
          status,
        });
      },
      requestFailed: (requestId, error) => {
        this.logger.error(`OpenAI API请求失败[${requestId}]`, {
          event: 'openai_request_failed',
          requestId,
          error: error.message,
          stack: error.stack,
        });
      },
      responseReceived: (requestId, data) => {
        this.logger.debug(`OpenAI API响应数据[${requestId}]`, {
          event: 'openai_response_received',
          requestId,
          data,
        });
      },
    };
  }

  /**
   * MCP工具调用日志
   */
  get mcpTool() {
    return {
      callStarted: (sessionId, mcpName, toolName, params) => {
        this.logger.info(`MCP工具调用开始: ${mcpName}.${toolName}`, {
          event: 'mcp_tool_call_started',
          sessionId,
          mcpName,
          toolName,
          params,
        });
      },
      callCompleted: (sessionId, mcpName, toolName, responseTime, result) => {
        this.logger.info(`MCP工具调用完成: ${mcpName}.${toolName} 耗时: ${responseTime}ms`, {
          event: 'mcp_tool_call_completed',
          sessionId,
          mcpName,
          toolName,
          responseTime,
        });
        this.logger.debug(`MCP工具调用结果: ${mcpName}.${toolName}`, {
          event: 'mcp_tool_call_result',
          sessionId,
          mcpName,
          toolName,
          result,
        });
      },
      callFailed: (sessionId, mcpName, toolName, error) => {
        this.logger.error(`MCP工具调用失败: ${mcpName}.${toolName}`, {
          event: 'mcp_tool_call_failed',
          sessionId,
          mcpName,
          toolName,
          error: error.message,
          stack: error.stack,
        });
      },
    };
  }

  /**
   * 函数调用处理日志
   */
  get functionCalling() {
    return {
      detected: (requestId, toolCalls) => {
        this.logger.info(`检测到函数调用请求[${requestId}]`, {
          event: 'function_calling_detected',
          requestId,
          toolCallCount: toolCalls?.length || 0,
        });
        this.logger.debug(`函数调用详情[${requestId}]`, {
          event: 'function_calling_detail',
          requestId,
          toolCalls,
        });
      },
      completed: (requestId, results) => {
        this.logger.info(`函数调用完成[${requestId}]`, {
          event: 'function_calling_completed',
          requestId,
          resultCount: results?.length || 0,
        });
      },
    };
  }

  /**
   * 创建Winston日志器
   * @private
   */
  _createWinstonLogger() {
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `[${timestamp}][${level.toUpperCase()}] ${message}${metaStr}`;
      }),
    );

    return winston.createLogger({
      level: this.level,
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
        // 错误日志文件
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
        }),
        // 所有日志文件
        new winston.transports.File({
          filename: path.join(this.logDir, 'combined.log'),
        }),
      ],
    });
  }

  /**
   * 确保日志目录存在
   * @private
   */
  _ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 设置特殊日志器
   * @private
   */
  _setupSpecialLoggers() {
    // 这些特殊日志器通过 getter 实现，无需额外设置
  }

  /**
   * 清理配置中的敏感信息
   * @private
   */
  _sanitizeConfig(config) {
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

  /**
   * 创建子日志器
   * @param {string} context - 日志上下文
   * @returns {Object} 子日志器
   */
  createChildLogger(context) {
    return {
      info: (message, ...meta) => this.info(`[${context}] ${message}`, ...meta),
      error: (message, ...meta) => this.error(`[${context}] ${message}`, ...meta),
      debug: (message, ...meta) => this.debug(`[${context}] ${message}`, ...meta),
      warn: (message, ...meta) => this.warn(`[${context}] ${message}`, ...meta),
    };
  }
}

module.exports = WinstonLogger;
