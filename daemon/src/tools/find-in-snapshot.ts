// browser_find_in_snapshot(§b.2):daemon 本地执行,不下发扩展。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserFindInSnapshotTool: ToolDef = {
  name: 'browser_find_in_snapshot',
  description: '在最近一次 browser_snapshot 的结果中检索(text/role/regex 多条件 AND),返回命中 ref。用于大快照里定位元素。',
  inputSchema: {
    snapshotId: z.string().describe('browser_snapshot 返回的 snapshotId(60s 有效)'),
    query: z
      .object({
        text: z.string().optional(),
        role: z.string().optional(),
        regex: z.string().optional(),
      })
      .describe('至少一项;多条件为 AND'),
    limit: z.number().int().max(50).optional().describe('默认 20,硬上限 50'),
  },
  handler: passthrough('browser_find_in_snapshot'),
};
