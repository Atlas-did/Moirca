#!/usr/bin/env node
// ============================================================
// scripts/check-drift.mjs —— CONTRACT §附 CI 漂移校验(AGENT_07)
// ① 全仓 9222 禁用 grep(仅允许白名单:CI 规则自身/本脚本/历史变更记录);
// ② shared-types 双侧一致性:daemon/src/types/* 与 shared-types/src/* 逐字节;
// ③ daemon 注册的 MCP 工具名集合 === mcp-tools.ts 的 MCP_TOOL_NAMES(+可选 browser_route);
// ④ 错误码枚举:CONTRACT §g.1 表 ↔ shared-types/src/errors.ts 一致;
// ⑤ extension/daemon 解析同一份 shared-types(node_modules 指向 workspace 真源)。
// 退出码非 0 即 CI 失败。
// ============================================================
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` —— ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// ---------- ① 9222 禁用 ----------
// 允许出现 9222 的文件:仅限「禁止 9222」规则本身与历史变更记录(非端口用途)。
const PORT_ALLOWLIST = new Set([
  'scripts/check-drift.mjs',
  'daemon/tests/drift.test.ts',
  'extension/CHANGELOG.md',   // 历史记录:"由旧默认端口改为 9223"
  // 规则文书自身(正文声明"禁止 9222 作为 WebBridge 端口",非端口用途)
  'docs/CONTRACT.md',
  'docs/ARCHITECTURE.md',
  // 审计报告正文引用了"9222 禁用检查"的描述性文字,非端口用途
  'docs/security_audit_2026-09-06.md',
]);
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'dist-pro', 'dist-readonly', '__pycache__',
        '.pytest_cache', '.ruff_cache', '.bridge-token', 'artifacts', 'data', 'logs',
        'ai_work', '.github'].includes(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}
const offenders = [];
for (const f of walk(repoRoot)) {
  const rel = path.relative(repoRoot, f).split(path.sep).join('/');
  if (PORT_ALLOWLIST.has(rel)) continue;
  if (!/\.(ts|js|mjs|cjs|json|py|md|sh|yml|yaml|html|toml|example)$/.test(rel)) continue;
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  // 剥掉行注释与块注释(告示性提及不算违规),再查字面量 9222
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
    .replace(/(^|\n)\s*#[^\n]*/g, '$1');
  if (code.includes('9222')) offenders.push(rel);
}
check('9222 禁用(全仓 grep,白名单外零命中)', offenders.length === 0,
  offenders.length ? offenders.join(', ') : '');

// ---------- ② shared-types 双侧一致性 ----------
const MIRROR_FILES = ['errors.ts', 'ws-protocol.ts', 'mcp-tools.ts'];
for (const f of MIRROR_FILES) {
  const daemonMirror = path.join(repoRoot, 'daemon/src/types', f);
  const sharedSrc = path.join(repoRoot, 'shared-types/src', f);
  const norm = (s) => s.replace(/^﻿/, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
  let ok = false;
  try { ok = norm(readFileSync(daemonMirror, 'utf8')) === norm(readFileSync(sharedSrc, 'utf8')); } catch { /* missing */ }
  check(`daemon/src/types/${f} 与 shared-types 零漂移`, ok);
}

// ---------- ③ MCP 工具名集合对齐 ----------
{
  const mcpTools = readFileSync(path.join(repoRoot, 'shared-types/src/mcp-tools.ts'), 'utf8');
  const block = mcpTools.match(/MCP_TOOL_NAMES = \[([\s\S]*?)\] as const/);
  const contractNames = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const daemonNames = new Set();
  const toolsDir = path.join(repoRoot, 'daemon/src/tools');
  for (const f of readdirSync(toolsDir)) {
    const text = readFileSync(path.join(toolsDir, f), 'utf8');
    for (const m of text.matchAll(/'browser_[a-z_]+'/g)) daemonNames.add(m[0].slice(1, -1));
  }
  // mcp-server 的注册循环只注册 tools/ 目录集合;browser_find_in_snapshot 也在此目录
  const missing = contractNames.filter((n) => !daemonNames.has(n));
  const extra = [...daemonNames].filter((n) => !contractNames.includes(n) && n !== 'browser_route');
  check('daemon 注册工具集合 === MCP_TOOL_NAMES(15 个)',
    missing.length === 0 && extra.length === 0 && contractNames.length === 15,
    `缺:${missing.join(',')} 多:${extra.join(',')}`);
}

// ---------- ④ 错误码枚举:CONTRACT §g.1 ↔ shared-types/errors.ts ----------
{
  const contract = readFileSync(path.join(repoRoot, 'docs/CONTRACT.md'), 'utf8');
  const sec = contract.split('### g.1 错误码表')[1].split('### g.2')[0];
  const contractCodes = new Set(
    [...sec.matchAll(/^\| ([A-Z_]+) \|/gm)].map((m) => m[1]));
  const errorsTs = readFileSync(path.join(repoRoot, 'shared-types/src/errors.ts'), 'utf8');
  const enumBlock = errorsTs.match(/export type ErrorCode =[\s\S]*?;/);
  const tsCodes = new Set([...enumBlock[0].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]));
  const missing = [...contractCodes].filter((c) => !tsCodes.has(c));
  const extra = [...tsCodes].filter((c) => !contractCodes.has(c));
  check(`错误码枚举对齐(CONTRACT ${contractCodes.size} 个 ↔ shared-types ${tsCodes.size} 个)`,
    missing.length === 0 && extra.length === 0,
    `CONTRACT 独有:${missing.join(',')} shared-types 独有:${extra.join(',')}`);
}

// ---------- ⑤ workspace 解析到同一份 shared-types ----------
// npm workspaces 会把 @webbridge/shared-types 提升到根 node_modules(软链或复制),
// 这里按 Node 解析规则:从各包出发逐级向上找 @webbridge/shared-types,
// 并校验其 realpath 与 shared-types 真源一致(同一份文件,零拷贝漂移)。
const sharedReal = (() => {
  try { return realpathSync(path.join(repoRoot, 'shared-types')); } catch { return ''; }
})();
function resolveSharedTypes(fromDir) {
  let cur = path.resolve(fromDir);
  while (true) {
    const candidate = path.join(cur, 'node_modules', '@webbridge', 'shared-types');
    if (existsSync(candidate)) return realpathSync(candidate);
    const parent = path.dirname(cur);
    if (parent === cur) return '';
    cur = parent;
  }
}
for (const pkg of ['extension', 'daemon']) {
  const resolved = resolveSharedTypes(path.join(repoRoot, pkg));
  const ok = resolved !== '' && sharedReal !== '' && resolved === sharedReal;
  check(`${pkg} 解析到同一份 @webbridge/shared-types`, ok,
    ok ? '' : `resolved=${resolved || '(未找到)'}`);
}

console.log(failures === 0 ? '\n全部漂移校验通过' : `\n${failures} 项漂移校验失败`);
process.exit(failures === 0 ? 0 : 1);
