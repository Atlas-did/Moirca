// browser_get_tabs(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserGetTabsTool: ToolDef = {
  name: 'browser_get_tabs',
  description: '列出标签(readonly 模式受限:仅返回当前激活标签,无 tabs 权限时 url/title 置空)。',
  inputSchema: {},
  handler: passthrough('browser_get_tabs'),
};
