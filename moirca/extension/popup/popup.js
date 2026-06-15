// ================================================================
// Popup Script — 快速状态 + 操作按钮
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 查询当前标签页的省份
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(false, '当前页面未注入（非填报系统或需刷新）');
        return;
      }
      // 获取后台的省份检测结果
      chrome.runtime.sendMessage({ type: 'DETECT_PROVINCE', url: tab.url }, (res) => {
        if (res && res.province) {
          showStatus(true, `已连接 · ${res.config.name}填报系统`);
        } else {
          showStatus(false, '当前网站不在支持列表中');
        }
      });
    });
  });

  // 按钮事件
  document.getElementById('btnFill').addEventListener('click', () => sendToTab('fill'));
  document.getElementById('btnRead').addEventListener('click', () => sendToTab('read'));
  document.getElementById('btnExport').addEventListener('click', () => sendToTab('download'));
  document.getElementById('btnOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('linkGuide').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/moirca/moirca/blob/main/extension/README.md' });
  });
});

function showStatus(active, text) {
  const row = document.getElementById('statusRow');
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (active) {
    row.className = 'status-row';
    dot.className = 'status-dot';
  } else {
    row.className = 'status-row inactive';
    dot.className = 'status-dot inactive';
  }
  txt.textContent = text;
}

function sendToTab(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    // 通过 content script 的消息通道发送
    chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_ACTION', action }).catch(() => {
      alert('无法连接到当前页面。请刷新填报系统页面后重试。');
    });
  });
}
