// browser_scroll(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserScrollTool: ToolDef = {
  name: 'browser_scroll',
  description: '滚动页面(up/down/top/bottom;top/bottom 忽略 amountPx)。',
  inputSchema: {
    direction: z.enum(['up', 'down', 'top', 'bottom']),
    amountPx: z.number().int().optional().describe('默认 500'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_scroll'),
};
