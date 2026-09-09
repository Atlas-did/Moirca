// ============================================================
// daemon/src/reader.ts —— 内容采集主通道(原则 3)
// 默认本地 @mozilla/readability:扩展 evaluate 取 outerHTML →
// daemon 内跑 Readability → turndown 转 markdown。
// 外部 reader API(Jina/Firecrawl)仅留 env WEBBRIDGE_READER_API_URL
// 开关且默认关闭(任务书要求;架构 §4)。
// ============================================================
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export interface ReaderOutcome {
  title: string;
  markdown: string;
  via: 'local-readability' | 'external-api';
}

export class ExtractFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractFailedError';
  }
}

/** 本地 Readability:HTML → 正文 markdown;空文档抛 ExtractFailedError(EXTRACT_FAILED) */
export function htmlToMarkdown(html: string, url: string): ReaderOutcome {
  if (!html || !html.trim()) {
    throw new ExtractFailedError('抽取失败:页面 HTML 为空(EXTRACT_FAILED)');
  }
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const parsed = new Readability(doc).parse();
  if (!parsed || !parsed.textContent || !parsed.textContent.trim()) {
    throw new ExtractFailedError('抽取失败:Readability 无法解析出正文(EXTRACT_FAILED)');
  }
  const markdown = turndown.turndown(parsed.content ?? '');
  return { title: parsed.title ?? doc.title ?? '', markdown, via: 'local-readability' };
}

/** 外部 reader API(默认关闭;env WEBBRIDGE_READER_API_URL 设置后启用) */
export async function externalReader(html: string, url: string, apiUrl: string): Promise<ReaderOutcome> {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ExtractFailedError(`外部 reader API HTTP ${res.status}`);
  const json = (await res.json()) as { title?: string; content?: string; markdown?: string };
  const markdown = json.content ?? json.markdown ?? '';
  if (!markdown) throw new ExtractFailedError('外部 reader API 返回空内容');
  return { title: json.title ?? '', markdown, via: 'external-api' };
}
