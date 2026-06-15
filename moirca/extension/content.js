// ================================================================
// Content Script — Shadow DOM UI 注入 + 表单侦测 + 自动填充
// ================================================================

(function () {
  'use strict';

  let panelHost = null;
  let shadowRoot = null;
  let cachedVolunteerData = null;
  let detectedProvince = null;

  // 等待页面加载后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    detectedProvince = detectProvince(location.href);
    if (!detectedProvince) {
      console.log('[Moirca] 当前网站不在支持列表中:', location.hostname);
      return;
    }
    console.log(`[Moirca] 检测到省份: ${detectedProvince.config.name}`);
    injectPanel();
  }

  // ================================================================
  // Shadow DOM UI 注入
  // ================================================================

  function injectPanel() {
    if (document.getElementById('moirca-ext-host')) return;

    // 宿主元素
    const host = document.createElement('div');
    host.id = 'moirca-ext-host';
    Object.assign(host.style, {
      position: 'fixed', top: '80px', right: '16px',
      zIndex: '2147483647', width: '0', height: '0',
      overflow: 'visible', pointerEvents: 'none',
    });
    document.body.appendChild(host);

    // Shadow DOM
    shadowRoot = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host { all: initial; }
      .panel {
        pointer-events: auto;
        width: 230px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        font-family: "Microsoft YaHei","PingFang SC",sans-serif;
        font-size: 12px;
        color: #1f2937;
        overflow: hidden;
      }
      .header {
        display:flex; align-items:center; justify-content:space-between;
        padding:8px 10px; background:linear-gradient(135deg,#4f46e5,#6366f1); color:#fff;
        font-weight:600; font-size:12px; cursor:move;
      }
      .body { padding:8px 10px; }
      .btn {
        display:flex; align-items:center; gap:6px; width:100%; padding:7px 10px;
        margin-bottom:4px; border:1px solid #e5e7eb; border-radius:7px;
        background:#f9fafb; color:#374151; cursor:pointer; font-size:11px;
        font-weight:500; transition:all .15s; text-align:left; font-family:inherit;
      }
      .btn:hover { background:#f3f4f6; border-color:#d1d5db; }
      .btn:last-child { margin-bottom:0; }
      .btn.primary { background:#eef2ff; border-color:#c7d2fe; color:#4338ca; }
      .btn.export { background:#fef3c7; border-color:#fde68a; color:#92400e; }
      .status {
        margin-top:6px; padding:5px 8px; background:#f0fdf4; border:1px solid #bbf7d0;
        border-radius:5px; font-size:10px; color:#166534;
      }
      .status.warn { background:#fefce8; border-color:#fef08a; color:#854d0e; }
      .sep { height:1px; background:#e5e7eb; margin:6px 0; }
      .badge {
        display:inline-block; padding:1px 5px; border-radius:8px; font-size:9px;
        font-weight:600; background:#dbeafe; color:#1d4ed8; margin-left:auto;
      }
    `);
    shadowRoot.adoptedStyleSheets = [sheet];

    // UI 结构
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header" id="moirca-drag-handle">
        <span>🔧 Moirca · ${detectedProvince.config.name}</span>
        <span class="badge">扩展版</span>
      </div>
      <div class="body">
        <button class="btn primary" data-action="import">📋 从 Moirca 导入</button>
        <button class="btn primary" data-action="fill">✍️ 一键填充</button>
        <div class="sep"></div>
        <button class="btn export" data-action="download">📥 导出 JSON</button>
        <button class="btn" data-action="clipboard">📋 复制到剪贴板</button>
        <button class="btn" data-action="read">👁️ 读取已填志愿</button>
        <div class="sep"></div>
        <button class="btn" data-action="clear">🗑️ 清空当前页</button>
        <div class="status" id="moirca-status">✅ 已就绪</div>
      </div>
    `;
    shadowRoot.appendChild(panel);

    // 事件绑定
    panel.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });

    // 拖拽
    makeDraggable(shadowRoot.querySelector('.header'), host);
    panelHost = host;
  }

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PING') { sendResponse({ ok: true }); return; }
    if (request.type === 'TRIGGER_ACTION') {
      handleAction(request.action);
      sendResponse({ ok: true });
      return;
    }
  });

  // ================================================================
  // 操作处理
  // ================================================================

  function handleAction(action) {
    switch (action) {
      case 'import':
        loadFromStorage();
        break;
      case 'fill':
        if (!cachedVolunteerData) { setStatus('请先导入数据', 'warn'); return; }
        setStatus('正在填充…', '');
        {
          const result = FormFiller.fill(detectedProvince.config, cachedVolunteerData.volunteers);
          setStatus(result.success ? `已填充 ${result.filled} 条` : (result.error || '失败'), result.success ? '' : 'warn');
        }
        break;
      case 'download':
        downloadJSON();
        break;
      case 'clipboard':
        copyToClipboard();
        break;
      case 'read':
        {
          const vols = FormFiller.readFromPage(detectedProvince.config);
          if (vols.length === 0) { setStatus('未检测到志愿数据', 'warn'); return; }
          cachedVolunteerData = { volunteers: vols, province: detectedProvince.config.name };
          setStatus(`已读取 ${vols.length} 条`, '');
        }
        break;
      case 'clear':
        if (!confirm('确定清空页面上所有志愿吗？')) return;
        {
          const detection = FormDetector.detect(detectedProvince.config);
          if (detection) {
            detection.rows.forEach((row) => {
              row.querySelectorAll('input[type="text"]').forEach((el) => FormFiller.setNativeValue(el, ''));
            });
          }
          setStatus('已清空', '');
        }
        break;
    }
  }

  // ================================================================
  // 数据操作
  // ================================================================

  async function loadFromStorage() {
    // 1. 尝试从 chrome.storage 读取
    try {
      const result = await chrome.storage.local.get('moirca_volunteer_data');
      if (result.moirca_volunteer_data) {
        cachedVolunteerData = result.moirca_volunteer_data;
        setStatus(`已导入 ${cachedVolunteerData.volunteers?.length || 0} 条`, '');
        return;
      }
    } catch (_) {}

    // 2. 从 localStorage 读取
    try {
      const raw = localStorage.getItem('moirca_recommend_export');
      if (raw) {
        cachedVolunteerData = JSON.parse(raw);
        setStatus(`已导入 ${cachedVolunteerData.volunteers?.length || 0} 条`, '');
        return;
      }
    } catch (_) {}

    // 3. 手动粘贴
    const input = prompt('请粘贴从 Moirca 导出的 JSON 数据：');
    if (input) {
      try {
        cachedVolunteerData = JSON.parse(input);
        if (cachedVolunteerData.volunteers) {
          setStatus(`已导入 ${cachedVolunteerData.volunteers.length} 条`, '');
        }
      } catch (_) {
        setStatus('JSON 格式错误', 'warn');
      }
    }
  }

  function downloadJSON() {
    const vols = cachedVolunteerData?.volunteers || FormFiller.readFromPage(detectedProvince.config);
    const payload = {
      export_version: '1.0',
      province: detectedProvince.config.name,
      exported_at: new Date().toISOString(),
      user_profile: cachedVolunteerData?.user_profile || {},
      volunteers: vols,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moirca-${detectedProvince.config.name}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 通知后台记录
    chrome.runtime.sendMessage({ type: 'ADD_EXPORT_ENTRY', entry: { province: detectedProvince.config.name, count: vols.length } });
    setStatus(`已导出 ${vols.length} 条`, '');
  }

  function copyToClipboard() {
    const vols = cachedVolunteerData?.volunteers || FormFiller.readFromPage(detectedProvince.config);
    const payload = { province: detectedProvince.config.name, volunteers: vols, exported_at: new Date().toISOString() };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => setStatus('已复制到剪贴板', ''));
  }

  function setStatus(msg, type) {
    const el = shadowRoot?.getElementById('moirca-status');
    if (!el) return;
    el.className = `status${type ? ' ' + type : ''}`;
    el.textContent = msg;
  }

  function makeDraggable(handle, host) {
    let ox = 0, oy = 0, sx = 0, sy = 0;
    handle.addEventListener('mousedown', (e) => {
      sx = e.clientX; sy = e.clientY;
      const rect = host.getBoundingClientRect();
      ox = sx - rect.left; oy = sy - rect.top;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    const move = (e) => {
      host.style.right = 'auto';
      host.style.top = (e.clientY - oy) + 'px';
      host.style.left = (e.clientX - ox) + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }
})();
