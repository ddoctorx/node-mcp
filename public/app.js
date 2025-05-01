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

// 事件总线模块
const eventBus = (() => {
  const events = {};

  function init() {
    // 初始化事件总线
  }

  function on(eventName, callback) {
    if (!events[eventName]) {
      events[eventName] = [];
    }
    events[eventName].push(callback);
  }

  function emit(eventName, data) {
    if (events[eventName]) {
      events[eventName].forEach(callback => {
        callback(data);
      });
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

    return fetch(`${API_BASE_URL}/session`, {
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
      return Promise.reject(new Error('没有用户ID'));
    }

    return fetch(`${API_BASE_URL}/sessions/user/${userId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取会话列表失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          return data.sessions;
        } else {
          throw new Error(data.error || '获取用户会话失败');
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
    if (!sessionId) {
      console.warn('尝试加载MCP列表，但会话ID不存在');
      return Promise.reject(new Error('会话ID不存在'));
    }

    return fetch(`${API_BASE_URL}/mcp?sessionId=${sessionId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          mcpList = data.mcps || [];
          // 更新实例ID映射
          mcpList.forEach(mcp => {
            if (mcp.instanceId) {
              mcpInstanceMap[mcp.name] = mcp.instanceId;
            }
          });
          renderMcpList();
          eventBus.emit('mcps-updated', mcpList);
          return mcpList;
        } else {
          throw new Error(data.error || '加载MCP列表失败');
        }
      });
  }

  function addMcp(payload) {
    // 添加instanceId字段
    if (mcpInstanceMap[payload.name]) {
      payload.instanceId = mcpInstanceMap[payload.name];
    }

    console.log('发送MCP添加请求:', JSON.stringify(payload, null, 2));

    return fetch(`${API_BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.mcp) {
          // 保存实例ID映射
          if (data.instanceId) {
            mcpInstanceMap[data.mcp.name] = data.instanceId;
            // 添加实例ID到MCP对象
            data.mcp.instanceId = data.instanceId;
          }

          // 显示实例复用信息
          if (!data.isNew && data.isPooled) {
            toastManager.showToast(`已复用已有的MCP实例: ${data.mcp.name}`, 'info');
          }

          // 添加到列表并渲染
          const existingIndex = mcpList.findIndex(m => m.name === data.mcp.name);

          if (existingIndex >= 0) {
            mcpList[existingIndex] = data.mcp;
          } else {
            mcpList.push(data.mcp);
          }

          renderMcpList();
          eventBus.emit('mcps-updated', mcpList);

          return data.mcp;
        } else {
          throw new Error(data.error || 'MCP添加失败');
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

    return addMcp(payload)
      .then(updatedMcp => {
        toastManager.showToast(`${mcp.name} 已重新连接`, 'success');
        return updatedMcp;
      })
      .catch(error => {
        toastManager.showToast(`重新连接 ${mcp.name} 失败: ${error.message}`, 'error');
        throw error;
      });
  }

  function deleteMcp(mcp) {
    toastManager.showToast(`正在移除 ${mcp.name}...`, 'info');

    // 确保URL参数正确编码
    const encodedName = encodeURIComponent(mcp.name);
    const encodedSessionId = encodeURIComponent(sessionId);

    return fetch(`${API_BASE_URL}/mcp?sessionId=${encodedSessionId}&name=${encodedName}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // 成功删除后重新从服务器获取最新的MCP列表
          loadMcpList()
            .then(() => {
              toastManager.showToast(`${mcp.name} 已移除`, 'success');
              console.log('已刷新MCP列表');
            })
            .catch(err => {
              console.error('刷新MCP列表失败:', err);
            });

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

  // 获取池状态信息
  function getPoolStats() {
    return fetch(`${API_BASE_URL}/mcp/pool`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          return data.stats;
        } else {
          throw new Error(data.error || '获取MCP池状态失败');
        }
      });
  }

  // 获取所有MCP实例
  function getAllInstances() {
    return fetch(`${API_BASE_URL}/mcp/instances`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          return data.instances;
        } else {
          throw new Error(data.error || '获取MCP实例列表失败');
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
      enableChat();
    } else {
      disableChat('等待连接MCP服务');
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
    const currentSessionId = sessionManager.getSessionId();
    if (!currentSessionId) {
      console.warn('尝试加载聊天历史，但会话ID不存在');
      return;
    }

    try {
      clearChatMessages();
      addSystemMessage('加载聊天历史...');

      const response = await fetch(`/api/chat/history/${currentSessionId}`);

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.history && data.history.length > 0) {
        clearChatMessages();

        // 重建聊天历史
        for (const message of data.history) {
          if (message.role === 'user') {
            addUserMessage(message.content);
          } else if (message.role === 'assistant' && message.content) {
            addAssistantMessage(message.content);
          } else if (message.role === 'assistant' && message.tool_calls) {
            // 处理函数调用，但不渲染，因为后面会有最终结果
            // 这里可以根据需求改进，例如显示函数调用过程
          }
        }
      } else {
        addSystemMessage('开始新的对话');
      }
    } catch (error) {
      console.error('加载聊天历史失败:', error);
      addSystemMessage('加载聊天历史失败: ' + error.message);
    }
  }

  // 发送消息
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isLoading) return;

    const currentSessionId = sessionManager.getSessionId();
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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message,
        }),
      });

      // 移除"思考中"消息
      removeSystemMessages();

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        if (data.type === 'text') {
          // 普通文本响应
          addAssistantMessage(data.content);
        } else if (data.type === 'function_result') {
          // 函数调用结果
          addFunctionCallInfo(data);

          // 添加最终响应
          if (data.final_response) {
            addAssistantMessage(data.final_response);
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
    const currentSessionId = sessionManager.getSessionId();
    if (!currentSessionId) {
      addSystemMessage('未找到会话，无法清除聊天历史');
      return;
    }

    try {
      const response = await fetch(`/api/chat/history/${currentSessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`清除失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        clearChatMessages();
        addSystemMessage('聊天历史已清除');
      } else {
        addSystemMessage(`清除失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('清除聊天历史失败:', error);
      addSystemMessage(`清除失败: ${error.message}`);
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
  function addFunctionCallInfo(data) {
    // 只显示第一个函数调用，如果需要可以扩展为显示多个
    if (!data.function_calls || !data.function_calls.length) return;

    const call = data.function_calls[0];
    const result = data.results.find(r => r.tool_call_id === call.id);

    if (!call || !result) return;

    const clone = functionCallTemplate.content.cloneNode(true);

    clone.querySelector('.function-name').textContent = call.function.name;

    try {
      // 格式化参数
      const params = JSON.parse(call.function.arguments);
      clone.querySelector('.function-params').textContent = JSON.stringify(params, null, 2);

      // 格式化结果
      let resultObj;

      try {
        // 尝试解析JSON字符串
        resultObj = JSON.parse(result.result);

        // 处理嵌套的特殊格式，如高德地图API的结果
        // 检查是否有特殊的嵌套structure: {"result":{"content":[{"type":"text","text":"JSON字符串"}]}}
        if (
          resultObj.result &&
          resultObj.result.content &&
          Array.isArray(resultObj.result.content)
        ) {
          // 尝试从content中提取text属性中的JSON字符串
          const textContent = resultObj.result.content.find(
            item => item.type === 'text' && item.text,
          );
          if (textContent && textContent.text) {
            try {
              // 尝试解析text字段中的JSON
              const parsedTextContent = JSON.parse(textContent.text);
              // 使用解析后的内容替换结果对象
              resultObj = parsedTextContent;
            } catch (e) {
              console.error('解析内嵌text字段JSON失败:', e);
              // 保持原有结果不变
            }
          }
        }

        // 确保以格式化的方式显示JSON对象
        clone.querySelector('.function-result').textContent = JSON.stringify(resultObj, null, 2);
      } catch (e) {
        // 如果不是有效的JSON，直接显示原始内容
        if (typeof result.result === 'string') {
          // 尝试检测是否是未正确解析的JSON字符串（有时候API返回的是带引号的JSON字符串）
          if (result.result.startsWith('"') && result.result.endsWith('"')) {
            try {
              // 去掉外层引号并尝试解析
              const unquoted = result.result.slice(1, -1).replace(/\\"/g, '"');
              resultObj = JSON.parse(unquoted);

              // 同样检查是否有特殊的嵌套格式
              if (
                resultObj.result &&
                resultObj.result.content &&
                Array.isArray(resultObj.result.content)
              ) {
                const textContent = resultObj.result.content.find(
                  item => item.type === 'text' && item.text,
                );
                if (textContent && textContent.text) {
                  try {
                    const parsedTextContent = JSON.parse(textContent.text);
                    resultObj = parsedTextContent;
                  } catch (e) {
                    console.error('解析内嵌text字段JSON失败:', e);
                  }
                } else {
                  resultObj = JSON.stringify(resultValue, null, 2);
                }
              } else {
                resultObj = JSON.stringify(resultValue, null, 2);
              }

              clone.querySelector('.function-result').textContent = JSON.stringify(
                resultObj,
                null,
                2,
              );
            } catch (e2) {
              // 如果仍然失败，显示原始内容
              clone.querySelector('.function-result').textContent = result.result;
            }
          } else {
            clone.querySelector('.function-result').textContent = result.result;
          }
        } else {
          // 如果已经是对象，直接格式化
          clone.querySelector('.function-result').textContent = JSON.stringify(
            result.result,
            null,
            2,
          );
        }
      }
    } catch (e) {
      console.error('解析函数调用信息失败:', e);
      // 降级处理
      clone.querySelector('.function-params').textContent = call.function.arguments;
      clone.querySelector('.function-result').textContent = result.result;
    }

    chatMessages.appendChild(clone);
    scrollToBottom();
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

  // 状态变量
  let isLoading = false;

  // 初始化
  function init() {
    setupEventListeners();
    checkAvailability();
  }

  // 设置事件监听
  function setupEventListeners() {
    runFunctionTestBtn.addEventListener('click', runTest);
    clearFunctionTestBtn.addEventListener('click', clearResults);

    // 注册MCP连接/断开事件监听
    eventBus.on('mcps-updated', checkAvailability);
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
          const result = response.results.find(r => r.tool_call_id === call.id);
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
    const packageName =
      document.getElementById('python-package-name').value.trim() || 'mcp-server-fetch';
    const moduleName =
      document.getElementById('python-module-name').value.trim() || 'mcp_server_fetch';
    const extraArgs = document.getElementById('python-extra-args').value.trim();

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

    // 创建配置对象
    const config = {
      mcpServers: {
        [name]: {
          command: pythonCommand,
          args: args,
          description: `Python ${packageName} MCP服务器`,
          setup: {
            command: pipSetupCommand,
            args: pipSetupArgs,
            description: `安装${packageName}包`,
          },
        },
      },
    };

    // 更新预览
    document.getElementById('python-config-preview').textContent = JSON.stringify(config, null, 2);
  },

  createPythonMcp() {
    const name = document.getElementById('python-server-name').value.trim();
    const packageName = document.getElementById('python-package-name').value.trim();
    const moduleName = document.getElementById('python-module-name').value.trim();

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

    if (!name || !packageName || !moduleName) {
      toastManager.showToast('请填写所有必填字段', 'error');
      return;
    }

    if (!sessionId) {
      toastManager.showToast('请先创建会话', 'error');
      return;
    }

    // 准备参数数组
    const args = ['-m', moduleName];

    // 添加额外参数
    const extraArgs = document.getElementById('python-extra-args').value.trim();
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

    // 创建配置
    const config = {
      command: pythonCommand,
      args: args,
      description: `Python ${packageName} MCP服务器`,
      setup: {
        command: pipSetupCommand,
        args: pipSetupArgs,
        description: `安装${packageName}包`,
      },
    };

    // 准备请求负载
    const payload = {
      sessionId,
      name,
      clientType: 'stdio',
      command: config.command,
      args: config.args,
      setup: config.setup,
    };

    // 显示加载状态
    document.getElementById('create-python-mcp-btn').disabled = true;
    toastManager.showToast('正在创建 Python MCP 服务器，这可能需要一些时间...', 'info');

    // 发送请求
    mcpManager
      .addMcp(payload)
      .then(mcp => {
        toastManager.showToast(`Python MCP 服务器 "${name}" 已成功创建`, 'success');
        // 切换到列表标签页
        switchTab('list-mcp');
      })
      .catch(error => {
        console.error('创建 Python MCP 服务器失败:', error);

        // 构建更友好的错误消息
        let errorMsg = error.message || '未知错误';

        // 添加提示信息
        if (
          errorMsg.includes('ENOENT') ||
          errorMsg.includes('找不到命令') ||
          errorMsg.includes('not found')
        ) {
          if (errorMsg.includes('pip') || errorMsg.includes('pip3')) {
            errorMsg += '\n\n建议: 请尝试选择其他pip命令，如 "python -m pip" 或 "python3 -m pip"';
          } else if (errorMsg.includes('python')) {
            errorMsg += '\n\n建议: 请确认Python已正确安装，并设置了正确的PATH环境变量';
          }
        } else if (errorMsg.includes('Permission denied') || errorMsg.includes('权限不足')) {
          errorMsg += '\n\n建议: 请尝试以管理员权限运行服务器，或使用 "--user" 选项';
        } else if (errorMsg.includes('无法安装') || errorMsg.includes('Could not find a version')) {
          errorMsg += '\n\n建议: 请检查包名 "' + packageName + '" 是否正确，网络是否正常';
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

    // 创建MCP配置
    const mcpConfig = {
      sessionId: currentSessionId,
      name: name,
      clientType: 'stdio',
      command: command,
      args: args,
      setup: {
        command: 'git',
        args: gitArgs,
        description: '克隆Git仓库',
      },
    };

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

  const name = serverNameInput.value.trim();
  const type = serverTypeSelect.value;
  const command = serverCommandInput.value.trim();
  const url = serverUrlInput.value.trim();

  const payload = {
    sessionId,
    name,
    clientType: type,
  };

  if (type === 'stdio') {
    // 确保命令存在
    if (command) {
      payload.command = command;
    } else {
      if (toastManager && typeof toastManager.showToast === 'function') {
        toastManager.showToast('请输入命令', 'error');
      }
      return;
    }

    // 解析参数（每行一个）
    const argsText = serverArgsInput.value.trim();
    if (argsText) {
      payload.args = argsText
        .split('\n')
        .map(arg => arg.trim())
        .filter(arg => arg);
    } else {
      payload.args = [];
    }

    // 解析环境变量（键值对）
    const envText = serverEnvInput.value.trim();
    if (envText) {
      payload.env = {};
      envText.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes('=')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          payload.env[key.trim()] = valueParts.join('=').trim();
        }
      });
    }

    // 添加setup字段，用于Python MCP预设
    if (name === 'python-fetch' || name.startsWith('python-')) {
      payload.setup = {
        command: 'pip',
        args: ['install', 'mcp-server-fetch'],
        description: '安装mcp-server-fetch包',
      };
    }

    // 打印表单值和解析后的数据
    console.log('表单值:', {
      command: serverCommandInput.value,
      args: serverArgsInput.value,
      env: serverEnvInput.value,
    });

    console.log('解析后的参数:', payload.args);
    if (payload.env) {
      console.log('解析后的环境变量:', payload.env);
    }
    if (payload.setup) {
      console.log('安装步骤:', payload.setup);
    }
  } else {
    payload.url = url;
  }

  // 显示加载状态
  addMcpBtn.disabled = true;
  if (toastManager && typeof toastManager.showToast === 'function') {
    toastManager.showToast('正在添加MCP...', 'info');
  }

  console.log('准备发送的 payload:', JSON.stringify(payload, null, 2));

  if (mcpManager && typeof mcpManager.addMcp === 'function') {
    mcpManager
      .addMcp(payload)
      .then(mcp => {
        // 重置表单
        resetForm();

        // 确保MCP列表已更新并渲染后再切换标签页
        setTimeout(() => {
          // 切换到列表标签页
          try {
            switchTab('list-mcp');
          } catch (e) {
            console.error('切换到MCP列表标签页失败:', e);
          }
        }, 100);

        if (toastManager && typeof toastManager.showToast === 'function') {
          toastManager.showToast('MCP已添加', 'success');
        }
      })
      .catch(error => {
        console.error('添加MCP失败:', error);
        if (toastManager && typeof toastManager.showToast === 'function') {
          toastManager.showToast('添加MCP失败: ' + error.message, 'error');
        }
      })
      .finally(() => {
        addMcpBtn.disabled = false;
      });
  } else {
    console.error('无法添加MCP: mcpManager不可用');
    addMcpBtn.disabled = false;
  }
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
    socket = io();

    socket.on('connect', () => {
      console.log('WebSocket已连接');
      socket.emit('join_session', sessionId);
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

  // 如果MCP列表容器不存在，尝试找到list-mcp标签页容器并创建必要的元素
  if (!mcpListContainer) {
    const listMcpTab = document.getElementById('list-mcp');
    if (listMcpTab) {
      // 创建MCP列表容器
      console.log('创建MCP列表容器');
      mcpListContainer = document.createElement('div');
      mcpListContainer.id = 'mcp-list';
      mcpListContainer.className = 'mcp-list';

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
      }

      // 创建MCP计数元素父容器
      const mcpCountContainer = document.createElement('div');
      mcpCountContainer.className = 'mcp-count-container';
      mcpCountContainer.innerHTML = '当前MCP: <span id="mcp-count">0</span>';

      // 创建MCP实例列表容器
      mcpInstancesContainer = document.createElement('div');
      mcpInstancesContainer.id = 'mcp-instances-list';
      mcpInstancesContainer.className = 'mcp-instances-list';

      // 创建MCP实例计数容器
      const mcpInstancesCountContainer = document.createElement('div');
      mcpInstancesCountContainer.className = 'mcp-count-container';
      mcpInstancesCountContainer.innerHTML = '可用实例: <span id="mcp-instances-count">0</span>';

      // 创建刷新按钮
      const refreshBtn = document.createElement('button');
      refreshBtn.id = 'refresh-instances-btn';
      refreshBtn.className = 'btn btn-primary';
      refreshBtn.textContent = '刷新实例列表';
      refreshBtn.addEventListener('click', loadAllMcpInstances);

      // 创建实例列表标题
      const instancesTitle = document.createElement('h3');
      instancesTitle.textContent = '可用的MCP实例';
      instancesTitle.className = 'section-title';

      // 清空标签页内容并重新添加元素
      listMcpTab.innerHTML = '';
      listMcpTab.appendChild(mcpCountContainer);
      listMcpTab.appendChild(emptyState);
      listMcpTab.appendChild(mcpListContainer);
      listMcpTab.appendChild(instancesTitle);
      listMcpTab.appendChild(mcpInstancesCountContainer);
      listMcpTab.appendChild(refreshBtn);
      listMcpTab.appendChild(mcpInstancesContainer);

      // 获取新创建的MCP计数元素
      mcpCountSpan = document.getElementById('mcp-count');
      mcpInstancesCountSpan = document.getElementById('mcp-instances-count');

      // 为"添加第一个MCP"按钮添加事件监听
      const addFirstMcpBtn = emptyState.querySelector('.add-first-mcp-btn');
      if (addFirstMcpBtn) {
        addFirstMcpBtn.addEventListener('click', () => {
          switchTab('add-mcp');
        });
      }
    } else {
      console.error('渲染MCP列表失败: 找不到list-mcp标签页');
      return;
    }
  }

  // 此时应该已经有必要的DOM元素了
  if (!mcpListContainer || !emptyState || !mcpCountSpan) {
    console.error('渲染MCP列表失败: 无法创建必要的DOM元素');
    return;
  }

  // 更新MCP数量显示
  mcpCountSpan.textContent = mcpList.length;

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
              mcp.status === 'connected'
                ? 'status-running'
                : mcp.status === 'disconnected'
                ? 'status-disconnecting'
                : 'status-error'
            }">${
          mcp.status === 'connected' ? '运行中' : mcp.status === 'disconnected' ? '断开中' : '异常'
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
    toastManager.showToast('无法连接实例: 没有活动会话', 'error');
    return;
  }

  toastManager.showToast(`正在连接到实例: ${instanceName}...`, 'info');

  fetch(`${API_BASE_URL}/mcp/connect-instance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      instanceId,
    }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        toastManager.showToast(`已连接到实例: ${instanceName}`, 'success');

        // 刷新MCP列表
        mcpManager
          .loadMcpList()
          .then(() => {
            // 刷新实例列表
            loadAllMcpInstances();
          })
          .catch(error => {
            console.error('刷新MCP列表失败:', error);
          });
      } else {
        throw new Error(data.error || '连接实例失败');
      }
    })
    .catch(error => {
      console.error('连接实例失败:', error);
      toastManager.showToast(`连接实例失败: ${error.message}`, 'error');
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

  return fetch(`${API_BASE_URL}/mcp?sessionId=${encodedSessionId}&name=${encodedName}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // 从列表中移除
        mcpList = mcpList.filter(m => m.name !== mcp.name);
        renderMcpList();
        eventBus.emit('mcps-updated', mcpList);

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
    console.error('无法调用MCP工具: 会话ID不存在');
    return Promise.reject(new Error('未连接会话'));
  }

  return fetch(`${API_BASE_URL}/mcp/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      mcpName,
      tool: toolName,
      params,
    }),
  }).then(response => response.json());
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

    // 将预设转换为JSON配置格式
    try {
      const jsonConfig = {
        mcpServers: {
          [preset.name]: {
            command: preset.command,
            args: preset.args,
            env: preset.env,
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

    // 添加所有配置的MCP
    const mcpPromises = [];

    if (mcpManager && typeof mcpManager.addMcp === 'function') {
      for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
        const payload = {
          sessionId,
          name,
          clientType: 'stdio',
          command: mcpConfig.command,
          args: Array.isArray(mcpConfig.args) ? mcpConfig.args : [],
          env: mcpConfig.env || {},
        };

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
