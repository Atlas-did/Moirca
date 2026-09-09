// ============================================================
// daemon/src/mcp-server.ts —— MCP Server(stdio)
// 注册 browser_* 工具全集:14 核心 + browser_route(可选,
// env WEBBRIDGE_MCP_ROUTE_TOOL=on)。工具名集合必须与
// shared-types/src/mcp-tools.ts 的 MCP_TOOL_NAMES 完全一致
// (tests/mcp-registration.test.ts 漂移校验,CONTRACT §附)。
// ============================================================
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCP_TOOL_NAMES } from './types/index.js';
import type { WebBridge } from './bridge.js';
import type { ToolDef } from './tools/def.js';
import { browserNavigateTool } from './tools/navigate.js';
import { browserNewTabTool } from './tools/new-tab.js';
import { browserCloseTabTool } from './tools/close-tab.js';
import { browserSwitchTabTool } from './tools/switch-tab.js';
import { browserGetTabsTool } from './tools/get-tabs.js';
import { browserSnapshotTool } from './tools/snapshot.js';
import { browserFindInSnapshotTool } from './tools/find-in-snapshot.js';
import { browserClickTool } from './tools/click.js';
import { browserFillTool } from './tools/fill.js';
import { browserPressKeyTool } from './tools/press-key.js';
import { browserScrollTool } from './tools/scroll.js';
import { browserEvaluateTool } from './tools/evaluate.js';
import { browserWaitTool } from './tools/wait.js';
import { browserScreenshotTool } from './tools/screenshot.js';
import { browserExtractTool } from './tools/extract.js';
import { browserRouteTool } from './tools/route.js';

const ALL_TOOLS: ToolDef[] = [
  browserNavigateTool,
  browserNewTabTool,
  browserCloseTabTool,
  browserSwitchTabTool,
  browserGetTabsTool,
  browserSnapshotTool,
  browserFindInSnapshotTool,
  browserClickTool,
  browserFillTool,
  browserPressKeyTool,
  browserScrollTool,
  browserEvaluateTool,
  browserWaitTool,
  browserScreenshotTool,
  browserExtractTool,
];

/** 实际会注册的工具名(供测试与启动日志使用) */
export function registeredToolNames(routeToolEnabled: boolean): string[] {
  return routeToolEnabled ? [...ALL_TOOLS.map((t) => t.name), 'browser_route'] : ALL_TOOLS.map((t) => t.name);
}

export function createMcpServer(bridge: WebBridge, opts: { routeToolEnabled: boolean }): McpServer {
  const server = new McpServer({ name: 'webbridge', version: '2.0.0' });

  const tools: ToolDef[] = opts.routeToolEnabled ? [...ALL_TOOLS, browserRouteTool] : ALL_TOOLS;
  for (const t of tools) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, async (args) => {
      const outcome = await t.handler((args ?? {}) as Record<string, unknown>, bridge);
      return outcome.isError ? { content: outcome.content, isError: true } : { content: outcome.content };
    });
  }
  return server;
}

/** 测试/CI 用:校验注册集合与契约真源一致 */
export function assertToolNamesMatchContract(routeToolEnabled = false): void {
  const registered = new Set(registeredToolNames(routeToolEnabled));
  const expected = new Set<string>(MCP_TOOL_NAMES);
  if (routeToolEnabled) expected.add('browser_route');
  if (registered.size !== expected.size || [...registered].some((n) => !expected.has(n))) {
    throw new Error(`MCP 工具漂移:registered=${[...registered].sort()} expected=${[...expected].sort()}`);
  }
}
