// WebBridge Daemon - MCP Server + WebSocket Client
// 作为 MCP Server 接收 AI 客户端的 tool calls
// 作为 WebSocket Client 连接 Chrome Extension

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketClient } from './ws-client.js';

const WS_URL = process.env.WEBBRIDGE_WS_URL || 'ws://localhost:9222';

async function main() {
  // 1. 启动 WebSocket Client（连 Chrome Extension）
  const wsClient = new WebSocketClient(WS_URL);
  await wsClient.connect();

  // 2. 启动 MCP Server（stdio 模式，供 Claude Desktop 等客户端使用）
  const server = new McpServer({
    name: 'webbridge',
    version: '1.0.0',
  });

  // 注册 MCP tools
  registerTools(server, wsClient);

  // 3. 启动 stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[WebBridge Daemon] Started');
  console.error(`[WebBridge Daemon] WebSocket: ${WS_URL}`);
  console.error('[WebBridge Daemon] MCP Server: stdio');
}

function registerTools(server: McpServer, wsClient: WebSocketClient) {
  // browser_navigate
  server.tool(
    'browser_navigate',
    'Navigate to a URL in the browser',
    { url: { type: 'string', description: 'URL to navigate to' } },
    async ({ url }) => {
      const result = await wsClient.sendCommand('navigate', { url });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_click
  server.tool(
    'browser_click',
    'Click an element on the page',
    {
      selector: { type: 'string', description: 'CSS selector' },
      ref: { type: 'string', description: 'Element ref from snapshot' },
    },
    async (params) => {
      const result = await wsClient.sendCommand('click', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_fill
  server.tool(
    'browser_fill',
    'Fill an input field',
    {
      selector: { type: 'string', description: 'CSS selector' },
      ref: { type: 'string', description: 'Element ref from snapshot' },
      value: { type: 'string', description: 'Value to fill' },
    },
    async (params) => {
      const result = await wsClient.sendCommand('fill', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_snapshot
  server.tool(
    'browser_snapshot',
    'Get accessibility tree / page content',
    { refs: { type: 'boolean', description: 'Include ref mappings' } },
    async (params) => {
      const result = await wsClient.sendCommand('snapshot', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_screenshot
  server.tool(
    'browser_screenshot',
    'Take a screenshot of the current page',
    {
      format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format' },
    },
    async (params) => {
      const result = await wsClient.sendCommand('screenshot', params);
      // screenshot 返回 base64，MCP 客户端需要特殊处理
      if (result.success && result.image) {
        return {
          content: [{
            type: 'image',
            data: result.image,
            mimeType: `image/${params.format || 'png'}`,
          }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_scroll
  server.tool(
    'browser_scroll',
    'Scroll the page',
    {
      direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
    },
    async (params) => {
      const result = await wsClient.sendCommand('scroll', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_evaluate
  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the page',
    { expression: { type: 'string', description: 'JS expression to evaluate' } },
    async (params) => {
      const result = await wsClient.sendCommand('evaluate', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_get_tabs
  server.tool(
    'browser_get_tabs',
    'List all open browser tabs',
    {},
    async () => {
      const result = await wsClient.sendCommand('get_tabs', {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // browser_switch_tab
  server.tool(
    'browser_switch_tab',
    'Switch to a specific tab',
    { tabId: { type: 'number', description: 'Tab ID to switch to' } },
    async (params) => {
      const result = await wsClient.sendCommand('switch_tab', params);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );
}

main().catch((e) => {
  console.error('[WebBridge Daemon] Fatal error:', e);
  process.exit(1);
});
