// Moirca 志愿助手 —— 后台 service worker
// 职责：把 popup 的请求转发到 Moirca 后端。支持自定义后端地址（chrome.storage.sync）。
// 只读、最小化：不主动采集页面，只在用户点按钮后才收到内容并转发。

const DEFAULT_API_BASE = 'http://localhost:8000';

async function getApiBase() {
  const { apiBase } = await chrome.storage.sync.get({ apiBase: DEFAULT_API_BASE });
  return (apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody && errBody.detail) || `HTTP ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  (async () => {
    const base = await getApiBase();
    switch (msg.type) {
      case 'ASK_CONTEXT': {
        const data = await postJson(`${base}/api/context/ask`, {
          page_title: msg.page_title || '',
          page_url: msg.page_url || '',
          context_text: msg.context_text || '',
          question: msg.question || '',
          agent_id: msg.agent_id || 'master',
        });
        sendResponse({ ok: true, data });
        break;
      }
      case 'PING': {
        const res = await fetch(`${base}/api/context/ping`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        sendResponse({ ok: true, data });
        break;
      }
      default:
        sendResponse({ ok: false, error: `未知消息类型: ${msg.type}` });
    }
  })().catch((e) => {
    sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
  });

  return true; // 保持消息通道，等待异步 sendResponse
});
