// browser_route(§b.1/§d.3):可选工具,默认不注册;
// env WEBBRIDGE_MCP_ROUTE_TOOL=on 才注册。调 backend POST /api/route。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserRouteTool: ToolDef = {
  name: 'browser_route',
  description: '调用 WebBridge 意图路由(POST /api/route):四分类 quick_answer/page_qa/deep_research/controlled_browse,无命中 label=null。',
  inputSchema: {
    text: z.string().max(500).describe('用户输入,≤500 字符'),
    context: z.record(z.string(), z.unknown()).optional().describe('RouteContext:{page_url,page_title,has_selection,selected_text}'),
  },
  handler: passthrough('browser_route'),
};
