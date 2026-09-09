// chrome.scripting 适配层(readonly 模式 DOM 提取注入;可注入便于测试)
export interface ScriptingAdapterLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeScript(injection: { target: { tabId: number }; func: (...args: any[]) => unknown; args?: unknown[] }): Promise<
    Array<{ result?: unknown; frameId?: number }>
  >;
}

export class ChromeScriptingAdapter implements ScriptingAdapterLike {
  executeScript(injection: Parameters<typeof chrome.scripting.executeScript>[0]): Promise<Array<{ result?: unknown; frameId?: number }>> {
    return chrome.scripting.executeScript(injection) as unknown as Promise<Array<{ result?: unknown; frameId?: number }>>;
  }
}
