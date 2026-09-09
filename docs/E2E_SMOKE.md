# WebBridge E2E 冒烟门(发布前必过)

> 版本:2026-09-06(AGENT_07)。
> 本清单是**发布门禁**:自动部分全绿 + 人工部分全部勾选,才允许发布。
> 架构链路:AI 客户端 ─MCP(stdio)→ daemon ─WS(127.0.0.1:9223)→ Chrome 扩展(CDP) → 真实浏览器。

## 第 0 步:环境准备

- [ ] Python 3.12+、Node.js 18+(20 更佳)已安装
- [ ] `pip install -r backend/requirements.txt`
- [ ] 仓库根目录 `npm install`(workspaces:shared-types / daemon / extension)
- [ ] Chrome / Edge 已安装(真机验证用)

## 第 1 步:自动冒烟(可重复执行)

```bash
bash scripts/smoke-e2e.sh
```

覆盖并自动断言:

- [ ] backend 启动,`GET /api/health` 返回 `ok:true` 且 `evidence_db:true`
- [ ] `POST /api/route` → `label=deep_research`
- [ ] `POST /api/evidence/save` → 201 + `ev_*` ID;`GET /api/evidence/query` 回查命中
- [ ] 同 evidence_id 重放 → 200 幂等
- [ ] daemon MCP stdio 冒烟:`tools/list` 返回契约 15 个 `browser_*` 工具;无扩展时 `browser_get_tabs` 返回 `EXT_NOT_CONNECTED`(isError);`.bridge-token` 以 0600 落盘

自动部分必须 `PASS=7 FAIL=0`。

## 第 2 步:构建扩展(双模式)

```bash
cd extension
npm run build        # readonly + pro 两个矩阵
```

- [ ] 产物 `dist-pro/` 与 `dist-readonly/` 均生成
- [ ] `dist-readonly/manifest.json` 权限仅 `activeTab + scripting + storage`
- [ ] `dist-pro/manifest.json` 含 `debugger` 与 `<all_urls>`

## 第 3 步:启动三组件

```bash
# 1) backend
cd backend && python run.py          # http://127.0.0.1:8000

# 2) daemon(另开终端)
cd daemon && npm run dev             # WS 监听 ws://127.0.0.1:9223
# 首次启动打印 64 位 hex token,并写入 daemon/.bridge-token(0600)
```

- [ ] daemon 日志确认只绑 `127.0.0.1:9223`
- [ ] `cat daemon/.bridge-token` 取得配对 token

## 第 4 步:加载扩展并配对(手工,真机)

- [ ] `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 `extension/dist-pro/`
- [ ] 打开该扩展的 service worker 控制台,确认 hello 握手成功、收到 welcome
      (若 daemon 已在跑但 token 未对上,会看到 close 4001 —— 检查 `daemon/.bridge-token`)
- [ ] daemon 侧日志显示扩展已连接(online / mode=pro)

> readonly 模式验证:另建一个 Chrome profile,加载 `extension/dist-readonly/`,重复配对;readonly 不应能执行任何写命令(见第 6 步矩阵抽查)。

## 第 5 步:MCP 全链路(Claude Code 接入)

把 daemon 注册进 AI 客户端(Claude Code 示例):

```bash
claude mcp add webbridge -- node /绝对路径/webbridge-build/daemon/dist/index.js
```

在客户端里依次调用并核对返回:

- [ ] `browser_navigate { url: "https://www.moe.gov.cn/", task_id: "task_E2E" }` → `ok:true` 且落在新标签(当前页未被抢走)
- [ ] `browser_snapshot {}` → `text ≤ 25,000 字符`,附 `digest`(≤2k token);构造超长页时返回 `fileRef`
- [ ] `browser_find_in_snapshot { snapshotId, query: { text: "招生" } }` → 命中 `ref=eN`
- [ ] `browser_click { ref: "eN" }` → `ok:true` + delta 验证信息(URL/标题变化)
- [ ] `browser_extract {}` → markdown 正文;backend `/api/evidence/query?task_id=task_E2E`
      查到自动落库的证据(channel=controlled_browse,evidence_id 已回填 extract 结果)
- [ ] `browser_screenshot {}` → `image` content + `fileRef`(artifacts 目录可见 png)

## 第 6 步:readonly / pro 拒绝矩阵抽查

- [ ] readonly 在线时调用 `browser_click` → `READONLY_REJECTED`
- [ ] pro 会话对写命令显式带 `target:"activeTab"` → `TARGET_DENIED`
- [ ] `tabId:N` 未托管标签 → `TARGET_DENIED`
- [ ] 断开扩展后调用任意工具 → `EXT_NOT_CONNECTED`

## 第 7 步:证据 → 报告引用渲染

- [ ] `POST /api/deep-research {"query":"帮我对比华科和武大的计算机专业","budget":{"max_evidence":10}}` → 202 + task_id
- [ ] 轮询 `GET /api/deep-research/{task_id}` 至 `done`,`evidence_count > 0`
- [ ] `POST /api/report {"task_id":"..."}` → 200,`citations[]` 均为 evidence_id 外键,正文含 `[E:ev_...]` 行内引用
- [ ] 任取一条 citation → `GET /api/evidence/{id}` 回查原文一致

## 第 8 步:终检(发布红线)

- [ ] `node scripts/check-drift.mjs` 全 PASS(禁用端口无残留 / shared-types 零漂移 / 工具名与错误码对齐)
- [ ] `cd backend && python -m ruff check . && python -m pytest tests/ -q` 全绿
- [ ] `npm test` 全绿(daemon / extension / shared-types tsc)
- [ ] 仓库无 LICENSE 缺失、无 `.env`/密钥入库(gitleaks 通过)
- [ ] `daemon/artifacts/`、`daemon/.bridge-token` 不在版本控制内

## 失败排查速查

| 症状 | 排查点 |
|------|--------|
| 扩展连不上 9223 | daemon 是否在跑;`WEBBRIDGE_WS_PORT` 是否一致;防火墙 |
| close 4001 | token 不匹配(`daemon/.bridge-token`)或 protocolVersion 不符 |
| EXT_NOT_CONNECTED | 扩展 service worker 未存活(MV3 休眠),刷新扩展或重开页面 |
| extract 无 evidence_id | backend 未启动 / `WEBBRIDGE_EVIDENCE_URL` 不对(降级不阻塞,查 daemon 日志 BACKEND_UNREACHABLE) |
| 报告 citations 空 | 深研任务是否 done;evidence 是否真实落库(非仅落盘) |
