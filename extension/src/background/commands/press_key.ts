// press_key(§a.5,pro only):CDP Input.dispatchKeyEvent keyDown/keyUp 序列。
// 键位映射与组合键合成见 keymap.ts(老版 v1 的回车/Tab/组合键丢事件痛点在此修复)。
import { BridgeError } from '../../background/bridge-error.js';
import type { PressKeyParams, PressKeyResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { planKey } from '../keymap.js';
import { resolveElement } from '../element-locator.js';

export async function pressKey(deps: CommandDeps, params: PressKeyParams): Promise<PressKeyResult> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  if (!params.key || typeof params.key !== 'string') {
    throw new BridgeError('INVALID_PARAMS', 'press_key: key 必填', { tabId, field: 'key' });
  }

  const plan = planKey(params.key);

  // 指定 ref 时先 focus 目标元素,再派发按键
  if (params.ref) {
    const el = await resolveElement(cdp, deps.snapshots, tabId, { ref: params.ref });
    await cdp.sendCommand(tabId, 'Runtime.callFunctionOn', {
      objectId: el.objectId,
      functionDeclaration: 'function() { this.focus(); }',
      returnByValue: true,
    });
  }

  for (const ev of plan.events) {
    await cdp.sendCommand(tabId, 'Input.dispatchKeyEvent', ev as unknown as Record<string, unknown>);
  }

  const state = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  let url = '';
  try {
    url = (JSON.parse(state.result?.value ?? '{}') as { url?: string }).url ?? '';
  } catch {
    url = '';
  }
  return { ok: true, tabId, url };
}
