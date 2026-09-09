function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.92em] text-foreground">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">$1</a>');
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
}

// 纯表现层:数字列(含百分号/小数/千分位)右对齐 tabular-nums
function isNumericCell(cell: string): boolean {
  const t = cell.trim();
  return /\d/.test(t) && /^[-+]?[\d,.]+(?:%|万|分|元|名|位|条)?$/i.test(t);
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeLang = '';
  let listType: 'ul' | 'ol' | null = null;
  let inBlockquote = false;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push('</blockquote>');
      inBlockquote = false;
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        closeList();
        closeBlockquote();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        html.push(`<pre class="my-3 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 text-[12px] leading-relaxed text-foreground thin-scrollbar"><code data-lang="${escapeHtml(codeLang)}" class="font-mono">`);
      } else {
        inCode = false;
        html.push('</code></pre>');
      }
      continue;
    }

    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }

    if (!trimmed) {
      closeList();
      closeBlockquote();
      html.push('<div class="h-3"></div>');
      continue;
    }

    // 表格:| a | b | 行块,第二行为 |---|---| 分隔线(纯渲染逻辑,无副作用)
    if (trimmed.startsWith('|')) {
      closeList();
      closeBlockquote();
      const tableLines: string[] = [];
      let k = li;
      while (k < lines.length && lines[k].trim().startsWith('|')) {
        tableLines.push(lines[k]);
        k++;
      }
      li = k - 1;

      const rows = tableLines.map(splitTableRow);
      let headerCells: string[] | null = null;
      let bodyRows = rows;
      if (rows.length >= 2 && isTableSeparatorLine(tableLines[1])) {
        headerCells = rows[0];
        bodyRows = rows.slice(2);
      }

      const colCount = Math.max(...rows.map(r => r.length));
      const colNumeric: boolean[] = [];
      for (let c = 0; c < colCount; c++) {
        colNumeric.push(bodyRows.length > 0 && bodyRows.every(r => isNumericCell(r[c] ?? '')));
      }

      const thead = headerCells
        ? `<thead><tr>${headerCells
            .map(
              (cell, c) =>
                `<th class="h-9 border-b border-border bg-muted/60 px-3 text-left text-xs font-medium tracking-wide text-muted-foreground ${colNumeric[c] ? 'text-right' : ''}">${renderInline(cell)}</th>`
            )
            .join('')}</tr></thead>`
        : '';
      const tbody = bodyRows
        .map(
          row =>
            `<tr>${Array.from({ length: colCount }, (_, c) => {
              const cell = row[c] ?? '';
              return `<td class="h-10 border-b border-border/60 px-3 align-middle text-[13px] text-foreground ${colNumeric[c] ? 'text-right tabular-nums' : ''}">${renderInline(cell)}</td>`;
            }).join('')}</tr>`
        )
        .join('');

      html.push(
        `<div class="my-3 overflow-x-auto thin-scrollbar"><table class="w-full border-collapse text-foreground">${thead}<tbody>${tbody}</tbody></table></div>`
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeBlockquote();
      const level = heading[1].length;
      // v2 §5.9 文档式标题阶梯:h1 带下 hairline、h2 字重分层、h3 眉标、h4+ 正文加粗
      const headingClass =
        level === 1
          ? 'mt-5 mb-2 border-b border-border pb-1 text-base font-semibold tracking-tight text-foreground'
          : level === 2
            ? 'mt-4 mb-1.5 text-sm font-semibold tracking-tight text-foreground'
            : level === 3
              ? 'eyebrow mt-3 mb-1'
              : 'mt-3 mb-1 text-[13px] font-semibold text-foreground';
      html.push(`<h${level} class="${headingClass}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      closeList();
      if (!inBlockquote) {
        html.push('<blockquote class="my-3 rounded-r-sm border-l-[3px] border-primary bg-muted/60 py-2 pl-3 pr-3 text-[13px] text-muted-foreground">');
        inBlockquote = true;
      }
      html.push(`<p class="my-1">${renderInline(trimmed.replace(/^>\s+/, ''))}</p>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unordered) {
      closeBlockquote();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul class="my-2 list-disc space-y-1 pl-5 text-foreground marker:text-muted-foreground">');
      }
      html.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      closeBlockquote();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol class="my-2 list-decimal space-y-1 pl-5 text-foreground marker:text-muted-foreground">');
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    closeBlockquote();
    html.push(`<p class="my-2 text-foreground">${renderInline(trimmed)}</p>`);
  }

  closeList();
  closeBlockquote();
  if (inCode) {
    html.push('</code></pre>');
  }

  return html.join('');
}

export default function MarkdownRenderer({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose-doc max-w-none [&_strong]:text-foreground"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
    />
  );
}
