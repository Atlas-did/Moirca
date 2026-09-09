// 动作命令的结构化 delta 组装(纯逻辑,可单测)。
// 任务书第 4 条:所有动作命令返回结构化 delta + 验证信息("点击后页面发生了什么"),
// 不返回"已点击"空话。契约 §a.5 的 *Result 字段为最小集,此处以附加字段
// `delta` 提供验证信息(URL/标题/DOM 变化),对客户端向后兼容(超集)。

export interface PageState {
  url: string;
  title: string;
}

export interface ActionDelta {
  urlChanged: boolean;
  titleChanged: boolean;
  before: PageState;
  after: PageState;
  /** before→after 之间观测到的导航次数(由执行层填充,纯组装时可为 0) */
  navigations?: number;
  /** DOM 变化摘要(执行层可选填充:如 MutationObserver 计数) */
  domMutations?: number;
}

/** 组装动作前后 delta */
export function buildDelta(before: PageState, after: PageState, extra?: Partial<ActionDelta>): ActionDelta {
  return {
    urlChanged: before.url !== after.url,
    titleChanged: before.title !== after.title,
    before,
    after,
    ...extra,
  };
}

/** 验证信息的人类可读摘要(空 URL/标题变化时不输出空话) */
export function describeDelta(delta: ActionDelta): string {
  const parts: string[] = [];
  if (delta.urlChanged) parts.push(`URL ${delta.before.url || '(空)'} → ${delta.after.url || '(空)'}`);
  if (delta.titleChanged) parts.push(`标题 ${delta.before.title || '(空)'} → ${delta.after.title || '(空)'}`);
  if (typeof delta.navigations === 'number' && delta.navigations > 0) parts.push(`导航 ×${delta.navigations}`);
  if (typeof delta.domMutations === 'number' && delta.domMutations > 0) parts.push(`DOM 变更 ×${delta.domMutations}`);
  return parts.length > 0 ? parts.join(';') : '页面无可见变化';
}
