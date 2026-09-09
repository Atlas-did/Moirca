// 命令共享依赖容器(service-worker 装配一次,各命令模块消费)
import type { CDPController } from './cdp-controller.js';
import type { ManagedTabs } from './managed-tabs.js';
import type { SnapshotStore } from './snapshot-store.js';
import type { ScriptingAdapterLike } from './scripting-adapter.js';
import type { TargetResolver } from './target-resolver.js';
import type { TabsAdapterLike } from './tabs-adapter.js';

export interface CommandDeps {
  mode: 'pro' | 'readonly';
  tabs: TabsAdapterLike;
  resolver: TargetResolver;
  cdp: CDPController | null; // readonly 构建下恒为 null
  scripting: ScriptingAdapterLike | null; // readonly 模式必需
  managed: ManagedTabs;
  snapshots: SnapshotStore;
  commandId: string;
}
