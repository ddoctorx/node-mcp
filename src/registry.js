// MCP服务注册中心
// 负责服务实例的注册、发现和复用管理

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// 存储所有活跃的MCP服务实例
const mcpInstances = {};

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
function registerInstance(instanceId, config, mcpSession) {
  const signature = generateInstanceSignature(config);

  if (!mcpInstances[signature]) {
    mcpInstances[signature] = {
      signature,
      config,
      instanceId,
      mcpSession,
      sessions: new Set(),
      lastUsedTime: Date.now(),
      createdTime: Date.now(),
      usageCount: 0,
    };
  }

  return mcpInstances[signature];
}

// 查找是否存在匹配的MCP服务实例
function findMatchingInstance(config) {
  try {
    const signature = generateInstanceSignature(config);
    return mcpInstances[signature] || null;
  } catch (error) {
    console.error('生成实例签名失败:', error);
    return null;
  }
}

// 将会话关联到MCP实例
function associateSessionWithInstance(sessionId, instanceId) {
  Object.values(mcpInstances).forEach(instance => {
    if (instance.instanceId === instanceId) {
      instance.sessions.add(sessionId);
      instance.lastUsedTime = Date.now();
      instance.usageCount++;
      return true;
    }
  });

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
  Object.keys(mcpInstances).forEach(signature => {
    if (mcpInstances[signature].instanceId === instanceId) {
      delete mcpInstances[signature];
      return true;
    }
  });

  return false;
}

// 获取所有实例信息（用于管理界面）
function getAllInstances() {
  return Object.values(mcpInstances).map(instance => ({
    instanceId: instance.instanceId,
    signature: instance.signature,
    type: instance.mcpSession.clientType,
    name: instance.mcpSession.name,
    sessionCount: instance.sessions.size,
    lastUsedTime: instance.lastUsedTime,
    createdTime: instance.createdTime,
    usageCount: instance.usageCount,
    status: instance.mcpSession.status,
  }));
}

// 获取实例的详细信息
function getInstanceDetail(instanceId) {
  const instance = Object.values(mcpInstances).find(inst => inst.instanceId === instanceId);
  if (!instance) return null;

  return {
    ...instance,
    sessions: Array.from(instance.sessions),
  };
}

module.exports = {
  registerInstance,
  findMatchingInstance,
  associateSessionWithInstance,
  dissociateSessionFromInstance,
  getIdleInstances,
  removeInstance,
  getAllInstances,
  getInstanceDetail,
};
