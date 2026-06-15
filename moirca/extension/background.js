// ================================================================
// Service Worker — 消息路由 + 存储管理 + 跨域请求代理
// ================================================================

importScripts('utils/storage.js', 'utils/province-configs.js');

// 安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Moirca] Extension installed');
  Storage.savePrefs({ autoDetect: true, showPanel: true });
});

// 保持 SW 存活（每20分钟重置空闲计时器）
chrome.alarms.create('keepalive', { periodInMinutes: 20 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    console.log('[Moirca] SW keepalive');
  }
});

// ================================================================
// 消息路由
// ================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    // 获取当前标签页的省份检测结果
    case 'DETECT_PROVINCE':
      handleDetectProvince(sender, sendResponse);
      return true; // 异步响应

    // 获取用户档案
    case 'LOAD_PROFILES':
      Storage.loadProfiles().then((profiles) => sendResponse({ profiles }));
      return true;

    // 保存用户档案
    case 'SAVE_PROFILE':
      Storage.addProfile(request.profile).then((p) => sendResponse({ profile: p }));
      return true;

    // 删除用户档案
    case 'DELETE_PROFILE':
      Storage.deleteProfile(request.profileId).then(() => sendResponse({ ok: true }));
      return true;

    // 保存导出历史
    case 'ADD_EXPORT_ENTRY':
      Storage.addExportEntry(request.entry).then(() => sendResponse({ ok: true }));
      return true;

    // 获取导出历史
    case 'LOAD_EXPORT_HISTORY':
      Storage.loadExportHistory().then((history) => sendResponse({ history }));
      return true;

    // 获取偏好设置
    case 'LOAD_PREFS':
      Storage.loadPrefs().then((prefs) => sendResponse({ prefs }));
      return true;

    // 保存偏好设置
    case 'SAVE_PREFS':
      Storage.savePrefs(request.prefs).then(() => sendResponse({ ok: true }));
      return true;

    // 跨域 API 请求代理
    case 'API_REQUEST':
      handleApiRequest(request, sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type: ' + request.type });
      return false;
  }
});

// 处理省份检测
function handleDetectProvince(sender, sendResponse) {
  if (sender.tab && sender.tab.url) {
    const result = detectProvince(sender.tab.url);
    sendResponse({ province: result ? result.key : null, config: result ? result.config : null });
  } else {
    sendResponse({ province: null });
  }
}

// 处理 API 代理请求
async function handleApiRequest(request, sendResponse) {
  try {
    const { url, method, headers, body } = request;
    const res = await fetch(url, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      sendResponse({ data: JSON.parse(text), status: res.status });
    } catch {
      sendResponse({ data: text, status: res.status });
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}
