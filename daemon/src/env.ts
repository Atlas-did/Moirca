// ============================================================
// daemon/src/env.ts —— 环境变量装配(CONTRACT + 任务书)
// daemon 不做云服务:WS 只绑 127.0.0.1,无任何对外监听开关。
// ============================================================
import type { ArtifactsStoreOptions } from './artifacts.js';

export interface DaemonEnv {
  /** WS 监听端口(默认 9223;Chrome remote-debugging 默认端口全仓库禁用作 WebBridge 端口) */
  wsPort: number;
  wsHost: '127.0.0.1';
  /** 命令级 WS 等待超时(§a.5 默认 30,000ms,可配置) */
  commandTimeoutMs: number;
  artifacts: ArtifactsStoreOptions;
  evidenceUrl: string;
  evidenceEnabled: boolean;
  /** backend 可选鉴权 token(随 X-WebBridge-Token 头发送;backend/app/api/auth.py) */
  backendToken?: string;
  /** 外部 reader API(Jina/Firecrawl),默认关闭;不设置即走本地 readability */
  readerApiUrl?: string;
  /** env WEBBRIDGE_MCP_ROUTE_TOOL=on 才注册 browser_route(§b.1) */
  routeToolEnabled: boolean;
  /** 预共享 token(测试/脚本用);默认启动时随机生成 */
  token?: string;
}

export function loadDaemonEnv(): DaemonEnv {
  return {
    wsPort: Number(process.env.WEBBRIDGE_WS_PORT ?? 9223),
    wsHost: '127.0.0.1',
    commandTimeoutMs: Number(process.env.WEBBRIDGE_CMD_TIMEOUT_MS ?? 30_000),
    artifacts: {},
    evidenceUrl: process.env.WEBBRIDGE_EVIDENCE_URL ?? 'http://127.0.0.1:8000/api/evidence/save',
    evidenceEnabled: process.env.WEBBRIDGE_EVIDENCE_OFF !== '1',
    backendToken: process.env.WEBBRIDGE_BACKEND_TOKEN || undefined,
    readerApiUrl: process.env.WEBBRIDGE_READER_API_URL || undefined,
    routeToolEnabled: process.env.WEBBRIDGE_MCP_ROUTE_TOOL === 'on',
    token: process.env.WEBBRIDGE_TOKEN || undefined,
  };
}
