import { CDPController } from '../cdp-controller.js';
import { ClickParams, ClickResult } from '../../types/index.js';

export class ClickCommand {
  constructor(private cdp: CDPController) {}

  async execute(params: ClickParams): Promise<ClickResult> {
    if (!params.selector && !params.ref) {
      throw new Error('click: selector or ref is required');
    }

    let expression: string;
    if (params.ref) {
      // 通过 ref 点击（需要先 snapshot 获取 ref）
      expression = `
        (() => {
          const el = window.__webbridge_refs__?.[${JSON.stringify(params.ref)}];
          if (!el) return { error: 'ref not found: ${params.ref}' };
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100) };
        })()
      `;
    } else {
      expression = `
        (() => {
          const el = document.querySelector(${JSON.stringify(params.selector)});
          if (!el) return { error: 'element not found: ${params.selector}' };
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { success: true, tag: el.tagName, text: el.textContent?.slice(0, 100) };
        })()
      `;
    }

    const result = await this.cdp.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`click: ${result.exceptionDetails.text}`);
    }

    const value = result.result?.value;
    if (value?.error) throw new Error(value.error);
    return value || { success: true };
  }
}
