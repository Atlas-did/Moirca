// browser_navigate(§b.2):target 由 daemon 推导(默认 newTab),
// 客户端不得传 activeTab(daemon 拒绝,TARGET_DENIED)。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserNavigateTool: ToolDef = {
  name: 'browser_navigate',
  description: '在新后台标签(daemon 会话 task 标签)中导航到指定 URL;绝不复用用户当前标签。',
  inputSchema: {
    url: z.string().regex(/^https?:\/\//, 'URL 必须 http(s):// 开头').describe('要打开的 URL'),
    waitUntil: z.enum(['load', 'domcontentloaded', 'none']).optional().describe("默认 'load'"),
    timeoutMs: z.number().int().max(60000).optional().describe('默认 15000,超时 NAV_TIMEOUT'),
    task_id: z.string().optional().describe('可选;不传由 daemon 生成并贯穿 artifacts/evidence'),
  },
  handler: passthrough('browser_navigate'),
};
