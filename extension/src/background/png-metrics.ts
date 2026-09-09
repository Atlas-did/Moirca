// 截图像素指标(§a.6 analysis_report 的本地计算,纯函数 + 可注入解码器):
// - 宽高 / 宽高比
// - Rec.709 加权亮度均值(0-1)
// - Hasler-Süsstrunk 彩色度(colorfulness,常见 0-110+)
// - 主色:RGB444 桶计数 top5(share = 桶像素占比,rgb 取桶内均值色)
// 隐私红线:图像数据不出本机 —— service worker 内解码统计,仅上报指标。
// 解码默认实现:fetch data: URL → createImageBitmap → OffscreenCanvas 2d → getImageData;
// 单测可注入 ImageData 桩(computePngMetrics(base64, decode))。
import { BridgeError } from './bridge-error.js';

export interface DominantColor {
  rgb: [number, number, number];
  share: number; // 0-1,桶像素占比;全部主色 share 合计 ≈1(截断前)
}

export interface PngMetrics {
  width: number;
  height: number;
  aspectRatio: number; // width / height
  brightness: number; // 0-1,Rec.709 加权均值
  colorfulness: number; // Hasler-Süsstrunk
  dominantColors: DominantColor[]; // ≤5,按 share 降序
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type PngDecoder = (pngBase64: string) => Promise<ImageDataLike>;

/** service worker 默认解码(Chrome 69+ OffscreenCanvas;不可用时抛 EXTRACT_FAILED) */
export async function defaultPngDecode(pngBase64: string): Promise<ImageDataLike> {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new BridgeError('EXTRACT_FAILED', '当前环境不支持 Canvas 图像解码,无法分析截图');
  }
  let bmp: ImageBitmap;
  try {
    const resp = await fetch(`data:image/png;base64,${pngBase64}`);
    const blob = await resp.blob();
    bmp = await createImageBitmap(blob);
  } catch (e) {
    throw new BridgeError('EXTRACT_FAILED', `截图解码失败:${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new BridgeError('EXTRACT_FAILED', 'OffscreenCanvas 2d 上下文不可用,无法分析截图');
    }
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    throw new BridgeError('EXTRACT_FAILED', `截图像素读取失败:${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      bmp.close();
    } catch {
      /* ignore */
    }
  }
}

const round4 = (x: number): number => Math.round(x * 10000) / 10000;

/** 统计入口:PNG base64(不带 data: 前缀)→ 像素指标。解码失败/空图抛 BridgeError('EXTRACT_FAILED') */
export async function computePngMetrics(pngBase64: string, decode: PngDecoder = defaultPngDecode): Promise<PngMetrics> {
  let img: ImageDataLike;
  try {
    img = await decode(pngBase64);
  } catch (e) {
    if (e instanceof BridgeError) throw e;
    throw new BridgeError('EXTRACT_FAILED', `截图像素统计失败:${e instanceof Error ? e.message : String(e)}`);
  }
  const { width, height, data } = img;
  if (!width || !height || !data || data.length < width * height * 4) {
    throw new BridgeError('EXTRACT_FAILED', '截图像素数据为空或尺寸非法', { width, height, bytes: data?.length ?? 0 });
  }

  // RGB444 桶(每通道 16 级,共 4096 桶):计数 + 通道求和(桶内均值色)
  const BUCKETS = 4096;
  const count = new Float64Array(BUCKETS);
  const sumR = new Float64Array(BUCKETS);
  const sumG = new Float64Array(BUCKETS);
  const sumB = new Float64Array(BUCKETS);
  // 亮度(Rec.709)与彩色度(Hasler-Süsstrunk)的矩
  let lumSum = 0;
  let rgSum = 0, rgSq = 0, ybSum = 0, ybSq = 0;
  let valid = 0;

  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a === 0) continue; // 全透明像素不计入
    const r = data[o], g = data[o + 1], b = data[o + 2];
    valid += 1;
    lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg; rgSq += rg * rg;
    ybSum += yb; ybSq += yb * yb;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    count[key] += 1;
    sumR[key] += r; sumG[key] += g; sumB[key] += b;
  }
  if (valid === 0) {
    throw new BridgeError('EXTRACT_FAILED', '截图全部像素透明,无法统计指标');
  }

  const muRg = rgSum / valid, muYb = ybSum / valid;
  const sdRg = Math.sqrt(Math.max(rgSq / valid - muRg * muRg, 0));
  const sdYb = Math.sqrt(Math.max(ybSq / valid - muYb * muYb, 0));
  const colorfulness = Math.sqrt(sdRg * sdRg + sdYb * sdYb) + 0.3 * Math.sqrt(muRg * muRg + muYb * muYb);

  // 主色 top5:按桶像素数降序(跳过空桶)
  const keys: number[] = [];
  for (let k = 0; k < BUCKETS; k++) if (count[k] > 0) keys.push(k);
  keys.sort((a, b) => count[b] - count[a]);
  const dominantColors: DominantColor[] = keys.slice(0, 5).map((k) => ({
    rgb: [
      Math.round(sumR[k] / count[k]),
      Math.round(sumG[k] / count[k]),
      Math.round(sumB[k] / count[k]),
    ],
    share: round4(count[k] / valid),
  }));

  return {
    width,
    height,
    aspectRatio: round4(width / height),
    brightness: round4(lumSum / (valid * 255)),
    colorfulness: round4(colorfulness),
    dominantColors,
  };
}
