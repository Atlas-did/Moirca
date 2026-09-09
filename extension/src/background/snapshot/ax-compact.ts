// AX 树紧凑序列化(纯逻辑,可单测)。
// 输入:CDP Accessibility.getFullAXTree 的扁平节点数组(或兼容嵌套树),输出:
//   - 分层紧凑文本(仅标题/链接/按钮/输入框等可交互元素 + 标题层级)
//   - ref 表:'e{n}' 自增短 ref → backendDOMNodeId(对齐 chrome-devtools-mcp 语义)
//   - 截断:深度上限 + 字符上限(≤25k,§h),超限截断并标 truncated
// 原则 2:快照 ≠ 整棵 AX 树喂模型。
import type { RefEntry } from '@webbridge/shared-types';

export interface AXNodeLike {
  nodeId?: string;
  backendDOMNodeId?: number;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  description?: { value?: string };
  childIds?: string[];
  children?: AXNodeLike[]; // 兼容嵌套形态
  properties?: Array<{ name: string; value: { value?: unknown } | unknown }>;
  value?: { value?: unknown };
}

export interface CompactOptions {
  maxChars: number; // 硬上限由 policy.clampMaxChars 保证
  depthLimit?: number; // 默认 14
  level?: 'compact' | 'full'; // full 额外纳入 staticText/image/table
}

export interface CompactSnapshot {
  text: string;
  refs: RefEntry[];
  totalChars: number; // 截断前的完整字符数
  truncated: boolean;
}

const COMPACT_ROLES = new Set([
  'heading',
  'link',
  'button',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'switch',
  'tab',
  'option',
  'slider',
  'spinbutton',
  'textarea',
]);

const FULL_EXTRA_ROLES = new Set(['statictext', 'image', 'table', 'tablist', 'menu', 'tree', 'grid', 'cell']);

export const DEFAULT_DEPTH_LIMIT = 14;
/** 递归遍历硬上限(防超深树栈/死循环,与 depthLimit 独立) */
export const HARD_TRAVERSAL_DEPTH = 60;

function roleName(node: AXNodeLike): string {
  return String(node.role?.value ?? '').toLowerCase();
}

function nodeDisplayName(node: AXNodeLike): string {
  const raw = String(node.name?.value ?? '').trim();
  // 控制字符压平,单行内换行变空格
  return raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function propValue(node: AXNodeLike, key: string): unknown {
  const p = (node.properties ?? []).find((x) => x.name === key);
  if (!p) return undefined;
  const v = p.value as { value?: unknown } | undefined;
  return v && typeof v === 'object' ? v.value : v;
}

/** 压平 CDP 扁平节点数组为嵌套树;兼容已是嵌套树的输入 */
export function buildTree(nodes: AXNodeLike[]): AXNodeLike | null {
  if (nodes.length === 0) return null;
  // 嵌套形态:第一个节点带 children
  if (nodes.length === 1 && Array.isArray(nodes[0].children)) return nodes[0];
  const withChildren: AXNodeLike[] = nodes.map((n) => ({ ...n, children: [] }));
  const byId = new Map<string, AXNodeLike>();
  for (const n of withChildren) if (n.nodeId) byId.set(n.nodeId, n);
  for (const n of withChildren) {
    n.children = (n.childIds ?? []).map((id) => byId.get(id)).filter((x): x is AXNodeLike => !!x);
  }
  // 找根:未被任何节点引用为 child 的节点(或第一个 RootNode/WebArea)
  const referenced = new Set<string>();
  for (const n of nodes) for (const c of n.childIds ?? []) referenced.add(c);
  const root: AXNodeLike | undefined =
    withChildren.find((n) => !referenced.has(n.nodeId ?? '') && ['rootnode', 'rootwebarea', 'webarea'].includes(roleName(n))) ??
    withChildren.find((n) => !referenced.has(n.nodeId ?? ''));
  return root ?? withChildren[0];
}

function isIncluded(node: AXNodeLike, level: 'compact' | 'full'): boolean {
  if (node.ignored) return false;
  const role = roleName(node);
  if (!role) return false;
  if (level === 'full' && FULL_EXTRA_ROLES.has(role)) return true;
  return COMPACT_ROLES.has(role);
}

function renderLine(node: AXNodeLike, depth: number, ref: string | null): string {
  const role = roleName(node);
  const name = nodeDisplayName(node);
  const indent = '  '.repeat(Math.max(0, depth));
  let line = `${indent}- ${role}`;
  if (name) line += ` "${name}"`;
  const headingLevel = propValue(node, 'level');
  if (role === 'heading' && (typeof headingLevel === 'number' || typeof headingLevel === 'string')) {
    line += ` [h${headingLevel}]`;
  }
  const checked = propValue(node, 'checked');
  if (typeof checked === 'string' && checked !== 'false' && checked !== 'unchecked') {
    line += ` [${checked}]`;
  }
  if (ref) line += ` [ref=${ref}]`;
  return line;
}

/**
 * 分层截断序列化。深度上限防超深 DOM,字符上限防上下文爆炸(原则 2)。
 * refs 顺序 = 文本行顺序,daemon find_in_snapshot 直接按行检索本 text。
 */
export function compactAXSnapshot(rootNodes: AXNodeLike[], options: CompactOptions): CompactSnapshot {
  const level = options.level ?? 'compact';
  const depthLimit = options.depthLimit ?? DEFAULT_DEPTH_LIMIT;
  const root = buildTree(rootNodes);
  const refs: RefEntry[] = [];
  const lines: string[] = [];
  let refCounter = 0;
  let accLen = 0;
  if (!root) {
    return { text: '', refs, totalChars: 0, truncated: false };
  }

  const walk = (node: AXNodeLike | undefined, depth: number, renderDepth: number) => {
    if (!node || accLen > options.maxChars || depth > HARD_TRAVERSAL_DEPTH) return;
    if (isIncluded(node, level)) {
      if (depth > depthLimit) {
        lines.push(`${'  '.repeat(renderDepth)}- …(深度超过 ${depthLimit} 已截断)`);
        accLen += lines[lines.length - 1].length + 1;
        return;
      }
      let ref: string | null = null;
      const backendId = typeof node.backendDOMNodeId === 'number' ? node.backendDOMNodeId : undefined;
      if (backendId !== undefined) {
        ref = `e${++refCounter}`;
        refs.push({ ref, role: roleName(node), name: nodeDisplayName(node), backendDOMNodeId: backendId });
      }
      lines.push(renderLine(node, renderDepth, ref));
      accLen += lines[lines.length - 1].length + 1;
    }
    const kids = node.children ?? [];
    for (const k of kids) {
      walk(k, depth + 1, isIncluded(node, level) ? renderDepth + 1 : renderDepth);
    }
  };

  walk(root, 0, 0);

  const fullText = lines.join('\n');
  const totalChars = fullText.length;
  const truncated = totalChars > options.maxChars;
  const text = truncated ? fullText.slice(0, options.maxChars) : fullText;
  // 截断时丢弃越界行对应的 refs,保证 ref 永远能回查到 text 中的行
  const keptRefs = truncated ? refsUpTo(text, refs) : refs;
  return { text, refs: keptRefs, totalChars, truncated };
}

/** 截断后保留仍在 text 内出现的 refs */
export function refsUpTo(text: string, refs: RefEntry[]): RefEntry[] {
  let end = 0;
  for (const r of refs) {
    const marker = `[ref=${r.ref}]`;
    const at = text.lastIndexOf(marker);
    if (at === -1) break;
    end = Math.max(end, at + marker.length);
  }
  return refs.filter((r) => {
    const marker = `[ref=${r.ref}]`;
    const at = text.lastIndexOf(marker);
    return at !== -1 && at + marker.length <= end;
  });
}

/** 通用字符截断(snapshot/extract 共用):返回截断后文本与元数据 */
export function truncateText(text: string, maxChars: number): { text: string; totalChars: number; truncated: boolean } {
  const totalChars = text.length;
  const truncated = totalChars > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, totalChars, truncated };
}
