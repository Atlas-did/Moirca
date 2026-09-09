// browser_click(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserClickTool: ToolDef = {
  name: 'browser_click',
  description: '点击页面元素(按 snapshot ref 或 CSS selector 定位)。动作前应有对应的 browser_snapshot。',
  inputSchema: {
    ref: z.string().regex(/^e\d+$/).optional().describe('snapshot 返回的元素 ref,与 selector 二选一,ref 优先'),
    selector: z.string().optional().describe('CSS selector'),
    expectNavigation: z.boolean().optional().describe('true 时等 load(默认 10s)'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_click'),
};
