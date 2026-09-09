# WebBridge Daemon(Node.js · TypeScript)

本地桥:连接 AI 客户端(stdio MCP)与 Chrome 扩展(WebSocket)。

```
AI 客户端(Claude Code / Cursor) ──MCP(stdio)──▶ daemon
                                                    │ WebSocket ws://127.0.0.1:9223(仅回环)
                                                    ▼
                                          Chrome 扩展(MV3,chrome.debugger/CDP)
```

- 端口 **9223**(避开 Chrome remote-debugging 默认端口;全仓库禁用该默认端口作为 WebBridge 端口)
- daemon 只做**翻译/转发/落盘/认证**,不做浏览器控制决策
- 接口字段一律以 `docs/CONTRACT.md` 为准;类型镜像在 `src/types/`(由 `tests/drift.test.ts` 与 `shared-types/src` 逐字节校验防漂移)

## 目录结构

| 文件 | 职责 |
|------|------|
| `src/index.ts` | 启动编排 + 环境变量装配 |
| `src/mcp-server.ts` | MCP Server(stdio),注册 15 个 `browser_*` 工具(+可选 `browser_route`) |
| `src/extension-bridge.ts` | WS Server(127.0.0.1:9223):token 认证、hello 握手、pending/超时/断连清理 |
| `src/bridge.ts` | MCP 调用 → WS 命令翻译层 + 证据钩子 + 字符预算 |
| `src/tools/*.ts` | 每工具一文件(inputSchema 与 description,契约 §b) |
| `src/snapshot-store.ts` | snapshotId 索引(60s 过期),支撑 `browser_find_in_snapshot` |
| `src/artifacts.ts` | 文件旁路(§f):`artifacts/{task_id}/{kind}-{时间戳}-{seq}.{ext}` |
| `src/evidence-client.ts` | 证据钩子:snapshot/extract/click 自动 POST `/api/evidence/save` |
| `src/digest.ts` | snapshot 浓缩摘录(≤2k token) |
| `src/reader.ts` | 默认本地 `@mozilla/readability` → markdown;外部 reader API 仅 env 开关 |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `WEBBRIDGE_WS_PORT` | `9223` | WS 监听端口(恒绑 127.0.0.1) |
| `WEBBRIDGE_CMD_TIMEOUT_MS` | `30000` | 命令级 WS 等待超时 |
| `WEBBRIDGE_ARTIFACTS_DIR` | `<repo>/daemon/artifacts` | 文件旁路根目录 |
| `WEBBRIDGE_EVIDENCE_URL` | `http://127.0.0.1:8000/api/evidence/save` | 证据落库端点 |
| `WEBBRIDGE_EVIDENCE_OFF` | 未设置(开启) | 设为 `1` 关闭证据钩子(**默认开启,核心价值承诺**) |
| `WEBBRIDGE_READER_API_URL` | 未设置(本地 readability) | 外部 reader API(Jina/Firecrawl),默认关闭 |
| `WEBBRIDGE_MCP_ROUTE_TOOL` | 未设置(不注册) | 设为 `on` 注册 `browser_route` 工具 |
| `WEBBRIDGE_TOKEN` | 启动时随机生成 | 预共享 token(测试/脚本用;正常使用让 daemon 自动生成) |
| `WEBBRIDGE_ARTIFACT_TTL_HOURS` | `168`(7 天) | 仅供 `cleanupOlderThan` 显式清理;daemon 不做自动删除(§f) |

## 手工联调步骤(不跑测试时的端到端复现)

1. **构建与启动 daemon**

   ```bash
   cd daemon
   npm install
   npm run build
   npm run start-mcp        # 前台运行;或 npm run dev(tsx watch)
   ```

   启动后终端(stderr)会打印本次会话 token,并写入 `daemon/.bridge-token`(0600):

   ```
   [webbridge] 本次会话 token(粘贴到扩展 popup 设置页):
     3f9c...64 位 hex...
   [extension-bridge] listening on ws://127.0.0.1:9223(仅回环)
   [webbridge] MCP Server 已就绪(stdio)
   ```

2. **装载 Chrome 扩展并完成 token 握手**

   - Chrome → `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/dist-pro`(pro 模式构建产物,构建方式见 extension/README)
   - 点扩展 popup → 设置页粘贴第 1 步的 token → 保存(存 `chrome.storage.local`)
   - popup 显示"已连接"即握手成功(daemon stderr 出现 `握手成功:mode=pro`)

   > 认证语义:扩展连上 9223 后必须先发 `hello`(携带 token),daemon 校验通过才回 `welcome`;
   > token 错误或 `protocolVersion≠1` 的连接会被立即关闭——"任何本地进程都能连端口"被拒绝。

3. **把 MCP Server 接入 AI 客户端**

   ```bash
   claude mcp add webbridge -- node <仓库>/daemon/dist/index.js
   # Cursor:Claude Desktop 同理,在 mcp 配置中加
   # { "mcpServers": { "webbridge": { "command": "node", "args": ["<仓库>/daemon/dist/index.js"] } } }
   ```

4. **全链路复现(navigate + snapshot)**

   在 Claude Code / Cursor 里依次说:

   - 「用 browser_navigate 打开 https://example.com」→ 新建后台标签并导航,返回 `{ok,tabId,url,finalUrl}`
   - 「用 browser_snapshot 看看页面」→ 返回 ≤25,000 字符快照 + `refs`(如 `e12`)+ `digest`
   - 「用 browser_click 点 ref e12」→ 执行并回执

   同时可验证:

   - **不跑扩展时**:任何 `browser_*` 调用返回
     `{"code":"EXT_NOT_CONNECTED","num":-32000,"message":"扩展未连接:…"}`(`isError:true`)
   - **证据钩子**:backend(AGENT_02,`127.0.0.1:8000`)在跑时,`browser_extract` 成功后自动落库并回填 `evidenceId`;
     backend 挂掉时 daemon 打印 `BACKEND_UNREACHABLE` 日志,**浏览器操作不受影响**(文件旁路兜底,artifact 照常落盘)
   - **文件旁路**:超长 snapshot/extract 与全部截图落 `daemon/artifacts/{task_id}/`,`fileRef` 为 `file://` 绝对路径

5. **安全说明**

   - WS Server 恒绑 `127.0.0.1`,无任何对外监听开关;MCP 走 stdio,不额外开放 TCP
   - 截图仅供人复核,**不能作为执行动作的依据**(工具 description 已写死;动作一律基于 snapshot 的 refs)
   - readonly 模式扩展接入时,daemon 侧双保险拒绝写命令(`READONLY_REJECTED`/`TARGET_DENIED`)

## 测试

```bash
npm test          # node:test + tsx,26 项:bridge 转发(fake WS 端)/ token 拒绝 /
                  # 超时/断连 / 证据钩子降级 / 文件旁路 / readability / 漂移校验 / 9222 禁用
npm run test:e2e  # 验收冒烟:官方 SDK Client 经 stdio 连 dist/index.js,
                  # 校验 tools/list=15 工具、无扩展时 EXT_NOT_CONNECTED、token 落盘 0600
```
