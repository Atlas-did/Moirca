# Changelog — WebBridge 扩展

## 2.0.0(2026-09-06)— 按 CONTRACT.md v1.0 重构

接口为破坏性重写,与老版(moirca-webbridge v0.2 / extension 1.0)不兼容。

### WS 协议(§a)

- 连接地址由 `ws://localhost:9222` 改为 **`ws://127.0.0.1:9223`**(契约端口约定)。
- 新增 hello/welcome 握手:`hello {mode, extVersion, protocolVersion:1}` → `welcome {protocolVersion, artifactRoot}`;welcome 前不响应命令;协议版本不匹配即断开并停止重连。
- 重连退避改为指数 3s→30s。
- 消息信封改为契约结构:`result {id, ok, result?, error?}`,错误结构化 `{code, num, message, data}`(§g.1 错误码表),不再回传纯字符串错误。

### target 语义(§a.3,新增)

- 除 `get_tabs`/`find_in_snapshot` 外所有命令必含 `target: 'activeTab'|'newTab'|'tabId:N'`。
- `activeTab` 仅放行只读命令(snapshot/screenshot/extract/wait),写命令 → `TARGET_DENIED(-32005)`(原则 1:不抢用户当前标签)。
- `tabId:N` 仅限托管标签;`newTab` 复用/新建 agent 专属后台标签,登记 managed 集合,空闲 10 分钟自动回收。

### 快照重构(§a.5,原则 2)

- **旧**:整棵 AX 树直出文本,无截断,无 ref 定位。
- **新**:紧凑序列化(仅标题/链接/按钮/输入框 + 标题层级),深度上限 14 + 字符上限 ≤25,000,超限 `truncated:true`(fileRef 由 daemon 回填);`e{n}` 自增 ref → backendDOMNodeId,click/fill 用 ref 定位,失效报 `REF_STALE(-32006)`。
- readonly 模式:无 AX 树,由 `chrome.scripting` 注入 DOM 提取紧凑摘要,**无 ref**;`find_in_snapshot` 在 readonly 被拒。
- `find_in_snapshot`:契约定为 daemon 本地执行(§a.5);扩展保留同一算法与最近快照存储作兜底。

### 命令集(§a.2,9 → 15 条)

- 新增实现:`new_tab` / `close_tab` / `switch_tab` / `press_key`(CDP `Input.dispatchKeyEvent` keyDown/keyUp 序列,支持 `Control+A` 等组合键——v1 痛点)/ `wait`(time/selector/networkidle,语义对齐 playwright-mcp)/ `scroll` / `extract`(pro 走 CDP 注入,readonly 走 DOM 克隆)/ `find_in_snapshot`(兜底)。
- `navigate`:target 仅 `newTab`/`tabId:N`;`waitUntil` load/domcontentloaded/none;默认 15s,超时报 `NAV_TIMEOUT(-32002)`(不再静默吞超时)。
- `evaluate`:仅 pro;expression ≤100,000 字符,返回值须 JSON 可序列化 ≤100KB。
- `fill`:`secret` 不回显,`pressEnter` 补 Enter,`value` ≤10,000 字符。
- 所有动作命令结果附加结构化 `delta`(URL/标题变化、导航/DOM 计数)+ 摘要,不再返回"已点击"空话(契约 *Result 字段为最小集,`delta` 为向后兼容超集)。

### 双模式与权限(原则 8)

- manifest 拆分:`manifest.pro.json`(debugger+<all_urls>+tabs)/ `manifest.readonly.json`(activeTab+scripting+storage),vite 构建矩阵经 `--mode` 注入 `__WEBBRIDGE_MODE__`。
- pro attach 时:Chrome 自带调试提示 + 扩展图标 `DBG` 徽标。

### 通道②(readonly popup)

- popup 完整实现页面只读问答闭环:选区优先正文提取 → `POST /api/context/ask`(§e.2 字段逐字对齐)→ 弹窗内安全 markdown 渲染;移植 moirca-webbridge 的视角选择/一键复制/后端地址设置交互。
- pro 构建的 popup 改为 daemon 连接状态展示。

### 工程化

- 类型真源迁至 `@webbridge/shared-types`(npm workspace `file:` 依赖);`extension/src/types/index.ts` 改为 re-export。
- 单测:node:test + tsx,119 个用例(截断算法、find、target 决策、readonly 拒绝矩阵、键位映射、delta、错误码表、CDP mock、WS 握手状态机)。

## 1.0.0

老版骨架:5 个命令(其中 scroll/evaluate/get_tabs/switch_tab 为占位),WS 9222,无握手,无 target,无截断。
