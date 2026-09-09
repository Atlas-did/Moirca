// 命令注册表:15 条命令 → 处理函数;准入策略(readonly 矩阵 + target)统一在此裁决。
// 顺序(§a.3):UNKNOWN_COMMAND → READONLY_REJECTED(矩阵) → TARGET_DENIED(策略)。
import type { CommandName, WSResultMessage } from '@webbridge/shared-types';
import type { ErrorCode } from '@webbridge/shared-types';
import { makeError } from '@webbridge/shared-types';
import type { CommandDeps } from './deps.js';
import { decideAccess } from './policy.js';
import { navigate } from './commands/navigate.js';
import { closeTab, getTabs, newTab, switchTab } from './commands/tabs.js';
import { snapshot } from './commands/snapshot.js';
import { findInSnapshot } from './commands/find-in-snapshot.js';
import { click } from './commands/click.js';
import { fill } from './commands/fill.js';
import { pressKey } from './commands/press_key.js';
import { scroll } from './commands/scroll.js';
import { evaluate } from './commands/evaluate.js';
import { wait } from './commands/wait.js';
import { screenshot } from './commands/screenshot.js';
import { extract } from './commands/extract.js';
import type { SnapshotStore } from './snapshot-store.js';

type Handler = (deps: CommandDeps, params: Record<string, unknown>) => Promise<unknown>;

const HANDLERS: Record<CommandName, Handler> = {
  navigate: (d, p) => navigate(d, p as never),
  new_tab: (d, p) => newTab(d, p as never),
  close_tab: (d, p) => closeTab(d, p as never),
  switch_tab: (d, p) => switchTab(d, p as never),
  get_tabs: (d) => getTabs(d),
  snapshot: (d, p) => snapshot(d, p as never),
  find_in_snapshot: (d, p) => findInSnapshot(d, p as never),
  click: (d, p) => click(d, p as never),
  fill: (d, p) => fill(d, p as never),
  press_key: (d, p) => pressKey(d, p as never),
  scroll: (d, p) => scroll(d, p as never),
  evaluate: (d, p) => evaluate(d, p as never),
  wait: (d, p) => wait(d, p as never),
  screenshot: (d, p) => screenshot(d, p as never),
  extract: (d, p) => extract(d, p as never),
};

export function isKnownCommand(method: string): method is CommandName {
  return Object.prototype.hasOwnProperty.call(HANDLERS, method);
}

/** 单条命令执行入口(含准入裁决与结构化错误封装;不裸抛,§g.2) */
export async function executeCommand(
  deps: Omit<CommandDeps, 'commandId'> & { commandId: string },
  method: string,
  params: Record<string, unknown>,
  snapshots: SnapshotStore,
): Promise<WSResultMessage> {
  const makeResult = (ok: boolean, result?: unknown, error?: WSResultMessage['error']): WSResultMessage => {
    const msg: WSResultMessage = { type: 'result', id: deps.commandId, ok };
    if (ok) msg.result = result;
    else msg.error = error;
    return msg;
  };

  try {
    if (!isKnownCommand(method)) {
      return makeResult(false, undefined, makeError('UNKNOWN_COMMAND', `未知命令:${method}(契约 §a.2 共 15 条)`, { method }));
    }
    const decision = decideAccess({
      command: method,
      mode: deps.mode,
      target: params?.target as never,
      isManagedTab: (tabId) => deps.managed.isManaged(tabId),
    });
    if (decision.verdict === 'deny') {
      return makeResult(false, undefined, decision.error as WSResultMessage['error']);
    }
    const result = await HANDLERS[method](deps, params ?? {});
    return makeResult(true, result);
  } catch (e) {
    // 依赖注入的 makeError 错误已带 code/num;未知异常兜底为 INVALID_PARAMS
    const err = e as { code?: string; num?: number; message?: string };
    if (err && typeof err.code === 'string' && typeof err.num === 'number') {
      return makeResult(false, undefined, {
        code: err.code as ErrorCode,
        num: err.num,
        message: err.message ?? String(e),
      });
    }
    return makeResult(false, undefined, {
      code: 'INVALID_PARAMS',
      num: -32602,
      message: `命令执行失败:${e instanceof Error ? e.message : String(e)}`,
    });
  } finally {
    void snapshots;
  }
}
