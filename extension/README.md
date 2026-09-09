# WebBridge Chrome 扩展(MV3,双模式)

一套源码,两份 manifest,构建出两种权限形态(契约 §a.4 / 原则 8):

| 构建 | 产物目录 | manifest | 权限哲学 |
|------|----------|----------|----------|
| `npm run build:readonly` | `dist-readonly/` | `manifest.readonly.json` | 最小权限:`activeTab + scripting + storage`;通道②页面只读问答;写命令一律 `READONLY_REJECTED` |
| `npm run build:pro` | `dist-pro/` | `manifest.pro.json` | CDP 全权:`debugger + <all_urls> + tabs`;受控浏览执行器(通道④) |

类型真源:`@webbridge/shared-types`(仓库根 `shared-types/`,经 npm `file:` 依赖解析)。

## 构建

```bash
cd extension
npm install          # 含 file:../shared-types 链接
npm run typecheck    # tsc --noEmit
npm test             # node --import tsx --test(119 个单测)
npm run build        # 顺序构建 readonly + pro 两个产物目录
```

产物:`dist-readonly/` 与 `dist-pro/`,各自内含完整可加载的 `manifest.json`、`background.js`、`popup.html/js`、`icons/`。

## 手工加载验证(chrome://extensions)

1. 打开 Chrome,地址栏输入 `chrome://extensions`。
2. 右上角打开「开发者模式」开关。
3. 点「加载已解压的扩展程序」,选择目录:
   - 体验只读问答 → 选 `extension/dist-readonly/`
   - 联调 daemon/MCP → 选 `extension/dist-pro/`
   - **两个目录只能加载其中一个**(同源两份会互相覆盖设置;建议先卸载再换装)。
4. 验证 readonly:
   - 打开任一普通网页,点扩展图标 → 弹窗出现「页面只读问答」。
   - 在页面选中一段文字,输入问题,点「解读当前页面」→ 回答渲染在弹窗内(需 backend 运行于 127.0.0.1:8000,或底部「后端设置」里改地址)。
   - 「后端设置」可改后端地址,保存时会请求对应主机授权(optional_host_permissions)。
5. 验证 pro:
   - 先启动 daemon(监听 `ws://127.0.0.1:9223`),扩展自动连接;弹窗「连接状态」显示已连接。
   - 经 MCP 调 `browser_navigate {target:'newTab'}`:新开后台专用标签,**用户当前活动标签页不被触碰**。
   - 调 `browser_snapshot`:返回 ≤25,000 字符紧凑 AX 摘要 + `e{n}` ref;超限 `truncated:true`(fileRef 由 daemon 落盘回填)。
   - 调 `browser_click {ref:'eN'}`:执行后返回结构化 `delta`(URL/标题变化),而非"已点击"空话。
   - attach 时 Chrome 顶部出现「WebBridge 正在调试此浏览器」提示,扩展图标显示 `DBG` 徽标;detach 后消失。
   - 对 readonly 才有的写命令矩阵:pro 构建 `evaluate` 可用;readonly 构建同一命令返回 `READONLY_REJECTED(-32004)`。
6. 验证 target 拒绝:对 pro 构建发 `click {target:'activeTab'}` → `TARGET_DENIED(-32005)`;发 `navigate {target:'tabId:99'}(未托管)` → `TARGET_DENIED`。

## 故障排查

- 扩展连不上 daemon:确认 daemon 监听 `ws://127.0.0.1:9223`(仅回环);扩展每 3s→30s 指数退避重连。
- `chrome://`、Web Store 等受限页:readonly 提取注入会失败,popup 显示"无页面内容",属预期。
- 协议版本不匹配(welcome.protocolVersion ≠ 1):扩展主动断开且**停止重连**,需升级 daemon/扩展之一。
