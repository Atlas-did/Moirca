// browser_screenshot(§b.2)
// 语义红线(tool description 写死):截图只供人复核,禁止据截图执行动作(原则 3)。
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserScreenshotTool: ToolDef = {
  name: 'browser_screenshot',
  description:
    '对页面截图,返回 image content 与元数据(fileRef 落盘)。' +
    '【红线】截图仅供人复核,不能作为执行动作的依据;元素定位与点击请使用 browser_snapshot 的 refs。',
  inputSchema: {
    format: z.enum(['png', 'jpeg']).optional().describe('默认 png'),
    quality: z.number().int().max(100).optional().describe('jpeg 0-100,默认 80'),
    fullPage: z.boolean().optional().describe('默认 false,pro only'),
    target: z.enum(['newTab', 'activeTab']).optional().describe('可选;readonly 恒为 activeTab'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_screenshot'),
};
