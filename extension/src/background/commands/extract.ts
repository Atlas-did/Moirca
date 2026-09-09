// extract(§a.5,双模式):
// - pro:Runtime.evaluate 注入提取(main world);readonly:chrome.scripting 注入 DOM 克隆提取
// - markdown:readability 风格正文;schema:按 JSON Schema 属性抽取
// 截断:字符口径,maxChars 默认 60,000(§h);fileRef 由 daemon 落盘回填。
import { BridgeError } from '../../background/bridge-error.js';
import type { ExtractParams, ExtractResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';
import { clampMaxChars, EXTRACT_MAX_CHARS_HARD_LIMIT } from '../policy.js';
import { truncateText } from '../snapshot/ax-compact.js';
import { wbExtractMarkdown, wbExtractSchema } from '../../readonly/readonly-extract.js';

export async function extract(deps: CommandDeps, params: ExtractParams): Promise<ExtractResult> {
  const target = params.target ?? (deps.mode === 'readonly' ? 'activeTab' : 'newTab');
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  const maxChars = clampMaxChars(params.maxChars, EXTRACT_MAX_CHARS_HARD_LIMIT, EXTRACT_MAX_CHARS_HARD_LIMIT);
  const format = params.format ?? 'markdown';

  if (format === 'schema' && !params.schema) {
    throw new BridgeError('INVALID_PARAMS', 'extract: format=schema 时 schema 必填(§a.5)', { field: 'schema' });
  }

  if (deps.mode === 'readonly') {
    return extractReadonly(deps, tabId, format, params, maxChars);
  }
  return extractPro(deps, tabId, format, params, maxChars);
}

async function extractPro(
  deps: CommandDeps,
  tabId: number,
  format: 'markdown' | 'schema',
  params: ExtractParams,
  maxChars: number,
): Promise<ExtractResult> {
  const cdp = deps.cdp!;
  // 复用 readonly 提取函数:同一段函数经 Runtime.evaluate 注入 main world(语义一致,单测一份)
  if (format === 'schema') {
    const res = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
      expression: `(${wbExtractSchema.toString()})(${JSON.stringify(JSON.stringify(params.schema))}, ${maxChars})`,
      returnByValue: true,
    })) as { result?: { value?: { title: string; url: string; data: Record<string, unknown>; totalChars: number; truncated: boolean } } };
    const ex = res.result?.value;
    if (!ex) throw new BridgeError('EXTRACT_FAILED', 'extract(schema) 注入执行失败', { tabId });
    deps.managed.touch(tabId);
    return {
      ok: true,
      tabId,
      url: ex.url,
      title: ex.title,
      content: JSON.stringify(ex.data),
      data: ex.data,
      totalChars: ex.totalChars,
      truncated: ex.truncated,
    };
  }
  const res = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: `(${wbExtractMarkdown.toString()})(${params.selector ? JSON.stringify(JSON.stringify(params.selector)) : 'null'}, ${maxChars})`,
    returnByValue: true,
  })) as { result?: { value?: { title: string; url: string; content: string; totalChars: number; truncated: boolean } } };
  const ex = res.result?.value;
  if (!ex) throw new BridgeError('EXTRACT_FAILED', 'extract(markdown) 注入执行失败(空文档等)', { tabId });
  if (ex.totalChars === 0) {
    throw new BridgeError('EXTRACT_FAILED', 'extract: 页面无可提取正文(空文档或全脚本页)', { tabId, url: ex.url });
  }
  const truncated = truncateText(ex.content, maxChars);
  deps.managed.touch(tabId);
  return {
    ok: true,
    tabId,
    url: ex.url,
    title: ex.title,
    content: truncated.text,
    totalChars: truncated.totalChars,
    truncated: truncated.truncated || ex.truncated,
  };
}

async function extractReadonly(
  deps: CommandDeps,
  tabId: number,
  format: 'markdown' | 'schema',
  params: ExtractParams,
  maxChars: number,
): Promise<ExtractResult> {
  if (!deps.scripting) {
    throw new BridgeError('PERMISSION_DENIED', 'readonly extract 需要 chrome.scripting 权限', { tabId });
  }
  const injection =
    format === 'schema'
      ? {
          func: wbExtractSchema as (...args: unknown[]) => unknown,
          args: [JSON.stringify(params.schema), maxChars] as unknown[],
        }
      : {
          func: wbExtractMarkdown as (...args: unknown[]) => unknown,
          args: [params.selector ?? null, maxChars] as unknown[],
        };
  const results = await deps.scripting.executeScript({ target: { tabId }, ...injection });
  const ex = (results?.[0]?.result ?? null) as
    | { title: string; url: string; content?: string; data?: Record<string, unknown>; totalChars: number; truncated: boolean }
    | null;
  if (!ex) {
    throw new BridgeError('EXTRACT_FAILED', 'readonly extract 注入执行失败(受限页面 chrome:// 等)', { tabId });
  }
  const base = {
    ok: true as const,
    tabId,
    url: ex.url,
    title: ex.title,
    totalChars: ex.totalChars,
    truncated: ex.truncated,
  };
  if (format === 'schema') {
    return { ...base, content: JSON.stringify(ex.data ?? {}), data: ex.data };
  }
  const content = ex.content ?? '';
  if (!content.trim()) {
    throw new BridgeError('EXTRACT_FAILED', 'readonly extract: 页面无可提取正文', { tabId, url: ex.url });
  }
  const truncated = truncateText(content, maxChars);
  return { ...base, content: truncated.text, totalChars: truncated.totalChars, truncated: truncated.truncated || ex.truncated };
}
