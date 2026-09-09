// PNG 尺寸解析(纯逻辑,可单测):从 base64 PNG 读 IHDR,取 width/height。
// 用于 readonly captureVisibleTab 截图(无 CDP Page.getLayoutMetrics 可查)。

/** 解析 PNG IHDR;非法输入返回 {width:0,height:0} */
export function pngSizeFromBase64(base64: string): { width: number; height: number } {
  try {
    const bin = atobPolyfill(base64.slice(0, 64));
    // PNG 签名 8 字节 + IHDR 长度(4)+ 类型(4)+ width(4)+ height(4)
    if (bin.length < 24) return { width: 0, height: 0 };
    if (bin.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return { width: 0, height: 0 };
    if (bin.slice(12, 16) !== 'IHDR') return { width: 0, height: 0 };
    const view = new DataView(strToArrayBuffer(bin.slice(16, 24)));
    return { width: view.getUint32(0), height: view.getUint32(4) };
  } catch {
    return { width: 0, height: 0 };
  }
}

function atobPolyfill(b64: string): string {
  if (typeof atob === 'function') return atob(b64);
  // Node 测试环境兜底
  const g = globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } };
  if (g.Buffer) return g.Buffer.from(b64, 'base64').toString('binary');
  throw new Error('no base64 decoder');
}

function strToArrayBuffer(s: string): ArrayBuffer {
  const buf = new ArrayBuffer(s.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
  return buf;
}
