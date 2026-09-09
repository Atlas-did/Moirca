// ============================================================
// tests/smoke.e2e.ts —— 真实验收冒烟(非单测,手动/CI 可选跑)
// 用官方 SDK Client 经 stdio 连接「构建产物 dist/index.js」:
//   1. initialize + tools/list:注册工具名集合 === 契约 15 个
//   2. tools/call browser_navigate(无扩展):EXT_NOT_CONNECTED + isError
//   3. token 落盘 .bridge-token(0600)
//   4. WS Server 仅绑 127.0.0.1(握手端口连通性用 token 拒绝验证见 bridge.test.ts)
// 运行:node --import tsx tests/smoke.e2e.ts
// ============================================================
import { stat, readFile, rm, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';

const daemonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = await mkdtemp(path.join(os.tmpdir(), 'webbridge-smoke-'));

// dist/index.js 的 artifacts 默认根 = dist/../artifacts;这里用 env 覆盖避免污染仓库。
// 注意:SDK 默认只透传安全环境变量子集,因此显式带上我们的两个变量。
const transport = new StdioClientTransport({
  command: 'node',
  args: [path.join(daemonRoot, 'dist', 'index.js')],
  env: { ...process.env, WEBBRIDGE_ARTIFACTS_DIR: artifactsDir, WEBBRIDGE_WS_PORT: '19223' } as Record<string, string>,
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

try {
  // 1) 工具清单与契约一致
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  const expected = [
    'browser_navigate', 'browser_new_tab', 'browser_close_tab', 'browser_switch_tab',
    'browser_get_tabs', 'browser_snapshot', 'browser_find_in_snapshot', 'browser_click',
    'browser_fill', 'browser_press_key', 'browser_scroll', 'browser_evaluate',
    'browser_wait', 'browser_screenshot', 'browser_extract',
  ].sort();
  assert.deepEqual(names, expected, `工具集合漂移:${names}`);
  // 截图红线写死在 description(原则 3)
  const shot = tools.tools.find((t) => t.name === 'browser_screenshot')!;
  assert.ok(/复核/.test(shot.description), 'screenshot description 必须含"复核"红线');
  console.log(`✔ tools/list:15 个 browser_* 工具,与契约一致;screenshot 红线已写死`);

  // 2) 无扩展调用 → EXT_NOT_CONNECTED,isError:true
  const res = await client.callTool({ name: 'browser_navigate', arguments: { url: 'https://example.com' } });
  assert.equal(res.isError, true, '无扩展时必须 isError:true');
  const text = (res.content as Array<{ type: string; text?: string }>)[0]!.text!;
  const err = JSON.parse(text);
  assert.equal(err.code, 'EXT_NOT_CONNECTED');
  assert.equal(err.num, -32000);
  console.log(`✔ 无扩展调用:isError=true,EXT_NOT_CONNECTED(-32000):${err.message}`);

  // 3) token 落盘(dist/index.js 相对自身位置写 daemon/.bridge-token)
  const tokenPath = path.join(daemonRoot, '.bridge-token');
  const st = await stat(tokenPath);
  assert.equal(st.mode & 0o777, 0o600, '.bridge-token 权限必须 0600');
  const token = (await readFile(tokenPath, 'utf8')).trim();
  assert.match(token, /^[0-9a-f]{64}$/, 'token 必须是 64 位 hex');
  console.log(`✔ token 落盘 ${tokenPath}(0600,64 位 hex)`);

  console.log('SMOKE_OK');
} finally {
  await client.close();
  await rm(artifactsDir, { recursive: true, force: true });
}
