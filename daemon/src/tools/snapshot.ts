// browser_snapshot(§b.2):核心观测工具。
// 返回 AX 语义快照(动作/观测主通道,原则 3);>25,000 字符截断并
// 旁路落盘(§f);digest(≤2k token)由 daemon 生成,主 Agent 优先消费。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserSnapshotTool: ToolDef = {
  name: 'browser_snapshot',
  description:
    '获取页面可交互元素快照(ref 编号,如 e12),用于 browser_click/browser_fill 等动作定位。' +
    'ref 仅在本次 snapshotId 对应页面状态有效,页面变化后需重新 snapshot。',
  inputSchema: {
    level: z.enum(['compact', 'full']).optional().describe("默认 compact:仅可交互元素+标题层级"),
    maxChars: z.number().int().max(25000).optional().describe('默认 25000,硬上限(§h)'),
    refs: z.boolean().optional().describe('默认 true;readonly 模式恒为 false'),
    target: z.enum(['newTab', 'activeTab']).optional().describe('可选;默认 newTab(daemon task 标签)'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_snapshot'),
};
