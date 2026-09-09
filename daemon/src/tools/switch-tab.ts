// browser_switch_tab(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserSwitchTabTool: ToolDef = {
  name: 'browser_switch_tab',
  description: '切换到指定标签(仅限 daemon 会话内托管标签)。',
  inputSchema: {
    tabId: z.number().int().describe('目标标签 id'),
  },
  handler: passthrough('browser_switch_tab'),
};
