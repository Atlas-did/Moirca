// ref/selector → 页面元素的统一解析(pro/CDP)。
// ref 语义:'e{n}' → snapshot 的 backendDOMNodeId → DOM.resolveNode 远程对象。
// ref 失效(快照过期/无此 ref)→ REF_STALE(§g.1,不自动重试)。
import { BridgeError } from './bridge-error.js';
import type { CDPController } from './cdp-controller.js';
import type { SnapshotStore } from './snapshot-store.js';

export interface ResolvedElement {
  objectId?: string;
  via: 'ref' | 'selector';
  backendDOMNodeId?: number;
  selector?: string;
}

export async function resolveElement(
  cdp: CDPController,
  snapshots: SnapshotStore,
  tabId: number,
  opts: { ref?: string; selector?: string },
): Promise<ResolvedElement> {
  if (opts.ref) {
    const backendDOMNodeId = snapshots.resolveRef(tabId, opts.ref);
    const resolved = (await cdp.sendCommand(tabId, 'DOM.resolveNode', {
      backendNodeId: backendDOMNodeId,
      objectGroup: 'webbridge',
    })) as { object?: { objectId?: string } };
    if (!resolved?.object?.objectId) {
      throw new BridgeError('REF_STALE', `ref ${opts.ref} 对应节点无法解析(节点可能已脱离 DOM),请重新 snapshot`, {
        tabId,
        ref: opts.ref,
      });
    }
    return { objectId: resolved.object.objectId, via: 'ref', backendDOMNodeId };
  }
  if (opts.selector) {
    const evalRes = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `(function(){ const el = document.querySelector(${JSON.stringify(opts.selector)}); if (!el) return null; return el; })()`,
      returnByValue: false,
    })) as { result?: { objectId?: string } };
    if (!evalRes?.result?.objectId) {
      throw new BridgeError('INVALID_PARAMS', `selector 未命中元素:${opts.selector}`, { tabId, selector: opts.selector });
    }
    return { objectId: evalRes.result.objectId, via: 'selector', selector: opts.selector };
  }
  throw new BridgeError('INVALID_PARAMS', '必须提供 ref 或 selector 之一', { tabId });
}
