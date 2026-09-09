// browser_press_key(§b.2)
import { z } from 'zod';
import { passthrough, type ToolDef } from './def.js';

export const browserPressKeyTool: ToolDef = {
  name: 'browser_press_key',
  description: '按键:Enter|Tab|Escape|Backspace|Delete|ArrowUp/Down/Left/Right|PageUp|PageDown|Home|End|单字符;组合用 + 连接,如 Control+A、Shift+Enter。',
  inputSchema: {
    key: z.string().describe('按键名或组合'),
    ref: z.string().optional().describe('可选;先聚焦该元素再按键'),
    task_id: z.string().optional(),
  },
  handler: passthrough('browser_press_key'),
};
