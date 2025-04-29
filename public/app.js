// 常量和设置
const API_BASE_URL = '/api';
let sessionId = null;
let socket = null;
let mcpList = [];

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
      body: JSON.stringify({ userId: 'user-' + Date.now() }),
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
          localStorage.setItem('mcpSessionId', sessionId);

          console.log(`新会话已创建: ${sessionId}`);

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

          return sessionId;
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

  return {
    init,
    getSessionId,
    createNewSession,
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

    return fetch(`${API_BASE_URL}/mcp`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        name: mcp.name,
      }),
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
                }
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

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化各个模块
  eventBus.init();
  toastManager.init();
  sessionManager.init();
  mcpManager.init();
  chatModule.init();
  functionTestModule.init();
  pythonMcpManager.init();

  // 初始化Git MCP管理器
  gitMcpManager.init();

  // 初始化标签页切换
  initTabSwitching();

  // 初始化表单事件监听
  initFormListeners();

  // 尝试从本地存储恢复会话
  restoreSession();

  // 为"添加第一个MCP"按钮添加事件监听
  addFirstMcpBtn.addEventListener('click', () => {
    switchTab('add-mcp');
  });

  // 创建新会话按钮
  newSessionBtn.addEventListener('click', createNewSession);

  // 预设MCP选择器事件
  presetMcpSelect.addEventListener('change', handlePresetSelect);

  // 导入配置按钮事件
  importConfigBtn.addEventListener('click', handleConfigImport);

  // 配置JSON区域事件监听器
  document.getElementById('validate-json-btn').addEventListener('click', validateJSON);
  document.getElementById('format-json-btn').addEventListener('click', formatJSON);
  document.getElementById('clear-json-btn').addEventListener('click', clearJSON);
  document.getElementById('parse-config-btn').addEventListener('click', handleConfigParse);

  // 命令行解析事件监听器
  document.getElementById('parse-command-btn').addEventListener('click', parseCommandLine);

  // 连接WebSocket
  connectWebSocket();
});

// 初始化标签页切换
function initTabSwitching() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

// 切换标签页
function switchTab(tabId) {
  // 移除所有活动状态
  tabBtns.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  // 设置当前活动标签
  document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// 初始化表单监听器
function initFormListeners() {
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

// 处理预设选择
function handlePresetSelect() {
  const selectedPreset = presetMcpSelect.value;

  if (selectedPreset && MCP_PRESETS[selectedPreset]) {
    const preset = MCP_PRESETS[selectedPreset];

    // 将预设转换为JSON配置格式
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
    document.getElementById('config-json').value = JSON.stringify(jsonConfig, null, 2);

    // 填充表单
    serverNameInput.value = preset.name;
    serverCommandInput.value = preset.command;
    serverArgsInput.value = preset.args.join('\n');

    // 格式化环境变量
    const envText = Object.entries(preset.env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    serverEnvInput.value = envText;

    // 切换到stdio类型
    serverTypeSelect.value = 'stdio';
    serverTypeSelect.dispatchEvent(new Event('change'));

    // 验证表单
    validateForm();

    // 重置选择器
    presetMcpSelect.value = '';

    toastManager.showToast(`已加载预设: ${preset.name}`, 'info');
  }
}

// 处理配置文件导入
function handleConfigImport() {
  const file = configFileInput.files[0];

  if (!file) {
    toastManager.showToast('请选择配置文件', 'error');
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
          toastManager.showToast('配置文件导入成功', 'success');
          switchTab('list-mcp');
        })
        .catch(error => {
          toastManager.showToast(`导入失败: ${error.message}`, 'error');
        });
    } catch (error) {
      toastManager.showToast(`配置文件解析失败: ${error.message}`, 'error');
    }
  };

  reader.readAsText(file);
}

// JSON配置处理函数
function validateJSON() {
  const configJson = document.getElementById('config-json').value.trim();

  if (!configJson) {
    toastManager.showToast('请输入配置信息', 'error');
    return false;
  }

  try {
    const config = JSON.parse(configJson);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      toastManager.showToast('无效的配置格式，需要包含mcpServers对象', 'error');
      return false;
    }

    toastManager.showToast('JSON格式有效', 'success');
    return true;
  } catch (error) {
    toastManager.showToast(`JSON格式无效: ${error.message}`, 'error');
    return false;
  }
}

function formatJSON() {
  const configJson = document.getElementById('config-json').value.trim();

  if (!configJson) {
    toastManager.showToast('请输入配置信息', 'error');
    return;
  }

  try {
    const parsed = JSON.parse(configJson);
    document.getElementById('config-json').value = JSON.stringify(parsed, null, 2);
    toastManager.showToast('已格式化JSON', 'success');
  } catch (error) {
    toastManager.showToast(`无法格式化: ${error.message}`, 'error');
  }
}

function clearJSON() {
  document.getElementById('config-json').value = '';
}

function handleConfigParse() {
  const configJson = document.getElementById('config-json').value.trim();

  if (!configJson) {
    toastManager.showToast('请输入配置信息', 'error');
    return;
  }

  try {
    const config = JSON.parse(configJson);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('无效的配置格式，需要包含mcpServers对象');
    }

    // 添加所有配置的MCP
    const mcpPromises = [];

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
        toastManager.showToast('配置已成功应用', 'success');
        switchTab('list-mcp');
        // 清空输入框
        document.getElementById('config-json').value = '';
      })
      .catch(error => {
        toastManager.showToast(`应用配置失败: ${error.message}`, 'error');
      });
  } catch (error) {
    toastManager.showToast(`JSON解析失败: ${error.message}`, 'error');
  }
}

// 命令行解析函数
function parseCommandLine() {
  const commandLine = document.getElementById('command-line-input').value.trim();

  if (!commandLine) {
    toastManager.showToast('请输入命令行', 'error');
    return;
  }

  try {
    // 解析命令行
    const parsed = parseCommandToConfig(commandLine);

    // 显示生成的JSON配置
    document.getElementById('config-json').value = JSON.stringify(parsed, null, 2);

    // 自动切换到配置粘贴区域
    const configPasteSection = document.querySelector('.config-paste-section');
    configPasteSection.scrollIntoView({ behavior: 'smooth' });

    toastManager.showToast('已解析命令行为配置', 'success');
  } catch (error) {
    toastManager.showToast(`解析失败: ${error.message}`, 'error');
  }
}

// 命令行解析辅助函数
function parseCommandToConfig(commandLine) {
  const parts = parseCommandLineString(commandLine);

  if (parts.length === 0) {
    throw new Error('无效的命令行');
  }

  const command = parts[0];
  const args = [];
  const env = {};
  let serverName = '';

  // 解析参数
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // 检查是否是环境变量格式 (--KEY=value)
    if (part.startsWith('--') && part.includes('=')) {
      const [key, ...valueParts] = part.substring(2).split('=');
      env[key] = valueParts.join('=');
    } else {
      args.push(part);

      // 尝试从参数中提取服务器名称
      if (part.startsWith('@') && !serverName) {
        // 例如 @amap/amap-maps-mcp-server -> amap-maps
        serverName = part.split('/').pop().replace('-mcp-server', '');
      }
    }
  }

  // 如果没有解析出服务器名称，使用默认名称
  if (!serverName) {
    serverName = `mcp-${Date.now()}`;
  }

  // 构建配置对象
  const config = {
    mcpServers: {
      [serverName]: {
        command: command,
        args: args,
      },
    },
  };

  // 只有当有环境变量时才添加env字段
  if (Object.keys(env).length > 0) {
    config.mcpServers[serverName].env = env;
  }

  return config;
}

// 解析命令行字符串的辅助函数（处理引号等情况）
function parseCommandLineString(commandLine) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < commandLine.length; i++) {
    const char = commandLine[i];

    if ((char === '"' || char === "'") && (!inQuotes || char === quoteChar)) {
      inQuotes = !inQuotes;
      if (inQuotes) {
        quoteChar = char;
      } else {
        quoteChar = '';
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

// 从本地存储恢复会话
function restoreSession() {
  const savedSessionId = localStorage.getItem('mcpSessionId');

  if (savedSessionId) {
    // 验证会话是否存在
    fetch(`${API_BASE_URL}/mcp?sessionId=${savedSessionId}`)
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          // 如果会话不存在，创建新会话
          console.log('保存的会话无效，创建新会话');
          throw new Error('会话不存在或已过期');
        }
      })
      .then(data => {
        if (data.success) {
          sessionId = savedSessionId;
          updateSessionDisplay();
          connectWebSocket();
          mcpList = data.mcps || [];
          renderMcpList();
          eventBus.emit('mcps-updated', mcpList);
        } else {
          throw new Error(data.error || '无法加载MCP列表');
        }
      })
      .catch(error => {
        console.error('恢复会话失败:', error);
        // 创建新会话
        localStorage.removeItem('mcpSessionId');
        sessionManager.createNewSession();
      });
  } else {
    sessionManager.createNewSession();
  }
}

// 连接WebSocket
function connectWebSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    console.log('WebSocket已连接');
    socket.emit('join_session', sessionId);
  });

  socket.on('mcp_connected', mcp => {
    const existingIndex = mcpList.findIndex(m => m.name === mcp.name);

    if (existingIndex >= 0) {
      mcpList[existingIndex] = mcp;
    } else {
      mcpList.push(mcp);
    }

    renderMcpList();
  });

  socket.on('mcp_disconnected', data => {
    mcpList = mcpList.filter(mcp => mcp.name !== data.name);
    renderMcpList();
  });

  socket.on('disconnect', () => {
    console.log('WebSocket已断开');
  });
}

// 更新会话显示
function updateSessionDisplay() {
  sessionIdDisplay.textContent = `会话ID: ${sessionId.substring(0, 8)}...`;
}

// 渲染MCP列表
function renderMcpList() {
  // 清空列表（除了空状态提示）
  const items = mcpListContainer.querySelectorAll('.mcp-item');
  items.forEach(item => item.remove());

  // 更新计数
  mcpCountElement.textContent = mcpList.length;

  // 显示或隐藏空状态
  if (mcpList.length === 0) {
    emptyState.style.display = 'block';
    return;
  } else {
    emptyState.style.display = 'none';
  }

  // 渲染列表项
  mcpList.forEach(mcp => {
    const template = document.getElementById('mcp-item-template');
    const clone = document.importNode(template.content, true);

    // 填充数据
    clone.querySelector('.mcp-name').textContent = mcp.name;
    clone.querySelector('.mcp-type').textContent = `类型: ${mcp.clientType}`;

    const statusElement = clone.querySelector('.mcp-status');
    statusElement.textContent = `状态: ${mcp.status === 'connected' ? '已连接' : '已断开'}`;
    statusElement.classList.add(mcp.status);

    // 添加工具列表和交互
    const toolsContainer = document.createElement('div');
    toolsContainer.className = 'mcp-tools-container';

    const toolsElement = clone.querySelector('.mcp-tools');
    toolsElement.textContent = '工具: ';

    if (mcp.tools && mcp.tools.length > 0) {
      mcp.tools.forEach((tool, index) => {
        const toolButton = document.createElement('button');
        toolButton.className = 'tool-button';
        toolButton.textContent = tool.name;
        toolButton.title = tool.description || '';
        toolButton.addEventListener('click', () => showToolDialog(mcp.name, tool.name));

        if (index > 0) {
          toolsContainer.appendChild(document.createTextNode(' '));
        }
        toolsContainer.appendChild(toolButton);
      });
    } else {
      toolsElement.textContent += '无可用工具';
    }

    toolsElement.appendChild(toolsContainer);

    // 添加事件监听器
    const reconnectBtn = clone.querySelector('.reconnect-btn');
    reconnectBtn.addEventListener('click', () => reconnectMcp(mcp));

    const deleteBtn = clone.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteMcp(mcp));

    // 将项目添加到列表
    mcpListContainer.appendChild(clone);
  });
}

// 工具调用函数
function callMcpTool(mcpName, toolName, params) {
  if (!sessionId) return Promise.reject(new Error('未连接会话'));

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
  dialog.querySelector('.cancel-btn').addEventListener('click', () => {
    dialog.remove();
  });

  dialog.querySelector('.execute-btn').addEventListener('click', () => {
    // 获取参数
    switch (toolName) {
      case 'search':
        params = { query: dialog.querySelector('#search-query').value };
        break;
      case 'calculator':
        params = { expression: dialog.querySelector('#calc-expression').value };
        break;
      case 'weather':
        params = { city: dialog.querySelector('#weather-city').value };
        break;
    }

    // 执行工具调用
    const executeBtn = dialog.querySelector('.execute-btn');
    executeBtn.disabled = true;
    executeBtn.textContent = '执行中...';

    callMcpTool(mcpName, toolName, params)
      .then(result => {
        const resultContainer = dialog.querySelector('.result-container');
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
      })
      .catch(error => {
        const resultContainer = dialog.querySelector('.result-container');
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = `
          <div class="error-result">
            <h4>执行失败</h4>
            <p>${error.message}</p>
          </div>
        `;
      })
      .finally(() => {
        executeBtn.disabled = false;
        executeBtn.textContent = '执行';
      });
  });
}

// 创建新会话
function createNewSession() {
  sessionManager.createNewSession().catch(error => {
    console.error('创建会话失败:', error);
    toastManager.showToast('创建会话失败: ' + error.message, 'error');
  });
}

// 添加MCP
function addMcp() {
  if (!validateForm() || !sessionId) return;

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
      toastManager.showToast('请输入命令', 'error');
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
  toastManager.showToast('正在添加MCP...', 'info');

  console.log('准备发送的 payload:', JSON.stringify(payload, null, 2));

  mcpManager
    .addMcp(payload)
    .then(mcp => {
      // 重置表单
      resetForm();

      // 切换到列表标签页
      switchTab('list-mcp');

      toastManager.showToast('MCP已添加', 'success');
    })
    .catch(error => {
      console.error('添加MCP失败:', error);
      toastManager.showToast('添加MCP失败: ' + error.message, 'error');
    })
    .finally(() => {
      addMcpBtn.disabled = false;
    });
}

// 重置表单
function resetForm() {
  serverNameInput.value = '';
  serverCommandInput.value = '';
  serverArgsInput.value = '';
  serverEnvInput.value = '';
  serverUrlInput.value = '';
  validateForm();
}

// 重新连接MCP
function reconnectMcp(mcp) {
  mcpManager.reconnectMcp(mcp).catch(error => {
    console.error('重新连接MCP失败:', error);
  });
}

// 删除MCP
function deleteMcp(mcp) {
  mcpManager.deleteMcp(mcp).catch(error => {
    console.error('删除MCP失败:', error);
  });
}

// 显示通知
function showToast(message, type = 'info') {
  toastManager.showToast(message, type);
}
