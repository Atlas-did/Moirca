// ================================================================
// 表单字段侦测引擎 — 多策略中文 label 匹配
// ================================================================

const FormDetector = {
  /**
   * 在页面中查找志愿填报表
   * 返回: { container, rows, fields } 或 null
   */
  detect(config) {
    const tableSel = config.selectors.volunteerTable;
    // 策略 1: 使用配置的选择器
    let container = this._query(tableSel.container);
    if (container) {
      const rows = this._queryAll(tableSel.rows, container);
      if (rows.length > 0) {
        return { container, rows, fields: tableSel.fields, method: 'config' };
      }
    }

    // 策略 2: 自动侦测（查找包含大量input的table）
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const inputs = table.querySelectorAll('input[type="text"]');
      if (inputs.length >= 10) {
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length >= 5) {
          return { container: table, rows: [...rows], fields: this._autoDetectFields(inputs), method: 'auto' };
        }
      }
    }

    // 策略 3: 查找包含若干input的form
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const inputs = form.querySelectorAll('input[type="text"]');
      if (inputs.length >= 10) {
        return { container: form, rows: this._formToRows(form, inputs), fields: this._autoDetectFields(inputs), method: 'form' };
      }
    }

    return null;
  },

  /**
   * 自动推断字段选择器（基于常见命名模式）
   */
  _autoDetectFields(inputs) {
    const allInputs = [...inputs];
    const schoolInputs = allInputs.filter(
      (el) => COMMON_SELECTORS.schoolCodePatterns.some((p) => el.matches(p))
    );
    const majorInputs = allInputs.filter(
      (el) => COMMON_SELECTORS.majorCodePatterns.some((p) => el.matches(p))
    );

    return {
      schoolCode: schoolInputs.length > 0 ? this._makeSelector(schoolInputs[0]) : 'input[name*="yxdh"]',
      groupCode: 'input[name*="zydh"]',
      majorCodes: majorInputs.length > 0 ? this._makeSelector(majorInputs[0]) : 'input[name*="zy"]',
      adjustment: COMMON_SELECTORS.adjustmentPatterns.join(', '),
    };
  },

  _makeSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.name) return `input[name="${el.name}"]`;
    if (el.className) return `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`;
    return el.tagName.toLowerCase();
  },

  _formToRows(form, inputs) {
    const rows = [];
    const trs = form.querySelectorAll('tr');
    for (const tr of trs) {
      if (tr.querySelectorAll('input[type="text"]').length >= 3) rows.push(tr);
    }
    return rows.length > 0 ? rows : [form];
  },

  _query(selector) {
    try { return document.querySelector(selector); } catch (_) { return null; }
  },

  _queryAll(selector, parent) {
    try { return [...(parent || document).querySelectorAll(selector)]; } catch (_) { return []; }
  },
};
