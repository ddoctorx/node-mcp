// registry.js
// MCP服务注册中心
// 负责服务实例的注册、发现和复用管理
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// 添加配额和限制常量
const DEFAULT_SYSTEM_MAX_INSTANCES = 1000; // 系统最大实例数
const DEFAULT_MAX_INSTANCES_PER_USER = 20; // 每用户最大实例数
const DEFAULT_MAX_SESSIONS_PER_INSTANCE = 100; // 每实例最大会话数

// 保存系统配置的对象
let systemConfig = {
  maxInstances: process.env.MAX_INSTANCES || DEFAULT_SYSTEM_MAX_INSTANCES,
  maxInstancesPerUser: process.env.MAX_INSTANCES_PER_USER || DEFAULT_MAX_INSTANCES_PER_USER,
  maxSessionsPerInstance:
    process.env.MAX_SESSIONS_PER_INSTANCE || DEFAULT_MAX_SESSIONS_PER_INSTANCE,
};

// 存储所有活跃的MCP服务实例
const mcpInstances = {};

// 用户到MCP实例的映射
const userMcpInstances = {};

// 存储全局mcpPool实例
let globalMcpPool = null;

// 设置全局mcpPool实例
function setMcpPool(mcpPool) {
  globalMcpPool = mcpPool;
}

// 获取全局mcpPool实例
function getMcpPool() {
  return globalMcpPool;
}

// 根据配置生成唯一的实例签名
function generateInstanceSignature(config) {
  if (typeof config === 'string') {
    // 直接命令字符串的情况
    return crypto.createHash('md5').update(config).digest('hex');
  } else if (config.command && config.args) {
    // 检查是否是Git clone命令
    const isGitClone =
      (config.command === 'git' || config.args.includes('git')) && config.args.includes('clone');

    // 如果是Git clone命令，并且有仓库URL信息，使用仓库URL作为签名的一部分
    if (isGitClone && config.env && config.env.MCP_REPO_URL) {
      // 使用仓库URL生成签名，确保相同仓库URL生成相同签名
      return `git-repo-${
        config.env.MCP_REPO_HASH ||
        crypto.createHash('md5').update(config.env.MCP_REPO_URL).digest('hex').substring(0, 8)
      }`;
    }

    // 命令+参数+环境变量的配置
    const envString = config.env ? JSON.stringify(config.env) : '';
    // 工作目录也会影响签名（确保不同目录的相同命令有不同签名）
    const workingDirString = config.workingDir ? config.workingDir : '';
    const configString = `${config.command}|${config.args.join(
      '|',
    )}|${envString}|${workingDirString}`;
    return crypto.createHash('md5').update(configString).digest('hex');
  } else if (config.url) {
    // SSE类型配置
    return crypto.createHash('md5').update(config.url).digest('hex');
  }

  throw new Error('无效的MCP配置格式');
}

// 注册一个新的MCP服务实例
async function registerInstance(instanceId, config, mcpSession, userId = 'anonymous') {
  const signature = generateInstanceSignature(config);

  // 使用锁确保创建实例的原子性
  return await lock.acquire(signature, async () => {
    // 检查是否已存在
    if (!mcpInstances[signature]) {
      // 检查系统实例数限制
      const totalInstances = Object.keys(mcpInstances).length;
      if (totalInstances >= systemConfig.maxInstances) {
        logger.error(`系统实例数已达上限 (${systemConfig.maxInstances})，拒绝创建新实例`);
        throw new Error(`系统资源已达上限，请稍后再试`);
      }

      // 检查用户实例数限制
      const userInstanceCount = findUserInstances(userId).length;
      if (userInstanceCount >= systemConfig.maxInstancesPerUser) {
        logger.error(
          `用户[${userId}]实例数已达上限 (${systemConfig.maxInstancesPerUser})，拒绝创建新实例`,
        );
        throw new Error(`您的资源使用已达上限，请释放一些实例后再试`);
      }

      // 创建新实例
      mcpInstances[signature] = {
        signature,
        config,
        instanceId,
        mcpSession,
        userId,
        sessions: new Set(),
        lastUsedTime: Date.now(),
        createdTime: Date.now(),
        usageCount: 0,
      };

      // 将实例关联到用户
      if (!userMcpInstances[userId]) {
        userMcpInstances[userId] = new Set();
      }
      userMcpInstances[userId].add(signature);

      console.log(`已将实例[${instanceId}]关联到用户[${userId}]，签名[${signature}]`);
    }

    return mcpInstances[signature];
  });
}

// 查找匹配的MCP服务实例
async function findMatchingInstance(config) {
  const signature = generateInstanceSignature(config);
  return mcpInstances[signature];
}

// 查找用户的所有MCP服务实例
function findUserInstances(userId) {
  if (!userId || !userMcpInstances[userId]) {
    console.log(`未找到用户[${userId}]的实例记录`);
    return [];
  }

  const instances = Array.from(userMcpInstances[userId])
    .map(signature => mcpInstances[signature])
    .filter(Boolean);

  console.log(`用户[${userId}]找到${instances.length}个实例`);
  return instances;
}

// 获取实例详情
function getInstanceDetail(instanceId) {
  return Object.values(mcpInstances).find(instance => instance.instanceId === instanceId);
}

// 关联会话与MCP实例
function associateSessionWithInstance(sessionId, instanceId) {
  if (!sessionId) {
    logger.warn('关联失败: sessionId为空');
    return false;
  }

  if (!instanceId) {
    logger.warn('关联失败: instanceId为空');
    return false;
  }

  console.log(`尝试关联会话[${sessionId}]与实例[${instanceId}]`);

  // for (const instance of Object.values(mcpInstances)) {
  //   if (instance.instanceId === instanceId) {
  //     instance.sessions.add(sessionId);
  //     instance.lastUsedTime = Date.now();
  //     instance.usageCount += 1;
  //     console.log(`成功关联会话[${sessionId}]与实例[${instanceId}]`);
  //     return true;
  //   }
  // }
  for (const instance of Object.values(mcpInstances)) {
    if (instance.instanceId === instanceId) {
      // 检查会话数限制
      if (instance.sessions.size >= systemConfig.maxSessionsPerInstance) {
        logger.warn(
          `实例[${instanceId}]已达最大会话数 (${systemConfig.maxSessionsPerInstance})，拒绝新会话`,
        );
        return false;
      }

      instance.sessions.add(sessionId);
      instance.lastUsedTime = Date.now();
      instance.usageCount += 1;
      console.log(`成功关联会话[${sessionId}]与实例[${instanceId}]`);
      return true;
    }
  }

  console.log(`关联失败：找不到实例[${instanceId}]`);
  return false;
}

// 在registry.js中添加新方法，获取超过最大生命期的实例
function getOldInstances(maxLifetime) {
  const now = Date.now();
  return Object.values(mcpInstances).filter(instance => {
    return now - instance.createdTime > maxLifetime;
  });
}

// 解除会话与MCP实例的关联
function dissociateSessionFromInstance(sessionId, instanceId) {
  if (!sessionId || !instanceId) {
    logger.warn(`解除关联失败: 参数无效`, { sessionId, instanceId });
    return false;
  }

  let found = false;
  Object.values(mcpInstances).forEach(instance => {
    if (instance.instanceId === instanceId) {
      instance.sessions.delete(sessionId);
      found = true;
    }
  });

  if (!found) {
    logger.warn(`解除关联失败: 找不到实例`, { sessionId, instanceId });
  }

  return found;
}

// 获取所有空闲的MCP服务实例（没有关联会话的实例）
function getIdleInstances(idleTimeThreshold = 60 * 5 * 1000) {
  // 默认5分钟
  const now = Date.now();
  return Object.values(mcpInstances).filter(instance => {
    return instance.sessions.size === 0 && now - instance.lastUsedTime > idleTimeThreshold;
  });
}

// 移除指定的MCP服务实例
function removeInstance(instanceId) {
  const instance = Object.values(mcpInstances).find(inst => inst.instanceId === instanceId);

  if (instance) {
    // 从用户映射中移除
    if (instance.userId && userMcpInstances[instance.userId]) {
      userMcpInstances[instance.userId].delete(instance.signature);

      // 如果用户没有任何实例了，清理用户映射
      if (userMcpInstances[instance.userId].size === 0) {
        delete userMcpInstances[instance.userId];
      }
    }

    // 从实例map中移除
    delete mcpInstances[instance.signature];
    return true;
  }

  return false;
}

// 获取所有实例信息（用于管理界面）
function getAllInstances() {
  return Object.values(mcpInstances).map(instance => ({
    instanceId: instance.instanceId,
    signature: instance.signature,
    type: instance.mcpSession.clientType,
    name: instance.mcpSession.name,
    userId: instance.userId, // 添加用户ID到返回数据
    sessionCount: instance.sessions.size,
    lastUsedTime: instance.lastUsedTime,
    createdTime: instance.createdTime,
    usageCount: instance.usageCount,
  }));
}

// 获取统计信息
function getStats() {
  const instances = Object.values(mcpInstances);
  return {
    totalInstances: instances.length,
    activeInstances: instances.filter(instance => instance.sessions.size > 0).length,
    idleInstances: instances.filter(instance => instance.sessions.size === 0).length,
    totalUsers: Object.keys(userMcpInstances).length,
  };
}

function updateSystemConfig(newConfig) {
  if (newConfig.maxInstances !== undefined) {
    systemConfig.maxInstances = newConfig.maxInstances;
  }
  if (newConfig.maxInstancesPerUser !== undefined) {
    systemConfig.maxInstancesPerUser = newConfig.maxInstancesPerUser;
  }
  if (newConfig.maxSessionsPerInstance !== undefined) {
    systemConfig.maxSessionsPerInstance = newConfig.maxSessionsPerInstance;
  }

  logger.info(`系统配置已更新`, { systemConfig });
  return { ...systemConfig };
}

// 增强统计信息
function getDetailedStats() {
  const instances = Object.values(mcpInstances);
  const now = Date.now();

  // 基础统计
  const stats = {
    totalInstances: instances.length,
    activeInstances: instances.filter(instance => instance.sessions.size > 0).length,
    idleInstances: instances.filter(instance => instance.sessions.size === 0).length,
    totalUsers: Object.keys(userMcpInstances).length,
    systemConfig: { ...systemConfig },
  };

  // 高级统计
  if (instances.length > 0) {
    // 实例年龄统计
    const ages = instances.map(instance => now - instance.createdTime);
    stats.instanceAges = {
      min: Math.min(...ages),
      max: Math.max(...ages),
      avg: ages.reduce((sum, age) => sum + age, 0) / ages.length,
    };

    // 会话数统计
    const sessionCounts = instances.map(instance => instance.sessions.size);
    stats.sessionCounts = {
      min: Math.min(...sessionCounts),
      max: Math.max(...sessionCounts),
      avg: sessionCounts.reduce((sum, count) => sum + count, 0) / instances.length,
      total: sessionCounts.reduce((sum, count) => sum + count, 0),
    };

    // 使用次数统计
    const usageCounts = instances.map(instance => instance.usageCount);
    stats.usageCounts = {
      min: Math.min(...usageCounts),
      max: Math.max(...usageCounts),
      avg: usageCounts.reduce((sum, count) => sum + count, 0) / instances.length,
      total: usageCounts.reduce((sum, count) => sum + count, 0),
    };

    // 按类型分组统计
    stats.instancesByType = {};
    instances.forEach(instance => {
      const type = instance.mcpSession.clientType || 'unknown';
      stats.instancesByType[type] = (stats.instancesByType[type] || 0) + 1;
    });

    // 按用户分组统计
    stats.instancesByUser = {};
    Object.entries(userMcpInstances).forEach(([userId, signatures]) => {
      stats.instancesByUser[userId] = signatures.size;
    });
  }

  return stats;
}

// 使用简单的内存循环缓冲区存储历史数据
const metricsHistory = {
  timestamps: [],
  metrics: [],
  maxEntries: 100, // 存储最近100个时间点的数据
};

// 定期收集指标
function collectMetrics() {
  const stats = getDetailedStats();
  const timestamp = Date.now();

  // 添加到历史记录
  metricsHistory.timestamps.push(timestamp);
  metricsHistory.metrics.push(stats);

  // 如果超出最大条目数，移除最旧的记录
  if (metricsHistory.timestamps.length > metricsHistory.maxEntries) {
    metricsHistory.timestamps.shift();
    metricsHistory.metrics.shift();
  }

  return stats;
}

// 获取历史指标
function getMetricsHistory(count = 10) {
  const limit = Math.min(count, metricsHistory.timestamps.length);
  const result = {
    timestamps: metricsHistory.timestamps.slice(-limit),
    metrics: metricsHistory.metrics.slice(-limit),
  };
  return result;
}

module.exports = {
  registerInstance,
  findMatchingInstance,
  findUserInstances,
  getInstanceDetail,
  associateSessionWithInstance,
  dissociateSessionFromInstance,
  getIdleInstances,
  removeInstance,
  getAllInstances,
  getStats,
  setMcpPool,
  getMcpPool,
  getOldInstances,
  updateSystemConfig,
  getDetailedStats,
  collectMetrics,
  getMetricsHistory,
};
