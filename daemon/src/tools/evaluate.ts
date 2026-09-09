// browser_evaluate(§b.2,pro only)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserEvaluateTool: ToolDef = {
  name: 'browser_evaluate',
  description: '在页面 MAIN world 执行 JavaScript(返回值须 JSON 可序列化,≤100KB)。readonly 模式拒绝。',
  inputSchema: {
    expression: z.string().max(100000).describe('JS 表达式'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_evaluate'),
};
