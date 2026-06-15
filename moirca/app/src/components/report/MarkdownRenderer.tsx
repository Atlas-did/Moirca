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
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-900/80 text-cyan-200 text-[0.95em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-500 underline">$1</a>');
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

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCode) {
        closeList();
        closeBlockquote();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        html.push(`<pre class="my-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-slate-100"><code data-lang="${escapeHtml(codeLang)}">`);
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

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      closeBlockquote();
      const level = heading[1].length;
      html.push(`<h${level} class="mt-4 mb-2 font-semibold text-slate-900">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      closeList();
      if (!inBlockquote) {
        html.push('<blockquote class="my-3 border-l-4 border-slate-300 pl-4 italic text-slate-600">');
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
        html.push('<ul class="my-3 list-disc pl-6 space-y-1 text-slate-700">');
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
        html.push('<ol class="my-3 list-decimal pl-6 space-y-1 text-slate-700">');
      }
      html.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    closeBlockquote();
    html.push(`<p class="my-2 leading-7 text-slate-700">${renderInline(trimmed)}</p>`);
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
      className="prose prose-slate max-w-none prose-pre:my-0 prose-pre:p-0"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
    />
  );
}
