# Moirca 志愿助手（浏览器插件）

一个只读的浏览器插件：浏览高考志愿相关网站（招生网 / 省考试院 / 阳光高考等）时，
选中一段文字或直接提问，让 Moirca 后端的 Agent 帮你解读页面内容。

Manifest V3，权限最小化：`activeTab + scripting + storage`，无 `debugger`、无常驻的
`<all_urls>` 注入 —— 插件不预埋在任意页面，只在**你点按钮的那一刻**才按需注入并读取一次文本。

## 一、装机方法（手动加载，一次设置）

1. 确认后端已启动：`cd moirca\backend && python run.py`（默认 http://localhost:8000）
2. 打开 Chrome/Edge，地址栏输入 `chrome://extensions`（Edge 是 `edge://extensions`）
3. 右上角打开「开发者模式」
4. 点「加载已解压的扩展程序」，选择本目录 `moirca-webbridge\`
5. 工具栏会出现「Moirca 志愿助手」图标，点它即可使用

## 二、怎么做

1. 打开一个招生网页
2. （可选）用鼠标选中一段你关心的文字
3. 点插件图标 → 选择解读视角 → 填问题 → 点「解读当前页面」
4. 结果显示在弹窗里（可一键复制）

## 三、权限说明（只读、最小化）

- 不在任何页面常驻注入：`content_scripts` 无 `<all_urls>`，`debugger` 等高风险权限一概没有
- 只在**你主动点按钮**时，用 `chrome.scripting` 往**当前这一个标签页**注入一次脚本读文字
- 只上传「选中文字 / 整页正文」的文本片段，不上传整页 DOM、Cookie、截图
- 不落库、不记录个人成绩/身份证等敏感字段；后端对文本片段做长度上限截断

## 四、后端地址设置

- 默认连 `http://localhost:8000`
- 弹窗底部「后端设置」可改成你的真实后端域名（自动持久化到 `chrome.storage.sync`，并申请对应主机权限）

## 五、文件

- manifest.json   — MV3 配置（activeTab + scripting + storage 最小权限，无 <all_urls> 常驻注入）
- background.js   — 转发请求到 Moirca 后端（地址可配置，含 /api/context/ping 连通性检测）
- content.js      — 采集选中文字 / 整页正文（由 popup 点击时按需注入）
- popup.html/js   — 弹窗 UI、按需注入、markdown 渲染、复制、后端设置
- icons/          — 16/48/128 图标
- _locales/       — 中文本地化

## 六、后端接口

新增 `POST /api/context/ask`：把页面文本 + 问题喂给现有 Agent（chat.py 的 AGENT_PROMPTS + LLMClient）。
文件：`moirca\backend\app\api\context.py`，已在 `api\__init__.py` 注册。
配套 `GET /api/context/ping`：插件设置页用它检测连通性与 LLM 配置状态。

详细契约见 `moirca\docs\api.md` 第 7 节。
