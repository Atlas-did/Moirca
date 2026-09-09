// browser_new_tab(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserNewTabTool: ToolDef = {
  name: 'browser_new_tab',
  description: '新建后台专用标签(active 恒为 false),可选初始 URL。',
  inputSchema: {
    url: z.string().optional().describe('可选初始 URL;不传则打开空白页'),
  },
  handler: passthrough('browser_new_tab'),
};
