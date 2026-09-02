# 前端设计调研 — 从 10+ 个项目中学习 UI/UX 模式

> 搜索了 MiroFish、DeepTutor、MaxKB、GangDan、admissionsystem、EduPath-AI 等项目的完整前端实现
> 日期: 2026-05-29

---

## 一、已分析项目一览

| 项目 | Stars | 前端框架 | 核心 UI 模式 |
|------|-------|---------|------------|
| **MiroFish** | 62.9k | Vue 3 + Vite + D3 | 5步pipeline、D3力导向图、轮询进度、历史数据库 |
| **DeepTutor** (HKU) | 21k | Next.js + React 19 | WebSocket流式、4主题、Mermaid/SVG/Chart.js、KaTeX |
| **MaxKB** | 15k | Vue.js | 流式对话、全屏/浮窗嵌入、移动端适配、Markdown渲染 |
| **GangDan** | 新项目 | 纯HTML/CSS/JS | 零框架、SSE流式、浏览器终端、7模块化JS |
| **Langchain4j 高考志愿** | - | Vue 3 + Tailwind | 冲稳保策略UI、dark mode、流式打字效果 |
| **EduPath-AI** | - | React 18 + TS | 推荐卡片、AI聊天、个性化仪表盘 |
| **rank2college** | - | Next.js 14 | 实时结果、智能匹配、NextUI组件 |
| **CampusMind** | - | React 18 + TS | RAG多Agent、来源标注回复、Framer Motion |
| **admissionsystem** | 53 | Vue 2 | 平行志愿算法UI、Excel导入导出、表格展示 |
| **UniPath** | - | React + Tailwind | 基于成绩的大学推荐、响应式UI |

---

## 二、可直接借鉴的设计模式（按优先级）

### P0 — 立即可做，效果最明显

#### 1. 流式响应（SSE）— 来自 GangDan / MaxKB / DeepTutor

当前 Moirca：Agent Chat 发送消息 → 等 2-10s → 一次性返回。

改为 SSE（Server-Sent Events）：
```
用户发送消息 → SSE 连接 → 后端逐 token 推送 → 前端实时打字效果
```

**GangDan 的做法**（纯 Python + JS，零依赖）：
```python
# 后端: Flask SSE
def generate():
    for chunk in ollama.chat(messages, stream=True):
        yield f"data: {json.dumps({'content': chunk})}\n\n"
    yield "data: [DONE]\n\n"

@app.route('/chat/stream', methods=['POST'])
def chat_stream():
    return Response(generate(), mimetype='text/event-stream')
```

**价值**：Agent 对话从"等 10 秒"变成"逐字显示"，体验提升巨大。

#### 2. 推荐卡片化展示 — 来自 EduPath-AI / rank2college

当前 Moirca：志愿表是传统 `<table>` 行。

改为卡片网格：
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ⭐ 计算机科学      │  │   软件工程        │  │   电气工程        │
│ 华南理工大学       │  │ 深圳大学          │  │ 华南理工大学       │
│ 78分  稳         │  │ 72分  稳         │  │ 65分  冲         │
│ 就业确定性高       │  │ 地理位置优势       │  │ 电网兜底          │
│ 技术壁垒强        │  │ 实习机会多         │  │ 进可攻退可守       │
│ [查看详情]        │  │ [查看详情]        │  │ [查看详情]        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

#### 3. 深色模式 — 来自 DeepTutor / Langchain4j / MaxKB

DeepTutor 实现了 4 种主题，最简单的做法是亮/暗切换。

Moirca 当前只有亮色，加一个暗色 toggle 按钮即可。

### P1 — 本周可做

#### 4. Markdown 报告渲染 — 来自 MiroFish Step4Report / MaxKB

MiroFish 的 `renderMarkdown()` 支持：
- 标题层级（h1-h6）
- 代码块（语法高亮）
- 引用块
- 列表（含子列表）
- 粗体/斜体
- 水平线

Moirca 的报告当前是纯文本，需要至少支持这 6 种格式。

#### 5. 实时进度条（轮询模式）— 来自 MiroFish

MiroFish 的进度轮询模式（每 2-3 秒）：
- Step 1: `getTaskStatus` + `getGraphData`
- Step 2: `getPrepareStatus` + `getSimulationProfilesRealtime`
- Step 3: `getRunStatus` + `getRunStatusDetail`
- Step 4: `getAgentLog` + `getConsoleLog`

Moirca 的异步推荐已支持 `GET /status/{id}` 轮询，前端只需接上。

#### 6. 历史项目列表 — 来自 MiroFish HistoryDatabase

MiroFish 的首页历史卡片：
```
┌──────────────────────────┐
│ 📄 广东585分 计算机类       │
│ 文件: 成绩单.pdf           │
│ 推荐: 华南理工 计算机 78分   │
│ 2026-05-29 14:30          │
│ [查看详情] [重新分析]       │
└──────────────────────────┘
```

### P2 — 下一阶段

#### 7. WebSocket 实时通信 — 来自 DeepTutor

替代轮询，真正的实时双向通信：
- 前端收到推荐进度 → 进度条自动更新
- Agent 完成一个 → 即时通知前端
- 多个用户可共享同一 session

#### 8. 交互式报告 — 来自 DeepTutor Guided Learning

DeepTutor 的多步骤交互式 HTML 页面：
- 每一步包含讲解、图示、示例
- 侧边栏支持每步的上下文问答
- 暂停/恢复/回看

可以用于 Moirca 的志愿报告：第一章=用户画像 → 第二章=推荐清单 → 第三章=对比分析 → 第四章=风险提示

#### 9. 终端面板 — 来自 GangDan / MiroFish

GangDan 在浏览器里嵌入了一个真实终端。MiroFish 有黑色终端式系统日志面板。

Moirca 可以用它展示 Agent 调研过程的实时日志。

---

## 三、技术实现参考

### SSE 流式对话（GangDan 模式）

```javascript
// 前端: 极简 SSE 客户端
async function streamChat(message, agentId) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, agent_id: agentId }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const chunk = JSON.parse(line.slice(6));
        fullText += chunk.content;
        updateMessageUI(fullText);  // 实时更新 UI
      }
    }
  }
}
```

### Markdown 渲染（MiroFish 模式）

```javascript
function renderMarkdown(content) {
  return content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/> (.+)/g, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>');
}
```

### 深色模式（DeepTutor 模式）

```css
:root {
  --bg: #ffffff; --text: #1a1a2e; --card: #f8f9fa;
}
[data-theme="dark"] {
  --bg: #0f172a; --text: #e2e8f0; --card: #1e293b;
}
/* 所有组件使用 var(--bg) var(--text) var(--card) */
```

---

## 四、Moirca 前端改进路线图

```
当前 ──────→ P0 (本周) ──────→ P1 (下周) ──────→ P2 (后续)

表格展示     推荐卡片化          Markdown报告      WebSocket实时
同步等待     SSE流式对话         历史项目列表       交互式分步报告
亮色 only    深色模式            进度轮询接入       终端日志面板
             VersionUpdate ✅    移动端适配
```

### 最优先做的三件事

1. **SSE 流式对话** — 后端 + 前端共约 2h，体验提升最明显
2. **深色模式** — 纯 CSS 变量，约 1h
3. **推荐卡片化** — 新建一个 `RecommendationCards` 组件，约 3h
