// registry.js
// MCP服务注册中心
// 负责服务实例的注册、发现和复用管理

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

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
    // 命令+参数+环境变量的配置
    const envString = config.env ? JSON.stringify(config.env) : '';
    const configString = `${config.command}|${config.args.join('|')}|${envString}`;
    return crypto.createHash('md5').update(configString).digest('hex');
  } else if (config.url) {
    // SSE类型配置
    return crypto.createHash('md5').update(config.url).digest('hex');
  }

  throw new Error('无效的MCP配置格式');
}

// 注册一个新的MCP服务实例
function registerInstance(instanceId, config, mcpSession, userId = 'anonymous') {
  const signature = generateInstanceSignature(config);

  if (!mcpInstances[signature]) {
    mcpInstances[signature] = {
      signature,
      config,
      instanceId,
      mcpSession,
      userId, // 添加用户ID
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
}

// 查找匹配的MCP服务实例
function findMatchingInstance(config) {
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
  console.log(`尝试关联会话[${sessionId}]与实例[${instanceId}]`);

  for (const instance of Object.values(mcpInstances)) {
    if (instance.instanceId === instanceId) {
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

// 解除会话与MCP实例的关联
function dissociateSessionFromInstance(sessionId, instanceId) {
  Object.values(mcpInstances).forEach(instance => {
    if (instance.instanceId === instanceId) {
      instance.sessions.delete(sessionId);
      return true;
    }
  });

  return false;
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
};
