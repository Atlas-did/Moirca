// find_in_snapshot 扩展侧兜底实现(§a.5:契约主实现在 daemon snapshot-store,不下发扩展;
// 若 daemon 误发该命令,扩展用本地快照存储给出一致结果,而不是 UNKNOWN_COMMAND)。
import { BridgeError } from '../../background/bridge-error.js';
import type { FindInSnapshotParams, FindInSnapshotResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { findInSnapshot as findAlgorithm } from '../find.js';

export async function findInSnapshot(deps: CommandDeps, params: FindInSnapshotParams): Promise<FindInSnapshotResult> {
  if (!params?.snapshotId || typeof params.snapshotId !== 'string') {
    throw new BridgeError('INVALID_PARAMS', 'find_in_snapshot: snapshotId 必填', { field: 'snapshotId' });
  }
  const query = params.query ?? {};
  if (!query.text && !query.role && !query.regex) {
    throw new BridgeError('INVALID_PARAMS', 'find_in_snapshot: query 至少需要 text/role/regex 一项', { field: 'query' });
  }
  const rec = deps.snapshots.getBySnapshotId(params.snapshotId);
  if (!rec) {
    throw new BridgeError('INVALID_PARAMS', `find_in_snapshot: 快照 ${params.snapshotId} 不存在或已过期(60s)`, {
      snapshotId: params.snapshotId,
    });
  }
  try {
    const out = findAlgorithm({ text: rec.text, refs: rec.refs, query, limit: params.limit });
    return { ok: true, matches: out.matches, truncated: out.truncated };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('INVALID_PARAMS')) {
      throw new BridgeError('INVALID_PARAMS', e.message.replace('INVALID_PARAMS: ', ''), { snapshotId: params.snapshotId });
    }
    throw e;
  }
}
