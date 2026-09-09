// ============================================================
// tests/drift.test.ts —— 类型镜像防漂移(CONTRACT §附)
// ① daemon/src/types/* 必须与 shared-types/src/* 逐字节一致;
// ② daemon 实际注册的 MCP 工具名集合 === mcp-tools.ts 的 MCP_TOOL_NAMES。
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const daemonRoot = path.resolve(here, '..');
const repoRoot = path.resolve(daemonRoot, '..');

const MIRROR_FILES = ['errors.ts', 'ws-protocol.ts', 'mcp-tools.ts'];

test('daemon/src/types 与 shared-types/src 零漂移', () => {
  for (const f of MIRROR_FILES) {
    const local = readFileSync(path.join(daemonRoot, 'src/types', f), 'utf8');
    const src = path.join(repoRoot, 'shared-types/src', f);
    let upstream: string;
    try {
      upstream = readFileSync(src, 'utf8');
    } catch {
      // shared-types 尚未创建时跳过(允许并行施工期缺真源)
      console.warn(`[drift] ${src} 不存在,跳过该文件比对`);
      continue;
    }
    assert.equal(normalize(local), normalize(upstream), `daemon/src/types/${f} 与 shared-types/src/${f} 漂移`);
  }
});

/** 去掉行尾空白与 BOM 后比对(容忍无害差异) */
function normalize(s: string): string {
  return s.replace(/^﻿/, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
}

test('daemon 注册工具名集合 === MCP_TOOL_NAMES(CONTRACT §附)', async () => {
  const { MCP_TOOL_NAMES } = await import('../src/types/index.js');
  const { assertToolNamesMatchContract } = await import('../src/mcp-server.js');
  // 默认(不含 browser_route)
  assert.doesNotThrow(() => assertToolNamesMatchContract(false));
  assert.doesNotThrow(() => assertToolNamesMatchContract(true));
  assert.equal(MCP_TOOL_NAMES.length, 15, 'CONTRACT §b 共 15 个 browser_* 工具(14+evaluate)+1 可选');
});

test('9222 禁用检查:daemon 源码不出现 9222 作为监听端口', async () => {
  const files = ['src/index.ts', 'src/extension-bridge.ts', 'src/env.ts', 'src/types/ws-protocol.ts'];
  for (const f of files) {
    const text = readFileSync(path.join(daemonRoot, f), 'utf8');
    // 剥掉注释后再检查:注释中的"禁止 9222"告示不算违规
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!code.includes('9222'), `${f} 出现 9222(全仓库禁用)`);
  }
});
