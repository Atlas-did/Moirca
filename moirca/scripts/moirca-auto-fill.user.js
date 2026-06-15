// ==UserScript==
// @name         Moirca 志愿填报助手
// @namespace    https://github.com/moirca
// @version      0.1.0
// @description  辅助高考志愿填报：从 Moirca 推荐结果一键填充到官方系统 + 结构化数据导出
// @author       Moirca
// @match        *://pg.eeagd.edu.cn/ks/*
// @match        *://*.eeagd.edu.cn/*
// @match        *://eea.gd.gov.cn/*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_setClipboard
// @license      AGPL-3.0
// @homepage     https://github.com/moirca
// @supportURL   https://github.com/moirca/issues
// ==/UserScript==

(function () {
  'use strict';

  // ================================================================
  // 省份配置映射
  // 填报季开放后，根据实际 DOM 结构修改 selectors
  // ================================================================

  const PROVINCE_CONFIGS = {
    guangdong: {
      name: '广东',
      matchPatterns: ['pg.eeagd.edu.cn', 'eea.gd.gov.cn', 'localhost', '127.0.0.1'],
      selectors: {
        // 登录页
        loginForm: {
          container: 'form[action*="login"], #loginForm, .login-form',
          studentId: 'input[name="ksh"], input[name="yhzh"], input[name="sfzh"], input#ksh, input#yhzh',
          password: 'input[type="password"]',
          captcha: 'input[name="captcha"], input[name="yzm"], #captcha, #yzm',
          submitBtn: 'button[type="submit"], input[type="submit"], .login-btn, #loginBtn',
        },
        // 批次选择页
        batchSelect: {
          container: 'table, .batch-table, #batchTable',
          rows: 'tbody tr, .batch-row',
          batchNameCell: 'td:first-child, .batch-name',
          actionCell: 'td:last-child, .batch-actions',
          enterBtn: 'a, button',
        },
        // 志愿填写页（核心）
        volunteerTable: {
          container: 'table#volunteer-table, .volunteer-table, form table, #fillTable',
          rows: 'tbody tr, .volunteer-row, tr[data-row]',
          fields: {
            schoolCode: 'input[name*="yxdh"], input[id*="yxdh"], input[name*="school"]',
            groupCode: 'input[name*="zydh"], input[id*="zydh"], input[name*="group"]',
            majorCodes: 'input[name*="zy"], input[id*="zy"], input[name*="major"]',
            adjustment: 'select[name*="tj"], input[type="radio"][name*="tj"], input[name*="adjust"]',
          },
        },
        // 操作按钮
        actionButtons: {
          verify: 'button, input[type="button"], input[type="submit"]',
          save: 'button, input[type="button"], input[type="submit"]',
          confirm: 'button, input[type="button"], input[type="submit"]',
        },
      },
      // 最多45个志愿行
      maxVolunteers: 45,
      majorsPerRow: 6,
    },

    // 模板 — 其他省份复制此结构
    template: {
      name: '模板',
      matchPatterns: ['example.edu.cn'],
      selectors: {
        loginForm: { container: '', studentId: '', password: '', captcha: '', submitBtn: '' },
        batchSelect: { container: '', rows: '', batchNameCell: '', actionCell: '', enterBtn: '' },
        volunteerTable: {
          container: '',
          rows: '',
          fields: { schoolCode: '', groupCode: '', majorCodes: '', adjustment: '' },
        },
        actionButtons: { verify: '', save: '', confirm: '' },
      },
      maxVolunteers: 45,
      majorsPerRow: 6,
    },
  };

  // ================================================================
  // 工具函数
  // ================================================================

  /** 根据当前 URL 自动检测省份 */
  function detectProvince() {
    const host = location.hostname.toLowerCase();
    for (const [key, cfg] of Object.entries(PROVINCE_CONFIGS)) {
      if (key === 'template') continue;
      if (cfg.matchPatterns.some((p) => host.includes(p))) {
        return { key, config: cfg };
      }
    }
    return null;
  }

  /** 等待元素出现（MutationObserver） */
  function waitForElement(selector, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素超时: ${selector}`));
      }, timeout);
    });
  }

  /** 模拟 React/Vue 输入事件（关键！否则框架不识别） */
  function setNativeValue(element, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    // 额外触发 focus/blur 以触发某些框架的验证
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  /** 安全选择（返回第一个匹配元素或 null） */
  function qs(selector, parent) {
    try {
      return (parent || document).querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  /** 安全全选 */
  function qsa(selector, parent) {
    try {
      return [...(parent || document).querySelectorAll(selector)];
    } catch (_) {
      return [];
    }
  }

  /** 生成唯一ID */
  function uid() {
    return 'moirca_' + Math.random().toString(36).slice(2, 9);
  }

  // ================================================================
  // 数据存储（GM API + localStorage 双通道）
  // ================================================================

  const Store = {
    /** 从 Moirca 应用（localStorage）读取推荐结果 */
    loadFromMoirca() {
      try {
        // Moirca 前端存储的推荐数据
        const raw = localStorage.getItem('moirca_recommend_export');
        if (raw) return JSON.parse(raw);
        // 兼容旧 key
        const old = localStorage.getItem('moirca_volunteer_data');
        if (old) return JSON.parse(old);
      } catch (_) {}
      return null;
    },

    /** 保存偏好设置（跨页面） */
    savePrefs(prefs) {
      if (typeof GM_setValue !== 'undefined') {
        GM_setValue('moirca_prefs', JSON.stringify(prefs));
      }
      localStorage.setItem('moirca_prefs', JSON.stringify(prefs));
    },

    /** 读取偏好设置 */
    loadPrefs() {
      try {
        if (typeof GM_getValue !== 'undefined') {
          const raw = GM_getValue('moirca_prefs', '{}');
          return JSON.parse(raw);
        }
      } catch (_) {}
      try {
        const raw = localStorage.getItem('moirca_prefs');
        return raw ? JSON.parse(raw) : {};
      } catch (_) {
        return {};
      }
    },

    /** 保存历史导出记录 */
    saveExportHistory(entry) {
      const history = this.loadExportHistory();
      history.unshift(entry);
      if (history.length > 50) history.length = 50; // 保留最近50条
      if (typeof GM_setValue !== 'undefined') {
        GM_setValue('moirca_export_history', JSON.stringify(history));
      }
      localStorage.setItem('moirca_export_history', JSON.stringify(history));
    },

    loadExportHistory() {
      try {
        if (typeof GM_getValue !== 'undefined') {
          return JSON.parse(GM_getValue('moirca_export_history', '[]'));
        }
      } catch (_) {}
      try {
        const raw = localStorage.getItem('moirca_export_history');
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    },
  };

  // ================================================================
  // 表单自动填充引擎
  // ================================================================

  const Filler = {
    /**
     * 填充志愿表
     * @param {Object} config - 省份配置
     * @param {Array} volunteers - 志愿数据数组
     * @param {Object} options - { startRow: 0, fillAll: true }
     */
    async fill(config, volunteers, options = {}) {
      const { startRow = 0, fillAll = true } = options;
      const tableSel = config.selectors.volunteerTable;

      // 查找志愿表容器
      const container = qs(tableSel.container);
      if (!container) {
        this._notify('error', '未检测到志愿填报表单');
        return { success: false, filled: 0, error: '找不到志愿表容器' };
      }

      // 获取所有行
      const rows = qsa(tableSel.rows, container);
      if (rows.length === 0) {
        this._notify('error', '志愿表为空，请先进入填报页面');
        return { success: false, filled: 0, error: '找不到志愿行' };
      }

      const fieldSel = tableSel.fields;
      let filled = 0;

      for (let i = startRow; i < rows.length && i - startRow < volunteers.length; i++) {
        const row = rows[i];
        const vol = volunteers[i - startRow];
        if (!vol) break;

        try {
          // 院校代码
          const schoolInput = qs(fieldSel.schoolCode, row);
          if (schoolInput && vol.school_code) {
            setNativeValue(schoolInput, String(vol.school_code));
          }

          // 专业组代码
          const groupInput = qs(fieldSel.groupCode, row);
          if (groupInput && vol.group_code) {
            setNativeValue(groupInput, String(vol.group_code));
          }

          // 专业代码（最多6个）
          const majorInputs = qsa(fieldSel.majorCodes, row);
          const codes = vol.major_codes || [];
          for (let j = 0; j < Math.min(majorInputs.length, codes.length, config.majorsPerRow); j++) {
            if (codes[j]) {
              setNativeValue(majorInputs[j], String(codes[j]));
            }
          }

          // 调剂选择
          const adjInput = qs(fieldSel.adjustment, row);
          if (adjInput && vol.adjustment !== undefined) {
            if (adjInput.tagName === 'SELECT') {
              adjInput.value = vol.adjustment ? '1' : '0';
              adjInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (adjInput.type === 'radio') {
              // 找到对应的 radio 并点击
              const radios = qsa(`input[type="radio"][name="${adjInput.name}"]`, row);
              const targetValue = vol.adjustment ? '1' : '0';
              const targetRadio = radios.find((r) => r.value === targetValue);
              if (targetRadio) targetRadio.click();
            }
          }

          filled++;
        } catch (e) {
          console.warn(`[Moirca] 填充第 ${i + 1} 行失败:`, e);
        }

        if (!fillAll && filled >= volunteers.length) break;
      }

      this._notify('success', `已填充 ${filled} 条志愿`);
      return { success: true, filled };
    },

    /** 从页面读取已填写的志愿数据（用于导出前的核对） */
    readFromPage(config) {
      const tableSel = config.selectors.volunteerTable;
      const container = qs(tableSel.container);
      if (!container) return [];

      const rows = qsa(tableSel.rows, container);
      const fieldSel = tableSel.fields;
      const result = [];

      rows.forEach((row, index) => {
        const schoolInput = qs(fieldSel.schoolCode, row);
        const groupInput = qs(fieldSel.groupCode, row);
        const schoolCode = schoolInput ? schoolInput.value.trim() : '';
        const groupCode = groupInput ? groupInput.value.trim() : '';
        if (!schoolCode && !groupCode) return;

        const majorInputs = qsa(fieldSel.majorCodes, row);
        const majorCodes = majorInputs.map((el) => el.value.trim()).filter(Boolean);
        const adjInput = qs(fieldSel.adjustment, row);
        let adjustment = true;
        if (adjInput) {
          adjustment =
            adjInput.tagName === 'SELECT' ? adjInput.value === '1' : adjInput.checked;
        }

        result.push({ row: index + 1, school_code: schoolCode, group_code: groupCode, major_codes: majorCodes, adjustment });
      });

      return result;
    },

    _notify(type, msg) {
      console.log(`[Moirca] ${msg}`);
      if (typeof GM_notification !== 'undefined') {
        GM_notification({ text: msg, timeout: 2500, title: type === 'error' ? '⚠️ 错误' : '✅ 完成' });
      }
    },
  };

  // ================================================================
  // 数据导出
  // ================================================================

  const Exporter = {
    /** 导出为 JSON 并下载 */
    downloadJSON(data, province) {
      const payload = {
        export_version: '1.0',
        province: province || 'unknown',
        exported_at: new Date().toISOString(),
        user_profile: data.profile || {},
        volunteers: data.volunteers || [],
        metadata: {
          script_version: '0.1.0',
          page_url: location.href,
          page_title: document.title,
        },
      };

      const json = JSON.stringify(payload, null, 2);
      const filename = `moirca-${province || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;

      if (typeof GM_download !== 'undefined') {
        GM_download({
          url: 'data:application/json;charset=utf-8,' + encodeURIComponent(json),
          name: filename,
          saveAs: true,
        });
      } else {
        // 降级：创建下载链接
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      // 保存到历史
      Store.saveExportHistory({
        filename,
        province,
        volunteerCount: payload.volunteers.length,
        exportedAt: payload.exported_at,
      });

      return payload;
    },

    /** 复制 JSON 到剪贴板 */
    copyToClipboard(data, province) {
      const payload = this.downloadJSON(data, province);
      const json = JSON.stringify(payload, null, 2);

      if (typeof GM_setClipboard !== 'undefined') {
        GM_setClipboard(json, { type: 'text', mimetype: 'text/plain' });
        if (typeof GM_notification !== 'undefined') {
          GM_notification({ text: '已复制到剪贴板', timeout: 2000 });
        }
      } else {
        navigator.clipboard.writeText(json).then(() => {
          console.log('[Moirca] 已复制到剪贴板');
        });
      }
    },
  };

  // ================================================================
  // UI — 浮动面板
  // ================================================================

  const UI = {
    panelId: 'moirca-floating-panel',
    _panel: null,
    _statusEl: null,
    _collapsed: false,

    /** 注入样式 */
    injectStyles() {
      const css = `
        #moirca-floating-panel {
          position: fixed;
          top: 80px;
          right: 16px;
          z-index: 999999;
          width: 240px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
          font-size: 13px;
          color: #1f2937;
          user-select: none;
          overflow: hidden;
          transition: box-shadow 0.2s;
        }
        #moirca-floating-panel:hover { box-shadow: 0 6px 28px rgba(0,0,0,0.18); }
        #moirca-floating-panel.moirca-collapsed { width: 44px; }

        .moirca-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          color: #fff;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
        }
        .moirca-header-left { display: flex; align-items: center; gap: 6px; }
        .moirca-toggle { font-size: 16px; line-height: 1; opacity: 0.8; cursor: pointer; }
        .moirca-toggle:hover { opacity: 1; }

        .moirca-body { padding: 10px 12px; }
        .moirca-collapsed .moirca-body { display: none; }
        .moirca-collapsed .moirca-header { border-radius: 12px; }

        .moirca-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          margin-bottom: 6px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f9fafb;
          color: #374151;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.15s;
          text-align: left;
          font-family: inherit;
        }
        .moirca-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
        .moirca-btn:active { background: #e5e7eb; transform: scale(0.98); }
        .moirca-btn:last-child { margin-bottom: 0; }
        .moirca-btn.primary { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
        .moirca-btn.primary:hover { background: #e0e7ff; border-color: #a5b4fc; }
        .moirca-btn.export { background: #fef3c7; border-color: #fde68a; color: #92400e; }
        .moirca-btn.export:hover { background: #fef08a; border-color: #fcd34d; }
        .moirca-btn.danger { background: #fef2f2; border-color: #fecaca; color: #991b1b; }

        .moirca-status {
          margin-top: 8px;
          padding: 6px 10px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-size: 11px;
          color: #166534;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .moirca-status.warn { background: #fefce8; border-color: #fef08a; color: #854d0e; }
        .moirca-status.error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }

        .moirca-separator {
          height: 1px;
          background: #e5e7eb;
          margin: 8px 0;
        }

        .moirca-badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          background: #dbeafe;
          color: #1d4ed8;
          margin-left: auto;
        }
      `;

      if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(css);
      } else {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
      }
    },

    /** 创建面板 */
    create(province, onAction) {
      if (this._panel) return;

      this.injectStyles();

      const panel = document.createElement('div');
      panel.id = this.panelId;

      panel.innerHTML = `
        <div class="moirca-header" id="moirca-header-btn">
          <span class="moirca-header-left">🔧 Moirca 填报助手</span>
          <span class="moirca-toggle" id="moirca-toggle-btn">−</span>
        </div>
        <div class="moirca-body">
          <button class="moirca-btn primary" data-action="import">
            <span>📋</span> 从 Moirca 导入数据
          </button>
          <button class="moirca-btn primary" data-action="fill">
            <span>✍️</span> 一键填充
          </button>
          <div class="moirca-separator"></div>
          <button class="moirca-btn export" data-action="download">
            <span>📥</span> 导出数据 (JSON)
          </button>
          <button class="moirca-btn" data-action="clipboard">
            <span>📋</span> 复制到剪贴板
          </button>
          <button class="moirca-btn" data-action="readPage">
            <span>👁️</span> 读取已填志愿
          </button>
          <div class="moirca-separator"></div>
          <button class="moirca-btn" data-action="clearAll">
            <span>🗑️</span> 清空所有志愿
          </button>
          <div class="moirca-status" id="moirca-status">
            <span>✅</span> 已就绪 · ${province || '未知省份'}
          </div>
        </div>
      `;

      document.body.appendChild(panel);
      this._panel = panel;
      this._statusEl = panel.querySelector('#moirca-status');

      // 折叠/展开
      const toggleBtn = panel.querySelector('#moirca-toggle-btn');
      const headerBtn = panel.querySelector('#moirca-header-btn');
      const toggleCollapse = () => {
        this._collapsed = !this._collapsed;
        panel.classList.toggle('moirca-collapsed', this._collapsed);
        toggleBtn.textContent = this._collapsed ? '+' : '−';
      };
      toggleBtn.addEventListener('click', toggleCollapse);
      headerBtn.addEventListener('click', (e) => {
        if (e.target !== toggleBtn) toggleCollapse();
      });

      // 按钮事件
      panel.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          onAction(action);
        });
      });

      // 可拖拽
      this._makeDraggable(panel.querySelector('.moirca-header'), panel);
    },

    /** 更新状态 */
    setStatus(msg, type = 'ok') {
      if (!this._statusEl) return;
      const icons = { ok: '✅', warn: '⚠️', error: '❌' };
      this._statusEl.className = `moirca-status${type !== 'ok' ? ` ${type}` : ''}`;
      this._statusEl.innerHTML = `<span>${icons[type] || '✅'}</span> ${msg}`;
    },

    /** 销毁面板 */
    destroy() {
      if (this._panel) {
        this._panel.remove();
        this._panel = null;
        this._statusEl = null;
      }
    },

    /** 简单拖拽 */
    _makeDraggable(handle, panel) {
      let offsetX = 0, offsetY = 0, startX = 0, startY = 0;
      handle.style.cursor = 'move';
      handle.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        offsetX = startX - rect.left;
        offsetY = startY - rect.top;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      const onMove = (e) => {
        panel.style.right = 'auto';
        panel.style.top = (e.clientY - offsetY) + 'px';
        panel.style.left = (e.clientX - offsetX) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    },
  };

  // ================================================================
  // 主入口
  // ================================================================

  function main() {
    const detected = detectProvince();

    // 等待页面加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initApp(detected));
    } else {
      initApp(detected);
    }
  }

  function initApp(detected) {
    if (!detected) {
      console.log('[Moirca] 当前网站不在支持列表中，跳过注入。URL:', location.href);
      return;
    }

    const { key: provinceKey, config } = detected;
    console.log(`[Moirca] 检测到省份: ${config.name} (${provinceKey})`);

    // 缓存导入的数据
    let cachedVolunteerData = null;

    // 创建 UI 面板
    UI.create(config.name, (action) => {
      switch (action) {
        case 'import':
          cachedVolunteerData = Store.loadFromMoirca();
          if (cachedVolunteerData && cachedVolunteerData.volunteers) {
            UI.setStatus(`已导入 ${cachedVolunteerData.volunteers.length} 条志愿`, 'ok');
            console.log('[Moirca] 导入数据:', cachedVolunteerData);
          } else {
            // 尝试手动输入 JSON
            const input = prompt(
              '请粘贴从 Moirca 导出的志愿数据 (JSON)：\n\n' +
              '在 Moirca 应用的推荐结果页点击「导出给脚本」即可复制数据。'
            );
            if (input) {
              try {
                cachedVolunteerData = JSON.parse(input);
                if (cachedVolunteerData.volunteers) {
                  // 同时存到 localStorage 供下次使用
                  localStorage.setItem('moirca_recommend_export', input);
                  UI.setStatus(`已导入 ${cachedVolunteerData.volunteers.length} 条志愿`, 'ok');
                } else {
                  UI.setStatus('数据格式不正确，缺少 volunteers 字段', 'error');
                  cachedVolunteerData = null;
                }
              } catch (e) {
                UI.setStatus('JSON 解析失败，请检查格式', 'error');
              }
            }
          }
          break;

        case 'fill':
          if (!cachedVolunteerData || !cachedVolunteerData.volunteers) {
            UI.setStatus('请先导入 Moirca 推荐数据', 'warn');
            return;
          }
          UI.setStatus('正在填充…', 'ok');
          Filler.fill(config, cachedVolunteerData.volunteers, { startRow: 0 }).then((res) => {
            if (res.success) {
              UI.setStatus(`已填充 ${res.filled} 条 · 请核对后保存`, 'ok');
            } else {
              UI.setStatus(res.error || '填充失败', 'error');
            }
          });
          break;

        case 'download':
          {
            const vols = cachedVolunteerData?.volunteers || Filler.readFromPage(config);
            const profile = cachedVolunteerData?.profile || {};
            if (vols.length === 0) {
              UI.setStatus('没有可导出的志愿数据', 'warn');
              return;
            }
            Exporter.downloadJSON({ volunteers: vols, profile }, config.name);
            UI.setStatus(`已导出 ${vols.length} 条志愿`, 'ok');
          }
          break;

        case 'clipboard':
          {
            const vols = cachedVolunteerData?.volunteers || Filler.readFromPage(config);
            const profile = cachedVolunteerData?.profile || {};
            if (vols.length === 0) {
              UI.setStatus('没有可复制的志愿数据', 'warn');
              return;
            }
            Exporter.copyToClipboard({ volunteers: vols, profile }, config.name);
            UI.setStatus(`已复制 ${vols.length} 条到剪贴板`, 'ok');
          }
          break;

        case 'readPage':
          {
            const vols = Filler.readFromPage(config);
            if (vols.length === 0) {
              UI.setStatus('页面上没有检测到已填写的志愿', 'warn');
            } else {
              // 将读取结果存入缓存
              cachedVolunteerData = { volunteers: vols, profile: {} };
              UI.setStatus(`已读取 ${vols.length} 条志愿`, 'ok');
              console.log('[Moirca] 读取的志愿:', vols);
            }
          }
          break;

        case 'clearAll':
          if (confirm('确定要清空页面上所有已填写的志愿吗？此操作不可恢复。')) {
            const rows = qsa(config.selectors.volunteerTable.rows);
            const fieldSel = config.selectors.volunteerTable.fields;
            let cleared = 0;
            rows.forEach((row) => {
              const inputs = [
                qs(fieldSel.schoolCode, row),
                qs(fieldSel.groupCode, row),
                ...qsa(fieldSel.majorCodes, row),
              ].filter(Boolean);
              inputs.forEach((el) => {
                setNativeValue(el, '');
                cleared++;
              });
            });
            cachedVolunteerData = null;
            UI.setStatus(`已清空 ${cleared} 个字段`, 'ok');
          }
          break;
      }
    });
  }

  // 启动
  main();
})();
