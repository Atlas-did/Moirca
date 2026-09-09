// browser_extract(§b.2):内容采集主通道(原则 3)。
// 默认本地 @mozilla/readability:扩展取 outerHTML → daemon 转 markdown;
// 外部 reader API 仅留 WEBBRIDGE_READER_API_URL 开关且默认关闭。
// 成功后 daemon 自动 POST /api/evidence/save(§c.3,默认开启)。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserExtractTool: ToolDef = {
  name: 'browser_extract',
  description:
    '抽取页面正文:format=markdown(Readability 正文,采集主通道)或 format=schema(按 JSON Schema 结构化抽取)。' +
    '成功后自动落证据库(可追溯:url+抓取时间+原文 quote)。readonly 模式走 DOM 克隆。',
  inputSchema: {
    format: z.enum(['markdown', 'schema']).optional().describe("默认 'markdown'"),
    schema: z.record(z.string(), z.unknown()).optional().describe("format='schema' 时必填,JSON Schema"),
    selector: z.string().optional().describe('限定抽取根,默认 document'),
    maxChars: z.number().int().max(60000).optional().describe('默认 60000,超出截断+fileRef'),
    channel: z.enum(['deep_research', 'controlled_browse']).optional().describe('证据 channel,默认 controlled_browse(§c.3)'),
    target: z.enum(['newTab', 'activeTab']).optional(),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_extract'),
};
