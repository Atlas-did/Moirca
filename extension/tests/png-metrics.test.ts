// png-metrics 纯函数单测:注入 ImageData 桩,断言亮度(Rec.709)/彩色度(Hasler-Süsstrunk)/
// 主色(RGB444 桶 top5)/宽高比。不解码真实 PNG(解码默认实现依赖 OffscreenCanvas,仅 SW 内可用)。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePngMetrics,
  type ImageDataLike,
  type PngDecoder,
} from '../src/background/png-metrics.js';
import { BridgeError } from '../src/background/bridge-error.js';

/** 构造纯色 ImageData 桩:fillers 逐像素给出 [r,g,b,a](按行填充,不足循环) */
function stubImage(width: number, height: number, fillers: Array<[number, number, number, number]>): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = fillers[i % fillers.length];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

const decodeOf = (img: ImageDataLike): PngDecoder => async () => img;
// base64 内容在注入解码器时不参与解码,占位即可
const FAKE_B64 = 'cG5nLXN0dWI=';

describe('computePngMetrics(注入 ImageData 桩)', () => {
  test('2×2 全白:亮度=1、彩色度=0、单一主色 share=1、宽高比=1', async () => {
    const m = await computePngMetrics(FAKE_B64, decodeOf(stubImage(2, 2, [[255, 255, 255, 255]])));
    assert.equal(m.width, 2);
    assert.equal(m.height, 2);
    assert.equal(m.aspectRatio, 1);
    assert.equal(m.brightness, 1);
    assert.equal(m.colorfulness, 0);
    assert.equal(m.dominantColors.length, 1);
    assert.deepEqual(m.dominantColors[0].rgb, [255, 255, 255]);
    assert.equal(m.dominantColors[0].share, 1);
  });

  test('2×2 全黑:亮度=0、彩色度=0', async () => {
    const m = await computePngMetrics(FAKE_B64, decodeOf(stubImage(2, 2, [[0, 0, 0, 255]])));
    assert.equal(m.brightness, 0);
    assert.equal(m.colorfulness, 0);
    assert.deepEqual(m.dominantColors[0].rgb, [0, 0, 0]);
  });

  test('4×2 红/蓝各半:宽高比=2、亮度=0.1424、彩色度≈272.62、两个主色 share 各 0.5', async () => {
    const m = await computePngMetrics(
      FAKE_B64,
      decodeOf(stubImage(4, 2, [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ])),
    );
    assert.equal(m.aspectRatio, 2);
    // Rec.709:0.2126*255 与 0.0722*255 各占一半 → (54.213+18.411)/2/255 = 0.1424
    assert.equal(m.brightness, 0.1424);
    // Hasler-Süsstrunk:sdRg=127.5, sdYb=191.25, muRg=127.5, muYb=-63.75
    assert.ok(Math.abs(m.colorfulness - 272.6187) < 0.01, `colorfulness=${m.colorfulness}`);
    assert.equal(m.dominantColors.length, 2);
    const shares = m.dominantColors.map((c) => c.share).sort();
    assert.deepEqual(shares, [0.5, 0.5]);
    const rgbs = m.dominantColors.map((c) => c.rgb.join(',')).sort();
    assert.deepEqual(rgbs, ['0,0,255', '255,0,0']);
  });

  test('4×2 灰阶四档:主色按 share 降序,桶内均值色正确', async () => {
    // 每档 2 像素:0/85/170/255 灰(亮度递增,四桶)
    const m = await computePngMetrics(
      FAKE_B64,
      decodeOf(stubImage(4, 2, [
        [0, 0, 0, 255],
        [85, 85, 85, 255],
        [170, 170, 170, 255],
        [255, 255, 255, 255],
      ])),
    );
    assert.equal(m.dominantColors.length, 4);
    for (let i = 1; i < 4; i++) {
      assert.ok(m.dominantColors[i - 1].share >= m.dominantColors[i].share, '主色必须按 share 降序');
    }
    const sum = m.dominantColors.reduce((acc, c) => acc + c.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `主色 share 合计应≈1,实际 ${sum}`);
    // 灰阶 rg=yb=0 → 彩色度 0
    assert.equal(m.colorfulness, 0);
    // Rec.709 亮度均值:(0 + 0.334*85... ) 直接复核:均值灰度 127.5 → 0.5
    assert.ok(Math.abs(m.brightness - 0.5) < 0.001, `brightness=${m.brightness}`);
  });

  test('全透明像素被剔除:2×2 半透明只统计 2 个白像素', async () => {
    const m = await computePngMetrics(
      FAKE_B64,
      decodeOf(stubImage(2, 2, [
        [255, 255, 255, 255],
        [255, 0, 0, 0], // a=0,不计入
      ])),
    );
    assert.equal(m.brightness, 1);
    assert.equal(m.dominantColors.length, 1);
    assert.deepEqual(m.dominantColors[0].rgb, [255, 255, 255]);
    assert.equal(m.dominantColors[0].share, 1);
  });

  test('全部像素透明 → EXTRACT_FAILED', async () => {
    await assert.rejects(
      computePngMetrics(FAKE_B64, decodeOf(stubImage(2, 2, [[255, 255, 255, 0]]))),
      (e: unknown) => e instanceof BridgeError && e.code === 'EXTRACT_FAILED',
    );
  });

  test('像素数据为空/尺寸非法 → EXTRACT_FAILED', async () => {
    await assert.rejects(
      computePngMetrics(FAKE_B64, decodeOf({ width: 4, height: 4, data: new Uint8ClampedArray(4) })),
      (e: unknown) => e instanceof BridgeError && e.code === 'EXTRACT_FAILED',
    );
  });

  test('解码器抛 BridgeError 原样透传;抛普通 Error 包装为 EXTRACT_FAILED', async () => {
    const boom: PngDecoder = async () => {
      throw new BridgeError('EXTRACT_FAILED', 'OffscreenCanvas 不可用');
    };
    await assert.rejects(
      computePngMetrics(FAKE_B64, boom),
      (e: unknown) => e instanceof BridgeError && e.code === 'EXTRACT_FAILED' && /OffscreenCanvas/.test(e.message),
    );
    const generic: PngDecoder = async () => {
      throw new Error('decode boom');
    };
    await assert.rejects(
      computePngMetrics(FAKE_B64, generic),
      (e: unknown) => e instanceof BridgeError && e.code === 'EXTRACT_FAILED' && /decode boom/.test(e.message),
    );
  });
});
