// fill(§a.5,pro only):native setter + input/change 事件,contenteditable 走 execCommand;
// secret=true 时结果与错误信息不回显 value;pressEnter 复用 press_key 的键位序列。
import { BridgeError } from '../../background/bridge-error.js';
import type { FillParams, FillResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { resolveElement } from '../element-locator.js';
import { planKey } from '../keymap.js';

export async function fill(deps: CommandDeps, params: FillParams): Promise<FillResult> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  if (!params.ref && !params.selector) {
    throw new BridgeError('INVALID_PARAMS', 'fill: ref 与 selector 必须提供其一', { tabId });
  }
  if (typeof params.value !== 'string') {
    throw new BridgeError('INVALID_PARAMS', 'fill: value 必填(字符串)', { tabId, field: 'value' });
  }
  if (params.value.length > 10_000) {
    throw new BridgeError('INVALID_PARAMS', 'fill: value 超过 10,000 字符上限(§a.5)', { tabId, field: 'value' });
  }
  const secret = !!params.secret;
  const value = params.value;

  const el = await resolveElement(cdp, deps.snapshots, tabId, { ref: params.ref, selector: params.selector });

  const fillScript = `function(valueJson) {
    const value = JSON.parse(valueJson);
    const __target = this;
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
      try { __inserted = document.execCommand('insertText', false, value); } catch (_e) { __inserted = false; }
      if (!__inserted) {
        __target.textContent = value;
        __target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: value, bubbles: true }));
      }
      return { mode: 'contenteditable', tag: __target.tagName.toLowerCase() };
    }
    const proto = __target.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const __nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (__nativeSetter) __nativeSetter.call(__target, value);
    else __target.value = value;
    __target.dispatchEvent(new Event('input', { bubbles: true }));
    __target.dispatchEvent(new Event('change', { bubbles: true }));
    return { mode: 'value', tag: __target.tagName.toLowerCase() };
  }`;

  const res = (await cdp.sendCommand(tabId, 'Runtime.callFunctionOn', {
    objectId: el.objectId,
    functionDeclaration: fillScript,
    arguments: [{ value: JSON.stringify(value) }],
    returnByValue: true,
    awaitPromise: false,
  })) as { result?: { value?: { mode?: string; tag?: string } }; exceptionDetails?: { text: string } };
  if (res.exceptionDetails) {
    throw new BridgeError('INVALID_PARAMS', `fill 执行失败:${res.exceptionDetails.text}`, { tabId, via: el.via });
  }
  const mode = (res.result?.value?.mode === 'contenteditable' ? 'contenteditable' : 'value') as 'value' | 'contenteditable';

  if (params.pressEnter) {
    for (const ev of planKey('Enter').events) {
      await cdp.sendCommand(tabId, 'Input.dispatchKeyEvent', ev as unknown as Record<string, unknown>);
    }
  }

  const state = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  const url = safeUrl(state.result?.value);

  // secret:不回显 value(mode/tag 概要除外)
  return { ok: true, tabId, url, mode, secret } as FillResult & { secret: boolean };
}

function safeUrl(json: string | undefined): string {
  try {
    return (JSON.parse(json ?? '{}') as { url?: string }).url ?? '';
  } catch {
    return '';
  }
}
