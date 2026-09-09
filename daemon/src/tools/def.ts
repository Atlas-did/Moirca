// daemon/src/tools/def.ts —— 工具定义公共类型
import type { z } from 'zod';
import type { WebBridge, McpToolOutcome } from '../bridge.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>, bridge: WebBridge) => Promise<McpToolOutcome>;
}

/** 绝大多数工具的 handler 就是透传给 bridge.call(翻译层统一处理) */
export function passthrough(name: Parameters<WebBridge['call']>[0]) {
  return async (args: Record<string, unknown>, bridge: WebBridge): Promise<McpToolOutcome> => bridge.call(name, args);
}
