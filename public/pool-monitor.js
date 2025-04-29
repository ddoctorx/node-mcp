// MCP服务池监控模块
const poolMonitor = (() => {
  // 存储DOM元素引用
  let elements = {};
  // 存储轮询定时器
  let refreshTimer = null;
  // 轮询间隔（毫秒）
  const AUTO_REFRESH_INTERVAL = 10000; // 10秒

  // 初始化模块
  function init() {
    console.log('初始化池监控模块...');

    // 查找DOM元素
    elements = {
      totalInstances: document.getElementById('total-instances'),
      activeInstances: document.getElementById('active-instances'),
      idleInstances: document.getElementById('idle-instances'),
      lastUpdateTime: document.getElementById('last-update-time'),
      refreshButton: document.getElementById('refresh-pool-status'),
      cleanupButton: document.getElementById('cleanup-idle-instances'),
      instanceList: document.getElementById('instance-list'),
      createDuplicateButton: document.getElementById('create-duplicate-instance'),
      testServerName: document.getElementById('test-server-name'),
      testServerCommand: document.getElementById('test-server-command'),
      testServerArgs: document.getElementById('test-server-args'),
      testResult: document.getElementById('reuse-test-result'),
      instanceTemplate: document.getElementById('instance-item-template'),
    };

    // 绑定事件
    bindEvents();

    // 初始化数据
    refreshPoolStats();
    refreshInstanceList();

    // 启动自动刷新
    startAutoRefresh();
  }

  // 绑定事件处理函数
  function bindEvents() {
    elements.refreshButton.addEventListener('click', () => {
      refreshPoolStats();
      refreshInstanceList();
    });

    elements.cleanupButton.addEventListener('click', () => {
      cleanupIdleInstances();
    });

    elements.createDuplicateButton.addEventListener('click', () => {
      createDuplicateInstance();
    });

    // 标签页切换事件
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'monitor-pool') {
          refreshPoolStats();
          refreshInstanceList();
        }
      });
    });
  }

  // 启动自动刷新
  function startAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {
      if (document.getElementById('monitor-pool').classList.contains('active')) {
        refreshPoolStats();
        refreshInstanceList();
      }
    }, AUTO_REFRESH_INTERVAL);
  }

  // 停止自动刷新
  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // 刷新池状态
  function refreshPoolStats() {
    fetch('/api/mcp/pool')
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          updatePoolStatsUI(data.stats);
        } else {
          showError(`获取池状态失败: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('获取池状态出错:', error);
        showError(`获取池状态出错: ${error.message}`);
      });
  }

  // 更新池状态UI
  function updatePoolStatsUI(stats) {
    elements.totalInstances.textContent = stats.totalInstances;
    elements.activeInstances.textContent = stats.activeInstances;
    elements.idleInstances.textContent = stats.idleInstances;
    elements.lastUpdateTime.textContent = formatDateTime(new Date());
  }

  // 刷新实例列表
  function refreshInstanceList() {
    fetch('/api/mcp/instances')
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          renderInstanceList(data.instances);
        } else {
          showError(`获取实例列表失败: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('获取实例列表出错:', error);
        showError(`获取实例列表出错: ${error.message}`);
      });
  }

  // 渲染实例列表
  function renderInstanceList(instances) {
    // 清空实例列表
    elements.instanceList.innerHTML = '';

    if (!instances || instances.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = '<p>暂无MCP实例</p>';
      elements.instanceList.appendChild(emptyState);
      return;
    }

    // 排序实例（先按活跃状态，再按创建时间）
    instances.sort((a, b) => {
      // 先按会话数排序（活跃的在前）
      if (a.sessionCount !== b.sessionCount) {
        return b.sessionCount - a.sessionCount;
      }
      // 再按创建时间排序（新的在前）
      return new Date(b.createdTime) - new Date(a.createdTime);
    });

    // 渲染每个实例
    instances.forEach(instance => {
      const instanceEl = elements.instanceTemplate.content
        .cloneNode(true)
        .querySelector('.instance-item');

      instanceEl.querySelector('.instance-name').textContent = instance.name;
      instanceEl.querySelector('.instance-id').textContent = instance.instanceId;
      instanceEl.querySelector('.instance-type').textContent = instance.type;
      instanceEl.querySelector('.instance-sessions').textContent = instance.sessionCount;

      const statusEl = instanceEl.querySelector('.instance-status');
      statusEl.textContent = instance.status;
      statusEl.classList.add(`status-${instance.status}`);

      instanceEl.querySelector('.instance-created').textContent = formatDateTime(
        new Date(instance.createdTime),
      );

      // 绑定按钮事件
      const viewBtn = instanceEl.querySelector('.view-instance-btn');
      viewBtn.addEventListener('click', () => {
        showInstanceDetail(instance.instanceId);
      });

      const removeBtn = instanceEl.querySelector('.remove-instance-btn');
      removeBtn.addEventListener('click', () => {
        removeInstance(instance.instanceId);
      });

      // 如果有活跃会话，禁用删除按钮
      if (instance.sessionCount > 0) {
        removeBtn.disabled = true;
        removeBtn.title = '实例有活跃会话，无法删除';
      }

      elements.instanceList.appendChild(instanceEl);
    });
  }

  // 显示实例详情
  function showInstanceDetail(instanceId) {
    fetch(`/api/proxy/instance/${instanceId}?sessionId=${sessionId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          // 格式化实例详情并显示
          const instance = data.instance;
          const detailsHtml = `
            <h3>实例详情</h3>
            <table>
              <tr><td>实例ID:</td><td>${instance.instanceId}</td></tr>
              <tr><td>名称:</td><td>${instance.name}</td></tr>
              <tr><td>类型:</td><td>${instance.clientType}</td></tr>
              <tr><td>状态:</td><td>${instance.status}</td></tr>
              <tr><td>关联会话数:</td><td>${instance.sessionCount}</td></tr>
              <tr><td>创建时间:</td><td>${formatDateTime(new Date(instance.createdTime))}</td></tr>
              <tr><td>最后使用:</td><td>${formatDateTime(new Date(instance.lastUsedTime))}</td></tr>
              <tr><td>工具数量:</td><td>${instance.tools ? instance.tools.length : 0}</td></tr>
            </table>
          `;

          // 显示弹窗
          alert(detailsHtml);
        } else {
          showError(`获取实例详情失败: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('获取实例详情出错:', error);
        showError(`获取实例详情出错: ${error.message}`);
      });
  }

  // 删除实例
  function removeInstance(instanceId) {
    if (!confirm(`确定要删除实例 ${instanceId} 吗？此操作不可恢复！`)) {
      return;
    }

    // 调用删除API
    fetch('/api/proxy/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify({
        instanceId,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          toastManager.showToast('实例已成功删除', 'success');
          refreshPoolStats();
          refreshInstanceList();
        } else {
          showError(`删除实例失败: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('删除实例出错:', error);
        showError(`删除实例出错: ${error.message}`);
      });
  }

  // 清理空闲实例
  function cleanupIdleInstances() {
    if (!confirm('确定要清理所有空闲实例吗？此操作不可恢复！')) {
      return;
    }

    // 强制触发一次生命周期清理
    fetch('/api/lifecycle/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          toastManager.showToast(`已清理 ${data.cleanedCount || 0} 个空闲实例`, 'success');
          refreshPoolStats();
          refreshInstanceList();
        } else {
          showError(`清理空闲实例失败: ${data.error}`);
        }
      })
      .catch(error => {
        console.error('清理空闲实例出错:', error);
        // 即使API不存在也视为成功，只是通过定时器实现的
        toastManager.showToast('已触发空闲实例清理', 'info');
        // 延迟刷新以等待清理完成
        setTimeout(() => {
          refreshPoolStats();
          refreshInstanceList();
        }, 2000);
      });
  }

  // 创建重复实例（测试复用功能）
  function createDuplicateInstance() {
    const name = elements.testServerName.value.trim();
    const command = elements.testServerCommand.value.trim();
    const argsString = elements.testServerArgs.value.trim();

    if (!name || !command) {
      showTestResult('请输入服务名称和命令', 'error');
      return;
    }

    // 解析参数
    const args = argsString
      .split(',')
      .map(arg => arg.trim())
      .filter(arg => arg);

    // 构造请求
    const payload = {
      name,
      clientType: 'stdio',
      command,
      args,
    };

    // 显示测试中状态
    showTestResult('正在测试实例复用，请稍候...', 'info');

    // 调用API创建MCP
    mcpManager
      .addMcp({
        sessionId,
        ...payload,
      })
      .then(mcp => {
        toastManager.showToast(`MCP服务 ${name} 已添加`, 'success');

        // 检查是否复用
        if (mcp.isPooled && !mcp.isNew) {
          showTestResult(`测试成功：实例被复用！实例ID: ${mcp.instanceId}`, 'success');
        } else {
          showTestResult(`创建了新实例，未复用。实例ID: ${mcp.instanceId}`, 'info');
        }

        // 刷新状态
        refreshPoolStats();
        refreshInstanceList();
      })
      .catch(error => {
        console.error('测试实例复用失败:', error);
        showTestResult(`测试失败: ${error.message}`, 'error');
      });
  }

  // 显示测试结果
  function showTestResult(message, type = 'info') {
    elements.testResult.textContent = message;
    elements.testResult.className = 'test-result';

    if (type === 'success') {
      elements.testResult.classList.add('test-success');
    } else if (type === 'error') {
      elements.testResult.classList.add('test-error');
    }
  }

  // 显示错误信息
  function showError(message) {
    toastManager.showToast(message, 'error');
  }

  // 格式化日期时间
  function formatDateTime(date) {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return {
    init,
    refreshPoolStats,
    refreshInstanceList,
    startAutoRefresh,
    stopAutoRefresh,
  };
})();

// 在文档加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 等待主应用初始化完成后再初始化池监控模块
  setTimeout(() => {
    poolMonitor.init();
  }, 1000);
});
