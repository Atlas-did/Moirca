import { CDPController } from '../cdp-controller.js';
import { FillParams, FillResult } from '../../types/index.js';

export class FillCommand {
  constructor(private cdp: CDPController) {}

  async execute(params: FillParams): Promise<FillResult> {
    if (!params.selector && !params.ref) {
      throw new Error('fill: selector or ref is required');
    }
    if (params.value == null) {
      throw new Error('fill: value is required');
    }

    const fillScript = (target: string) => `
      (() => {
        const __target = ${target};
        __target.focus();

        if (__target.isContentEditable) {
          const __sel = window.getSelection();
          if (__sel) {
            const __range = document.createRange();
            __range.selectNodeContents(__target);
            __sel.removeAllRanges();
            __sel.addRange(__range);
          }
          let __inserted = false;
          try {
            __inserted = document.execCommand('insertText', false, ${JSON.stringify(params.value)});
          } catch (_e) {
            __inserted = false;
          }
          if (!__inserted) {
            __target.textContent = ${JSON.stringify(params.value)};
            __target.dispatchEvent(new InputEvent('input', {
              inputType: 'insertText',
              data: ${JSON.stringify(params.value)},
              bubbles: true,
            }));
          }
          return { success: true, tag: __target.tagName, mode: 'contenteditable' };
        }

        const __nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        if (__nativeSetter) {
          __nativeSetter.call(__target, ${JSON.stringify(params.value)});
        } else {
          __target.value = ${JSON.stringify(params.value)};
        }

        __target.dispatchEvent(new Event('input', { bubbles: true }));
        __target.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, tag: __target.tagName, mode: 'value' };
      })()
    `;

    let expression: string;
    if (params.ref) {
      expression = fillScript(`window.__webbridge_refs__?.[${JSON.stringify(params.ref)}]`);
    } else {
      expression = fillScript(`document.querySelector(${JSON.stringify(params.selector)})`);
    }

    const result = await this.cdp.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`fill: ${result.exceptionDetails.text}`);
    }

    const value = result.result?.value;
    if (value?.error) throw new Error(value.error);
    return value || { success: true };
  }
}
