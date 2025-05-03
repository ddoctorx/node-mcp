// src/infrastructure/http/middleware.js

const { v4: uuidv4 } = require('uuid');

/**
 * HTTP中间件集合
 * 提供各种通用的Express中间件
 */
const middleware = {
  /**
   * 请求日志中间件
   * @param {LoggerPort} logger - 日志服务
   * @returns {Function} Express中间件
   */
  requestLogger(logger) {
    return (req, res, next) => {
      const requestId = uuidv4();
      const startTime = Date.now();

      // 在请求对象上添加requestId，方便跟踪
      req.requestId = requestId;

      // 记录请求开始
      logger.info('HTTP请求', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        sessionId: req.headers['x-session-id'] || req.query.sessionId,
      });

      // 拦截res.json和res.send以记录响应
      const originalJson = res.json;
      const originalSend = res.send;

      res.json = function (body) {
        res.locals.responseBody = body;
        return originalJson.call(this, body);
      };

      res.send = function (body) {
        res.locals.responseBody = body;
        return originalSend.call(this, body);
      };

      // 监听响应完成
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 400 ? 'error' : 'info';

        logger[logLevel]('HTTP响应', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          responseSize: res.get('content-length'),
        });
      });

      next();
    };
  },

  /**
   * 错误处理中间件
   * @param {LoggerPort} logger - 日志服务
   * @returns {Function} Express错误处理中间件
   */
  errorHandler(logger) {
    return (err, req, res, next) => {
      const requestId = req.requestId || uuidv4();

      // 记录错误
      logger.error('HTTP错误', {
        requestId,
        method: req.method,
        url: req.url,
        error: err.message,
        stack: err.stack,
        name: err.name,
      });

      // 确定错误状态码
      const statusCode = err.statusCode || err.status || 500;

      // 格式化错误响应
      let errorResponse = {
        success: false,
        error: err.message || 'Internal Server Error',
        requestId,
      };

      // 在开发环境添加调试信息
      if (process.env.NODE_ENV !== 'production') {
        errorResponse.stack = err.stack;
        errorResponse.name = err.name;
      }

      res.status(statusCode).json(errorResponse);
    };
  },

  /**
   * 会话验证中间件
   * @param {SessionManagerService} sessionManager - 会话管理服务
   * @returns {Function} Express中间件
   */
  validateSession(sessionManager) {
    return async (req, res, next) => {
      // 从header或query中获取sessionId
      const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId;

      if (!sessionId) {
        return res.status(401).json({
          success: false,
          error: '缺少会话ID',
        });
      }

      try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(401).json({
            success: false,
            error: '无效的会话ID',
          });
        }

        // 将会话注入请求对象
        req.session = session;
        req.sessionId = sessionId;
        next();
      } catch (error) {
        res.status(500).json({
          success: false,
          error: '会话验证失败',
        });
      }
    };
  },

  /**
   * 速率限制中间件
   * @param {Object} options - 速率限制选项
   * @returns {Function} Express中间件
   */
  rateLimit(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15分钟
      max = 100, // 最大请求数
      standardHeaders = true,
      legacyHeaders = false,
    } = options;

    const requests = new Map(); // IP -> {timestamp, count}

    return (req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;

      // 清理过期的请求记录
      for (const [key, value] of requests.entries()) {
        if (value.timestamp < windowStart) {
          requests.delete(key);
        }
      }

      // 获取当前IP的请求信息
      let ipRequests = requests.get(ip);
      if (!ipRequests || ipRequests.timestamp < windowStart) {
        ipRequests = { timestamp: now, count: 1 };
      } else {
        ipRequests.count += 1;
      }

      requests.set(ip, ipRequests);

      // 设置响应头
      const resetTime = Math.ceil((ipRequests.timestamp + windowMs) / 1000);
      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', max);
        res.setHeader('RateLimit-Remaining', Math.max(0, max - ipRequests.count));
        res.setHeader('RateLimit-Reset', resetTime);
      }

      // 检查是否超出限制
      if (ipRequests.count > max) {
        return res.status(429).json({
          success: false,
          error: '请求频率超出限制',
          retryAfter: resetTime,
        });
      }

      next();
    };
  },

  /**
   * 请求验证中间件
   * @param {Function} schema - 验证schema函数
   * @returns {Function} Express中间件
   */
  validateRequest(schema) {
    return (req, res, next) => {
      const result = schema(req.body);

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          error: '请求数据验证失败',
          details: result.errors,
        });
      }

      next();
    };
  },

  /**
   * 安全头中间件
   * @returns {Function} Express中间件
   */
  securityHeaders() {
    return (req, res, next) => {
      // 防止点击劫持
      res.setHeader('X-Frame-Options', 'DENY');

      // 防止 MIME 类型嗅探
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // 启用 XSS 过滤器
      res.setHeader('X-XSS-Protection', '1; mode=block');

      // 只在HTTPS连接时传输Cookie
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

      // 设置内容安全策略
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
      );

      // 设置权限策略
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

      next();
    };
  },

  /**
   * 跨域（CORS）中间件
   * @param {Object} options - CORS选项
   * @returns {Function} Express中间件
   */
  cors(options = {}) {
    const {
      origin = '*',
      methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders = ['Content-Type', 'Authorization', 'x-session-id'],
      exposedHeaders = [],
      credentials = false,
      maxAge = 86400,
    } = options;

    return (req, res, next) => {
      // 设置CORS头
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', methods.join(','));
      res.header('Access-Control-Allow-Headers', allowedHeaders.join(','));

      if (exposedHeaders.length > 0) {
        res.header('Access-Control-Expose-Headers', exposedHeaders.join(','));
      }

      if (credentials) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }

      if (maxAge) {
        res.header('Access-Control-Max-Age', maxAge);
      }

      // 处理预检请求
      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      next();
    };
  },

  /**
   * 请求大小限制中间件
   * @param {number} limit - 大小限制（字节）
   * @returns {Function} Express中间件
   */
  requestSizeLimit(limit = 5 * 1024 * 1024) {
    // 默认5MB
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'], 10);

      if (contentLength > limit) {
        return res.status(413).json({
          success: false,
          error: '请求体太大',
          limit: `${limit / (1024 * 1024)}MB`,
        });
      }

      next();
    };
  },

  /**
   * 缓存控制中间件
   * @param {Object} options - 缓存选项
   * @returns {Function} Express中间件
   */
  cacheControl(options = {}) {
    const {
      maxAge = 3600, // 1小时
      mustRevalidate = true,
      noCache = false,
      noStore = false,
      public = true,
    } = options;

    return (req, res, next) => {
      let cacheControl = [];

      if (noCache) {
        cacheControl.push('no-cache');
      }
      if (noStore) {
        cacheControl.push('no-store');
      }
      if (mustRevalidate) {
        cacheControl.push('must-revalidate');
      }
      if (public) {
        cacheControl.push('public');
      } else {
        cacheControl.push('private');
      }
      if (maxAge) {
        cacheControl.push(`max-age=${maxAge}`);
      }

      res.setHeader('Cache-Control', cacheControl.join(', '));
      next();
    };
  },

  /**
   * 异步错误处理包装器
   * @param {Function} fn - 异步路由处理器
   * @returns {Function} Express路由处理器
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  },
};

module.exports = middleware;
