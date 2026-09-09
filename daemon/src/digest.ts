// ============================================================
// daemon/src/digest.ts —— snapshot 浓缩(§b.2 / §h)
// digest ≤2k token,由 daemon 在 MCP 响应前生成,extension 不感知。
// token 估算口径:CJK 字符 ≈1 token/字,非 CJK ≈4 字符/token(保守)。
// 策略(确定性、可单测):优先保留标题/交互元素行(与动作相关的
// AX 语义),普通正文段落压缩保留首段——主 Agent 优先消费 digest。
// ============================================================
import { MCP_BUDGET } from './types/index.js';

/** 保守 token 估算(不引分词器,零依赖) */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[　-鿿＀-￯]/.test(ch)) cjk++;
    else other++;
  }
  return Math.ceil(cjk * 1.0 + other / 4);
}

function clipLine(line: string, max = 160): string {
  const t = line.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * 生成 ≤maxTokens 的浓缩摘录。
 * 行打分:标题(#/heading/层级)与交互元素(链接/按钮/输入)优先,
 * 其余按原文顺序补足至预算。
 */
export function digest(text: string, maxTokens: number = MCP_BUDGET.DIGEST_MAX_TOKENS): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const priority: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line) || /^\[heading/i.test(line) || /heading/i.test(line.slice(0, 24));
    const isInteractive = /\[(link|button|textbox|combobox|checkbox|radio|menuitem|tab|searchbox|slider)\b/i.test(line);
    if (isHeading || isInteractive) priority.push(line);
    else rest.push(line);
  }
  const out: string[] = [];
  let used = 0;
  for (const line of priority) {
    const clipped = clipLine(line);
    const cost = estimateTokens(clipped) + 1;
    if (used + cost > maxTokens) break;
    out.push(clipped);
    used += cost;
  }
  for (const line of rest) {
    const clipped = clipLine(line);
    const cost = estimateTokens(clipped) + 1;
    if (used + cost > maxTokens) break;
    out.push(clipped);
    used += cost;
  }
  return out.join('\n');
}
