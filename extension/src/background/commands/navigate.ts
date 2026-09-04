import { CDPController } from '../cdp-controller.js';
import { NavigateParams, NavigateResult } from '../../types/index.js';

export class NavigateCommand {
  constructor(private cdp: CDPController) {}

  async execute(params: NavigateParams): Promise<NavigateResult> {
    if (!params.url) throw new Error('navigate: url is required');

    let tab: chrome.tabs.Tab;

    if (params.newTab) {
      tab = await chrome.tabs.create({ url: params.url, active: false });
    } else {
      const existing = await this.cdp.getAttachedTab();
      if (existing && existing.id) {
        tab = await chrome.tabs.update(existing.id, { url: params.url });
      } else {
        tab = await chrome.tabs.create({ url: params.url, active: false });
      }
    }

    if (!tab.id) throw new Error('navigate: failed to create/update tab');

    // 等待页面加载
    await new Promise<void>((resolve) => {
      const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // 超时 10 秒
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });

    await this.cdp.attach(tab.id);

    return {
      success: true,
      tabId: tab.id,
      url: tab.url || params.url,
    };
  }
}
