// WebBridge 扩展双模式构建矩阵。
// 用法:
//   npm run build:readonly  → dist-readonly/  (manifest.readonly.json,最小权限)
//   npm run build:pro       → dist-pro/       (manifest.pro.json,CDP 全权)
// 模式经 Vite mode 注入 __WEBBRIDGE_MODE__,运行时由 src/mode.ts 消费。
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readFileSync, copyFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';

type ExtMode = 'pro' | 'readonly';

function webbridgeManifestPlugin(mode: ExtMode): Plugin {
  return {
    name: 'webbridge-manifest',
    closeBundle() {
      const outDir = resolve(__dirname, mode === 'pro' ? 'dist-pro' : 'dist-readonly');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      const manifest = JSON.parse(
        readFileSync(resolve(__dirname, `manifest.${mode}.json`), 'utf-8'),
      );
      // 图标与 popup.html 直接拷贝(entry 输出的 background.js/popup.js 已由 rollup 产出)
      copyFileSync(resolve(__dirname, 'src/popup/popup.html'), resolve(outDir, 'popup.html'));
      for (const size of [16, 48, 128]) {
        copyFileSync(
          resolve(__dirname, `public/icons/icon${size}.png`),
          resolve(outDir, `icons/icon${size}.png`),
        );
      }
      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig(({ mode }) => {
  const extMode: ExtMode = mode === 'pro' ? 'pro' : 'readonly';
  return {
    define: {
      __WEBBRIDGE_MODE__: JSON.stringify(extMode),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: extMode === 'pro' ? 'dist-pro' : 'dist-readonly',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/service-worker.ts'),
          popup: resolve(__dirname, 'src/popup/popup.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          format: 'es',
        },
      },
    },
    plugins: [webbridgeManifestPlugin(extMode)],
  };
});
