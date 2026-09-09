// browser_close_tab(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserCloseTabTool: ToolDef = {
  name: 'browser_close_tab',
  description: '关闭一个标签(仅限 daemon 会话内托管标签,不碰用户手工打开的标签)。',
  inputSchema: {
    tabId: z.number().int().describe('要关闭的标签 id'),
  },
  handler: passthrough('browser_close_tab'),
};
