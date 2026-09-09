// browser_fill(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserFillTool: ToolDef = {
  name: 'browser_fill',
  description: '向输入框/可编辑元素填写文本(≤10,000 字符);secret=true 时结果不回显 value。',
  inputSchema: {
    ref: z.string().optional(),
    selector: z.string().optional(),
    value: z.string().max(10000).describe('要填入的文本'),
    secret: z.boolean().optional().describe('true:结果与错误信息中不回显 value(密码等)'),
    pressEnter: z.boolean().optional().describe('填后是否补 Enter(搜索框场景)'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_fill'),
};
