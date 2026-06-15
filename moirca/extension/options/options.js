// ================================================================
// Options Script — 档案管理 + 偏好设置 + 数据管理
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadProfiles();
  loadPrefs();

  document.getElementById('btnAddProfile').addEventListener('click', addProfile);
  document.getElementById('btnSavePrefs').addEventListener('click', savePrefs);
  document.getElementById('btnExportData').addEventListener('click', exportData);
  document.getElementById('btnClearData').addEventListener('click', clearData);
});

// --- 档案管理 ---

async function loadProfiles() {
  chrome.runtime.sendMessage({ type: 'LOAD_PROFILES' }, (res) => {
    const list = document.getElementById('profileList');
    const profiles = res?.profiles || [];
    if (profiles.length === 0) {
      list.innerHTML = '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px;">暂无档案</div>';
      return;
    }
    list.innerHTML = profiles
      .map(
        (p) => `
      <div class="profile-item">
        <span>
          ${p.score || '-'}分 · ${p.province || '-'} · ${p.subject || '-'}
          ${p.rank ? ` · 位次${p.rank}` : ''}
        </span>
        <button class="danger" data-id="${p.id}" onclick="deleteProfile('${p.id}')">删除</button>
      </div>`
      )
      .join('');
  });
}

function addProfile() {
  const score = document.getElementById('profScore').value;
  const province = document.getElementById('profProvince').value;
  const subject = document.getElementById('profSubject').value;
  const rank = document.getElementById('profRank').value;

  if (!score || !province) { alert('请至少填写分数和省份'); return; }

  const profile = { score: parseFloat(score), province, subject, rank: rank ? parseInt(rank) : null };
  chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', profile }, () => {
    document.getElementById('profScore').value = '';
    document.getElementById('profProvince').value = '';
    document.getElementById('profRank').value = '';
    loadProfiles();
  });
}

// 需要暴露到全局作用域以便 onclick 使用
window.deleteProfile = function (id) {
  chrome.runtime.sendMessage({ type: 'DELETE_PROFILE', profileId: id }, () => loadProfiles());
};

// --- 偏好设置 ---

async function loadPrefs() {
  chrome.runtime.sendMessage({ type: 'LOAD_PREFS' }, (res) => {
    const prefs = res?.prefs || {};
    document.getElementById('prefAutoDetect').checked = prefs.autoDetect !== false;
    document.getElementById('prefShowPanel').checked = prefs.showPanel !== false;
  });
}

function savePrefs() {
  const prefs = {
    autoDetect: document.getElementById('prefAutoDetect').checked,
    showPanel: document.getElementById('prefShowPanel').checked,
  };
  chrome.runtime.sendMessage({ type: 'SAVE_PREFS', prefs }, () => {
    const msg = document.getElementById('prefMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
}

// --- 数据管理 ---

async function exportData() {
  chrome.runtime.sendMessage({ type: 'LOAD_EXPORT_HISTORY' }, (res) => {
    const history = res?.history || [];
    if (history.length === 0) { alert('暂无导出历史'); return; }
    const json = JSON.stringify(history, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moirca-export-history.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function clearData() {
  if (!confirm('确定清除所有本地数据（档案、设置、导出历史）？此操作不可恢复。')) return;
  chrome.storage.local.clear(() => {
    chrome.storage.session.clear(() => {
      const msg = document.getElementById('dataMsg');
      msg.textContent = '✅ 已清除所有本地数据';
      msg.classList.add('show');
      setTimeout(() => msg.classList.remove('show'), 2000);
      loadProfiles();
    });
  });
}
