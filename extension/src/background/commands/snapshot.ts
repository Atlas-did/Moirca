// snapshot(§a.5,双模式,核心):
// - pro:Accessibility.getFullAXTree → 紧凑序列化(仅标题/链接/按钮/输入框 + 深度/字符上限)
//       ref 机制:'e{n}' → backendDOMNodeId(click/fill 用 ref 定位)
// - readonly:无 AX 树,由 chrome.scripting 注入 DOM 提取紧凑摘要,无 ref(§a.6 语义)
// 截断:按字符口径在本模块执行(§h);超限标 truncated,fileRef 由 daemon 落盘后回填。
import { BridgeError } from '../../background/bridge-error.js';
import type { SnapshotParams, SnapshotResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { clampMaxChars, SNAPSHOT_MAX_CHARS_HARD_LIMIT } from '../policy.js';
import { compactAXSnapshot } from '../snapshot/ax-compact.js';
import { wbDomSnapshot } from '../../readonly/readonly-extract.js';

export async function snapshot(deps: CommandDeps, params: SnapshotParams): Promise<SnapshotResult> {
  const target = params.target ?? 'activeTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  const maxChars = clampMaxChars(params.maxChars, SNAPSHOT_MAX_CHARS_HARD_LIMIT, SNAPSHOT_MAX_CHARS_HARD_LIMIT);
  const level = params.level ?? 'compact';

  if (deps.mode === 'readonly') {
    return snapshotReadonly(deps, tabId, maxChars);
  }
  return snapshotPro(deps, tabId, maxChars, level, params.refs !== false);
}

async function snapshotPro(
  deps: CommandDeps,
  tabId: number,
  maxChars: number,
  level: 'compact' | 'full',
  wantRefs: boolean,
): Promise<SnapshotResult> {
  const cdp = deps.cdp!;
  await cdp.attach(tabId);
  const tree = (await cdp.sendCommand(tabId, 'Accessibility.getFullAXTree')) as {
    nodes?: Parameters<typeof compactAXSnapshot>[0];
  };
  if (!tree?.nodes?.length) {
    throw new BridgeError('EXTRACT_FAILED', `AX 树获取失败(标签 ${tabId},页面可能未完成加载)`, { tabId });
  }
  const compact = compactAXSnapshot(tree.nodes, { maxChars, level });
  const meta = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href, title: document.title })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  let url = '';
  let title = '';
  try {
    const parsed = JSON.parse(meta.result?.value ?? '{}') as { url?: string; title?: string };
    url = parsed.url ?? '';
    title = parsed.title ?? '';
  } catch {
    /* 元信息失败不阻塞快照返回 */
  }
  const snapshotId = deps.snapshots.put(tabId, url, compact.text, wantRefs ? compact.refs : []);
  deps.managed.touch(tabId);
  const result: SnapshotResult & { fileRef?: string } = {
    ok: true,
    tabId,
    url,
    title,
    snapshotId,
    text: compact.text,
    totalChars: compact.totalChars,
    truncated: compact.truncated,
    ...(wantRefs ? { refs: compact.refs } : {}),
    // fileRef 由 daemon 在 artifacts 落盘后回填(§f);扩展无法获知 daemon 本地路径
  };
  return result;
}

async function snapshotReadonly(deps: CommandDeps, tabId: number, maxChars: number): Promise<SnapshotResult> {
  if (!deps.scripting) {
    throw new BridgeError('PERMISSION_DENIED', 'readonly snapshot 需要 chrome.scripting 权限(manifest.readonly.json 已声明)', { tabId });
  }
  const results = await deps.scripting.executeScript({
    target: { tabId },
    func: wbDomSnapshot,
    args: [maxChars],
  });
  const extracted = (results?.[0]?.result ?? {}) as { title?: string; url?: string; text?: string; totalChars?: number; truncated?: boolean };
  const text = extracted.text ?? '';
  const snapshotId = deps.snapshots.put(tabId, extracted.url ?? '', text, []); // readonly 无 ref,存空表
  return {
    ok: true,
    tabId,
    url: extracted.url ?? '',
    title: extracted.title ?? '',
    snapshotId,
    text,
    totalChars: extracted.totalChars ?? text.length,
    truncated: !!extracted.truncated,
    // readonly 恒无 refs(§a.4:find_in_snapshot 亦被拒)
  };
}
