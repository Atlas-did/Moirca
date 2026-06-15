// ================================================================
// 表单填充引擎 — Vue/React 事件触发支持
// ================================================================

const FormFiller = {
  /**
   * 模拟 React/Vue 输入事件
   */
  setNativeValue(element, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  },

  /**
   * 填充志愿表
   */
  fill(config, volunteers, startRow = 0) {
    const detection = FormDetector.detect(config);
    if (!detection) return { success: false, filled: 0, error: '未检测到志愿填报表单' };

    const { rows, fields } = detection;
    let filled = 0;
    const isMajorSchool = config.model === 'major_school';

    for (let i = startRow; i < rows.length && i - startRow < volunteers.length; i++) {
      const row = rows[i];
      const vol = volunteers[i - startRow];
      if (!vol) break;

      try {
        // 院校代码
        const schoolInput = row.querySelector(fields.schoolCode);
        if (schoolInput && vol.school_code) {
          this.setNativeValue(schoolInput, String(vol.school_code));
        }

        if (isMajorSchool) {
          // 专业+院校模式：填充专业代码
          const majorInput = row.querySelector(fields.majorCode || fields.majorCodes);
          const codes = vol.major_codes || [];
          if (majorInput && codes[0]) {
            this.setNativeValue(majorInput, String(codes[0]));
          }
        } else {
          // 院校专业组模式：填充专业组代码 + 多个专业代码 + 调剂
          const groupInput = row.querySelector(fields.groupCode);
          if (groupInput && vol.group_code) {
            this.setNativeValue(groupInput, String(vol.group_code));
          }

          const majorInputs = row.querySelectorAll(fields.majorCodes);
          const codes = vol.major_codes || [];
          for (let j = 0; j < Math.min(majorInputs.length, codes.length, 6); j++) {
            if (codes[j]) this.setNativeValue(majorInputs[j], String(codes[j]));
          }

          const adjEl = row.querySelector(fields.adjustment);
          if (adjEl) {
            if (adjEl.tagName === 'SELECT') {
              adjEl.value = vol.adjustment !== false ? '1' : '0';
              adjEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (adjEl.type === 'radio') {
              const radios = row.querySelectorAll(`input[type="radio"][name="${adjEl.name}"]`);
              const target = [...radios].find((r) => r.value === (vol.adjustment !== false ? '1' : '0'));
              if (target) target.click();
            }
          }
        }
        filled++;
      } catch (e) {
        console.warn(`[Moirca] 填充第 ${i + 1} 行失败:`, e);
      }
    }

    return { success: true, filled, method: detection.method };
  },

  /**
   * 读取页面已填写的志愿
   */
  readFromPage(config) {
    const detection = FormDetector.detect(config);
    if (!detection) return [];

    const { rows, fields } = detection;
    const result = [];
    const isMajorSchool = config.model === 'major_school';

    rows.forEach((row, index) => {
      const schoolInput = row.querySelector(fields.schoolCode);
      const schoolCode = schoolInput ? schoolInput.value.trim() : '';
      if (!schoolCode) return;

      if (isMajorSchool) {
        const majorInput = row.querySelector(fields.majorCode || fields.majorCodes);
        result.push({
          row: index + 1,
          school_code: schoolCode,
          major_codes: majorInput ? [majorInput.value.trim()] : [],
          adjustment: null,
        });
      } else {
        const groupInput = row.querySelector(fields.groupCode);
        const majorInputs = row.querySelectorAll(fields.majorCodes);
        result.push({
          row: index + 1,
          school_code: schoolCode,
          group_code: groupInput ? groupInput.value.trim() : '',
          major_codes: [...majorInputs].map((el) => el.value.trim()).filter(Boolean),
          adjustment: true,
        });
      }
    });

    return result;
  },
};
