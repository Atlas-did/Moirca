// browser_wait(§b.2):等待策略对齐 playwright-mcp 语义。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserWaitTool: ToolDef = {
  name: 'browser_wait',
  description: '等待:until=time 固定延时(默认 1000ms,上限 10s)/ until=selector 等元素出现(默认超时 15s)/ until=networkidle 等网络空闲。',
  inputSchema: {
    until: z.enum(['time', 'selector', 'networkidle']).optional().describe("默认 'time';readonly 仅支持 time"),
    ms: z.number().int().max(10000).optional().describe('time 模式:毫秒'),
    selector: z.string().optional().describe('selector 模式必填'),
    timeoutMs: z.number().int().max(30000).optional().describe('selector 模式超时,上限 30s'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_wait'),
};
