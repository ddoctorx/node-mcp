// 常量和设置
const API_BASE_URL = '/api';
let sessionId = null;
let userId = null; // 添加用户ID变量
let socket = null;
let mcpList = [];

// 添加自定义样式
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .editable-user-id {
      cursor: pointer;
      text-decoration: underline dotted;
      color: #0066cc;
      transition: color 0.2s;
    }
    .editable-user-id:hover {
      color: #004080;
    }
    .command-warning {
      margin-bottom: 15px;
      padding: 10px;
      border-radius: 4px;
      font-size: 14px;
    }
    .warning-message {
      background-color: #fff3cd;
      border: 1px solid #ffeeba;
      color: #856404;
      padding: 10px;
      border-radius: 4px;
    }
    .success-message {
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
      padding: 10px;
      border-radius: 4px;
    }
    .details {
      margin-top: 8px;
      padding: 8px;
      background-color: rgba(0,0,0,0.05);
      border-radius: 3px;
      font-size: 12px;
      overflow-x: auto;
    }
    .function-confirmation {
      background-color: #f8f9fa;
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 10px;
      width: 100%;
    }
    .function-confirmation-needed {
      border: 3px solid #dc3545;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
      background-color: #fff8f8;
      max-width: 100%;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      position: relative;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(220, 53, 69, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(220, 53, 69, 0);
      }
    }
    .confirmation-message {
      color: #dc3545;
      margin-bottom: 15px;
      font-weight: 500;
    }
    .confirmation-message h3 {
      margin: 0 0 10px 0;
      font-size: 18px;
      color: #dc3545;
      font-weight: bold;
    }
    .function-params-preview {
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 10px;
      margin-top: 10px;
    }
    .function-params-preview pre {
      margin: 5px 0 0 0;
      white-space: pre-wrap;
      font-size: 13px;
      background-color: #f1f1f1;
      padding: 8px;
      border-radius: 3px;
      max-height: 150px;
      overflow-y: auto;
    }
    .confirmation-buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 15px;
    }
    .always-confirm-btn, .confirm-once-btn, .reject-btn {
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.3s;
      font-size: 14px;
    }
    .always-confirm-btn, .confirm-once-btn {
      background-color: transparent;
      border: 1px solid #dc3545;
      color: #dc3545;
    }
    .reject-btn {
      background-color: transparent;
      border: 1px solid #6c757d;
      color: #6c757d;
    }
    .always-confirm-btn:hover, .confirm-once-btn:hover {
      background-color: #dc3545;
      color: white;
    }
    .reject-btn:hover {
      background-color: #6c757d;
      color: white;
    }
    .function-executing {
      background-color: #e9ecef;
      color: #495057;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .function-error {
      background-color: #f8d7da;
      color: #721c24;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .function-rejection {
      background-color: #f8d7da;
      color: #721c24;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .function-call-item {
      margin-bottom: 15px;
      padding: 10px;
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
    }
    .function-name {
      font-weight: bold;
      margin-bottom: 5px;
      color: #007bff;
    }
    .function-params, .function-result {
      white-space: pre-wrap;
      background-color: #f1f1f1;
      padding: 8px;
      border-radius: 3px;
      font-size: 13px;
      margin-top: 5px;
      overflow-x: auto;
    }
  `;
  document.head.appendChild(style);
})();

// MCP预设配置
const MCP_PRESETS = {
  'amap-maps': {
    name: '高德地图 MCP',
    command: 'npx',
    args: ['-y', '@amap/amap-maps-mcp-server'],
    env: {
      AMAP_MAPS_API_KEY: '您在高德官网上申请的key',
    },
  },
  stripe: {
    name: 'Stripe MCP',
    command: 'npx',
    args: ['-y', '@stripe/mcp-server'],
    env: {
      STRIPE_API_KEY: '您的Stripe API密钥',
    },
  },
  openai: {
    name: 'OpenAI MCP',
    command: 'npx',
    args: ['-y', '@openai/mcp-server'],
    env: {
      OPENAI_API_KEY: '您的OpenAI API密钥',
    },
  },
  'docker-mcp': {
    name: 'Docker MCP',
    command: 'docker',
    args: ['run', '--rm', '-p', '8080:8080', 'your-mcp-server-image:latest'],
    env: {
      MCP_API_KEY: '您的MCP API密钥',
    },
  },
  'python-mcp': {
    name: 'python-fetch',
    command: 'python',
    args: ['-m', 'mcp_server_fetch'],
    env: {},
    setup: {
      command: 'pip',
      args: ['install', 'mcp-server-fetch'],
      description: '安装mcp-server-fetch包',
    },
  },
};

// 事件总线模块 - 用于组件间通信
const eventBus = (() => {
  const events = {};

  function init() {
    return {
      on,
      emit,
    };
  }

  function on(eventName, callback) {
    if (!events[eventName]) {
      events[eventName] = [];
    }
    events[eventName].push(callback);
  }

  function emit(eventName, data) {
    const callbacks = events[eventName];
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  return {
    init,
    on,
    emit,
  };
})();

// 提示消息管理模块
const toastManager = (() => {
  function init() {
    // 创建Toast容器（如果不存在）
    if (!document.getElementById('toast-container')) {
      const toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  function showToast(message, type = 'info', duration = 3000) {
    init();

    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // 超时自动移除
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s forwards';
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, duration);

    return toast;
  }

  return {
    init,
    showToast,
  };
})();

// 会话管理模块
const sessionManager = (() => {
  function init() {
    // 初始化会话管理器
  }

  function getSessionId() {
    return sessionId;
  }

  function getUserId() {
    return userId;
  }

  function createNewSession() {
    // 禁用UI元素，显示加载状态
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => (btn.disabled = true));
    toastManager.showToast('正在创建新会话...', 'info');

    return fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: localStorage.getItem('mcpUserId') || null,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`创建会话失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          sessionId = data.sessionId;

          // 检查返回的userId或使用现有值
          if (data.userId && data.userId !== 'undefined') {
            userId = data.userId;
          } else {
            // 如果服务器没有返回有效的userId，使用存储的或默认值
            userId = localStorage.getItem('mcpUserId');
            if (!userId || userId === 'undefined') {
              userId = 'anonymous';
            }
          }

          localStorage.setItem('mcpSessionId', sessionId);
          localStorage.setItem('mcpUserId', userId);

          console.log(`新会话已创建: ${sessionId}, 用户ID: ${userId}`);

          // 更新UI
          updateSessionDisplay();

          // 连接WebSocket
          connectWebSocket();

          // 清空现有MCP列表
          mcpList = [];
          renderMcpList();

          eventBus.emit('session-changed', sessionId);

          toastManager.showToast('会话已创建', 'info');

          // 重新启用UI元素
          allButtons.forEach(btn => (btn.disabled = false));

          return { sessionId, userId };
        } else {
          throw new Error(data.error || '创建会话失败');
        }
      })
      .catch(error => {
        console.error('创建会话失败:', error);
        toastManager.showToast('创建会话失败: ' + error.message, 'error');

        // 重新启用UI元素
        allButtons.forEach(btn => (btn.disabled = false));

        throw error;
      });
  }

  // 获取用户的所有会话
  function getUserSessions() {
    if (!userId) {
      toastManager.showToast('未登录，无法获取会话列表', 'error');
      return Promise.resolve([]);
    }

    return fetch(`${API_BASE_URL}/users/${userId}/sessions`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取用户会话列表失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          return data.sessions;
        } else {
          throw new Error(data.error || '获取用户会话列表失败');
        }
      });
  }

  return {
    init,
    getSessionId,
    getUserId,
    createNewSession,
    getUserSessions,
  };
})();

// MCP管理模块
const mcpManager = (() => {
  // 存储MCP实例ID映射
  const mcpInstanceMap = {};

  function init() {
    // 初始化MCP管理器
  }

  function getAllMcps() {
    return mcpList.reduce((acc, mcp) => {
      acc[mcp.name] = mcp;
      return acc;
    }, {});
  }

  function loadMcpList() {
    if (!sessionId) return Promise.resolve([]);

    const encodedSessionId = encodeURIComponent(sessionId);
    return fetch(`${API_BASE_URL}/sessions/${encodedSessionId}/mcp`, {
      headers: {
        'X-Session-ID': sessionId,
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取MCP列表失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          mcpList = data.mcps;
          return data.mcps;
        } else {
          throw new Error(data.error || '获取MCP列表失败');
        }
      });
  }

  function addMcp(payload) {
    if (!sessionId) {
      toastManager.showToast('会话无效，无法添加MCP', 'error');
      return Promise.reject(new Error('会话无效'));
    }

    // 调整payload格式，适应新接口
    const newPayload = {
      name: payload.name,
      clientType: payload.clientType,
      config: {},
    };

    // 检测输入格式 - 如果有command/args/setup等字段但没有config字段，说明是旧格式
    const isOldFormat = !payload.config && (payload.command || payload.args || payload.setup);

    if (isOldFormat) {
      console.log('检测到旧格式参数，进行转换');

      // 根据客户端类型封装参数到config对象中
      if (payload.clientType === 'stdio') {
        newPayload.config = {
          command: payload.command || '',
          args: Array.isArray(payload.args) ? payload.args : [],
          description: payload.description || `${payload.name} MCP服务`,
        };

        // 确保setup完整复制
        if (payload.setup) {
          newPayload.config.setup = {
            command: payload.setup.command,
            args: Array.isArray(payload.setup.args) ? payload.setup.args : [],
            description: payload.setup.description || '设置环境',
          };
        }

        // 复制环境变量
        if (payload.env) {
          newPayload.config.env = payload.env;
        }
      } else if (payload.clientType === 'sse') {
        newPayload.config = {
          url: payload.url || '',
          description: payload.description,
        };
      }
    } else {
      // 使用现有的config对象
      newPayload.config = payload.config || {};
    }

    // 确保config不为空对象，且包含必须的字段
    if (Object.keys(newPayload.config).length === 0) {
      console.error('警告: 生成的config对象为空', payload);
      toastManager.showToast('MCP配置无效：缺少必要参数', 'error');
      return Promise.reject(new Error('MCP配置无效：缺少必要参数'));
    }

    // 对于stdio类型，确保command和args字段存在
    if (payload.clientType === 'stdio' && !newPayload.config.command) {
      console.error('警告: stdio类型MCP缺少command字段', newPayload);
      toastManager.showToast('MCP配置无效：缺少command字段', 'error');
      return Promise.reject(new Error('MCP配置无效：缺少command字段'));
    }

    console.log('转换后的payload:', JSON.stringify(newPayload, null, 2));

    const encodedSessionId = encodeURIComponent(sessionId);
    return fetch(`${API_BASE_URL}/sessions/${encodedSessionId}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify(newPayload),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`添加MCP失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          // 确保mcpList是数组
          if (!Array.isArray(mcpList)) {
            mcpList = [];
          }

          // 更新MCP列表，确保新添加的MCP被立即添加到列表中
          if (data.mcp) {
            const existingIndex = mcpList.findIndex(m => m.name === data.mcp.name);
            if (existingIndex >= 0) {
              mcpList[existingIndex] = data.mcp;
            } else {
              mcpList.push(data.mcp);
            }

            // 渲染MCP列表
            renderMcpList();

            // 触发事件，通知聊天模块MCP已更新
            if (eventBus && typeof eventBus.emit === 'function') {
              eventBus.emit('mcps-updated', mcpList);
            }
          }
          return data;
        } else {
          throw new Error(data.error || '添加MCP失败');
        }
      });
  }

  function reconnectMcp(mcp) {
    // 根据类型准备不同的载荷
    const payload = {
      sessionId,
      name: mcp.name,
      clientType: mcp.clientType,
    };

    if (mcp.clientType === 'stdio') {
      payload.command = mcp.command;
      payload.args = mcp.args;
      payload.env = mcp.env;
    } else {
      payload.url = mcp.url;
    }

    toastManager.showToast(`正在重新连接 ${mcp.name}...`, 'info');

    // 首先断开指定的MCP连接
    return deleteMcp(mcp)
      .then(() => {
        // 然后重新连接这个特定的MCP
        return fetch(`${API_BASE_URL}/sessions/${encodeURIComponent(sessionId)}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify(payload),
        });
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`重新连接失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          // 更新单个MCP实例而不是重新加载整个列表
          return loadMcpList().then(updatedList => {
            // 找到当前重新连接的MCP
            const updatedMcp = updatedList.find(m => m.name === mcp.name);
            toastManager.showToast(`${mcp.name} 已重新连接`, 'success');

            // 只更新页面上对应的MCP卡片
            updateSingleMcpCard(updatedMcp);

            return updatedMcp;
          });
        } else {
          throw new Error(data.error || '重新连接失败');
        }
      })
      .catch(error => {
        toastManager.showToast(`重新连接 ${mcp.name} 失败: ${error.message}`, 'error');
        throw error;
      });
  }

  // 添加一个新函数来更新单个MCP卡片，而不是整个列表
  function updateSingleMcpCard(mcp) {
    if (!mcp) return;

    // 查找对应的MCP卡片
    const mcpCard = document.querySelector(`.mcp-card[data-mcp-name="${mcp.name}"]`);
    if (!mcpCard) return;

    // 更新状态显示
    const statusValue = mcpCard.querySelector('.status-value');
    if (statusValue) {
      statusValue.className = `status-value ${
        mcp.status === 'connected' || mcp.status === 'ready'
          ? 'status-running'
          : mcp.status === 'disconnected'
          ? 'status-disconnecting'
          : 'status-error'
      }`;

      statusValue.textContent =
        mcp.status === 'connected' || mcp.status === 'ready'
          ? '运行中'
          : mcp.status === 'disconnected'
          ? '断开中'
          : '异常';
    }

    // 更新工具列表
    const toolsList = mcpCard.querySelector('.tools-list');
    if (toolsList) {
      // 确保mcp.tools是一个数组
      const tools = Array.isArray(mcp.tools) ? mcp.tools : [];

      if (tools.length > 0) {
        toolsList.innerHTML = tools
          .map(
            tool => `
            <div class="tool-item" onclick="showToolDialog('${mcp.name}', '${tool.name}')">
              <div class="tool-name">${tool.name}</div>
              <div class="tool-description">${tool.description || '无描述'}</div>
            </div>
          `,
          )
          .join('');
      } else {
        toolsList.innerHTML = '<div class="no-tools">无可用工具</div>';
      }
    }

    // 更新卡片类
    if (mcp.status === 'disconnected') {
      mcpCard.classList.add('disconnecting');
    } else {
      mcpCard.classList.remove('disconnecting');
    }

    // 触发精确的事件更新
    eventBus.emit('mcp-updated', mcp);
  }

  function deleteMcp(mcp) {
    if (!sessionId || !mcp || !mcp.name) {
      toastManager.showToast('无效的会话或MCP', 'error');
      return Promise.reject(new Error('无效的会话或MCP'));
    }

    const encodedSessionId = encodeURIComponent(sessionId);
    const encodedName = encodeURIComponent(mcp.name);

    return fetch(`${API_BASE_URL}/sessions/${encodedSessionId}/mcp`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify({ name: mcp.name }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`删除MCP失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          toastManager.showToast(`已成功删除MCP: ${mcp.name}`, 'success');
          return true;
        } else {
          throw new Error(data.error || '删除MCP失败');
        }
      });
  }

  // 获取池状态信息
  function getPoolStats() {
    return fetch(`${API_BASE_URL}/mcp/stats`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          return data.stats;
        } else {
          throw new Error(data.error || '获取池统计信息失败');
        }
      });
  }

  // 获取所有MCP实例
  function getAllInstances() {
    return fetch(`${API_BASE_URL}/mcp/instances`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          return data.instances;
        } else {
          throw new Error(data.error || '获取实例列表失败');
        }
      });
  }

  return {
    init,
    getAllMcps,
    loadMcpList,
    addMcp,
    reconnectMcp,
    deleteMcp,
    getPoolStats,
    getAllInstances,
  };
})();

// DOM元素
const sessionIdDisplay = document.getElementById('session-id-display');
const newSessionBtn = document.getElementById('new-session-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const serverTypeSelect = document.getElementById('server-type');
const serverNameInput = document.getElementById('server-name');
const serverCommandInput = document.getElementById('server-command');
const serverArgsInput = document.getElementById('server-args');
const serverEnvInput = document.getElementById('server-env');
const serverUrlInput = document.getElementById('server-url');
const commandGroup = document.getElementById('command-group');
const argsGroup = document.getElementById('args-group');
const envGroup = document.getElementById('env-group');
const urlGroup = document.getElementById('url-group');
const addMcpBtn = document.getElementById('add-mcp-btn');
const mcpListContainer = document.getElementById('mcp-list');
const emptyState = document.getElementById('empty-state');
const mcpCountElement = document.getElementById('mcp-count');
const addFirstMcpBtn = document.querySelector('.add-first-mcp-btn');
const presetMcpSelect = document.getElementById('preset-mcp-select');
const configFileInput = document.getElementById('config-file');
const importConfigBtn = document.getElementById('import-config-btn');

// 聊天功能实现
const chatModule = (() => {
  // DOM元素
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendMessageBtn = document.getElementById('send-message-btn');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  const chatStatus = document.getElementById('chat-status');

  // 模板
  const chatMessageTemplate = document.getElementById('chat-message-template');
  const functionCallTemplate = document.getElementById('function-call-template');

  // 状态变量
  let isLoading = false;

  // 初始化
  function init() {
    setupEventListeners();

    // 初始状态设置为禁用，直到MCP连接
    disableChat('等待连接MCP服务');

    // 检查当前会话状态
    if (sessionId) {
      checkChatAvailability();
    }
  }

  // 设置事件监听
  function setupEventListeners() {
    sendMessageBtn.addEventListener('click', sendMessage);
    clearChatBtn.addEventListener('click', clearChat);

    // 按Enter发送消息
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // 注册MCP连接/断开事件监听
    eventBus.on('mcps-updated', checkChatAvailability);
    eventBus.on('mcp-updated', function (mcp) {
      // 单个MCP更新，检查聊天可用性
      checkChatAvailability();
    });
    eventBus.on('mcp-removed', function (mcpName) {
      // 单个MCP被移除，检查聊天可用性
      checkChatAvailability();
    });
    eventBus.on('session-changed', onSessionChanged);
  }

  // 会话变更处理
  function onSessionChanged(newSessionId) {
    console.log(`聊天模块: 会话已更改为 ${newSessionId}`);
    loadChatHistory();
  }

  // 检查聊天可用性
  function checkChatAvailability() {
    if (!sessionId) {
      disableChat('无会话ID');
      return;
    }

    const mcps = mcpManager.getAllMcps();

    if (Object.keys(mcps).length > 0) {
      // 至少有一个MCP连接
      enableChat();
    } else {
      // 没有连接的MCP
      disableChat('请连接至少一个MCP服务以开始聊天');
    }
  }

  // 启用聊天
  function enableChat() {
    chatInput.disabled = false;
    sendMessageBtn.disabled = false;
    chatStatus.textContent = '已连接';
    chatStatus.classList.add('connected');

    // 加载聊天历史
    loadChatHistory();
  }

  // 禁用聊天
  function disableChat(message) {
    chatInput.disabled = true;
    sendMessageBtn.disabled = true;
    chatStatus.textContent = message || '未连接';
    chatStatus.classList.remove('connected');
  }

  // 加载聊天历史
  async function loadChatHistory() {
    const currentSessionId = sessionId;
    if (!currentSessionId) {
      console.warn('没有有效的会话ID，无法加载聊天历史');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${currentSessionId}/history`, {
        headers: {
          'X-Session-ID': currentSessionId,
        },
      });
      const data = await response.json();

      if (data.success && data.history) {
        clearChatMessages();

        // 渲染历史消息
        data.history.forEach(item => {
          if (item.type === 'user') {
            addUserMessage(item.content);
          } else if (item.type === 'assistant') {
            addAssistantMessage(item.content);
          } else if (item.type === 'function_call') {
            addFunctionCallInfo(item);
          }
        });

        scrollToBottom();
      } else {
        console.error('加载聊天历史失败:', data.error);
      }
    } catch (error) {
      console.error('加载聊天历史出错:', error);
    }
  }

  // 发送消息
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isLoading) return;

    const currentSessionId = sessionId;
    if (!currentSessionId) {
      addSystemMessage('未找到会话，请重新连接');
      return;
    }

    // 禁用输入和发送按钮
    isLoading = true;
    chatInput.disabled = true;
    sendMessageBtn.disabled = true;

    // 显示用户消息
    addUserMessage(message);

    // 清空输入框
    chatInput.value = '';

    try {
      addSystemMessage('AI思考中...');

      // 获取聊天历史用于上下文
      const history = await fetch(`${API_BASE_URL}/sessions/${currentSessionId}/history`, {
        headers: {
          'X-Session-ID': currentSessionId,
        },
      })
        .then(res => res.json())
        .then(data => (data.success ? data.history : []));

      // 构造消息数组，包含历史消息和当前消息
      const messages = [];

      // 添加历史消息作为上下文
      if (history && history.length > 0) {
        history.forEach(item => {
          if (item.type === 'user') {
            messages.push({ role: 'user', content: item.content });
          } else if (item.type === 'assistant') {
            messages.push({ role: 'assistant', content: item.content });
          }
          // function_call类型的消息不添加到上下文中
        });
      }

      // 添加当前消息
      messages.push({ role: 'user', content: message });

      // 构建请求体，明确告知后端不要自动执行函数调用
      const requestBody = {
        message: messages,
        autoExecuteFunctions: false, // 明确告诉后端不要自动执行函数调用
      };

      console.log('发送消息请求体:', JSON.stringify(requestBody));

      const response = await fetch(`${API_BASE_URL}/sessions/${currentSessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': currentSessionId,
        },
        body: JSON.stringify(requestBody),
      });

      // 移除"思考中"消息
      removeSystemMessages();

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('收到的响应:', JSON.stringify(data));

      if (data.success) {
        const responseData = data.response;

        // 根据响应类型处理
        if (responseData.type === 'text') {
          // 普通文本响应
          addAssistantMessage(responseData.content);
        } else if (responseData.type === 'function_call') {
          // 这是真正需要用户确认的函数调用
          console.log('检测到函数调用请求，显示确认界面');
          addFunctionCallInfo(responseData, true); // 需要用户确认
        } else if (responseData.type === 'function_result') {
          // 已经执行了函数调用并有结果，仍然需要确认
          console.log('检测到函数调用结果，显示确认界面');
          addFunctionCallInfo(responseData, true); // 修改为需要用户确认

          // 添加模型最终回答
          if (responseData.final_response) {
            addAssistantMessage(responseData.final_response);
          }
        } else {
          // 检查是否存在calls或function_calls字段，确定是否需要用户确认
          const hasCalls = responseData.calls && responseData.calls.length > 0;
          const hasFunctionCalls =
            responseData.function_calls && responseData.function_calls.length > 0;
          const hasResults = responseData.results && responseData.results.length > 0;

          if (hasCalls || hasFunctionCalls) {
            // 有函数调用请求，总是需要用户确认
            console.log('检测到函数调用请求（通用格式），显示确认界面');
            addFunctionCallInfo(responseData, true);
          } else if (hasResults) {
            // 虽然有结果，但仍然显示确认界面
            console.log('检测到函数调用结果（通用格式），显示确认界面');
            addFunctionCallInfo(responseData, true);

            // 添加模型最终回答（如果有）
            if (responseData.final_response) {
              addAssistantMessage(responseData.final_response);
            }
          } else {
            // 其他未知类型的响应
            console.warn('未知的响应类型:', responseData);
            addSystemMessage(`收到未知类型的响应: ${JSON.stringify(responseData)}`);
          }
        }
      } else {
        addSystemMessage(`错误: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      removeSystemMessages();
      addSystemMessage(`发送失败: ${error.message}`);
    } finally {
      // 恢复输入和发送按钮
      isLoading = false;
      chatInput.disabled = false;
      sendMessageBtn.disabled = false;
      chatInput.focus();
    }
  }

  // 清除聊天历史
  async function clearChat() {
    const currentSessionId = sessionId;
    if (!currentSessionId) {
      console.warn('没有有效的会话ID，无法清除聊天');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${currentSessionId}/history`, {
        method: 'DELETE',
        headers: {
          'X-Session-ID': currentSessionId,
        },
      });
      const data = await response.json();

      if (data.success) {
        clearChatMessages();
        addSystemMessage('聊天记录已清除');
      } else {
        console.error('清除聊天记录失败:', data.error);
        toastManager.showToast('清除聊天记录失败', 'error');
      }
    } catch (error) {
      console.error('清除聊天记录出错:', error);
      toastManager.showToast(`清除聊天记录出错: ${error.message}`, 'error');
    }
  }

  // 清除聊天消息
  function clearChatMessages() {
    chatMessages.innerHTML = '';
  }

  // 移除系统消息
  function removeSystemMessages() {
    const systemMessages = chatMessages.querySelectorAll('.system-message');
    systemMessages.forEach(msg => msg.remove());
  }

  // 添加系统消息
  function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    scrollToBottom();
  }

  // 添加用户消息
  function addUserMessage(message) {
    const clone = chatMessageTemplate.content.cloneNode(true);
    const messageElement = clone.querySelector('.message');
    messageElement.classList.add('user');

    clone.querySelector('.message-sender').textContent = '你';
    clone.querySelector('.message-time').textContent = getCurrentTime();
    clone.querySelector('.message-content').textContent = message;

    chatMessages.appendChild(clone);
    scrollToBottom();
  }

  // 添加助手消息
  function addAssistantMessage(message) {
    const clone = chatMessageTemplate.content.cloneNode(true);
    const messageElement = clone.querySelector('.message');
    messageElement.classList.add('assistant');

    clone.querySelector('.message-sender').textContent = 'AI助手';
    clone.querySelector('.message-time').textContent = getCurrentTime();

    // 处理可能的markdown代码块
    const content = clone.querySelector('.message-content');
    const formattedMessage = formatMessage(message);
    content.innerHTML = formattedMessage;

    chatMessages.appendChild(clone);
    scrollToBottom();
  }

  // 添加函数调用信息
  async function addFunctionCallInfo(data, needConfirmation = false) {
    // 兼容后端返回的两种可能格式：calls 或 function_calls
    const callsData = data.calls || data.function_calls;

    if (!callsData || !callsData.length) return;

    // 创建函数调用容器
    const callContainer = document.createElement('div');
    callContainer.className = 'function-calls-container';

    // 强制需要确认 - 修复直接执行函数调用的问题
    needConfirmation = true; // 无论何种情况，总是需要用户确认

    // 如果需要确认，添加确认按钮和说明
    if (needConfirmation) {
      console.log('创建函数调用确认UI');
      callContainer.classList.add('function-confirmation-needed');

      // 获取函数名称，清晰显示需要调用的是什么函数
      const functionName = callsData[0]?.function?.name || '未知函数';
      const functionParams = callsData[0]?.function?.arguments || '{}';

      // 检查是否已设置自动确认
      const isAutoConfirmed = localStorage.getItem(`auto_confirm_${functionName}`) === 'true';

      // 如果已设置自动确认，则直接执行函数调用而不显示确认对话框
      if (isAutoConfirmed) {
        console.log(`函数 ${functionName} 已设置自动确认，直接执行`);
        callContainer.dataset.callData = JSON.stringify(data);
        callContainer.dataset.functionName = functionName;
        chatMessages.appendChild(callContainer);
        // 自动确认执行
        setTimeout(() => handleFunctionConfirmation(callContainer, true), 100);
        return callContainer;
      }

      try {
        // 尝试解析参数为JSON对象，以便美化显示
        const paramsObj = JSON.parse(functionParams);

        const confirmationSection = document.createElement('div');
        confirmationSection.className = 'function-confirmation';
        confirmationSection.innerHTML = `
          <div class="confirmation-message">
            <h3>需要调用 ${functionName}</h3>
            <div class="function-params-preview">
              <div>调用参数:</div>
              <pre>${JSON.stringify(paramsObj, null, 2)}</pre>
            </div>
          </div>
          <div class="confirmation-buttons">
            <button class="always-confirm-btn">始终同意</button>
            <button class="confirm-once-btn">同意一次</button>
            <button class="reject-btn">拒绝</button>
          </div>
        `;
        callContainer.appendChild(confirmationSection);

        // 存储调用数据和ID，以便确认后使用
        callContainer.dataset.callData = JSON.stringify(data);
        callContainer.dataset.functionName = functionName;

        // 为按钮添加事件监听
        const alwaysConfirmBtn = confirmationSection.querySelector('.always-confirm-btn');
        const confirmOnceBtn = confirmationSection.querySelector('.confirm-once-btn');
        const rejectBtn = confirmationSection.querySelector('.reject-btn');

        if (alwaysConfirmBtn) {
          alwaysConfirmBtn.addEventListener('click', () => {
            // 保存自动确认设置到localStorage
            localStorage.setItem(`auto_confirm_${functionName}`, 'true');

            // 发送到后端记录
            fetch(`${API_BASE_URL}/sessions/${sessionId}/auto-confirm`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sessionId,
              },
              body: JSON.stringify({
                functionName: functionName,
              }),
            })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  console.log(`已设置函数 ${functionName} 为自动确认`);
                } else {
                  console.error('设置自动确认失败:', data.error);
                }
              })
              .catch(error => {
                console.error('保存自动确认设置失败:', error);
              });

            handleFunctionConfirmation(callContainer, true);
          });
        }

        if (confirmOnceBtn) {
          confirmOnceBtn.addEventListener('click', () =>
            handleFunctionConfirmation(callContainer, true),
          );
        }

        if (rejectBtn) {
          rejectBtn.addEventListener('click', () =>
            handleFunctionConfirmation(callContainer, false),
          );
        }
      } catch (error) {
        console.error('解析函数参数出错:', error);
        // 参数解析出错时的回退方案
        const confirmationSection = document.createElement('div');
        confirmationSection.className = 'function-confirmation';
        confirmationSection.innerHTML = `
          <div class="confirmation-message">
            <h3>需要调用 ${functionName}</h3>
          </div>
          <div class="confirmation-buttons">
            <button class="confirm-once-btn">同意一次</button>
            <button class="reject-btn">拒绝</button>
          </div>
        `;
        callContainer.appendChild(confirmationSection);

        // 存储调用数据
        callContainer.dataset.callData = JSON.stringify(data);

        // 为按钮添加事件监听
        const confirmOnceBtn = confirmationSection.querySelector('.confirm-once-btn');
        const rejectBtn = confirmationSection.querySelector('.reject-btn');

        if (confirmOnceBtn) {
          confirmOnceBtn.addEventListener('click', () =>
            handleFunctionConfirmation(callContainer, true),
          );
        }

        if (rejectBtn) {
          rejectBtn.addEventListener('click', () =>
            handleFunctionConfirmation(callContainer, false),
          );
        }
      }

      // 在这里将确认界面添加到聊天窗口，显示给用户
      chatMessages.appendChild(callContainer);
      scrollToBottom();
      return callContainer;
    }

    // 处理每个函数调用
    callsData.forEach((call, index) => {
      // 找到对应的结果
      const result = data.results ? data.results.find(r => r.tool_call_id === call.id) : null;
      if (!call) return;

      const callElement = document.createElement('div');
      callElement.className = 'function-call-item';

      // 函数名称
      const nameElement = document.createElement('div');
      nameElement.className = 'function-name';
      nameElement.textContent = call.function.name;
      callElement.appendChild(nameElement);

      try {
        // 参数部分
        const paramsElement = document.createElement('pre');
        paramsElement.className = 'function-params';
        const params = JSON.parse(call.function.arguments || '{}');
        paramsElement.textContent = JSON.stringify(params, null, 2);
        callElement.appendChild(paramsElement);

        // 结果部分 (如果有结果)
        if (result) {
          const resultElement = document.createElement('pre');
          resultElement.className = 'function-result';

          try {
            // 尝试解析结果JSON
            const resultObj = JSON.parse(result.result);
            resultElement.textContent = JSON.stringify(resultObj, null, 2);
          } catch (e) {
            // 如果不是JSON，直接显示结果
            resultElement.textContent = result.result;
          }

          callElement.appendChild(resultElement);
        }
      } catch (error) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = `解析失败: ${error.message}`;
        callElement.appendChild(errorElement);
      }

      callContainer.appendChild(callElement);
    });

    chatMessages.appendChild(callContainer);
    scrollToBottom();

    return callContainer;
  }

  // 处理用户对函数调用的确认或拒绝
  async function handleFunctionConfirmation(callContainer, isConfirmed) {
    if (!callContainer || !callContainer.dataset.callData) return;

    // 删除确认按钮部分
    const confirmationSection = callContainer.querySelector('.function-confirmation');
    if (confirmationSection) {
      confirmationSection.remove();
    }

    // 如果拒绝，则显示拒绝消息并返回
    if (!isConfirmed) {
      const rejectionMsg = document.createElement('div');
      rejectionMsg.className = 'function-rejection';
      rejectionMsg.textContent = '您已拒绝此函数调用';
      callContainer.insertBefore(rejectionMsg, callContainer.firstChild);
      return;
    }

    // 移除确认样式
    callContainer.classList.remove('function-confirmation-needed');

    // 显示执行中状态
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'function-executing';
    loadingMsg.textContent = '正在执行函数调用...';
    callContainer.insertBefore(loadingMsg, callContainer.firstChild);

    try {
      // 获取调用数据
      const data = JSON.parse(callContainer.dataset.callData);
      const callsData = data.calls || data.function_calls;

      if (!callsData || !callsData.length) throw new Error('无效的函数调用数据');

      // 执行函数调用
      if (!sessionId) throw new Error('会话无效');

      try {
        // 尝试调用新的API
        console.log('尝试调用execute-function API...');
        // 注意：后端需要实现此API端点来处理用户确认后的函数调用
        // 该API应接收函数调用数据，执行函数，并返回结果和可能的模型最终回答
        const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/execute-function`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify({
            function_calls: callsData,
          }),
        });

        if (!response.ok) {
          // 如果API不存在或返回错误，我们尝试使用旧的调用方式
          if (response.status === 404) {
            throw new Error('API不存在，尝试旧方法');
          }
          throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        // 移除执行中消息
        loadingMsg.remove();

        if (result.success) {
          // 清空当前容器内容
          callContainer.innerHTML = '';

          // 显示函数调用结果
          const resultData = {
            calls: callsData,
            results: result.results,
          };

          // 创建新的结果容器
          const resultContainer = document.createElement('div');
          resultContainer.className = 'function-results';

          // 处理每个函数调用的结果
          resultData.calls.forEach((call, index) => {
            const result = resultData.results.find(r => r.tool_call_id === call.id);
            if (!call) return;

            const callElement = document.createElement('div');
            callElement.className = 'function-call-item';

            // 函数名称
            const nameElement = document.createElement('div');
            nameElement.className = 'function-name';
            nameElement.textContent = call.function.name;
            callElement.appendChild(nameElement);

            try {
              // 参数部分
              const paramsElement = document.createElement('pre');
              paramsElement.className = 'function-params';
              const params = JSON.parse(call.function.arguments || '{}');
              paramsElement.textContent = JSON.stringify(params, null, 2);
              callElement.appendChild(paramsElement);

              // 结果部分
              if (result) {
                const resultElement = document.createElement('pre');
                resultElement.className = 'function-result';

                try {
                  // 尝试解析结果JSON
                  const resultObj = JSON.parse(result.result);
                  resultElement.textContent = JSON.stringify(resultObj, null, 2);
                } catch (e) {
                  // 如果不是JSON，直接显示结果
                  resultElement.textContent = result.result;
                }

                callElement.appendChild(resultElement);
              }
            } catch (error) {
              const errorElement = document.createElement('div');
              errorElement.className = 'error-message';
              errorElement.textContent = `解析失败: ${error.message}`;
              callElement.appendChild(errorElement);
            }

            resultContainer.appendChild(callElement);
          });

          // 将结果容器替换原始容器
          callContainer.parentNode.replaceChild(resultContainer, callContainer);

          // 如果有最终回答，显示它
          if (result.final_response) {
            addAssistantMessage(result.final_response);
          }
        } else {
          // 显示错误消息
          const errorMsg = document.createElement('div');
          errorMsg.className = 'function-error';
          errorMsg.textContent = `执行失败: ${result.error || '未知错误'}`;
          callContainer.insertBefore(errorMsg, callContainer.firstChild);
        }
      } catch (apiError) {
        console.warn('API调用出错:', apiError);

        // 如果API不存在或返回错误，我们使用旧的方式调用单个函数
        // 对于每个函数调用，直接调用工具API
        const resultsPromises = callsData.map(async call => {
          if (!call.function) return null;

          const functionName = call.function.name;
          let functionParams = {};
          try {
            functionParams = JSON.parse(call.function.arguments || '{}');
          } catch (e) {
            console.error('解析参数失败:', e);
          }

          console.log(`回退方案：直接调用工具 ${functionName}`, functionParams);

          try {
            // 调用工具API
            const toolResponse = await fetch(`${API_BASE_URL}/tools/execute`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sessionId,
              },
              body: JSON.stringify({
                tool: functionName,
                params: functionParams,
              }),
            });

            if (!toolResponse.ok) {
              throw new Error(`工具执行失败: ${toolResponse.status} ${toolResponse.statusText}`);
            }

            const toolResult = await toolResponse.json();

            return {
              tool_call_id: call.id,
              function_name: functionName,
              result:
                typeof toolResult.result === 'object'
                  ? JSON.stringify(toolResult.result)
                  : toolResult.result,
            };
          } catch (toolError) {
            console.error(`工具 ${functionName} 执行失败:`, toolError);
            return {
              tool_call_id: call.id,
              function_name: functionName,
              result: JSON.stringify({ error: toolError.message }),
            };
          }
        });

        // 等待所有工具执行完成
        const results = await Promise.all(resultsPromises);
        const validResults = results.filter(r => r !== null);

        // 移除执行中消息
        loadingMsg.remove();

        if (validResults.length > 0) {
          // 清空当前容器内容
          callContainer.innerHTML = '';

          // 显示函数调用结果
          const resultData = {
            calls: callsData,
            results: validResults,
          };

          // 创建新的结果容器
          const resultContainer = document.createElement('div');
          resultContainer.className = 'function-results';

          // 处理每个函数调用的结果
          resultData.calls.forEach((call, index) => {
            const result = resultData.results.find(r => r.tool_call_id === call.id);
            if (!call || !result) return;

            const callElement = document.createElement('div');
            callElement.className = 'function-call-item';

            // 函数名称
            const nameElement = document.createElement('div');
            nameElement.className = 'function-name';
            nameElement.textContent = call.function.name;
            callElement.appendChild(nameElement);

            try {
              // 参数部分
              const paramsElement = document.createElement('pre');
              paramsElement.className = 'function-params';
              const params = JSON.parse(call.function.arguments || '{}');
              paramsElement.textContent = JSON.stringify(params, null, 2);
              callElement.appendChild(paramsElement);

              // 结果部分
              const resultElement = document.createElement('pre');
              resultElement.className = 'function-result';

              try {
                // 尝试解析结果JSON
                const resultObj = JSON.parse(result.result);
                resultElement.textContent = JSON.stringify(resultObj, null, 2);
              } catch (e) {
                // 如果不是JSON，直接显示结果
                resultElement.textContent = result.result;
              }

              callElement.appendChild(resultElement);
            } catch (error) {
              const errorElement = document.createElement('div');
              errorElement.className = 'error-message';
              errorElement.textContent = `解析失败: ${error.message}`;
              callElement.appendChild(errorElement);
            }

            resultContainer.appendChild(callElement);
          });

          // 将结果容器替换原始容器
          callContainer.parentNode.replaceChild(resultContainer, callContainer);

          // 执行函数调用后，将结果再发送给AI获取最终回答
          try {
            console.log('将工具结果发送给AI生成最终回答...');
            const finalResponse = await fetch(
              `${API_BASE_URL}/sessions/${sessionId}/tool-results`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Session-ID': sessionId,
                },
                body: JSON.stringify({
                  function_calls: callsData,
                  results: validResults,
                }),
              },
            );

            if (finalResponse.ok) {
              const finalData = await finalResponse.json();
              if (finalData.success && finalData.response) {
                // 添加AI最终回答
                addAssistantMessage(finalData.response);
              }
            }
          } catch (finalError) {
            console.error('获取AI最终回答失败:', finalError);
          }
        } else {
          // 显示错误消息
          const errorMsg = document.createElement('div');
          errorMsg.className = 'function-error';
          errorMsg.textContent = `所有工具执行失败`;
          callContainer.insertBefore(errorMsg, callContainer.firstChild);
        }
      }
    } catch (error) {
      // 显示错误信息
      console.error('执行函数调用失败:', error);
      loadingMsg.className = 'function-error';
      loadingMsg.textContent = `执行失败: ${error.message}`;
    }
  }

  // 格式化消息，处理代码块
  function formatMessage(message) {
    // 简单的代码块检测和转换
    let formatted = message;

    // 替换代码块
    formatted = formatted.replace(
      /```([a-z]*)\n([\s\S]*?)\n```/g,
      function (match, language, code) {
        return `<pre><code>${code}</code></pre>`;
      },
    );

    // 替换换行符
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  // 获取当前时间 (HH:MM)
  function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // 滚动到底部
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  return {
    init,
    checkChatAvailability,
  };
})();

// Function Call测试模块
const functionTestModule = (() => {
  // DOM元素
  const functionTestStatus = document.getElementById('function-test-status');
  const functionTestMessage = document.getElementById('function-test-message');
  const runFunctionTestBtn = document.getElementById('run-function-test');
  const clearFunctionTestBtn = document.getElementById('clear-function-test');
  const functionTestOutput = document.getElementById('function-test-output');
  const executeTestBtn = document.getElementById('execute-function-test');

  // 状态变量
  let isLoading = false;
  let lastFunctionCallData = null;

  // 初始化
  function init() {
    setupEventListeners();
    checkAvailability();
  }

  // 设置事件监听
  function setupEventListeners() {
    runFunctionTestBtn.addEventListener('click', runTest);
    clearFunctionTestBtn.addEventListener('click', clearResults);

    // 如果有执行按钮，添加监听器
    if (executeTestBtn) {
      executeTestBtn.addEventListener('click', executeLastFunctionCall);
    } else {
      // 如果按钮不存在，创建一个
      const executeBtn = document.createElement('button');
      executeBtn.id = 'execute-function-test';
      executeBtn.className = 'btn btn-primary';
      executeBtn.textContent = '执行函数调用';
      executeBtn.disabled = true;
      executeBtn.addEventListener('click', executeLastFunctionCall);

      // 添加到适当位置
      const testControls = document.querySelector('.test-controls');
      if (testControls) {
        testControls.appendChild(executeBtn);
      }
    }

    // 注册MCP连接/断开事件监听
    eventBus.on('mcps-updated', checkAvailability);
  }

  // 执行最后一次函数调用
  async function executeLastFunctionCall() {
    if (
      !lastFunctionCallData ||
      !lastFunctionCallData.calls ||
      lastFunctionCallData.calls.length === 0
    ) {
      addOutputMessage('没有可执行的函数调用', 'error');
      return;
    }

    const currentSessionId = sessionManager.getSessionId();
    if (!currentSessionId) {
      addOutputMessage('会话ID无效', 'error');
      return;
    }

    // 显示执行中状态
    addOutputMessage('正在执行函数调用...');
    executeTestBtn.disabled = true;

    try {
      const response = await fetch(
        `${API_BASE_URL}/sessions/${currentSessionId}/execute-function`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': currentSessionId,
          },
          body: JSON.stringify({
            function_calls: lastFunctionCallData.calls,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        addOutputMessage('函数调用执行成功', 'success');

        // 显示结果
        const resultBlock = document.createElement('div');
        resultBlock.className = 'response-block';
        resultBlock.innerHTML = '<h4>执行结果:</h4>';

        // 显示每个函数调用的结果
        result.results.forEach((functionResult, index) => {
          const resultElement = document.createElement('div');
          resultElement.className = 'function-result';

          // 尝试格式化JSON结果
          let formattedResult = '';
          try {
            const jsonResult = JSON.parse(functionResult.result);
            formattedResult = JSON.stringify(jsonResult, null, 2);
          } catch (e) {
            formattedResult = functionResult.result;
          }

          resultElement.innerHTML = `
            <div class="result-id">结果 #${index + 1}</div>
            <pre>${formattedResult}</pre>
          `;

          resultBlock.appendChild(resultElement);
        });

        functionTestOutput.appendChild(resultBlock);

        // 如果有最终回答，显示它
        if (result.final_response) {
          const finalResponseBlock = document.createElement('div');
          finalResponseBlock.className = 'final-response';
          finalResponseBlock.innerHTML = `
            <h4>AI最终回答:</h4>
            <div class="response-content">${formatMessage(result.final_response)}</div>
          `;
          functionTestOutput.appendChild(finalResponseBlock);
        }

        // 清除最后的函数调用数据
        lastFunctionCallData = null;
        executeTestBtn.disabled = true;
      } else {
        throw new Error(result.error || '执行失败');
      }
    } catch (error) {
      console.error('执行函数调用失败:', error);
      addOutputMessage(`执行失败: ${error.message}`, 'error');
    } finally {
      executeTestBtn.disabled = !lastFunctionCallData;
    }
  }

  // 检查可用性
  function checkAvailability() {
    if (!sessionId) {
      disableTest('无会话ID');
      return;
    }

    const mcps = mcpManager.getAllMcps();

    if (Object.keys(mcps).length > 0) {
      enableTest();
    } else {
      disableTest('等待连接MCP服务');
    }
  }

  // 启用测试
  function enableTest() {
    functionTestMessage.disabled = false;
    runFunctionTestBtn.disabled = false;
    functionTestStatus.textContent = '已连接';
    functionTestStatus.classList.add('connected');
  }

  // 禁用测试
  function disableTest(message) {
    functionTestMessage.disabled = true;
    runFunctionTestBtn.disabled = true;
    functionTestStatus.textContent = message || '未连接';
    functionTestStatus.classList.remove('connected');
  }

  // 运行测试
  async function runTest() {
    const message = functionTestMessage.value.trim();
    if (!message || isLoading) return;

    const currentSessionId = sessionManager.getSessionId();
    if (!currentSessionId) {
      addOutputMessage('未找到会话，请重新连接', 'error');
      return;
    }

    // 禁用输入和运行按钮
    isLoading = true;
    functionTestMessage.disabled = true;
    runFunctionTestBtn.disabled = true;

    clearResults();
    addOutputMessage('正在向OpenAI发送请求...');

    try {
      const response = await fetch('/api/test/function-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        displayTestResult(data.response);

        // 如果是函数调用，保存它并启用执行按钮
        if (
          data.response.type === 'function_call' &&
          data.response.calls &&
          data.response.calls.length > 0
        ) {
          lastFunctionCallData = data.response;
          if (executeTestBtn) executeTestBtn.disabled = false;
        } else {
          lastFunctionCallData = null;
          if (executeTestBtn) executeTestBtn.disabled = true;
        }
      } else {
        addOutputMessage(`错误: ${data.error || '未知错误'}`, 'error');
      }
    } catch (error) {
      console.error('函数调用测试失败:', error);
      addOutputMessage(`测试失败: ${error.message}`, 'error');
    } finally {
      // 恢复输入和运行按钮
      isLoading = false;
      functionTestMessage.disabled = false;
      runFunctionTestBtn.disabled = false;
    }
  }

  // 清除结果
  function clearResults() {
    functionTestOutput.innerHTML = '';
    lastFunctionCallData = null;
    if (executeTestBtn) executeTestBtn.disabled = true;
  }

  // 添加输出消息
  function addOutputMessage(message, type = 'info') {
    const messageElement = document.createElement('div');
    messageElement.className = `system-message ${type}`;
    messageElement.textContent = message;
    functionTestOutput.appendChild(messageElement);
  }

  // 显示测试结果
  function displayTestResult(response) {
    if (response.type === 'text') {
      // 显示文本响应
      const responseBlock = document.createElement('div');
      responseBlock.className = 'response-block';

      const responseTitle = document.createElement('div');
      responseTitle.className = 'response-title';
      responseTitle.textContent = 'AI响应:';

      const responseContent = document.createElement('div');
      responseContent.className = 'response-content';
      responseContent.textContent = response.content;

      responseBlock.appendChild(responseTitle);
      responseBlock.appendChild(responseContent);
      functionTestOutput.appendChild(responseBlock);
    } else if (response.type === 'function_call') {
      // 显示函数调用
      const responseBlock = document.createElement('div');
      responseBlock.className = 'response-block';

      const responseTitle = document.createElement('div');
      responseTitle.className = 'response-title';
      responseTitle.textContent = 'AI请求调用函数:';
      responseBlock.appendChild(responseTitle);

      // 显示所有工具调用
      response.calls.forEach((call, index) => {
        if (call.type === 'function') {
          const toolCall = document.createElement('div');
          toolCall.className = 'tool-call';

          // 工具名称
          const toolName = document.createElement('div');
          toolName.className = 'tool-name';
          toolName.textContent = `工具: ${call.function.name}`;
          toolCall.appendChild(toolName);

          // 参数
          try {
            let argsDisplay;
            try {
              // 如果参数是字符串，尝试解析为JSON并格式化
              const args = JSON.parse(call.function.arguments);
              argsDisplay = JSON.stringify(args, null, 2);
            } catch (e) {
              // 如果解析失败，直接使用原始字符串
              argsDisplay = call.function.arguments;
            }

            const argsEl = document.createElement('div');
            argsEl.className = 'tool-args';
            argsEl.innerHTML = `<div class="tool-section-title">参数:</div><pre>${argsDisplay}</pre>`;
            toolCall.appendChild(argsEl);
          } catch (e) {
            console.error('解析参数失败:', e);
          }

          // 结果
          const result = response.results && response.results.find(r => r.tool_call_id === call.id);
          if (result) {
            const resultEl = document.createElement('div');
            resultEl.className = 'tool-result';
            resultEl.innerHTML = '<div class="tool-section-title">结果:</div>';

            let resultDisplay;
            try {
              // 尝试解析结果为JSON并格式化
              const resultValue = JSON.parse(result.result);

              // 处理高德地图API等特殊嵌套结构
              if (
                resultValue.result &&
                resultValue.result.content &&
                Array.isArray(resultValue.result.content)
              ) {
                // 尝试从content中提取text属性中的JSON字符串
                const textContent = resultValue.result.content.find(
                  item => item.type === 'text' && item.text,
                );
                if (textContent && textContent.text) {
                  try {
                    // 尝试解析text字段中的JSON
                    const parsedTextContent = JSON.parse(textContent.text);
                    // 使用解析后的内容替换结果对象
                    resultDisplay = JSON.stringify(parsedTextContent, null, 2);
                  } catch (e) {
                    console.error('解析内嵌text字段JSON失败:', e);
                    // 使用原始解析结果
                    resultDisplay = JSON.stringify(resultValue, null, 2);
                  }
                } else {
                  resultDisplay = JSON.stringify(resultValue, null, 2);
                }
              } else {
                resultDisplay = JSON.stringify(resultValue, null, 2);
              }
            } catch (e) {
              // 如果不是有效的JSON，尝试处理可能是JSON字符串的情况
              if (
                typeof result.result === 'string' &&
                result.result.startsWith('"') &&
                result.result.endsWith('"')
              ) {
                try {
                  // 去掉外层引号并尝试解析
                  const unquoted = result.result.slice(1, -1).replace(/\\"/g, '"');
                  const parsed = JSON.parse(unquoted);

                  // 同样检查嵌套结构
                  if (
                    parsed.result &&
                    parsed.result.content &&
                    Array.isArray(parsed.result.content)
                  ) {
                    const textContent = parsed.result.content.find(
                      item => item.type === 'text' && item.text,
                    );
                    if (textContent && textContent.text) {
                      try {
                        const parsedTextContent = JSON.parse(textContent.text);
                        resultDisplay = JSON.stringify(parsedTextContent, null, 2);
                      } catch (e) {
                        console.error('解析内嵌text字段JSON失败:', e);
                        resultDisplay = JSON.stringify(parsed, null, 2);
                      }
                    } else {
                      resultDisplay = JSON.stringify(parsed, null, 2);
                    }
                  } else {
                    resultDisplay = JSON.stringify(parsed, null, 2);
                  }
                } catch (e2) {
                  // 如果仍然失败，显示原始内容
                  resultDisplay = result.result;
                }
              } else {
                // 如果都失败了，直接使用原始结果
                resultDisplay = result.result;
              }
            }

            const resultPre = document.createElement('pre');
            resultPre.textContent = resultDisplay;
            resultEl.appendChild(resultPre);
            toolCall.appendChild(resultEl);
          }

          responseBlock.appendChild(toolCall);
        }
      });

      functionTestOutput.appendChild(responseBlock);
    }
  }

  return {
    init,
  };
})();

// Python MCP管理器
const pythonMcpManager = {
  init() {
    this.detectSystemPython();
    this.setupEventListeners();
    this.updatePreview();
    this.checkUvxCommand(); // 添加检查UVX命令
  },

  // 检查UVX命令是否存在
  checkUvxCommand() {
    fetch('/api/mcp/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: 'uvx',
      }),
    })
      .then(response => response.json())
      .then(data => {
        const warningContainer = document.getElementById('uvx-command-warning');
        if (!warningContainer) {
          // 创建警告容器
          const uvxFields = document.getElementById('uvx-fields');
          if (uvxFields) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'uvx-command-warning';
            warningDiv.className = 'command-warning';
            uvxFields.insertBefore(warningDiv, uvxFields.firstChild);
          }
        }

        // 获取警告容器
        const warningDiv = document.getElementById('uvx-command-warning');
        if (warningDiv) {
          if (!data.result.success) {
            warningDiv.innerHTML = `
            <div class="warning-message">
              <strong>警告:</strong> 系统中找不到uvx命令。创建MCP时将自动安装。
              <div class="details">
                <code>安装命令: pip install uvx</code>
              </div>
            </div>
          `;
            warningDiv.style.display = 'block';
          } else {
            warningDiv.innerHTML = `
            <div class="success-message">
              <strong>检测到UVX:</strong> ${data.result.path}
            </div>
          `;
            warningDiv.style.display = 'block';

            // 3秒后隐藏成功消息
            setTimeout(() => {
              warningDiv.style.display = 'none';
            }, 3000);
          }
        }
      })
      .catch(error => {
        console.error('检查UVX命令失败:', error);
      });
  },

  detectSystemPython() {
    // 尝试通过fetch API获取系统信息
    fetch('/api/system/python-paths')
      .then(response => response.json())
      .then(data => {
        if (data.success && data.pythonPaths && data.pythonPaths.length > 0) {
          console.log('检测到系统Python路径:', data.pythonPaths);

          // 找到最匹配的Python路径
          let pythonPath = '';

          // 首先尝试找Homebrew Python路径
          const homebrewPath = data.pythonPaths.find(
            path => path.includes('/opt/homebrew/') || path.includes('/usr/local/bin/python3'),
          );

          if (homebrewPath) {
            pythonPath = homebrewPath;
            console.log('使用Homebrew Python路径:', pythonPath);
          } else {
            // 否则使用第一个可用路径
            pythonPath = data.pythonPaths[0];
            console.log('使用默认Python路径:', pythonPath);
          }

          // 自动填充Python路径
          document.getElementById('custom-python-path').value = pythonPath;

          // 根据Python路径自动设置pip命令
          // 如果是特定Python版本路径，使用python -m pip形式
          let pipCommand = '';
          if (pythonPath.includes('python3') || pythonPath.includes('python@')) {
            pipCommand = `${pythonPath} -m pip`;
          } else {
            // 尝试使用pip3
            pipCommand = 'pip3';
          }

          document.getElementById('custom-pip-path').value = pipCommand;

          // 更新下拉选择框匹配Python路径
          const pythonSelect = document.getElementById('python-version');
          if (pythonPath.includes('python3.13') || pythonPath.includes('python@3.13')) {
            // 如果是Python 3.13，选择特定选项
            pythonSelect.value = '/opt/homebrew/opt/python@3.13/bin/python3.13';
          } else if (pythonPath.includes('python3')) {
            pythonSelect.value = 'python3';
          } else {
            pythonSelect.value = 'python';
          }

          // 更新预览
          this.updatePreview();
        } else {
          console.warn('无法检测到Python路径:', data);
          // 失败时使用默认值
          document.getElementById('custom-python-path').value = '/opt/homebrew/bin/python3';
          document.getElementById('custom-pip-path').value = '/opt/homebrew/bin/python3 -m pip';
          document.getElementById('python-version').value = 'python3';
          this.updatePreview();
        }
      })
      .catch(error => {
        console.error('获取Python路径失败:', error);
        // 失败时使用Homebrew常见路径
        document.getElementById('custom-python-path').value = '/opt/homebrew/bin/python3';
        document.getElementById('custom-pip-path').value = '/opt/homebrew/bin/python3 -m pip';
        document.getElementById('python-version').value = 'python3';
        this.updatePreview();
      });
  },

  setupEventListeners() {
    const nameInput = document.getElementById('python-server-name');
    const packageInput = document.getElementById('python-package-name');
    const moduleInput = document.getElementById('python-module-name');
    const extraArgsInput = document.getElementById('python-extra-args');
    const pythonVersionSelect = document.getElementById('python-version');
    const customPythonPath = document.getElementById('custom-python-path');
    const pipCommandSelect = document.getElementById('pip-command');
    const customPipPath = document.getElementById('custom-pip-path');
    const createButton = document.getElementById('create-python-mcp-btn');
    const commandTypeSelect = document.getElementById('command-type');
    const uvxPackageInput = document.getElementById('uvx-package');

    // 命令类型切换
    commandTypeSelect.addEventListener('change', () => {
      const commandType = commandTypeSelect.value;

      // 显示/隐藏相应的表单字段
      if (commandType === 'python') {
        document.getElementById('python-fields').style.display = 'block';
        document.getElementById('uvx-fields').style.display = 'none';
      } else if (commandType === 'uvx') {
        document.getElementById('python-fields').style.display = 'none';
        document.getElementById('uvx-fields').style.display = 'block';
        // 切换到UVX模式时检查UVX命令
        this.checkUvxCommand();
      }

      this.updatePreview();
    });

    // 添加更新预览的事件监听器
    [
      nameInput,
      packageInput,
      moduleInput,
      extraArgsInput,
      pythonVersionSelect,
      customPythonPath,
      pipCommandSelect,
      customPipPath,
      uvxPackageInput,
      commandTypeSelect,
    ].forEach(el => {
      el.addEventListener('input', () => this.updatePreview());
      el.addEventListener('change', () => this.updatePreview());
    });

    // 当Python选择变更时，自动更新pip命令
    pythonVersionSelect.addEventListener('change', () => {
      const pythonCmd = pythonVersionSelect.value;
      if (pythonCmd !== 'python' && pythonCmd !== 'python3') {
        // 如果选择了自定义路径，自动更新pip命令使用相同路径
        pipCommandSelect.value = 'python -m pip'; // 设置一个默认值
        customPipPath.value = `${pythonCmd} -m pip`;
      } else if (pythonCmd === 'python3') {
        pipCommandSelect.value = 'python3 -m pip';
        customPipPath.value = '';
      } else {
        pipCommandSelect.value = 'python -m pip';
        customPipPath.value = '';
      }
      this.updatePreview();
    });

    // 添加创建按钮的点击事件
    createButton.addEventListener('click', () => this.createPythonMcp());
  },

  updatePreview() {
    const name = document.getElementById('python-server-name').value.trim() || 'python-mcp';
    const commandType = document.getElementById('command-type').value;
    const extraArgs = document.getElementById('python-extra-args').value.trim();

    // 根据命令类型构建不同的配置
    let config = { mcpServers: {} };

    if (commandType === 'python') {
      const packageName =
        document.getElementById('python-package-name').value.trim() || 'mcp-server-fetch';
      const moduleName =
        document.getElementById('python-module-name').value.trim() || 'mcp_server_fetch';

      // 获取Python命令，优先使用自定义输入
      let pythonCommand = document.getElementById('custom-python-path').value.trim();
      if (!pythonCommand) {
        pythonCommand = document.getElementById('python-version').value;
      }

      // 获取Pip命令，优先使用自定义输入
      let pipCommand = document.getElementById('custom-pip-path').value.trim();
      if (!pipCommand) {
        pipCommand = document.getElementById('pip-command').value;
      }

      // 准备参数数组
      const args = ['-m', moduleName];

      // 添加额外参数
      if (extraArgs) {
        extraArgs.split('\n').forEach(arg => {
          if (arg.trim()) {
            args.push(arg.trim());
          }
        });
      }

      // 解析pip命令为命令和参数
      let pipSetupCommand, pipSetupArgs;
      if (pipCommand.includes(' ')) {
        // 处理像 "python -m pip" 这样的命令
        const parts = pipCommand.split(' ');
        pipSetupCommand = parts[0];
        pipSetupArgs = parts.slice(1).concat(['install', packageName]);
      } else {
        // 处理简单命令如 "pip" 或 "pip3"
        pipSetupCommand = pipCommand;
        pipSetupArgs = ['install', packageName];
      }

      // 创建Python模式的配置对象
      config.mcpServers[name] = {
        command: pythonCommand,
        args: args,
        description: `Python ${packageName} MCP服务器`,
        setup: {
          command: pipSetupCommand,
          args: pipSetupArgs,
          description: `安装${packageName}包`,
        },
      };
    } else if (commandType === 'uvx') {
      const uvxPackage = document.getElementById('uvx-package').value.trim() || 'mcp-server-time';

      // 准备参数数组
      const args = [uvxPackage];

      // 添加额外参数
      if (extraArgs) {
        extraArgs.split('\n').forEach(arg => {
          if (arg.trim()) {
            args.push(arg.trim());
          }
        });
      }

      // 创建UVX模式的配置对象
      config.mcpServers[name] = {
        command: 'uvx',
        args: args,
        description: `UVX ${uvxPackage} MCP服务器`,
        setup: {
          command: 'pip',
          args: ['install', 'uvx'],
          description: `安装UVX命令`,
        },
      };
    }

    // 更新预览
    document.getElementById('python-config-preview').textContent = JSON.stringify(config, null, 2);
  },

  createPythonMcp() {
    const name = document.getElementById('python-server-name').value.trim();
    const commandType = document.getElementById('command-type').value;
    const extraArgs = document.getElementById('python-extra-args').value.trim();

    // 验证名称
    if (!name) {
      toastManager.showToast('请填写MCP名称', 'error');
      return;
    }

    // 验证会话ID
    if (!sessionId) {
      toastManager.showToast('请先创建会话', 'error');
      return;
    }

    // 根据命令类型构建不同的配置
    let payload = {
      sessionId,
      name,
      clientType: 'stdio',
    };

    if (commandType === 'python') {
      const packageName = document.getElementById('python-package-name').value.trim();
      const moduleName = document.getElementById('python-module-name').value.trim();

      // 验证必填字段
      if (!packageName || !moduleName) {
        toastManager.showToast('请填写所有必填字段', 'error');
        return;
      }

      // 获取Python命令，优先使用自定义输入
      let pythonCommand = document.getElementById('custom-python-path').value.trim();
      if (!pythonCommand) {
        pythonCommand = document.getElementById('python-version').value;
      }

      // 获取Pip命令，优先使用自定义输入
      let pipCommand = document.getElementById('custom-pip-path').value.trim();
      if (!pipCommand) {
        pipCommand = document.getElementById('pip-command').value;
      }

      // 准备参数数组
      const args = ['-m', moduleName];

      // 添加额外参数
      if (extraArgs) {
        extraArgs.split('\n').forEach(arg => {
          if (arg.trim()) {
            args.push(arg.trim());
          }
        });
      }

      // 解析pip命令为命令和参数
      let pipSetupCommand, pipSetupArgs;
      if (pipCommand.includes(' ')) {
        // 处理像 "python -m pip" 这样的命令
        const parts = pipCommand.split(' ');
        pipSetupCommand = parts[0];
        pipSetupArgs = parts.slice(1).concat(['install', packageName]);
      } else {
        // 处理简单命令如 "pip" 或 "pip3"
        pipSetupCommand = pipCommand;
        pipSetupArgs = ['install', packageName];
      }

      // 设置Python模式的配置
      payload.command = pythonCommand;
      payload.args = args;
      payload.description = `Python ${packageName} MCP服务器`;
      payload.setup = {
        command: pipSetupCommand,
        args: pipSetupArgs,
        description: `安装${packageName}包`,
      };
    } else if (commandType === 'uvx') {
      const uvxPackage = document.getElementById('uvx-package').value.trim();

      // 验证必填字段
      if (!uvxPackage) {
        toastManager.showToast('请填写UVX包名', 'error');
        return;
      }

      // 准备参数数组
      const args = [uvxPackage];

      // 添加额外参数
      if (extraArgs) {
        extraArgs.split('\n').forEach(arg => {
          if (arg.trim()) {
            args.push(arg.trim());
          }
        });
      }

      // 设置UVX模式的配置
      payload.command = 'uvx';
      payload.args = args;
      payload.description = `UVX ${uvxPackage} MCP服务器`;

      // 添加UVX的安装过程
      payload.setup = {
        command: 'pip',
        args: ['install', 'uvx'],
        description: `安装UVX命令`,
      };
    }

    console.log('准备发送的Python/UVX MCP payload:', JSON.stringify(payload, null, 2));

    // 显示加载状态
    document.getElementById('create-python-mcp-btn').disabled = true;
    toastManager.showToast(
      `正在创建 ${commandType.toUpperCase()} MCP 服务器，这可能需要一些时间...`,
      'info',
    );

    // 发送请求
    mcpManager
      .addMcp(payload)
      .then(mcp => {
        toastManager.showToast(
          `${commandType.toUpperCase()} MCP 服务器 "${name}" 已成功创建`,
          'success',
        );

        // 手动触发checkChatAvailability，确保聊天功能被启用
        if (chatModule && typeof chatModule.checkChatAvailability === 'function') {
          chatModule.checkChatAvailability();
        }

        // 切换到列表标签页
        switchTab('list-mcp');
      })
      .catch(error => {
        console.error(`创建 ${commandType.toUpperCase()} MCP 服务器失败:`, error);

        // 构建更友好的错误消息
        let errorMsg = error.message || '未知错误';

        // 添加提示信息
        if (
          errorMsg.includes('ENOENT') ||
          errorMsg.includes('找不到命令') ||
          errorMsg.includes('not found')
        ) {
          if (commandType === 'python') {
            if (errorMsg.includes('pip') || errorMsg.includes('pip3')) {
              errorMsg += '\n\n建议: 请尝试选择其他pip命令，如 "python -m pip" 或 "python3 -m pip"';
            } else if (errorMsg.includes('python')) {
              errorMsg += '\n\n建议: 请确认Python已正确安装，并设置了正确的PATH环境变量';
            }
          } else if (commandType === 'uvx') {
            errorMsg += '\n\n建议: 请确认uvx已正确安装，可通过 "pip install uvx" 进行安装';
          }
        } else if (errorMsg.includes('Permission denied') || errorMsg.includes('权限不足')) {
          errorMsg += '\n\n建议: 请尝试以管理员权限运行服务器，或使用 "--user" 选项';
        } else if (errorMsg.includes('无法安装') || errorMsg.includes('Could not find a version')) {
          if (commandType === 'python') {
            const packageName = document.getElementById('python-package-name').value.trim();
            errorMsg += '\n\n建议: 请检查包名 "' + packageName + '" 是否正确，网络是否正常';
          } else if (commandType === 'uvx') {
            const uvxPackage = document.getElementById('uvx-package').value.trim();
            errorMsg += '\n\n建议: 请检查包名 "' + uvxPackage + '" 是否正确，网络是否正常';
          }
        }

        // 显示错误消息
        toastManager.showToast(`创建失败: ${errorMsg}`, 'error', 10000); // 显示10秒
      })
      .finally(() => {
        document.getElementById('create-python-mcp-btn').disabled = false;
      });
  },
};

// Git MCP管理器
const gitMcpManager = {
  init() {
    this.setupEventListeners();
    this.updatePreview();
    this.checkGitCommand(); // 添加对git命令的检查
  },

  // 检查git命令是否存在
  checkGitCommand() {
    fetch('/api/mcp/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        command: 'git',
      }),
    })
      .then(response => response.json())
      .then(data => {
        const warningContainer = document.getElementById('git-command-warning');
        if (!warningContainer) {
          // 创建警告容器
          const gitForm = document.getElementById('git-mcp-form');
          if (gitForm) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'git-command-warning';
            warningDiv.className = 'command-warning';
            gitForm.insertBefore(warningDiv, gitForm.firstChild);
          }
        }

        // 获取警告容器
        const warningDiv = document.getElementById('git-command-warning');
        if (warningDiv) {
          if (!data.result.success) {
            warningDiv.innerHTML = `
            <div class="warning-message">
              <strong>警告:</strong> 系统中找不到git命令。请确保已安装Git并添加到PATH环境变量中。
              <div class="details">
                <code>PATH=${data.env.PATH}</code>
              </div>
            </div>
          `;
            warningDiv.style.display = 'block';
          } else {
            warningDiv.innerHTML = `
            <div class="success-message">
              <strong>检测到Git:</strong> ${data.result.path}
            </div>
          `;
            warningDiv.style.display = 'block';

            // 3秒后隐藏成功消息
            setTimeout(() => {
              warningDiv.style.display = 'none';
            }, 3000);
          }
        }
      })
      .catch(error => {
        console.error('检查Git命令失败:', error);
      });
  },

  setupEventListeners() {
    const nameInput = document.getElementById('git-mcp-name');
    const repoUrlInput = document.getElementById('git-repo-url');
    const repoTokenInput = document.getElementById('git-repo-token');
    const runScriptInput = document.getElementById('git-run-script');
    const scriptTypeSelect = document.getElementById('git-script-type');
    const extraArgsInput = document.getElementById('git-extra-args');
    const createButton = document.getElementById('create-git-mcp-btn');

    // 添加更新预览的事件监听器
    [
      nameInput,
      repoUrlInput,
      repoTokenInput,
      runScriptInput,
      scriptTypeSelect,
      extraArgsInput,
    ].forEach(el => {
      el.addEventListener('input', () => this.updatePreview());
      el.addEventListener('change', () => this.updatePreview());
    });

    // 当脚本类型变更时更新预览
    scriptTypeSelect.addEventListener('change', () => {
      this.updatePreview();
    });

    // 添加创建按钮的点击事件
    createButton.addEventListener('click', () => this.createGitMcp());
  },

  updatePreview() {
    const name = document.getElementById('git-mcp-name').value.trim() || 'my-git-mcp';
    const repoUrl =
      document.getElementById('git-repo-url').value.trim() ||
      'https://github.com/username/repo.git';
    const repoToken = document.getElementById('git-repo-token').value.trim();
    const runScript = document.getElementById('git-run-script').value.trim() || 'run.sh';
    const scriptType = document.getElementById('git-script-type').value;
    const extraArgs = document.getElementById('git-extra-args').value.trim();

    // 确定命令类型
    let command = 'sh';
    if (scriptType === 'node') {
      command = 'node';
    } else if (scriptType === 'python') {
      command = 'python';
    }

    // 准备参数数组
    const args = [runScript];

    // 添加额外参数
    if (extraArgs) {
      extraArgs.split('\n').forEach(arg => {
        if (arg.trim()) {
          args.push(arg.trim());
        }
      });
    }

    // 构建Git克隆参数
    const gitArgs = ['clone'];
    // 如果有Token，添加到URL中
    if (repoToken && repoUrl.startsWith('https://')) {
      // 使用Token格式: https://{token}@github.com/...
      const urlWithToken = repoUrl.replace('https://', `https://${repoToken}@`);
      gitArgs.push(urlWithToken);
    } else {
      gitArgs.push(repoUrl);
    }
    // 克隆到当前目录
    gitArgs.push('.');

    // 创建配置对象
    const config = {
      mcpServers: {
        [name]: {
          command: command,
          args: args,
          description: `Git仓库MCP服务`,
          setup: {
            command: 'git',
            args: gitArgs,
            description: '克隆Git仓库',
          },
        },
      },
    };

    // 更新预览
    document.getElementById('git-config-preview').textContent = JSON.stringify(config, null, 2);
  },

  createGitMcp() {
    const name = document.getElementById('git-mcp-name').value.trim();
    const repoUrl = document.getElementById('git-repo-url').value.trim();
    const repoToken = document.getElementById('git-repo-token').value.trim();
    const runScript = document.getElementById('git-run-script').value.trim();
    const scriptType = document.getElementById('git-script-type').value;

    if (!name || !repoUrl || !runScript) {
      toastManager.showToast('请填写所有必填字段', 'error');
      return;
    }

    // 检查sessionId是否存在
    const currentSessionId = sessionManager.getSessionId();
    if (!currentSessionId) {
      toastManager.showToast('请先创建会话', 'error');
      return;
    }

    // 确定命令类型
    let command = 'sh';
    if (scriptType === 'node') {
      command = 'node';
    } else if (scriptType === 'python') {
      command = 'python';
    }

    // 准备参数数组
    const args = [runScript];

    // 添加额外参数
    const extraArgs = document.getElementById('git-extra-args').value.trim();
    if (extraArgs) {
      extraArgs.split('\n').forEach(arg => {
        if (arg.trim()) {
          args.push(arg.trim());
        }
      });
    }

    // 构建Git克隆参数
    const gitArgs = ['clone'];
    // 如果有Token，添加到URL中
    if (repoToken && repoUrl.startsWith('https://')) {
      // 使用Token格式: https://{token}@github.com/...
      const urlWithToken = repoUrl.replace('https://', `https://${repoToken}@`);
      gitArgs.push(urlWithToken);
    } else {
      gitArgs.push(repoUrl);
    }
    // 克隆到当前目录
    gitArgs.push('.');

    // 创建MCP配置 - 使用原始格式，让转换发生在mcpManager.addMcp中
    const mcpConfig = {
      sessionId: currentSessionId,
      name: name,
      clientType: 'stdio',
      command: command,
      args: args,
      description: 'Git仓库MCP服务',
      setup: {
        command: 'git',
        args: gitArgs,
        description: '克隆Git仓库',
      },
    };

    console.log('准备发送的Git MCP payload:', JSON.stringify(mcpConfig, null, 2));

    // 禁用按钮，防止重复提交
    document.getElementById('create-git-mcp-btn').disabled = true;

    // 显示加载提示
    toastManager.showToast('正在创建Git MCP服务...', 'info');

    // 提交请求
    mcpManager
      .addMcp(mcpConfig)
      .then(result => {
        console.log('Git MCP创建成功:', result);
        toastManager.showToast(`Git MCP "${name}" 创建成功`, 'success');

        // 手动触发checkChatAvailability，确保聊天功能被启用
        if (chatModule && typeof chatModule.checkChatAvailability === 'function') {
          chatModule.checkChatAvailability();
        }

        // 切换到MCP列表标签
        switchTab('list-mcp');

        // 清空表单
        document.getElementById('git-mcp-name').value = '';
        document.getElementById('git-repo-url').value = '';
        document.getElementById('git-repo-token').value = '';
        document.getElementById('git-run-script').value = 'run.sh';
        document.getElementById('git-script-type').value = 'shell';
        document.getElementById('git-extra-args').value = '';
        this.updatePreview();
      })
      .catch(error => {
        console.error('Git MCP创建失败:', error);
        toastManager.showToast('Git MCP创建失败: ' + error.message, 'error');
      })
      .finally(() => {
        // 重新启用按钮
        document.getElementById('create-git-mcp-btn').disabled = false;
      });
  },
};

// 初始化标签页切换
function initTabSwitching() {
  console.log('初始化标签页切换');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  if (!tabBtns || !tabContents || tabBtns.length === 0) {
    console.error('无法找到标签页按钮或内容元素');
    return;
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        switchTab(tabId);
      }
    });
  });

  // 为"添加第一个MCP"按钮添加事件监听
  const addFirstMcpBtn = document.querySelector('.add-first-mcp-btn');
  if (addFirstMcpBtn) {
    addFirstMcpBtn.addEventListener('click', () => {
      switchTab('add-mcp');
    });
  }
}

// 切换标签页
function switchTab(tabId) {
  console.log(`切换到标签页: ${tabId}`);

  if (!tabId) {
    console.error('无法切换标签页: 未提供标签页ID');
    return;
  }

  // 获取所有标签页按钮和内容
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  if (!tabBtns || !tabContents) {
    console.error('无法切换标签页: 未找到标签页元素');
    return;
  }

  // 先隐藏所有标签页，移除所有活动状态
  tabBtns.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  // 激活目标标签页
  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetContent = document.getElementById(tabId);

  if (targetBtn && targetContent) {
    targetBtn.classList.add('active');
    targetContent.classList.add('active');

    // 如果切换到MCP列表，尝试重新渲染列表
    if (tabId === 'list-mcp') {
      try {
        renderMcpList();
      } catch (e) {
        console.error('渲染MCP列表失败:', e);
      }
    }
  } else {
    console.error(`无法找到标签页 ${tabId} 的按钮或内容元素`);
  }
}

// 初始化表单监听器
function initFormListeners() {
  console.log('初始化表单监听器');

  // 检查必要的DOM元素是否存在
  const serverTypeSelect = document.getElementById('server-type');
  const serverNameInput = document.getElementById('server-name');
  const serverCommandInput = document.getElementById('server-command');
  const serverArgsInput = document.getElementById('server-args');
  const serverEnvInput = document.getElementById('server-env');
  const serverUrlInput = document.getElementById('server-url');
  const commandGroup = document.getElementById('command-group');
  const argsGroup = document.getElementById('args-group');
  const envGroup = document.getElementById('env-group');
  const urlGroup = document.getElementById('url-group');
  const addMcpBtn = document.getElementById('add-mcp-btn');

  if (
    !serverTypeSelect ||
    !serverNameInput ||
    !serverCommandInput ||
    !serverArgsInput ||
    !serverEnvInput ||
    !serverUrlInput ||
    !commandGroup ||
    !argsGroup ||
    !envGroup ||
    !urlGroup ||
    !addMcpBtn
  ) {
    console.error('初始化表单失败: 某些必要的DOM元素不存在');
    return;
  }

  // 监听服务器类型变化，切换表单
  serverTypeSelect.addEventListener('change', () => {
    const selectedType = serverTypeSelect.value;

    if (selectedType === 'stdio') {
      commandGroup.style.display = 'block';
      argsGroup.style.display = 'block';
      envGroup.style.display = 'block';
      urlGroup.style.display = 'none';
    } else {
      commandGroup.style.display = 'none';
      argsGroup.style.display = 'none';
      envGroup.style.display = 'none';
      urlGroup.style.display = 'block';
    }

    validateForm();
  });

  // 监听输入变化，验证表单
  serverNameInput.addEventListener('input', validateForm);
  serverCommandInput.addEventListener('input', validateForm);
  serverArgsInput.addEventListener('input', validateForm);
  serverEnvInput.addEventListener('input', validateForm);
  serverUrlInput.addEventListener('input', validateForm);

  // 添加MCP按钮点击事件
  addMcpBtn.addEventListener('click', addMcp);
}

// 验证表单
function validateForm() {
  const serverNameInput = document.getElementById('server-name');
  const serverTypeSelect = document.getElementById('server-type');
  const serverCommandInput = document.getElementById('server-command');
  const serverUrlInput = document.getElementById('server-url');
  const addMcpBtn = document.getElementById('add-mcp-btn');

  if (
    !serverNameInput ||
    !serverTypeSelect ||
    !serverCommandInput ||
    !serverUrlInput ||
    !addMcpBtn
  ) {
    console.error('验证表单失败: 某些必要的DOM元素不存在');
    return false;
  }

  const serverName = serverNameInput.value.trim();
  const serverType = serverTypeSelect.value;
  let isValid = !!serverName;

  if (serverType === 'stdio') {
    isValid = isValid && !!serverCommandInput.value.trim();
  } else {
    isValid = isValid && !!serverUrlInput.value.trim();
  }

  addMcpBtn.disabled = !isValid || !sessionId;

  return isValid;
}

// 添加MCP
function addMcp() {
  console.log('尝试添加MCP');

  if (!validateForm() || !sessionId) {
    console.error('表单验证失败或会话ID不存在');
    return;
  }

  const serverNameInput = document.getElementById('server-name');
  const serverTypeSelect = document.getElementById('server-type');
  const serverCommandInput = document.getElementById('server-command');
  const serverArgsInput = document.getElementById('server-args');
  const serverEnvInput = document.getElementById('server-env');
  const serverUrlInput = document.getElementById('server-url');
  const addMcpBtn = document.getElementById('add-mcp-btn');

  if (
    !serverNameInput ||
    !serverTypeSelect ||
    !serverCommandInput ||
    !serverArgsInput ||
    !serverEnvInput ||
    !serverUrlInput ||
    !addMcpBtn
  ) {
    console.error('添加MCP失败: 某些必要的DOM元素不存在');
    return;
  }

  const name = serverNameInput.value;
  const type = serverTypeSelect.value;
  const command = serverCommandInput.value;
  const argsText = serverArgsInput.value;
  const envText = serverEnvInput.value;
  const url = serverUrlInput.value;

  // 解析参数
  const args = argsText.split('\n').filter(arg => arg.trim().length > 0);

  // 解析环境变量
  let env = {};
  if (envText.trim()) {
    try {
      env = JSON.parse(envText);
    } catch (error) {
      // 尝试解析简单的KEY=VALUE格式
      try {
        env = {};
        envText.split('\n').forEach(line => {
          if (line.trim()) {
            const [key, value] = line.split('=');
            if (key && value) {
              env[key.trim()] = value.trim();
            }
          }
        });
      } catch (e) {
        console.error('解析环境变量失败:', e);
        toastManager.showToast('环境变量格式无效', 'error');
        return;
      }
    }
  }

  // 禁用按钮，防止重复提交
  addMcpBtn.disabled = true;

  // 创建MCP配置 - 使用旧格式，在mcpManager.addMcp中转换
  const payload = {
    sessionId,
    name,
    clientType: type,
  };

  // 根据类型添加不同的参数
  if (type === 'stdio') {
    payload.command = command;
    payload.args = args;
    payload.env = env;
    payload.description = `${name} MCP`;
  } else if (type === 'sse') {
    payload.url = url;
    payload.description = `${name} SSE服务`;
  }

  // 发送请求
  mcpManager
    .addMcp(payload)
    .then(data => {
      console.log('MCP添加成功:', data);
      toastManager.showToast(`MCP ${name} 添加成功`, 'success');

      // 清空表单
      serverNameInput.value = '';
      serverCommandInput.value = '';
      serverArgsInput.value = '';
      serverEnvInput.value = '';
      serverUrlInput.value = '';

      // 手动触发checkChatAvailability，确保聊天功能能够被启用
      if (chatModule && typeof chatModule.checkChatAvailability === 'function') {
        chatModule.checkChatAvailability();
      }

      // 切换到列表标签页
      switchTab('list-mcp');
    })
    .catch(error => {
      console.error('添加MCP失败:', error);
      toastManager.showToast(`添加MCP失败: ${error.message}`, 'error');
    })
    .finally(() => {
      // 重新启用按钮
      addMcpBtn.disabled = false;
    });
}

// 重置表单
function resetForm() {
  const serverNameInput = document.getElementById('server-name');
  const serverCommandInput = document.getElementById('server-command');
  const serverArgsInput = document.getElementById('server-args');
  const serverEnvInput = document.getElementById('server-env');
  const serverUrlInput = document.getElementById('server-url');

  if (
    !serverNameInput ||
    !serverCommandInput ||
    !serverArgsInput ||
    !serverEnvInput ||
    !serverUrlInput
  ) {
    console.error('重置表单失败: 某些必要的DOM元素不存在');
    return;
  }

  serverNameInput.value = '';
  serverCommandInput.value = '';
  serverArgsInput.value = '';
  serverEnvInput.value = '';
  serverUrlInput.value = '';
  validateForm();
}

// 恢复会话
function restoreSession() {
  console.log('尝试恢复会话...');

  // 尝试从本地存储中恢复会话ID
  const savedSessionId = localStorage.getItem('mcpSessionId');
  const savedUserId = localStorage.getItem('mcpUserId');

  if (savedSessionId) {
    sessionId = savedSessionId;

    // 确保userId有值
    if (savedUserId && savedUserId !== 'undefined') {
      userId = savedUserId;
    } else {
      // 如果没有用户ID或是undefined，设置为默认值
      userId = 'anonymous';
      localStorage.setItem('mcpUserId', userId);
    }

    console.log(`从本地存储恢复会话: ${sessionId}, 用户ID: ${userId}`);

    // 更新UI
    updateSessionDisplay();

    // 连接WebSocket
    connectWebSocket();

    // 加载MCP列表
    if (mcpManager && typeof mcpManager.loadMcpList === 'function') {
      mcpManager.loadMcpList().catch(error => {
        console.error('加载MCP列表失败:', error);
        // 如果失败，可能是会话已过期，创建新会话
        if (sessionManager && typeof sessionManager.createNewSession === 'function') {
          sessionManager.createNewSession();
        } else {
          console.error('无法创建新会话: sessionManager不可用');
        }
      });
    } else {
      console.error('无法加载MCP列表: mcpManager.loadMcpList不可用');
    }
  } else {
    console.log('没有保存的会话，将创建新会话');
    // 如果没有保存的会话，创建新会话
    if (sessionManager && typeof sessionManager.createNewSession === 'function') {
      sessionManager.createNewSession();
    } else {
      console.error('无法创建新会话: sessionManager不可用');
    }
  }
}

// 连接WebSocket
function connectWebSocket() {
  console.log('尝试连接WebSocket...');

  if (!sessionId) {
    console.error('无法连接WebSocket: 会话ID不存在');
    return;
  }

  if (typeof io !== 'function') {
    console.error('无法连接WebSocket: socket.io不可用');
    return;
  }

  if (socket) {
    console.log('关闭现有的WebSocket连接');
    socket.disconnect();
  }

  try {
    // 使用同样的路径创建socket连接
    socket = io();

    socket.on('connect', () => {
      console.log('WebSocket已连接');
      // 发送加入会话请求，包含sessionId
      socket.emit('join_session', { sessionId: sessionId });
    });

    socket.on('mcp_connected', mcp => {
      console.log('收到MCP连接事件:', mcp);

      if (!Array.isArray(mcpList)) {
        mcpList = [];
      }

      const existingIndex = mcpList.findIndex(m => m.name === mcp.name);

      if (existingIndex >= 0) {
        mcpList[existingIndex] = mcp;
      } else {
        mcpList.push(mcp);
      }

      renderMcpList();

      if (eventBus && typeof eventBus.emit === 'function') {
        eventBus.emit('mcps-updated', mcpList);
      }
    });

    socket.on('mcp_disconnected', data => {
      console.log('收到MCP断开连接事件:', data);

      if (!Array.isArray(mcpList)) {
        return;
      }

      // 查找要断开的MCP
      const index = mcpList.findIndex(m => m.name === data.name);
      if (index >= 0) {
        // 先修改其状态为"断开中"
        mcpList[index].status = 'disconnected';
        renderMcpList();

        // 找到对应的DOM元素添加动画效果
        setTimeout(() => {
          const mcpCard = document.querySelector(`.mcp-card[data-mcp-name="${data.name}"]`);
          if (mcpCard) {
            mcpCard.classList.add('removing');

            // 动画结束后再从列表中移除
            setTimeout(() => {
              mcpList = mcpList.filter(m => m.name !== data.name);
              renderMcpList();

              if (eventBus && typeof eventBus.emit === 'function') {
                eventBus.emit('mcps-updated', mcpList);
              }
            }, 1000); // 与CSS中动画时长匹配
          } else {
            // 如果找不到DOM元素，直接从列表移除
            mcpList = mcpList.filter(m => m.name !== data.name);
            renderMcpList();

            if (eventBus && typeof eventBus.emit === 'function') {
              eventBus.emit('mcps-updated', mcpList);
            }
          }
        }, 500); // 显示断开状态的延迟
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket已断开');
    });

    console.log('WebSocket监听器设置完成');
  } catch (error) {
    console.error('设置WebSocket连接时出错:', error);
  }
}

// 更新会话显示
function updateSessionDisplay() {
  const sessionDisplay = document.getElementById('session-id-display');
  if (!sessionDisplay) {
    console.error('无法更新会话显示: session-id-display元素不存在');
    return;
  }

  if (sessionId) {
    // 创建会话ID显示元素
    const sessionIdSpan = document.createElement('span');
    sessionIdSpan.textContent = `会话ID: ${String(sessionId).slice(0, 8)}...`;

    // 添加分隔符
    const separator = document.createElement('span');
    separator.textContent = ' | ';

    // 创建用户ID显示元素（可点击）
    const userIdSpan = document.createElement('span');
    userIdSpan.classList.add('editable-user-id');
    userIdSpan.title = '点击编辑用户ID';

    if (userId) {
      userIdSpan.textContent = `用户ID: ${String(userId).slice(0, 8)}...`;
    } else {
      userIdSpan.textContent = `用户ID: 未知`;
    }

    // 添加点击事件
    userIdSpan.addEventListener('click', function () {
      const newUserId = prompt('请输入您的用户ID:', userId || '');
      if (newUserId !== null && newUserId.trim() !== '') {
        userId = newUserId.trim();
        localStorage.setItem('mcpUserId', userId);
        updateSessionDisplay();
        toastManager.showToast('用户ID已更新', 'success');
      }
    });

    // 清空现有内容并添加新元素
    sessionDisplay.innerHTML = '';
    sessionDisplay.appendChild(sessionIdSpan);
    sessionDisplay.appendChild(separator);
    sessionDisplay.appendChild(userIdSpan);
  } else {
    sessionDisplay.textContent = '未连接';
  }
}

// 渲染MCP列表
function renderMcpList() {
  console.log('尝试渲染MCP列表...');

  // 查找MCP列表容器
  let mcpListContainer = document.getElementById('mcp-list');
  let emptyState = document.getElementById('empty-state');
  let mcpCountSpan = document.getElementById('mcp-count');

  // 创建实例列表容器（如果不存在）
  let mcpInstancesContainer = document.getElementById('mcp-instances-list');
  let mcpInstancesCountSpan = document.getElementById('mcp-instances-count');

  // 初始化MCP列表（如果尚未初始化）
  if (!Array.isArray(mcpList)) {
    mcpList = [];
    console.log('初始化mcpList为空数组');
  }

  // 获取list-mcp标签页容器
  const listMcpTab = document.getElementById('list-mcp');
  if (!listMcpTab) {
    console.error('渲染MCP列表失败: 找不到list-mcp标签页');
    return;
  }

  // 如果MCP列表容器不存在，创建它
  if (!mcpListContainer) {
    console.log('创建MCP列表容器');
    mcpListContainer = document.createElement('div');
    mcpListContainer.id = 'mcp-list';
    mcpListContainer.className = 'mcp-list';

    // 如果已存在旧容器，先移除
    const oldContainer = listMcpTab.querySelector('.mcp-list');
    if (oldContainer) {
      oldContainer.remove();
    }
  }

  // 创建空状态元素（如果不存在）
  if (!emptyState) {
    console.log('创建空状态元素');
    emptyState = document.createElement('div');
    emptyState.id = 'empty-state';
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-icon">📋</div>
      <div class="empty-text">还没有MCP服务器</div>
      <button class="add-first-mcp-btn">添加第一个MCP</button>
    `;

    // 如果已存在旧容器，先移除
    const oldEmptyState = listMcpTab.querySelector('.empty-state');
    if (oldEmptyState) {
      oldEmptyState.remove();
    }
  }

  // 创建MCP计数元素父容器
  let mcpCountContainer = listMcpTab.querySelector('.mcp-count-container');
  if (!mcpCountContainer) {
    mcpCountContainer = document.createElement('div');
    mcpCountContainer.className = 'mcp-count-container';
    mcpCountContainer.innerHTML = '当前MCP: <span id="mcp-count">0</span>';
  }

  // 创建MCP实例列表容器（如果不存在）
  if (!mcpInstancesContainer) {
    mcpInstancesContainer = document.createElement('div');
    mcpInstancesContainer.id = 'mcp-instances-list';
    mcpInstancesContainer.className = 'mcp-instances-list';
  }

  // 创建MCP实例计数容器（如果不存在）
  let mcpInstancesCountContainer = listMcpTab.querySelector('.mcp-instances-count-container');
  if (!mcpInstancesCountContainer) {
    mcpInstancesCountContainer = document.createElement('div');
    mcpInstancesCountContainer.className = 'mcp-count-container';
    mcpInstancesCountContainer.innerHTML = '可用实例: <span id="mcp-instances-count">0</span>';
  }

  // 创建刷新按钮（如果不存在）
  let refreshBtn = document.getElementById('refresh-instances-btn');
  if (!refreshBtn) {
    refreshBtn = document.createElement('button');
    refreshBtn.id = 'refresh-instances-btn';
    refreshBtn.className = 'btn btn-primary';
    refreshBtn.textContent = '刷新实例列表';
    refreshBtn.addEventListener('click', loadAllMcpInstances);
  }

  // 创建实例列表标题（如果不存在）
  let instancesTitle = listMcpTab.querySelector('.section-title');
  if (!instancesTitle) {
    instancesTitle = document.createElement('h3');
    instancesTitle.textContent = '可用的MCP实例';
    instancesTitle.className = 'section-title';
  }

  // 清空标签页内容并重新添加元素
  listMcpTab.innerHTML = '';
  listMcpTab.appendChild(mcpCountContainer);
  listMcpTab.appendChild(emptyState);
  listMcpTab.appendChild(mcpListContainer);
  listMcpTab.appendChild(instancesTitle);
  listMcpTab.appendChild(mcpInstancesCountContainer);
  listMcpTab.appendChild(refreshBtn);
  listMcpTab.appendChild(mcpInstancesContainer);

  // 重新获取添加到DOM后的元素引用
  mcpCountSpan = document.getElementById('mcp-count');
  mcpInstancesCountSpan = document.getElementById('mcp-instances-count');

  // 为"添加第一个MCP"按钮添加事件监听
  const addFirstMcpBtn = emptyState.querySelector('.add-first-mcp-btn');
  if (addFirstMcpBtn) {
    addFirstMcpBtn.addEventListener('click', () => {
      switchTab('add-mcp');
    });
  }

  // 更新MCP数量显示
  if (mcpCountSpan) {
    mcpCountSpan.textContent = mcpList.length;
  }

  if (mcpList.length === 0) {
    // 显示空状态
    emptyState.style.display = 'flex';
    mcpListContainer.style.display = 'none';
  } else {
    // 隐藏空状态，显示列表容器
    emptyState.style.display = 'none';
    mcpListContainer.style.display = 'flex';

    // 清空现有列表
    mcpListContainer.innerHTML = '';

    // 添加MCP卡片
    mcpList.forEach(mcp => {
      try {
        const mcpCard = document.createElement('div');
        mcpCard.className = 'mcp-card';
        // 添加数据属性用于后续查找
        mcpCard.setAttribute('data-mcp-name', mcp.name);

        // 如果是从其他会话共享来的MCP，添加特殊样式
        if (mcp.isFromOtherSession) {
          mcpCard.classList.add('shared-mcp');
        }

        // 根据状态添加相应的类
        if (mcp.status === 'disconnected') {
          mcpCard.classList.add('disconnecting');
        }

        // 确保mcp.tools是一个数组
        const tools = Array.isArray(mcp.tools) ? mcp.tools : [];

        const toolsList =
          tools.length > 0
            ? tools
                .map(
                  tool => `
          <div class="tool-item" onclick="showToolDialog('${mcp.name}', '${tool.name}')">
            <div class="tool-name">${tool.name}</div>
            <div class="tool-description">${tool.description || '无描述'}</div>
          </div>
        `,
                )
                .join('')
            : '<div class="no-tools">无可用工具</div>';

        mcpCard.innerHTML = `
          <div class="mcp-header">
            <div class="mcp-name">${mcp.name}</div>
            <div class="mcp-type">${mcp.clientType}</div>
            ${mcp.isFromOtherSession ? '<div class="mcp-shared-badge">共享</div>' : ''}
          </div>
          <div class="mcp-status">
            <span class="status-label">状态:</span>
            <span class="status-value ${
              mcp.status === 'connected' || mcp.status === 'ready'
                ? 'status-running'
                : mcp.status === 'disconnected'
                ? 'status-disconnecting'
                : 'status-error'
            }">${
          mcp.status === 'connected' || mcp.status === 'ready'
            ? '运行中'
            : mcp.status === 'disconnected'
            ? '断开中'
            : '异常'
        }</span>
          </div>
          <div class="mcp-details">
            ${mcp.url ? `<div class="mcp-url">URL: ${mcp.url}</div>` : ''}
            ${
              mcp.command
                ? `<div class="mcp-command">命令: ${mcp.command} ${
                    Array.isArray(mcp.args) ? mcp.args.join(' ') : ''
                  }</div>`
                : ''
            }
          </div>
          <div class="mcp-tools">
            <div class="tools-header">可用工具:</div>
            <div class="tools-list">
              ${toolsList}
            </div>
          </div>
          <div class="mcp-actions">
            <button class="reconnect-btn" onclick="reconnectMcp(${JSON.stringify(mcp).replace(
              /"/g,
              '&quot;',
            )})">重新连接</button>
            <button class="delete-btn" onclick="deleteMcp(${JSON.stringify(mcp).replace(
              /"/g,
              '&quot;',
            )})">断开连接</button>
          </div>
        `;

        mcpListContainer.appendChild(mcpCard);
      } catch (error) {
        console.error('渲染MCP卡片时出错:', error, mcp);
      }
    });
  }

  // 加载所有可用的MCP实例
  // 使用setTimeout确保DOM已经完全渲染
  setTimeout(() => {
    loadAllMcpInstances();
  }, 100);

  console.log('MCP列表渲染完成');
}

// 加载并显示所有可用的MCP实例
function loadAllMcpInstances() {
  // 确保容器存在
  let mcpInstancesContainer = document.getElementById('mcp-instances-list');
  const mcpInstancesCountSpan = document.getElementById('mcp-instances-count');

  // 如果容器不存在，尝试找到list-mcp标签页并创建容器
  if (!mcpInstancesContainer) {
    console.log('MCP实例列表容器不存在，尝试创建...');
    const listMcpTab = document.getElementById('list-mcp');

    if (listMcpTab) {
      // 创建MCP实例列表容器
      mcpInstancesContainer = document.createElement('div');
      mcpInstancesContainer.id = 'mcp-instances-list';
      mcpInstancesContainer.className = 'mcp-instances-list';

      // 创建标题（如果不存在）
      if (!document.querySelector('.section-title')) {
        const instancesTitle = document.createElement('h3');
        instancesTitle.textContent = '可用的MCP实例';
        instancesTitle.className = 'section-title';
        listMcpTab.appendChild(instancesTitle);
      }

      // 创建实例计数容器（如果不存在）
      if (!document.getElementById('mcp-instances-count')) {
        const mcpInstancesCountContainer = document.createElement('div');
        mcpInstancesCountContainer.className = 'mcp-count-container';
        mcpInstancesCountContainer.innerHTML = '可用实例: <span id="mcp-instances-count">0</span>';
        listMcpTab.appendChild(mcpInstancesCountContainer);
      }

      // 创建刷新按钮（如果不存在）
      if (!document.getElementById('refresh-instances-btn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-instances-btn';
        refreshBtn.className = 'btn btn-primary';
        refreshBtn.textContent = '刷新实例列表';
        refreshBtn.addEventListener('click', loadAllMcpInstances);
        listMcpTab.appendChild(refreshBtn);
      }

      // 添加容器到页面
      listMcpTab.appendChild(mcpInstancesContainer);
      console.log('成功创建MCP实例列表容器');
    } else {
      console.error('无法找到list-mcp标签页');
      return;
    }
  }

  // 显示加载中状态
  mcpInstancesContainer.innerHTML = '<div class="loading">加载中...</div>';

  mcpManager
    .getAllInstances()
    .then(instances => {
      // 清空容器
      mcpInstancesContainer.innerHTML = '';

      // 更新实例计数
      const countSpan = document.getElementById('mcp-instances-count');
      if (countSpan) {
        countSpan.textContent = instances.length;
      }

      if (instances.length === 0) {
        mcpInstancesContainer.innerHTML = '<div class="empty-instances">没有可用的MCP实例</div>';
        return;
      }

      // 添加每个实例卡片
      instances.forEach(instance => {
        const instanceCard = document.createElement('div');
        instanceCard.className = 'instance-card';

        // 检查实例是否已经被当前会话连接
        const isConnected = mcpList.some(mcp => mcp.name === instance.name);

        instanceCard.innerHTML = `
          <div class="instance-header">
            <div class="instance-name">${instance.name || '未命名实例'}</div>
            <div class="instance-type">${instance.type || 'unknown'}</div>
            ${isConnected ? '<div class="instance-connected-badge">已连接</div>' : ''}
          </div>
          <div class="instance-details">
            <div>实例ID: ${instance.instanceId}</div>
            <div>创建时间: ${new Date(instance.createdTime).toLocaleString()}</div>
            <div>最后使用: ${new Date(instance.lastUsedTime).toLocaleString()}</div>
            <div>会话数: ${instance.sessionCount}</div>
            <div>使用次数: ${instance.usageCount}</div>
          </div>
          <div class="instance-actions">
            ${
              isConnected
                ? `<button class="btn btn-disabled" disabled>已连接</button>`
                : `<button class="connect-instance-btn" data-instance-id="${instance.instanceId}" data-instance-name="${instance.name}">连接</button>`
            }
          </div>
        `;

        mcpInstancesContainer.appendChild(instanceCard);
      });

      // 为连接按钮添加事件监听
      document.querySelectorAll('.connect-instance-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const instanceId = this.getAttribute('data-instance-id');
          const instanceName = this.getAttribute('data-instance-name');
          connectToInstance(instanceId, instanceName);
        });
      });
    })
    .catch(error => {
      console.error('加载MCP实例列表失败:', error);
      mcpInstancesContainer.innerHTML = `<div class="error">加载实例列表失败: ${error.message}</div>`;
    });
}

// 连接到已有的MCP实例
function connectToInstance(instanceId, instanceName) {
  if (!sessionId) {
    toastManager.showToast('会话无效，无法连接到实例', 'error');
    return Promise.reject('会话无效');
  }

  toastManager.showToast(`正在连接到实例 ${instanceName}...`, 'info');

  return fetch(`${API_BASE_URL}/mcp/connect-instance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    body: JSON.stringify({
      sessionId,
      instanceId,
    }),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`连接实例失败: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        toastManager.showToast(`已成功连接到实例 ${instanceName}`, 'success');
        mcpList.push(data.mcp);
        renderMcpList();
        eventBus.emit('mcps-updated', mcpList);
        return true;
      } else {
        throw new Error(data.error || '连接实例失败');
      }
    })
    .catch(error => {
      toastManager.showToast(`连接实例失败: ${error.message}`, 'error');
      return false;
    });
}

// 主初始化函数
function initApp() {
  try {
    console.log('初始化应用...');

    // 获取关键DOM元素（使用全局变量）
    window.presetMcpSelect = document.getElementById('preset-mcp-select');
    window.importConfigBtn = document.getElementById('import-config-btn');
    window.configFileInput = document.getElementById('config-file');

    // 确认DOM元素已准备好
    if (
      !document.getElementById('session-id-display') ||
      !document.getElementById('server-name') ||
      !document.getElementById('server-type')
    ) {
      console.error('关键DOM元素未找到，延迟初始化...');
      setTimeout(initApp, 100);
      return;
    }

    // 初始化所有模块
    eventBus.init();
    toastManager.init();

    // 初始化UI组件
    initTabSwitching();

    try {
      initFormListeners();
    } catch (error) {
      console.error('初始化表单监听器失败:', error);
    }

    // 设置事件监听
    const newSessionBtn = document.getElementById('new-session-btn');
    if (newSessionBtn) {
      newSessionBtn.addEventListener('click', () => {
        if (sessionManager && typeof sessionManager.createNewSession === 'function') {
          sessionManager.createNewSession().catch(error => {
            console.error('创建会话失败:', error);
            toastManager.showToast('创建会话失败: ' + error.message, 'error');
          });
        } else {
          console.error('无法创建新会话: sessionManager不可用');
        }
      });
    }

    if (window.presetMcpSelect) {
      window.presetMcpSelect.addEventListener('change', handlePresetSelect);
    }

    if (window.importConfigBtn && window.configFileInput) {
      window.importConfigBtn.addEventListener('click', handleConfigImport);
    }

    // 添加基于ID的按钮监听
    const buttonIds = [
      'validate-json-btn',
      'format-json-btn',
      'clear-json-btn',
      'parse-config-btn',
      'parse-command-btn',
      'import-config-btn',
    ];

    buttonIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        switch (id) {
          case 'validate-json-btn':
            btn.addEventListener('click', validateJSON);
            break;
          case 'format-json-btn':
            btn.addEventListener('click', formatJSON);
            break;
          case 'clear-json-btn':
            btn.addEventListener('click', clearJSON);
            break;
          case 'parse-config-btn':
            btn.addEventListener('click', handleConfigParse);
            break;
          case 'parse-command-btn':
            btn.addEventListener('click', parseCommandLine);
            break;
        }
      }
    });

    // 初始化Python和Git MCP模块
    try {
      if (pythonMcpManager && typeof pythonMcpManager.init === 'function') {
        pythonMcpManager.init();
      }

      if (gitMcpManager && typeof gitMcpManager.init === 'function') {
        gitMcpManager.init();
      }
    } catch (e) {
      console.error('初始化Python或Git MCP模块失败:', e);
    }

    // 初始化聊天和测试模块
    try {
      if (chatModule && typeof chatModule.init === 'function') {
        chatModule.init();
      }

      if (functionTestModule && typeof functionTestModule.init === 'function') {
        functionTestModule.init();
      }
    } catch (e) {
      console.error('初始化聊天或测试模块失败:', e);
    }

    // 初始化其他模块
    try {
      if (mcpManager && typeof mcpManager.init === 'function') {
        mcpManager.init();
      }

      if (sessionManager && typeof sessionManager.init === 'function') {
        sessionManager.init();
      }
    } catch (e) {
      console.error('初始化其他模块失败:', e);
    }

    // 恢复会话
    try {
      restoreSession();
    } catch (e) {
      console.error('恢复会话失败:', e);
      // 如果恢复会话失败，尝试创建新会话
      try {
        if (sessionManager && typeof sessionManager.createNewSession === 'function') {
          console.log('尝试创建新会话...');
          sessionManager.createNewSession();
        } else {
          console.error('无法创建新会话: sessionManager不可用');
        }
      } catch (err) {
        console.error('创建新会话失败:', err);
      }
    }

    console.log('应用初始化完成');
  } catch (error) {
    console.error('应用初始化失败:', error);
    alert('初始化应用时出错，请刷新页面重试。详情请查看控制台。');
  }
}

// 在DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 重新连接MCP
function reconnectMcp(mcp) {
  console.log('尝试重新连接MCP:', mcp);

  if (!mcpManager || typeof mcpManager.reconnectMcp !== 'function') {
    console.error('无法重新连接MCP: mcpManager.reconnectMcp不可用');
    return;
  }

  if (!mcp || !mcp.name) {
    console.error('无法重新连接MCP: 无效的MCP对象');
    return;
  }

  if (toastManager && typeof toastManager.showToast === 'function') {
    toastManager.showToast(`正在重新连接 ${mcp.name}...`, 'info');
  }

  mcpManager
    .reconnectMcp(mcp)
    .then(updatedMcp => {
      console.log(`${mcp.name} 已重新连接:`, updatedMcp);
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast(`${mcp.name} 已重新连接`, 'success');
      }
    })
    .catch(error => {
      console.error('重新连接MCP失败:', error);
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast(`重新连接 ${mcp.name} 失败: ${error.message}`, 'error');
      }
    });
}

// 删除MCP
function deleteMcp(mcp) {
  toastManager.showToast(`正在移除 ${mcp.name}...`, 'info');

  // 确保URL参数正确编码
  const encodedName = encodeURIComponent(mcp.name);
  const encodedSessionId = encodeURIComponent(sessionId);

  return fetch(`${API_BASE_URL}/sessions/${encodedSessionId}/mcp`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    body: JSON.stringify({ name: mcp.name }),
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`删除MCP失败: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        // 从MCP列表中移除当前MCP
        const mcpIndex = mcpList.findIndex(m => m.name === mcp.name);
        if (mcpIndex !== -1) {
          mcpList.splice(mcpIndex, 1);
        }

        // 查找并移除页面上对应的MCP卡片
        const mcpCard = document.querySelector(`.mcp-card[data-mcp-name="${mcp.name}"]`);
        if (mcpCard) {
          mcpCard.remove();
        }

        // 更新MCP计数
        const mcpCountSpan = document.getElementById('mcp-count');
        if (mcpCountSpan) {
          mcpCountSpan.textContent = mcpList.length;
        }

        // 如果没有MCP了，显示空状态
        const emptyState = document.getElementById('empty-state');
        const mcpListContainer = document.getElementById('mcp-list');

        if (mcpList.length === 0 && emptyState && mcpListContainer) {
          emptyState.style.display = 'flex';
          mcpListContainer.style.display = 'none';
        }

        // 触发事件通知其他组件
        eventBus.emit('mcp-removed', mcp.name);

        // 检查聊天可用性
        if (chatModule && typeof chatModule.checkChatAvailability === 'function') {
          chatModule.checkChatAvailability();
        }

        toastManager.showToast(`${mcp.name} 已移除`, 'success');
        return true;
      } else {
        throw new Error(data.error || `移除 ${mcp.name} 失败`);
      }
    })
    .catch(error => {
      console.error('删除MCP失败:', error);
      toastManager.showToast(`移除 ${mcp.name} 失败: ${error.message}`, 'error');
      throw error;
    });
}

// 工具调用函数
function callMcpTool(mcpName, toolName, params) {
  console.log(`尝试调用MCP工具: ${mcpName}.${toolName}`, params);

  if (!sessionId) {
    toastManager.showToast('会话无效，无法调用工具', 'error');
    return Promise.reject(new Error('会话无效'));
  }

  return fetch(`${API_BASE_URL}/sessions/${sessionId}/tools`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': sessionId,
    },
    body: JSON.stringify({
      mcpName,
      toolName,
      params,
    }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        return data.result;
      } else {
        throw new Error(data.error || '调用工具失败');
      }
    });
}

// 显示工具对话框
function showToolDialog(mcpName, toolName) {
  console.log(`尝试显示工具对话框: ${mcpName}.${toolName}`);

  // 根据工具名创建相应的对话框
  let dialogHTML = '';
  let params = {};

  switch (toolName) {
    case 'search':
      dialogHTML = `
        <h3>搜索工具</h3>
        <div class="form-group">
          <label for="search-query">搜索关键词</label>
          <input type="text" id="search-query" placeholder="输入关键词...">
        </div>
      `;
      break;
    case 'calculator':
      dialogHTML = `
        <h3>计算器工具</h3>
        <div class="form-group">
          <label for="calc-expression">数学表达式</label>
          <input type="text" id="calc-expression" placeholder="例如: 2+2*3">
        </div>
      `;
      break;
    case 'weather':
      dialogHTML = `
        <h3>天气工具</h3>
        <div class="form-group">
          <label for="weather-city">城市名称</label>
          <input type="text" id="weather-city" placeholder="例如: 北京">
        </div>
      `;
      break;
    default:
      dialogHTML = `<h3>${toolName}</h3><p>此工具暂无交互界面</p>`;
  }

  // 创建对话框
  const dialog = document.createElement('div');
  dialog.className = 'tool-dialog';
  dialog.innerHTML = `
    <div class="tool-dialog-content">
      ${dialogHTML}
      <div class="dialog-actions">
        <button class="cancel-btn">取消</button>
        <button class="execute-btn">执行</button>
      </div>
      <div class="result-container" style="display:none;"></div>
    </div>
  `;

  document.body.appendChild(dialog);

  // 添加事件监听
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const executeBtn = dialog.querySelector('.execute-btn');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
    });
  }

  if (executeBtn) {
    executeBtn.addEventListener('click', () => {
      // 获取参数
      try {
        switch (toolName) {
          case 'search':
            const searchQuery = dialog.querySelector('#search-query');
            params = { query: searchQuery ? searchQuery.value : '' };
            break;
          case 'calculator':
            const calcExpression = dialog.querySelector('#calc-expression');
            params = { expression: calcExpression ? calcExpression.value : '' };
            break;
          case 'weather':
            const weatherCity = dialog.querySelector('#weather-city');
            params = { city: weatherCity ? weatherCity.value : '' };
            break;
        }

        // 执行工具调用
        executeBtn.disabled = true;
        executeBtn.textContent = '执行中...';

        callMcpTool(mcpName, toolName, params)
          .then(result => {
            const resultContainer = dialog.querySelector('.result-container');
            if (resultContainer) {
              resultContainer.style.display = 'block';

              if (result.success) {
                resultContainer.innerHTML = `
                  <div class="success-result">
                    <h4>执行结果</h4>
                    <pre>${JSON.stringify(result.result, null, 2)}</pre>
                  </div>
                `;
              } else {
                resultContainer.innerHTML = `
                  <div class="error-result">
                    <h4>执行失败</h4>
                    <p>${result.error}</p>
                  </div>
                `;
              }
            }
          })
          .catch(error => {
            const resultContainer = dialog.querySelector('.result-container');
            if (resultContainer) {
              resultContainer.style.display = 'block';
              resultContainer.innerHTML = `
                <div class="error-result">
                  <h4>执行失败</h4>
                  <p>${error.message}</p>
                </div>
              `;
            }
          })
          .finally(() => {
            executeBtn.disabled = false;
            executeBtn.textContent = '执行';
          });
      } catch (error) {
        console.error('工具调用参数处理失败:', error);
        const resultContainer = dialog.querySelector('.result-container');
        if (resultContainer) {
          resultContainer.style.display = 'block';
          resultContainer.innerHTML = `
            <div class="error-result">
              <h4>执行失败</h4>
              <p>参数处理错误: ${error.message}</p>
            </div>
          `;
        }
      }
    });
  }
}

// 处理预设选择
function handlePresetSelect() {
  console.log('处理预设选择');

  const presetMcpSelect = document.getElementById('preset-mcp-select');
  if (!presetMcpSelect) {
    console.error('处理预设选择失败: preset-mcp-select元素不存在');
    return;
  }

  const serverNameInput = document.getElementById('server-name');
  const serverCommandInput = document.getElementById('server-command');
  const serverArgsInput = document.getElementById('server-args');
  const serverEnvInput = document.getElementById('server-env');
  const serverTypeSelect = document.getElementById('server-type');
  const configJsonInput = document.getElementById('config-json');

  if (
    !serverNameInput ||
    !serverCommandInput ||
    !serverArgsInput ||
    !serverEnvInput ||
    !serverTypeSelect
  ) {
    console.error('处理预设选择失败: 某些必要的DOM元素不存在');
    return;
  }

  const selectedPreset = presetMcpSelect.value;

  // 检查是否有选择预设，并且预设存在
  if (selectedPreset && typeof MCP_PRESETS === 'object' && MCP_PRESETS[selectedPreset]) {
    const preset = MCP_PRESETS[selectedPreset];
    console.log('已选择预设:', preset);

    // 将预设转换为JSON配置格式，使用config对象包装命令参数
    try {
      const jsonConfig = {
        mcpServers: {
          [preset.name]: {
            config: {
              command: preset.command,
              args: preset.args,
              env: preset.env,
            },
          },
        },
      };

      // 填充到JSON输入框并格式化
      if (configJsonInput) {
        configJsonInput.value = JSON.stringify(jsonConfig, null, 2);
      }

      // 填充表单
      serverNameInput.value = preset.name;
      serverCommandInput.value = preset.command;
      serverArgsInput.value = Array.isArray(preset.args) ? preset.args.join('\n') : '';

      // 格式化环境变量
      const envText =
        preset.env && typeof preset.env === 'object'
          ? Object.entries(preset.env)
              .map(([key, value]) => `${key}=${value}`)
              .join('\n')
          : '';

      serverEnvInput.value = envText;

      // 切换到stdio类型
      serverTypeSelect.value = 'stdio';
      try {
        serverTypeSelect.dispatchEvent(new Event('change'));
      } catch (e) {
        console.error('无法触发serverTypeSelect变更事件:', e);
      }

      // 验证表单
      validateForm();

      // 重置选择器
      presetMcpSelect.value = '';

      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast(`已加载预设: ${preset.name}`, 'info');
      }
    } catch (error) {
      console.error('处理预设选择时出错:', error);
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast(`加载预设失败: ${error.message}`, 'error');
      }
    }
  }
}

// 处理配置文件导入
function handleConfigImport() {
  console.log('处理配置文件导入');

  const configFileInput = document.getElementById('config-file');
  if (!configFileInput) {
    console.error('处理配置文件导入失败: config-file元素不存在');
    return;
  }

  const file = configFileInput.files[0];

  if (!file) {
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('请选择配置文件', 'error');
    }
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {
    try {
      const config = JSON.parse(e.target.result);

      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        throw new Error('无效的配置文件格式');
      }

      // 添加所有配置的MCP
      const mcpPromises = [];

      if (mcpManager && typeof mcpManager.addMcp === 'function') {
        for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
          const payload = {
            sessionId,
            name,
            clientType: 'stdio',
            command: mcpConfig.command,
            args: mcpConfig.args,
            env: mcpConfig.env,
          };

          mcpPromises.push(mcpManager.addMcp(payload));
        }

        Promise.all(mcpPromises)
          .then(() => {
            if (toastManager && typeof toastManager.showToast === 'function') {
              toastManager.showToast('配置文件导入成功', 'success');
            }
            try {
              switchTab('list-mcp');
            } catch (e) {
              console.error('切换到MCP列表标签页失败:', e);
            }
          })
          .catch(error => {
            console.error('导入MCP失败:', error);
            if (toastManager && typeof toastManager.showToast === 'function') {
              toastManager.showToast(`导入失败: ${error.message}`, 'error');
            }
          });
      } else {
        console.error('无法导入MCP: mcpManager.addMcp不可用');
        if (toastManager && typeof toastManager.showToast === 'function') {
          toastManager.showToast('无法导入MCP: 管理器不可用', 'error');
        }
      }
    } catch (error) {
      console.error('解析配置文件失败:', error);
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast(`配置文件解析失败: ${error.message}`, 'error');
      }
    }
  };

  reader.readAsText(file);
}

// JSON配置处理函数
function validateJSON() {
  console.log('验证JSON配置');

  const configJsonInput = document.getElementById('config-json');
  if (!configJsonInput) {
    console.error('验证JSON配置失败: config-json元素不存在');
    return false;
  }

  const configJson = configJsonInput.value.trim();

  if (!configJson) {
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('请输入配置信息', 'error');
    }
    return false;
  }

  try {
    const config = JSON.parse(configJson);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast('无效的配置格式，需要包含mcpServers对象', 'error');
      }
      return false;
    }

    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('JSON格式有效', 'success');
    }
    return true;
  } catch (error) {
    console.error('JSON验证失败:', error);
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast(`JSON格式无效: ${error.message}`, 'error');
    }
    return false;
  }
}

function formatJSON() {
  console.log('格式化JSON配置');

  const configJsonInput = document.getElementById('config-json');
  if (!configJsonInput) {
    console.error('格式化JSON配置失败: config-json元素不存在');
    return;
  }

  const configJson = configJsonInput.value.trim();

  if (!configJson) {
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('请输入配置信息', 'error');
    }
    return;
  }

  try {
    const parsed = JSON.parse(configJson);
    configJsonInput.value = JSON.stringify(parsed, null, 2);
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('已格式化JSON', 'success');
    }
  } catch (error) {
    console.error('JSON格式化失败:', error);
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast(`无法格式化: ${error.message}`, 'error');
    }
  }
}

function clearJSON() {
  console.log('清除JSON配置');

  const configJsonInput = document.getElementById('config-json');
  if (configJsonInput) {
    configJsonInput.value = '';
  }
}

// 解析命令行
function parseCommandLine() {
  console.log('解析命令行');

  const commandInput = document.getElementById('command-input');
  if (!commandInput) {
    console.error('解析命令行失败: command-input元素不存在');
    return;
  }

  const serverNameInput = document.getElementById('server-name');
  const serverCommandInput = document.getElementById('server-command');
  const serverArgsInput = document.getElementById('server-args');

  if (!serverNameInput || !serverCommandInput || !serverArgsInput) {
    console.error('解析命令行失败: 必要的表单元素不存在');
    return;
  }

  const commandLine = commandInput.value.trim();
  if (!commandLine) {
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('请输入命令行', 'error');
    }
    return;
  }

  try {
    // 简单的命令行解析
    const parts = commandLine.split(/\s+/);
    if (parts.length === 0) {
      throw new Error('无效的命令行');
    }

    // 第一部分是命令
    const command = parts[0];
    // 其余部分是参数
    const args = parts.slice(1);

    // 填充表单
    serverCommandInput.value = command;
    serverArgsInput.value = args.join('\n');

    // 生成名称（如果为空）
    if (!serverNameInput.value) {
      serverNameInput.value = `${command}-mcp`;
    }

    // 验证表单
    validateForm();

    // 清空命令输入
    commandInput.value = '';

    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('命令行已解析', 'success');
    }
  } catch (error) {
    console.error('解析命令行失败:', error);
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast(`解析命令行失败: ${error.message}`, 'error');
    }
  }
}

function handleConfigParse() {
  console.log('解析并应用JSON配置');

  const configJsonInput = document.getElementById('config-json');
  if (!configJsonInput) {
    console.error('解析JSON配置失败: config-json元素不存在');
    return;
  }

  const configJson = configJsonInput.value.trim();

  if (!configJson) {
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast('请输入配置信息', 'error');
    }
    return;
  }

  try {
    const config = JSON.parse(configJson);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('无效的配置格式，需要包含mcpServers对象');
    }

    // 确保mcpList是数组
    if (!Array.isArray(mcpList)) {
      mcpList = [];
      console.log('初始化mcpList为空数组');
    }

    // 添加所有配置的MCP
    const mcpPromises = [];

    if (mcpManager && typeof mcpManager.addMcp === 'function') {
      for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
        // 检查是否已经使用新格式（包含config对象）
        const hasConfigObject = mcpConfig.config && typeof mcpConfig.config === 'object';

        // 如果是新格式，直接使用；否则，构建config对象
        let payload;

        if (hasConfigObject) {
          // 新格式
          payload = {
            sessionId,
            name,
            clientType: mcpConfig.clientType || 'stdio',
            config: mcpConfig.config,
          };
        } else {
          // 旧格式，需转换
          payload = {
            sessionId,
            name,
            clientType: 'stdio',
            command: mcpConfig.command,
            args: mcpConfig.args,
            description: mcpConfig.description,
            setup: mcpConfig.setup,
            env: mcpConfig.env,
          };
        }

        console.log(`准备添加MCP ${name}:`, payload);
        mcpPromises.push(mcpManager.addMcp(payload));
      }

      Promise.all(mcpPromises)
        .then(() => {
          if (toastManager && typeof toastManager.showToast === 'function') {
            toastManager.showToast('配置已成功应用', 'success');
          }
          try {
            switchTab('list-mcp');
          } catch (e) {
            console.error('切换到MCP列表标签页失败:', e);
          }
          // 清空输入框
          configJsonInput.value = '';
        })
        .catch(error => {
          console.error('应用配置失败:', error);
          if (toastManager && typeof toastManager.showToast === 'function') {
            toastManager.showToast(`应用配置失败: ${error.message}`, 'error');
          }
        });
    } else {
      console.error('无法应用配置: mcpManager.addMcp不可用');
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast('无法应用配置: 管理器不可用', 'error');
      }
    }
  } catch (error) {
    console.error('JSON解析失败:', error);
    if (toastManager && typeof toastManager.showToast === 'function') {
      toastManager.showToast(`JSON解析失败: ${error.message}`, 'error');
    }
  }
}

// 将函数公开到全局作用域中
window.loadAllMcpInstances = loadAllMcpInstances;
window.connectToInstance = connectToInstance;
window.reconnectMcp = reconnectMcp;
window.deleteMcp = deleteMcp;

// 添加帮助函数，专门转换GitHub案例和Python案例的入参
function fixExamplePayloads() {
  // 示例1 - Git MCP
  const gitExample = {
    sessionId: 'cd9638fe-3ba9-4372-a61e-4a95345a2592',
    name: 'git-mcp',
    clientType: 'stdio',
    command: 'sh',
    args: ['run.sh'],
    setup: {
      command: 'git',
      args: ['clone', 'git@git.woa.com:abwu/external-mcp.git', '.'],
      description: '克隆Git仓库',
    },
  };

  // 转换为新格式
  const fixedGitExample = {
    name: 'git-mcp',
    clientType: 'stdio',
    config: {
      command: 'sh',
      args: ['run.sh'],
      description: 'Git仓库MCP服务',
      setup: {
        command: 'git',
        args: ['clone', 'git@git.woa.com:abwu/external-mcp.git', '.'],
        description: '克隆Git仓库',
      },
    },
  };

  // 示例2 - Python MCP
  const pythonExample = {
    sessionId: 'cd9638fe-3ba9-4372-a61e-4a95345a2592',
    name: 'python-fetch',
    clientType: 'stdio',
    command: '/opt/homebrew/bin/python3',
    args: ['-m', 'mcp_server_fetch'],
    setup: {
      command: '/opt/homebrew/bin/python3',
      args: ['-m', 'pip', 'install', 'mcp-server-fetch'],
      description: '安装mcp-server-fetch包',
    },
  };

  // 转换为新格式
  const fixedPythonExample = {
    name: 'python-fetch',
    clientType: 'stdio',
    config: {
      command: '/opt/homebrew/bin/python3',
      args: ['-m', 'mcp_server_fetch'],
      description: 'Python MCP服务器',
      setup: {
        command: '/opt/homebrew/bin/python3',
        args: ['-m', 'pip', 'install', 'mcp-server-fetch'],
        description: '安装mcp-server-fetch包',
      },
    },
  };

  // 原始的mcpServers配置格式(完整示例)
  const originalMcpServersFormat = {
    mcpServers: {
      'git-mcp': {
        command: 'sh',
        args: ['run.sh'],
        description: 'Git仓库MCP服务',
        setup: {
          command: 'git',
          args: ['clone', 'git@git.woa.com:abwu/external-mcp.git', '.'],
          description: '克隆Git仓库',
        },
      },
      'python-fetch': {
        command: '/opt/homebrew/bin/python3',
        args: ['-m', 'mcp_server_fetch'],
        description: 'Python MCP服务器',
        setup: {
          command: '/opt/homebrew/bin/python3',
          args: ['-m', 'pip', 'install', 'mcp-server-fetch'],
          description: '安装mcp-server-fetch包',
        },
      },
    },
  };

  console.log('新接口格式 - Git MCP示例:', JSON.stringify(fixedGitExample, null, 2));
  console.log('新接口格式 - Python MCP示例:', JSON.stringify(fixedPythonExample, null, 2));
  console.log('原始mcpServers配置格式:', JSON.stringify(originalMcpServersFormat, null, 2));

  return {
    git: fixedGitExample,
    python: fixedPythonExample,
    mcpServers: originalMcpServersFormat,
  };
}

// 在适当的地方调用此函数，例如在初始化时
document.addEventListener('DOMContentLoaded', function () {
  // 其他初始化代码...

  // 添加示例转换按钮，方便用户查看正确格式
  const exampleBtn = document.createElement('button');
  exampleBtn.id = 'show-example-btn';
  exampleBtn.className = 'btn';
  exampleBtn.textContent = '显示正确的入参示例';
  exampleBtn.onclick = function () {
    const examples = fixExamplePayloads();
    const configJsonInput = document.getElementById('config-json');
    if (configJsonInput) {
      configJsonInput.value = JSON.stringify(
        {
          originalFormat: examples.mcpServers,
          newApiFormat: {
            gitExample: examples.git,
            pythonExample: examples.python,
          },
        },
        null,
        2,
      );
    }
    toastManager.showToast('已显示正确格式的示例', 'info');
  };

  // 将按钮添加到适当位置
  const jsonTools = document.querySelector('.json-tools');
  if (jsonTools) {
    jsonTools.appendChild(exampleBtn);
  }
});
