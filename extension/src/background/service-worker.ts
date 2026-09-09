// WebBridge 扩展 service worker(重构)。
// 职责:
// - WS 连接(§a.1):连 ws://127.0.0.1:9223,hello/welcome 握手,3s→30s 指数退避重连,
//   protocolVersion 不匹配即停止重连(保留旧版断线重连骨架,地址与协议按契约更新)
// - 命令循环:等待命令队列 → 准入裁决(readonly/pro 矩阵 + target)→ 执行 → 结构化 result
// - 超时/挂起兜底:命令级 30s(CMD_TIMEOUT),托管标签空闲回收,快照过期清理
// - pro 模式 attach 时 badge 状态提示(chrome.debugger 自带"开始调试此标签"提示之外,另加 DBG badge)
import type { WSCommandMessage } from '@webbridge/shared-types';
import { getMode } from '../mode.js';
import { CDPController } from './cdp-controller.js';
import { ChromeTabsAdapter } from './tabs-adapter.js';
import { ChromeScriptingAdapter } from './scripting-adapter.js';
import { ManagedTabs } from './managed-tabs.js';
import { SnapshotStore } from './snapshot-store.js';
import { TargetResolver } from './target-resolver.js';
import { WsConnection } from './ws-connection.js';
import { executeCommand } from './command-registry.js';
import { handleAnalyzeRequest } from './analysis-report.js';

const MANAGED_TAB_IDLE_MS = 10 * 60 * 1000; // 托管标签空闲 10 分钟回收(任务结束/超时兜底)

const mode = getMode();
const tabs = new ChromeTabsAdapter();
const snapshots = new SnapshotStore();
const cdp: CDPController | null = mode === 'pro' ? new CDPController({ tabsApi: tabs as never }) : null;
const managed = new ManagedTabs({
  onTabRemoved: (tabId) => {
    snapshots.invalidate(tabId);
    if (cdp) void cdp.detach(tabId).catch(() => undefined);
  },
});
const scripting = mode === 'readonly' ? new ChromeScriptingAdapter() : null;
const resolver = new TargetResolver(tabs, managed);

// pro:badge 提示调试状态(chrome.debugger 自带顶部提示,这里再给扩展图标 badge)
if (cdp && typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
  const updateBadge = () => {
    const n = cdp.attachedTabIds().length;
    chrome.action.setBadgeText({ text: n > 0 ? 'DBG' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  };
  cdp.onDetach(updateBadge);
  const origAttach = cdp.attach.bind(cdp);
  cdp.attach = async (tabId: number) => {
    await origAttach(tabId);
    updateBadge();
  };
}

// 托管标签被关闭:清理快照/attach(ManagedTabs.onTabRemoved 已挂;tabs.onRemoved 由 adapter 转发)

// 命令队列:串行执行,避免并发写同一标签;单命令 30s 兜底在 WsConnection.dispatchWithTimeout
let chain: Promise<unknown> = Promise.resolve();
const enqueue = (cmd: WSCommandMessage): Promise<unknown> => {
  const task = chain.then(
    () => executeCommand(
      {
        mode,
        tabs,
        resolver,
        cdp,
        scripting,
        managed,
        snapshots,
        commandId: cmd.id,
      },
      String(cmd.method),
      (cmd.params ?? {}) as Record<string, unknown>,
      snapshots,
    ),
  );
  // 失败已在 executeCommand 内封装为结构化 error;这里吞掉链式 reject 防断队
  chain = task.catch(() => undefined);
  return task;
};

const connection = new WsConnection(
  {
    onCommand: async (cmd) => (await enqueue(cmd)) as never,
    onStatusChange: (status) => {
      void chrome.storage.local.set({ wsStatus: status, wsMode: mode }).catch(() => undefined);
      if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
        chrome.action.setBadgeText({ text: status === 'connected' ? (mode === 'pro' ? '' : 'R') : '' });
      }
    },
  },
  undefined,
  chrome.runtime.getManifest?.().version ?? '2.0.0',
);

// 截图分析消息分支(popup 发 {kind:'wb_analyze_screenshot'},§a.6):
// worker 本地截 activeTab 并统计像素指标(图像不出本机),结果经 WS 上报 daemon、
// 同时回给 popup 展示。顶层装配全部包在能力探测内,任何环境缺失都不得让 worker 注册失败。
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    return handleAnalyzeRequest(
      msg,
      { deps: { mode, tabs, resolver, cdp, scripting, managed, snapshots }, connection },
      (res) => {
        // popup 可能在响应前关闭:sendResponse 抛错只静默
        try {
          sendResponse(res);
        } catch {
          /* ignore */
        }
      },
    );
  });
}

function start(): void {
  connection.start();
  // 定时兜底清理:过期快照 + 空闲托管标签(任务超时 detach 并关闭,任务书第 3 条)
  setInterval(() => {
    snapshots.evictExpired();
    for (const tabId of managed.idleIds(MANAGED_TAB_IDLE_MS)) {
      managed.unregister(tabId);
      void cdp?.detach(tabId).catch(() => undefined);
      void chrome.tabs.remove(tabId).catch(() => undefined);
    }
  }, 60_000);
}

chrome.runtime.onInstalled.addListener(() => {
  start();
});
chrome.runtime.onStartup.addListener(() => {
  start();
});
// service worker 冷启动(onInstalled/onStartup 不一定触发)
start();
