// content script：只在用户点击插件并请求时才采集「选中文字 / 整页正文」。
// 本脚本不再随 <all_urls> 常驻注入，而是由 popup 在点击时通过 chrome.scripting 按需注入。
// 只读、不自动上传，内容仅在用户主动触发后交给 background 转发。

const MAX_TEXT_CHARS = 12000;

function extractSelectedText() {
  const sel = window.getSelection();
  return sel ? sel.toString().trim() : '';
}

// 轻量正文抽取：优先 <article>/<main>，其次取 body 里的段落/表格文本
function extractPageText() {
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  if (!root) return '';
  const clone = root.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,iframe,svg,nav,footer,header').forEach((el) => el.remove());
  let text = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

function getPageMeta() {
  return { title: document.title || '', url: location.href || '' };
}

// 接收 popup 的指令：popup 通过 chrome.tabs.sendMessage 请求当前页数据
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'EXTRACT_PAGE') return undefined;

  const meta = getPageMeta();
  const selection = extractSelectedText();
  // 用户选中了文字 → 优先用选中文字；否则用整页正文
  const context = selection || extractPageText();

  sendResponse({ ...meta, context_text: context, source: selection ? 'selection' : 'page' });
  return true;
});
