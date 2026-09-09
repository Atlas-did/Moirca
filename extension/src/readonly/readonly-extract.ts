// readonly 模式页面内容提取(通道② / readonly snapshot / extract 共用)。
// 注意:以下函数经 chrome.scripting.executeScript({func}) 序列化注入,
// 必须完全自包含(不引用任何模块级变量/闭包),禁止改动为其引入依赖。

export interface ReadonlyExtractResult {
  title: string;
  url: string;
  contextText: string;
  source: 'selection' | 'page' | 'none';
  text: string; // 紧凑摘要(snapshot 用,无 ref)
  totalChars: number;
  truncated: boolean;
}

/** 选区优先的正文提取(popup 问答 / readonly extract) */
export function wbExtractContext(maxChars: number): { title: string; url: string; contextText: string; source: 'selection' | 'page' | 'none'; totalChars: number; truncated: boolean } {
  const MAX = 12000; // /api/context/ask 有效上限(§e.2)
  const sel = window.getSelection();
  const selection = sel ? sel.toString().trim() : '';
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  let pageText = '';
  if (root) {
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script,style,noscript,iframe,svg,nav,footer,header').forEach((el) => el.remove());
    pageText = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  const contextText = selection || pageText;
  const truncated = contextText.length > Math.min(maxChars, MAX);
  return {
    title: document.title || '',
    url: location.href || '',
    contextText: contextText.slice(0, Math.min(maxChars, MAX)),
    source: selection ? 'selection' : pageText ? 'page' : 'none',
    totalChars: contextText.length,
    truncated,
  };
}

/**
 * readonly 紧凑快照(§a.6 语义:无 AX 树、无 ref,由 DOM 提取)。
 * 仅列标题/链接/按钮/输入框,带 getBoundingClientRect(rect 供无 ref 弱定位)。
 */
export function wbDomSnapshot(maxChars: number): { title: string; url: string; text: string; totalChars: number; truncated: boolean } {
  const lines: string[] = [];
  const seen = new Set<Element>();

  const push = (line: string) => {
    if (lines.join('\n').length < maxChars) lines.push(line);
  };

  const rectOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  // 标题层级 h1-h6
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((el, i) => {
    if (seen.has(el) || i > 200) return;
    seen.add(el);
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (t) push(`- heading "${t}" [h${el.tagName.toLowerCase().slice(1)}]`);
  });

  // 链接
  document.querySelectorAll('a[href]').forEach((el, i) => {
    if (seen.has(el) || i > 400) return;
    seen.add(el);
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const href = el.getAttribute('href') || '';
    if (t || href) push(`- link "${t}" [href=${href.slice(0, 160)}]`);
  });

  // 按钮/提交
  document.querySelectorAll('button,[role=button],input[type=button],input[type=submit]').forEach((el, i) => {
    if (seen.has(el) || i > 400) return;
    seen.add(el);
    const t = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (t) push(`- button "${t}"`);
  });

  // 输入框
  document.querySelectorAll('input,textarea,select').forEach((el, i) => {
    if (seen.has(el) || i > 400) return;
    seen.add(el);
    const input = el as HTMLInputElement;
    const type = input.type === 'password' ? 'password' : input.type || 'text';
    const label =
      input.getAttribute('aria-label') ||
      input.placeholder ||
      input.name ||
      (input.labels && input.labels[0] ? input.labels[0].textContent || '' : '') ||
      '';
    push(`- textbox "${label.trim().replace(/\s+/g, ' ').slice(0, 120)}" [type=${type}]`);
  });

  const text = lines.join('\n');
  const truncated = text.length >= maxChars || lines.length >= 1400;
  return {
    title: document.title || '',
    url: location.href || '',
    text,
    totalChars: text.length,
    truncated,
  };
}

/** readonly extract:DOM 克隆 → 简化 readability(markdown 化) */
export function wbExtractMarkdown(selector: string | null, maxChars: number): { title: string; url: string; content: string; totalChars: number; truncated: boolean } {
  const root = (selector && document.querySelector(selector)) || document.querySelector('article') || document.querySelector('main') || document.body;
  if (!root) {
    return { title: document.title || '', url: location.href || '', content: '', totalChars: 0, truncated: false };
  }
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,noscript,iframe,svg,nav,footer,header,aside,form').forEach((el) => el.remove());

  const out: string[] = [];
  const pushMd = (s: string) => {
    if (out.join('\n\n').length < maxChars) out.push(s);
  };

  const blocks = clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,td,th');
  if (blocks.length > 0) {
    blocks.forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'pre') pushMd('```\n' + (el.textContent || '').trim() + '\n```');
      else if (/^h[1-6]$/.test(tag)) pushMd('#'.repeat(Number(tag.slice(1))) + ' ' + t);
      else if (tag === 'li') pushMd('- ' + t);
      else pushMd(t);
    });
  } else {
    pushMd((clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim());
  }

  const content = out.join('\n\n');
  const truncated = content.length > maxChars;
  return {
    title: document.title || '',
    url: location.href || '',
    content: content.slice(0, maxChars),
    totalChars: content.length,
    truncated,
  };
}

/** readonly extract(format=schema):按 JSON Schema 的属性名做启发式抽取(文本/属性) */
export function wbExtractSchema(schemaJson: string, maxChars: number): { title: string; url: string; data: Record<string, unknown>; totalChars: number; truncated: boolean } {
  const schema = JSON.parse(schemaJson) as { properties?: Record<string, { selector?: string; attribute?: string }> };
  const data: Record<string, unknown> = {};
  const props = schema.properties ?? {};
  for (const [key, def] of Object.entries(props)) {
    const sel = def?.selector || `[name=${key}],[data-field=${key}]`;
    const el = document.querySelector(sel);
    if (!el) {
      data[key] = null;
      continue;
    }
    const attr = def?.attribute;
    const value = attr ? el.getAttribute(attr) : (el.textContent || '').trim();
    data[key] = (value || '').slice(0, Math.max(0, Math.floor(maxChars / Math.max(1, Object.keys(props).length))));
  }
  return {
    title: document.title || '',
    url: location.href || '',
    data,
    totalChars: JSON.stringify(data).length,
    truncated: false,
  };
}
