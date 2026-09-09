// ============================================================
// daemon/src/index.ts —— 启动编排 + 环境变量装配
// 三件事:
//   1. 启动 ExtensionBridge(WS Server,127.0.0.1:9223)
//   2. 生成一次性 token:打印终端 + 写 .bridge-token(0600)
//   3. 启动 MCP Server(stdio;不额外开放 TCP MCP)
// ============================================================
import { writeFile, chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadDaemonEnv } from './env.js';
import { ExtensionBridge, generateToken } from './extension-bridge.js';
import { ArtifactsStore } from './artifacts.js';
import { SnapshotStore } from './snapshot-store.js';
import { EvidenceClient } from './evidence-client.js';
import { WebBridge } from './bridge.js';
import { createMcpServer } from './mcp-server.js';
import { WS_URL_DEFAULT } from './types/index.js';

async function main(): Promise<void> {
  const env = loadDaemonEnv();
  const artifacts = new ArtifactsStore(env.artifacts);
  await mkdir(artifacts.root, { recursive: true }).catch(() => undefined);

  const token = env.token ?? generateToken();

  const evidence = new EvidenceClient(env.evidenceUrl, env.evidenceEnabled, fetch, env.backendToken);

  const ext = new ExtensionBridge({
    port: env.wsPort,
    host: env.wsHost,
    commandTimeoutMs: env.commandTimeoutMs,
    artifactRoot: artifacts.root,
    ...(env.token ? { token: env.token } : {}),
    analysis: { artifacts, evidence },
  });
  await ext.start();

  // 一次性 token:打印 + 落盘(0600)。扩展 popup 设置页粘贴它完成握手。
  if (!env.token) {
    const tokenPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.bridge-token');
    try {
      await writeFile(tokenPath, token + '\n', { mode: 0o600 });
      await chmod(tokenPath, 0o600);
      console.error(`[webbridge] token 已写入 ${tokenPath}(0600)`);
    } catch (e) {
      console.error(`[webbridge] token 写盘失败(仍打印于下):${(e as Error).message}`);
    }
  }
  console.error('=========================================================');
  console.error('[webbridge] 本次会话 token(粘贴到扩展 popup 设置页):');
  console.error(`  ${token}`);
  console.error('=========================================================');

  const bridge = new WebBridge({
    ext,
    artifacts,
    snapshots: new SnapshotStore(),
    evidence,
    commandTimeoutMs: env.commandTimeoutMs,
    ...(env.readerApiUrl ? { readerApiUrl: env.readerApiUrl } : {}),
  });

  const server = createMcpServer(bridge, { routeToolEnabled: env.routeToolEnabled });
  await server.connect(new StdioServerTransport());

  console.error(`[webbridge] MCP Server 已就绪(stdio);WS:${WS_URL_DEFAULT}(env 可改 WEBBRIDGE_WS_PORT)`);
  console.error(`[webbridge] evidence 钩子:${env.evidenceEnabled ? '开启' : '关闭'} → ${env.evidenceUrl}`);

  const shutdown = async () => {
    await ext.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('[webbridge] Fatal:', e);
  process.exit(1);
});
