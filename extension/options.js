// PaperAgent - Options Page

document.addEventListener('DOMContentLoaded', async () => {
  const customPort = document.getElementById('customPort');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const saveStatus = document.getElementById('saveStatus');

  // ─── Load current config ─────────────────────────────────────────────

  const result = await chrome.storage.sync.get('paperagent_config');
  const config = result.paperagent_config || {};
  if (config.port) customPort.value = config.port;

  // ─── Check status ────────────────────────────────────────────────────

  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (status.running) {
      statusDot.className = 'dot running';
      statusText.textContent = `PaperAgent 运行中 (端口 ${status.port})`;
      if (status.configuredPort && status.port !== parseInt(status.configuredPort)) {
        statusText.textContent += `（配置端口 ${status.configuredPort}，实际运行 ${status.port}）`;
      }
    } else {
      statusDot.className = 'dot stopped';
      statusText.textContent = 'PaperAgent 未运行';
      if (status.configuredPort) {
        statusText.textContent += `（已配置端口 ${status.configuredPort}，但未响应）`;
      }
    }
  } catch {
    statusDot.className = 'dot stopped';
    statusText.textContent = '无法连接到 Service Worker';
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  saveBtn.addEventListener('click', async () => {
    const val = customPort.value.trim();
    let port = null;

    if (val) {
      port = parseInt(val, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        setStatus('请输入有效端口 (1-65535)', 'error');
        return;
      }
    }

    try {
      await chrome.storage.sync.set({ paperagent_config: { port } });
      setStatus(port ? `已保存端口 ${port}` : '已保存，使用自动探测', 'success');
    } catch (err) {
      setStatus('保存失败: ' + err.message, 'error');
    }
  });

  // ─── Clear ────────────────────────────────────────────────────────────

  clearBtn.addEventListener('click', async () => {
    customPort.value = '';
    try {
      await chrome.storage.sync.set({ paperagent_config: { port: null } });
      setStatus('已清除自定义端口，使用自动探测', 'success');
    } catch (err) {
      setStatus('清除失败: ' + err.message, 'error');
    }
  });

  function setStatus(msg, type) {
    saveStatus.textContent = msg;
    saveStatus.className = type;
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  }
});
