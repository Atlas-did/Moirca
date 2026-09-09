// 运行模式判定:由构建注入 __WEBBRIDGE_MODE__(vite define,readonly/pro 两份 manifest 配套)。
// 运行时不得依赖 chrome.runtime.id 猜测模式——单一真源是编译期注入。

declare const __WEBBRIDGE_MODE__: 'pro' | 'readonly';

export type BridgeMode = 'pro' | 'readonly';

export function getMode(): BridgeMode {
  // 兜底:测试/Node 环境无 define 时默认 readonly(最小权限哲学:拿不准就当只读)
  try {
    return typeof __WEBBRIDGE_MODE__ === 'string' ? __WEBBRIDGE_MODE__ : 'readonly';
  } catch {
    return 'readonly';
  }
}

export function isPro(): boolean {
  return getMode() === 'pro';
}

export function isReadonly(): boolean {
  return getMode() === 'readonly';
}
