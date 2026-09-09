// 命令准入策略(纯逻辑,可单测):mode × command × target 的三维决策。
// 规则来源:CONTRACT §a.3(target)、§a.4(readonly/pro 矩阵)、§g.1(错误码)。
// 冲突裁决顺序(§a.3):先判 readonly(READONLY_REJECTED),再判 target(TARGET_DENIED)。
import type { CommandName, Target } from '@webbridge/shared-types';
import { ACTIVE_TAB_READONLY_COMMANDS, COMMAND_AVAILABILITY, makeError } from '@webbridge/shared-types';

export type WsErrorLike = { code: string; num: number; message: string; data?: Record<string, unknown> };

/** §a.4 矩阵:mode 是否允许该命令(不含 target 维度) */
export function isCommandAllowedInMode(command: CommandName, mode: 'pro' | 'readonly'): boolean {
  const row = COMMAND_AVAILABILITY[command];
  if (!row) return false;
  return mode === 'pro' ? row.pro === 'allow' : row.readonly === 'allow' || row.readonly === 'restricted';
}

/** readonly 受限命令的附加约束(§a.4 备注列) */
export function readonlyRestriction(command: CommandName): string | null {
  const row = COMMAND_AVAILABILITY[command];
  if (!row || row.readonly !== 'restricted') return null;
  switch (command) {
    case 'get_tabs':
      return 'readonly:仅返回当前激活标签,无 tabs 权限时 url/title 置空';
    case 'wait':
      return 'readonly:wait 仅支持 until="time"';
    case 'screenshot':
      return 'readonly:仅 activeTab + captureVisibleTab + PNG';
    default:
      return null;
  }
}

/** 15 条命令的 target 必填性(§a.3:除 get_tabs/find_in_snapshot 外必含) */
export function requiresTarget(command: CommandName): boolean {
  return command !== 'get_tabs' && command !== 'find_in_snapshot';
}

export interface TargetDecisionInput {
  command: CommandName;
  mode: 'pro' | 'readonly';
  target: Target | undefined;
  isManagedTab: (tabId: number) => boolean;
}

export type TargetDecision =
  | { verdict: 'allow'; tabId: number | null } // tabId 稍后由执行层解析(newTab 等)
  | { verdict: 'deny'; error: WsErrorLike };

/**
 * 三维准入决策(单一裁决点,extension 侧强制;daemon 侧双保险)。
 * 顺序:未知命令由 dispatcher 处理 → readonly 矩阵 → target 规则。
 */
export function decideAccess(input: TargetDecisionInput): TargetDecision {
  const { command, mode, target, isManagedTab } = input;

  // 1) readonly 矩阵(先判,§a.3)
  if (!isCommandAllowedInMode(command, mode)) {
    return {
      verdict: 'deny',
      error: makeError(
        'READONLY_REJECTED',
        `readonly 模式命令被拒:${command} 为写/控制类命令,只读模式仅放行 snapshot/extract/wait/screenshot/get_tabs`,
        { command, mode },
      ),
    };
  }

  // 2) get_tabs / find_in_snapshot 免 target(§a.3)
  if (command === 'get_tabs' || command === 'find_in_snapshot') {
    return { verdict: 'allow', tabId: null };
  }

  // 3) target 必填
  if (!target) {
    return {
      verdict: 'deny',
      error: makeError('INVALID_PARAMS', `命令 ${command} 缺少必填参数 target`, { command, field: 'target' }),
    };
  }

  // 4) activeTab:只放行只读命令(§a.3)
  if (target === 'activeTab') {
    if (ACTIVE_TAB_READONLY_COMMANDS.includes(command)) {
      return { verdict: 'allow', tabId: null };
    }
    return {
      verdict: 'deny',
      error: makeError(
        'TARGET_DENIED',
        `target=activeTab 仅允许只读命令(snapshot/screenshot/extract/wait);${command} 不得作用于用户当前标签页(原则 1:不抢当前标签)`,
        { command, target },
      ),
    };
  }

  // 5) tabId:N:仅托管标签(§a.3)
  if (target.startsWith('tabId:')) {
    const tabId = Number(target.slice('tabId:'.length));
    if (!Number.isInteger(tabId) || tabId <= 0) {
      return {
        verdict: 'deny',
        error: makeError('INVALID_PARAMS', `target 格式非法:${target}`, { command, target }),
      };
    }
    if (!isManagedTab(tabId)) {
      return {
        verdict: 'deny',
        error: makeError(
          'TARGET_DENIED',
          `tabId:${tabId} 不是本 daemon 会话创建的托管标签,禁止定位(§a.3)`,
          { command, target, tabId },
        ),
      };
    }
    return { verdict: 'allow', tabId };
  }

  // 6) newTab:写命令默认值,执行层解析为托管 task 标签
  if (target === 'newTab') {
    return { verdict: 'allow', tabId: null };
  }

  return {
    verdict: 'deny',
    error: makeError('INVALID_PARAMS', `target 取值非法:${String(target)}`, { command, target }),
  };
}

/** snapshot 硬上限(§h):maxChars 超过 25_000 按硬上限钳制 */
export const SNAPSHOT_MAX_CHARS_HARD_LIMIT = 25_000;
export const EXTRACT_MAX_CHARS_HARD_LIMIT = 60_000;

export function clampMaxChars(requested: number | undefined, hardLimit: number, defaultValue: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return defaultValue;
  return Math.min(Math.floor(requested), hardLimit);
}
