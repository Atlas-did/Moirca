# Moirca 视觉规范 v2 —— 「文档化排版 · 去 AI 化」(设计总监定稿)

> v2 的命题只有两个:**去掉"圆圆圈圈的 AI 感"**,以及**用笔记软件的排版层次替换单调的卡片网格**。
> 色板与语义令牌体系**沿用 v1**(DESIGN_SPEC.md §1 的 HSL 令牌原样保留,零写死色铁律不变);v2 改的是**形状语言、图标系统、排版阶梯、密度节奏、每屏布局差异**。
> 学习对象:Notion / Obsidian / flomo / wolai / FlowUs / Heptabase / Craft / Tana / 语雀 / 飞书文档。它们共同的气质 = **文档即界面**:字重字号分层、细分隔线代替卡片框、密度有节奏、用色克制到只剩主色 + 语义色、图标全部线性小尺寸。

---

## 0. 总铁律(全体实施者必读,继承 v1 并加严)

1. **零写死色**:深浅两主题由 `.dark` 一次性接管;组件只消费语义令牌(bg-background / bg-card / text-foreground / text-muted-foreground / border-border / bg-muted / bg-accent / text-primary / --chart-N)。写死 hex 白名单仅三处:知识图谱 canvas 内部(§3)、日志/终端恒深色区(§11)、`--chart-*`/`--warning`/`--success` 在 index.css 的本体定义。
2. **不改业务逻辑**:API、路由、props 签名、dispatch action、中文文案一律不动。`AppContext.tsx` 中 agents 的 `avatar`(emoji)与 graph 节点的 `icon`/`radius` 字段**保留在数据里**(可能参与上报/持久化),只在**渲染层**停止消费或改用图标映射(见 §2.2、§3)。
3. **不动 `src/components/ui/*` 基件内部**。基件里自带的 `rounded-full`(badge/avatar/slider 等)不属整改范围;**业务代码禁止再使用 `rounded-full` 胶囊徽章/胶囊状态条**,自绘徽章一律 `rounded-sm`。
4. **字体栈**:沿用 index.css body 的系统 CJK sans 栈(PingFang SC / Microsoft YaHei / Noto Sans SC 兜底),不新增 webfont、不引依赖;`font-mono` 仅用于日志终端、代码、路径。
5. **动画纪律不变**:150/200ms transition-colors、`layoutId` 指示条 spring 保留;禁止 hover scale、入场大位移、发光、彩色渐变、漂浮粒子。
6. **验收 grep(v2 新增)**:除白名单外,全站 `src/components` + `src/pages` 中不得再出现:emoji 字面量(🧠🤖👨🎓⚠️✨ 等)、`rounded-full`(图例色点与 canvas 内 JS 除外)、`w-* h-* rounded-(xl|lg|full) … flex items-center justify-center` 的**图标底座**组合、`Sparkles` 图标、漂浮 `motion.div` 粒子。

---

## 1. 反 AI 化:反模式清单与替代做法(逐条给文件)

| # | 反模式 | 现存位置 | 替代做法 |
|---|---|---|---|
| A1 | **圆形/圆角图标底座**(彩色 12% 圆角块 + 居中大图标) | `AgentPlaza.tsx:28`(w-12 h-12 rounded-xl 主控)、`:61`(w-10 h-10 六顾问)、`Resources.tsx:85`、`DeepResearch.tsx:32`、`FullChat.tsx:117`(空状态 w-14 h-14) | 删除底座 div。图标直接裸放在文字行首:`<Icon className="w-4 h-4 text-muted-foreground" />`,与标题同基线;确需状态的用一枚 `w-1.5 h-1.5 rounded-full bg-chart-N` 色点(全屏 ≤2 处)。空状态:图标 `w-8 h-8 text-muted-foreground/40` 裸置,无底座(Notion 空页面式) |
| A2 | **emoji 头像 / emoji 图标** | `AppContext.tsx` agents.avatar(🧠👨‍🏫👨‍👩‍👧🎓💼📊⚠️)、graph node.icon、`FullChat.tsx:137` fallback 🤖、`KnowledgeGraph.tsx:253-256` canvas 绘制 emoji、节点 info 卡 `:360` | 建立唯一映射文件 `src/components/shared/agentIcons.ts`:`AGENT_ICON: Record<string, LucideIcon>`,主控=`Landmark`、张雪峰=`Megaphone`、爸妈=`Users`、学长=`GraduationCap`、职场=`Briefcase`、数据=`BarChart3`、风险=`ShieldAlert`,兜底=`Bot`;所有 UI 处以 `agent.id` 查表渲染 `w-4 h-4`,**不再读 avatar 字段**。canvas 内删除 emoji 绘制(§3) |
| A3 | **漂浮圆粒子** | `Login.tsx:42-64`(14 个 `rounded-full bg-primary/10` 呼吸圆) | 整段删除。背景只留:暖纸底 + v1 的 2% 细网格(48px)。静态、克制 |
| A4 | **装饰性形体**(星形/六边形节点、hover 光环) | `KnowledgeGraph.tsx:221-243`(hexagon/star 分支)、`:210-216` 光环 | 画布内所有节点统一为实心圆 + 用户节点空心圆环(§3.2);hover 光环删除,hover 反馈=标签提亮 + 邻边提亮 |
| A5 | **胶囊状态条与弹跳圆点** | `FullChat.tsx:159`(rounded-full 辩论中胶囊)、`:161-163`(三颗 animate-bounce 圆点)、`:98-101` | 改行内文本态:`<span className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--warning))]">` + 一枚 `w-1.5 h-1.5` 色点(`animate-pulse`,不用 bounce);去掉胶囊底与圆点编队 |
| A6 | **等宽圆角卡片网格**(一屏 N 张同构卡) | `AgentPlaza.tsx:47`(grid-cols-2)、`AHPMatrix.tsx:246` 每维度一卡、`Resources.tsx:75`(3 卡)、`HistoryPanel.tsx:133`(条条卡片)、`DeepResearch.tsx:86/115/138/161`(rounded-xl muted 盒) | 「列表化」改造:同级条目改 **hairline 分隔列表**(`divide-y divide-border` 或行间 `border-b border-border`),行内用字重+缩进分层;仅"表单输入区"和"浮层"保留卡片框。逐屏见 §5 |
| A7 | **彩色装饰进度条** | `Resources.tsx:108-113`、`DeepResearch.tsx:148-149`、`ScoreInputBar.tsx:226-227` | 装饰性进度条删除,改为 `text-xs tabular-nums text-muted-foreground` 的数字表达("已入库 10,075 / 上限 12,000");仅真实异步进度(上传/推理)保留进度条,样式统一 `h-1 bg-border rounded-sm` + `bg-primary` 填充,禁止 chart 色填充 |
| A8 | **AI 俗套图标 Sparkles** | `AHPMatrix.tsx:191/205`、`Login.tsx:83`、`HistoryPanel.tsx:136` | 全站替换:AHP「AI 对比」按钮 → `Scale`;AHP 分析条 → `ScanSearch` 或 `FileSearch`;Login 标题旁 → 删除(Logo 方印已足够);历史 kind 图标 → `History`/`FileText`/`GitBranch`/`PlaySquare` 保持但降为 `text-muted-foreground` |
| A9 | **过重阴影 / 大圆角** | `.panel-card`(rounded-xl + shadow-sm)、`Login.tsx:72` rounded-2xl | 令牌层整改:`--radius: 0.375rem`(6px 基准),`.panel-card` 降为 `rounded-lg shadow-xs`;登录卡 `rounded-xl`。静置卡片一律 `shadow-xs`,仅弹层 `shadow-md` |
| A10 | **彩底信息条(黄/琥珀)** | v1 已消灭大 promoter;`Resources.tsx` 状态图标底座属 A1 | 信息提示统一 `bg-muted/60 + border-l-[3px] border-l-primary rounded-r-md`(v1 §5.8 样式),图标 `w-4 h-4 text-primary` |

---

## 2. 去 AI 化总则:形状 / 图标 / 阴影新档位

### 2.1 形状
- 圆角档位(以新 `--radius: 6px` 为基准):卡片/面板 `rounded-lg`(6px,不再用 xl);按钮/输入框 `rounded-md`(4px);徽章/chip `rounded-sm`(2px);气泡 `rounded-md` + 方向角 `rounded-bl-sm`/`rounded-br-sm`。**业务代码禁用 `rounded-2xl/3xl/full`**(图例小色点、滑杆轨道等几何圆形元素除外)。
- 边框:一律 `border border-border`;hairline 分隔线(§4.2)优先于卡片框。

### 2.2 图标(lucide-react 唯一来源)
- 三档尺寸:行内 `w-4 h-4`、导航 `w-[18px] h-[18px]`、空状态 `w-8 h-8`。**删除全部 `w-7~w-14` 居中底座用法**。
- 颜色:默认 `text-muted-foreground`,激活/链接 `text-primary`,语义状态才用语义色。**禁止图标自带彩色底**。
- Agent 头像:见 A1/A2 映射表;对话/广场中的"头像位"改为 **22px 见方文字署名制**(Notion 评论区式):名字 `text-[11px] font-medium text-foreground` + 名前一枚 `w-1.5 h-1.5` agent 主题色点(色点从 `agent.color` 淡化为 60% 不透明度)。**不再有头像块**。

### 2.3 阴影
仅 `shadow-xs`(卡片静置)与 `shadow-md`(弹层)。删除 `shadow-sm` 于卡片静置态的使用。

---

## 3. 知识图谱重画(Obsidian graph view 式)—— `KnowledgeGraph.tsx`

画布恒为深色 `#101720`(白名单内),但**视觉从"彩色大圆+直线"改为"小节点 + 常显小标签 + 发丝细线 + 聚类淡彩"**。以下常量直接替换文件头部对应值;渲染分支按下述改。

### 3.1 常量替换(文件头 17-38 行区域)
```ts
const CANVAS_BG = '#101720';
const CANVAS_GRID = 'rgba(255,255,255,0.015)';      // 更弱的网格
const CANVAS_GRID_STEP = 48;
const EDGE_COLOR = 'rgba(255,255,255,0.08)';        // 常态发丝线
const EDGE_COLOR_HOVER = 'rgba(255,255,255,0.32)';  // 悬浮邻边
const EDGE_WIDTH = 1;                                // 常态 1px(原 1.25)
const EDGE_WIDTH_HOVER = 1.5;
const LABEL_COLOR = 'rgba(185,194,207,0.55)';       // 常显标签·淡
const LABEL_COLOR_ACTIVE = '#E8EAED';               // hover/选中/邻居·亮
const LABEL_SIZE = 10;                               // 原为 11px,改 10px
const NODE_STROKE = 'rgba(255,255,255,0.10)';        // 节点 1px 描边
const CLUSTER_ALPHA = 0.07;                          // 聚类淡彩强度
const SELECT_STROKE = '#E8EAED';
```
`NODE_PALETTE` 五色沿用,但渲染时统一降饱和处理:`fill = color @ 0.78 alpha`(见 3.2)。

### 3.2 节点渲染(替换 202-261 行的 Nodes 循环)
1. **半径脱离数据**:新增 `const NODE_R: Record<string, number> = { user: 8, school: 5, major: 4, career: 3.5, role: 4, system: 6 }`,渲染半径 `const r = NODE_R[n.type] ?? 4;`(hover 时 `r + 1`,不用 1.15 倍)。`n.radius` 字段保留不读,`findNodeAt` 命中半径改 `r + 4`。
2. **形体统一**:删除 hexagon(221-229)与 star(230-239)分支,全部 `ctx.arc(...)` 圆。
3. **填色**:专业/院校/就业/角色 = `NODE_PALETTE[type]` 以 `globalAlpha 0.78` 实心填充,再以 `NODE_STROKE` 描 1px 圈(解决深底上纯色圆的"塑料感");**用户节点=空心圆环**:`fillStyle = CANVAS_BG` 填底 + `#D9A13B` `lineWidth 2` 描环。
4. **聚类淡彩**(Obsidian 的"色晕"):画节点前,在同色系节点密集中心画一枚径向渐变圆(实现:对每种 type,先收集该类节点坐标,逐节点画 `createRadialGradient(x, y, 0, x, y, 18)`,从 `同色 alpha=CLUSTER_ALPHA` 到透明,`globalCompositeOperation = 'lighter'` 前先画完所有边)。视觉上五个类各自形成一片极淡的彩色云,不再是 20 个实心大圆。
5. **删除 emoji 绘制**:删除 253-256 行 `ctx.fillText(n.icon, ...)` 与对应 `ctx.font = serif` 行。
6. **常显标签**:`ctx.font = '10px sans-serif'`;默认 `LABEL_COLOR`,hover/选中/**选中节点的直接邻居**用 `LABEL_COLOR_ACTIVE`;位置 `y + r + 12`;`textAlign='center'`。标签常显(这是与 Obsidian 默认的唯一差异,用户要求可读性优先);同屏标签过多时可对 `label.length > 8` 截断为 7 字 + `…`。
7. **选中态**:`SELECT_STROKE` 1.5px 描边即选中;删除 210-216 的 hover/选中光环分支。

### 3.3 连线(176-200 行)
- 全部**实线**:`setLineDash([])` 三种分支删除(虚线是视觉噪音);关系类型不再靠线型区分(悬停邻边提亮已足够)。
- `lineWidth = adjacent ? EDGE_WIDTH_HOVER : EDGE_WIDTH`;颜色按 3.1。
- hover 邻居判定保留;同时把邻居节点标签也提亮(在 Nodes 循环中查 `hoveredRef` 邻接表,可在 simulate 开头构建一次 `Map<id, Set<id>>`)。

### 3.4 物理参数(9-14 行)
`REPULSION_FORCE = 800 → 1400`、`SPRING_LENGTH = 120 → 90`、`SPRING_STRENGTH = 0.03 → 0.02`:节点更散、簇更清晰,避免现在挤成一团的构图。

### 3.5 浮层与图例(348-437 行)
- 四个浮层(节点信息卡 / 图谱上下文 / tooltip / 图例)样式沿用 v1 §5.3 深色玻璃,但:节点信息卡 360 行的 `text-lg` emoji 改为查 `AGENT_ICON` 同思路的类型图标(`w-4 h-4 text-[#98A2B3]`),或直接删除图标只留类型小徽章 `text-[10px] text-[#98A2B3] border border-white/10 rounded-sm px-1`。
- 图例色点 `w-2 h-2 rounded-full` **保留**(几何色点属白名单豁免)。
- 「查看深度研究 →」链接保留。

### 3.6 类型/数据层
`types.ts`/`AppContext.tsx` 的 `radius`、`icon` 字段**不删不改名**;`src/contexts/AppContext.tsx:33-45` 等初始硬编码节点的 `radius: 28/24/22` 数值可顺手改为与 NODE_R 同档(8/5/4/3.5),仅当不触及其他消费方时执行(改前 grep `\.radius`)。

---

## 4. 去单调:笔记软件式排版体系

### 4.1 字号 / 字重 / 行高阶梯(全站唯一阶梯)

| 层级 | class 组合 | 规格 | 用途 |
|---|---|---|---|
| T0 页面标题 | `text-lg font-semibold tracking-tight text-foreground` | 18/26 | 内容区页首标题(Agent 广场、资源、上传等页首) |
| T0d 页首说明 | `text-xs text-muted-foreground mt-1` | 12/18 | 标题下一行说明 |
| T1 面板标题 | `.panel-title` = `text-sm font-semibold text-foreground` | 14/20 | 卡片/面板头部 |
| T2 分组眉标 | `.eyebrow` = `text-[11px] font-medium tracking-[0.08em] text-muted-foreground` | 11/16 | 分组标签(「主控协调」「专业顾问」「维度对比」)——新增组件类 |
| T3 正文 | `text-[13px] leading-[1.6] text-foreground` | 13/21 | 气泡、列表主文、报告正文 |
| T4 辅助 | `text-xs text-muted-foreground` | 12/18 | 说明、表头、时间戳 |
| T5 脚注/等宽 | `text-[11px] tabular-nums` / `font-mono text-[11px]` | 11/16 | 徽章、坐标轴、日志 |
| T6 KPI 数字 | `text-xl font-semibold tabular-nums text-foreground` | 20/28 | 图表 KPI、资源计数 |

规则:**层次靠字重与灰度,不靠框**。同一屏 T0 最多 1 个、T1 每分区 1 个、T2 用于不打框的分组。标题永不放进卡片里——页首标题裸排在 `bg-background` 上,下方压一条 hairline。

### 4.2 hairline 细分隔线(代替卡片网格的核心手段)

index.css 新增组件类:
```css
.hr-hairline { height: 1px; background: hsl(var(--border)); border: 0; }
.list-row {                   /* flomo/Notion 列表行 */
  @apply flex items-center gap-3 h-10 px-3 rounded-md transition-colors duration-150;
}
.list-row:hover { @apply bg-accent/60; }
```
使用规则:
- 同级可点击条目 ≥3 条时,一律 `.list-row` + 容器 `divide-y divide-border`(或行间 `border-b border-border last:border-0`),**不再逐条包卡**。
- 分区之间用 `<div className="hr-hairline my-4" />` 或标题下的 `border-b border-border pb-2 mb-3`。
- 卡片框只留给三种东西:表单输入区、浮层/弹窗、唯一强调对象(每屏至多 1 张)。

### 4.3 密度节奏
- 列表行高 `h-10`(40px,原 h-11 卡片制改列表制);表格行 `h-10`(原 h-11);紧凑双行列表 `py-1.5`。
- 表格:沿用 v1 §4.4(表头 `bg-muted/60 text-xs tracking-wide`、斑马纹二选一全站统一、`tabular-nums text-right` 数字列),行高改 `h-10`,表头底线用 `border-b border-border`(其余行线 `border-border/60`)。
- 页面级留白:`p-5` 保持;面板内 `p-4`;**同一屏只允许一个密度档**,不允许卡片里套卡片再套 chip 的三层嵌套。
- 间距仍按 4/8/12/16/20 档。

### 4.4 用色纪律(在 v1 基础上收紧)
- 每屏高饱和色点(色点/徽章/色条合计)≤ 3 处;`--chart-N` 只用于图表系列与那 ≤3 处的标识点。
- Agent 主题色只允许出现在 1.5px 色点与图表系列中,**不再做底色填充**(废 `${agent.color}1f` 底)。

---

## 5. 每屏布局差异化指令

> 目标:打开任意两屏,版式结构必须可区分。统一保留:顶栏 `h-12 bg-card border-b`(§4.1 of v1)、Sidebar 深轨(v1 §5.2,不变)、RightPanel 图标 tab 条(v1 §4.7,不变)。

### 5.1 登录页 — `src/components/onboarding/Login.tsx`(文档封面式)
- **删除**:42-64 漂浮粒子段;Logo 方印的 rotate 呼吸动画(76-79,静置);83 行 `<Sparkles …/>`。
- 背景保留暖纸底 + 2% 细网格;径向光晕可留但降为 `0.04`。
- 卡片 `panel-card rounded-2xl p-8` → `rounded-xl p-8`;卡内布局改**左对齐文档式**:Logo 方印 `w-10 h-10` 放标题行左、右侧标题 `text-lg tracking-tight` + 说明行,不再整体居中;「赭橙下划线」短横保留但移到标题文字下(`mt-1 w-8 h-0.5` 左对齐)。
- 三个特性位(124-139):删除 `w-9 h-9 bg-muted rounded-lg` 底座;改为一行横排的 hairline 分隔三点式:`flex divide-x divide-border` 每格 `flex-1 pt-3`(第一格不 pl),格内 `flex items-center justify-center gap-1.5`,图标 `w-3.5 h-3.5 text-muted-foreground` + 文字 `text-[11px] text-muted-foreground`。
- 按钮/输入框不动(v1 已合规)。

### 5.2 主框架 — `Layout.tsx` / `Sidebar.tsx` / `RightPanel.tsx`
- Sidebar、RightPanel tab 条、顶栏**维持 v1 定稿不动**(已是线性图标 + 指示条体系)。
- 内容区页首统一模板(各屏复用):`px-5 pt-4` 内 T0 标题 + T0d 说明 + `border-b border-border mt-3` 一条 hairline 把页首与内容分开——所有主屏(广场/资源/上传/志愿表)共用此骨架,差异在骨架之下的内容版式(见各屏)。
- 中栏与 RightPanel 之间的 resize 手柄保留。

### 5.3 知识图谱 — `KnowledgeGraph.tsx`(全屏深色画布,§3 全套)
- 画布重画(§3.1-3.6)。
- 左下图例、右上图谱上下文、tooltip、节点信息卡按 §3.5 微调。
- 页首不加大标题(画布即页面),仅保留现有顶栏「知识图谱」。

### 5.4 多 Agent 对话 — `FullChat.tsx`(文档式讨论流,非气泡卡片流)
- **空状态**(115-125):删除 `w-14 h-14 bg-primary/10 rounded-xl` 底座;改为居中文档式:`w-8 h-8 text-muted-foreground/40` 裸图标 + T1 标题 + T4 说明。
- **消息流改为「讨论串」式**(Obsidian/飞书文档评论式,弱化气泡):
  - 用户消息:保留右对齐 `bg-primary text-primary-foreground rounded-md rounded-br-sm`(唯一保留的实色气泡)。
  - Agent 消息:**去掉气泡框**——整行 `flex gap-2.5`,左列署名块(2.2:色点+名字),正文裸排在 `bg-background` 上,`text-[13px] leading-[1.6] text-foreground`;行与行 `py-2 + divide-y divide-border/60` 分隔(或每行 `hover:bg-accent/40 rounded-md px-3 py-2`)。名字行 `text-[11px] font-medium text-foreground` + 右侧时间戳 `text-[11px] text-muted-foreground tabular-nums`。
  - 删除 135-139 的 `w-7 h-7` 头像底座与 emoji(查 `AGENT_ICON` 映射也只渲染色点,不渲染图标——讨论流里图标冗余)。
- 「Agent 辩论中」状态:按 A5 改行内文本态,删胶囊与三圆点。
- 输入区不动。

### 5.5 Agent 广场 — `AgentPlaza.tsx`(通讯录/名单式,消灭卡片网格)
- 页首套 5.2 统一骨架。
- **主控协调 / 专业顾问两个分组**改「名单行」:分组眉标 `.eyebrow` + 容器 `divide-y divide-border`,每行 `.list-row h-12`:
  - 行内:色点(w-1.5,agent.color/60)+ 名字 `text-[13px] font-medium text-foreground` + tagline `text-[11px] text-muted-foreground`(用 `·` 连接而非徽章)+ 引语 `text-xs text-muted-foreground truncate flex-1` + 右端 `MessageCircle w-4 h-4 text-muted-foreground/40`。
  - 主控行强调:仅 `text-primary` 的名字 + 一枚 `border border-primary/25 bg-primary/[0.04] rounded-md` 小徽章「主控」,不给整行加底/左缘条(hover `bg-accent/60` 即可)。
  - 删除全部 `${agent.color}1f` 底座与 emoji。
- 底部「使用提示」:降为页尾脚注行:`border-t border-border pt-3 text-xs text-muted-foreground`,Info 图标 `w-3.5 h-3.5` 行内;删除 `border-l-[3px]` 信息条(提示不值得一个框)。

### 5.6 志愿填报表 — `VolunteerTable.tsx` / `CardView.tsx` / `ScoreInputBar.tsx`
- 表格区是全站密度基准:按 §4.3 执行(行 h-10、表头、数字右对齐 tabular-nums);已是 hairline 制,微调即可。
- 筛选 chips:选中 `bg-primary text-primary-foreground rounded-sm`,未选 `bg-transparent border border-border text-muted-foreground hover:bg-accent rounded-sm`(去掉 `bg-muted` 底,更「标签页」而非「糖果」)。
- 「冲稳保」计数条与收藏星沿用 v1 §5.5。
- CardView(卡片视图):若保留,逐卡降为 `rounded-lg border-border shadow-xs`,卡内用 T1/T3/T4 三层,顶部一条 `w-[3px]` 档位色条沿用;**同屏 12+ 卡时建议与表格合并入口或加分组 hairline**,不做等高网格强排。
- ScoreInputBar 的装饰进度条按 A7 改数字;真实异步进度条改 `h-1 bg-border rounded-sm + bg-primary`。

### 5.7 AHP 对比 — `AHPMatrix.tsx`(滑杆工作表式,去「每维度一卡」)
- 外层保持一张 `panel-card`(表单区允许卡),但内部**五个维度滑杆全部脱卡**(删 246 行 `bg-muted/50 border rounded-lg p-3`):容器 `divide-y divide-border`,每维度一行 `py-3`:
  - 行首 `text-[13px] text-foreground` 维度名(左)+ 偏向值 `text-xs font-medium tabular-nums`(右,着色逻辑保留);
  - 滑杆下校名两端对齐 `text-[11px] text-muted-foreground` 保留。
- 候选人 VS 条(224):保留 `bg-muted/50` 单行条(这是全屏唯一强调块),校名左 `text-primary` / 右 `text-chart-3` 沿用,字号升 `text-base font-semibold tracking-tight`。
- 「AI 对比」按钮:图标 Sparkles → `Scale`(w-3.5 h-3.5);样式沿用 `border-primary/25 bg-primary/10 text-primary`。
- AI 分析条与结论条沿用 `border-l-[3px]` 引文样式(§4 文档引用块,合理保留);CR 徽章改 `rounded-sm`。
- 雷达图容器同样脱卡:标题用 `.eyebrow`,图直接排在 hairline 分隔的行里。

### 5.8 历史 — `HistoryPanel.tsx`(活动流水列表,条条卡片→hairline 列表)
- 顶部工具条(h-10)与筛选 chips 保留(chips 改 §5.6 同款 rounded-sm 透明描边)。
- 列表(129-149):逐条 `motion.button bg-card border rounded-xl` → 容器 `px-3` + 行间 `divide-y divide-border`;每行 `.list-row h-12` 变体(双行版 `py-2`):
  - 第一行:kind 图标 `w-3.5 h-3.5 text-muted-foreground`(四色全部降灰,kind 靠文字徽章区分)+ 标题 `text-[13px] font-medium truncate` + `ExternalLink w-3.5 h-3.5 text-muted-foreground/40`;
  - 第二行:subtitle `text-xs text-muted-foreground truncate`;
  - 第三行右对齐:时间戳 `text-[11px] tabular-nums text-muted-foreground`,kind 徽章 `bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[11px]`。
  - hover 只 `bg-accent/60`,删除 `hover:border-primary/40 hover:shadow-sm`(无边框可 hover)。
- 空状态:按 A1 文档式空状态。

### 5.9 报告 — `ReportPanel.tsx` / `MarkdownRenderer.tsx` / `GuidedReport.tsx`(全站排版天花板:文档页)
- 这是唯一一屏按「文章」排:正文栏 `max-w-[720px] mx-auto px-6`(窄 RightPanel 内改 `max-w-none px-4`),`text-[13px] leading-[1.75] text-foreground`。
- 章节标题:MarkdownRenderer 输出 h1→`text-base font-semibold tracking-tight mt-5 mb-2 pb-1 border-b border-border`,h2→`text-sm font-semibold mt-4 mb-1.5`,h3→`.eyebrow mt-3 mb-1`;段距 `my-2`。
- 左侧 220px 目录栏(136-142):去条目卡片化(若有),改 `.list-row h-8 text-xs text-muted-foreground` 竖排 + 当前节 `text-primary font-medium border-l-2 border-primary pl-2`(Notion 目录式)。
- 163/177 行的 `rounded-xl border bg-card p-3` 提示盒 → `bg-muted/50 rounded-md` 无边框淡底块(引文块语义),或 `border-l-[3px] border-l-primary` 引文条,二选一全文件统一。
- GuidedReport 步骤:62/137 的 `rounded-full` 圆号牌(业务层)改 `w-6 h-6 rounded-sm bg-primary/10 text-primary text-[11px] font-semibold tabular-nums`;步骤之间用竖 hairline 连接(`border-l border-border ml-3`)形成大纲树(Tana/outliner 式),不再横排三卡。
- 表格/引用块/数字规范沿用 v1 §5.6。

### 5.10 资源 — `Resources.tsx`(数据源表格化,去三卡)
- 页首套统一骨架。
- 三张数据源卡(75-124)→ **一张 hairline 数据表或三行名单**(数据源是"清单"不是"橱窗"):容器 `panel-card` 一张(全屏唯一卡),内部 `divide-y divide-border`,每源一行 `py-3`:
  - 状态列:`w-1.5 h-1.5 rounded-full`(success/warning/muted-foreground 一枚色点)+ 名字 `text-[13px] font-medium`;
  - 描述 `text-xs text-muted-foreground`;
  - 记录数右对齐 `text-sm font-semibold tabular-nums` + `text-[11px] text-muted-foreground`「条记录」;最后更新 `text-[11px] tabular-nums text-muted-foreground`;
  - 行尾「查看样本 / 更新数据」两个 `h-7 text-xs` ghost 小按钮(`text-muted-foreground hover:text-foreground`,一个 `text-primary`)。
  - 删除:图标底座(A1)、彩色进度条(A7)、每源一卡的 grid。
- 采集日志终端(128-167):恒深色白名单区,样式保留;外层 `panel-card rounded-lg`;`h-1.5` 动画下划线光标保留。

### 5.11 日志 — `SystemLogPanel.tsx`(终端,基本保留)
- 白名单深色终端样式不动(§5.7 v1);外框 `panel-card rounded-lg shadow-xs`。
- 工具行(42-)`px-3 py-2` 保留;「每 15s 自动刷新」状态点已是小圆点豁免类。
- 唯一整改:若有 `rounded-md` 以上容器与卡片嵌套,压平为 `rounded-sm`;时间戳列固定宽 `tabular-nums`(若逐行渲染,给时间戳包 `<span className="text-[#98A2B3]">` 已有,加 `tabular-nums` 对齐)。

### 5.12 上传 — `FileUploadPanel.tsx`(表单/向导式:允许卡片,但降密度噪音)
- 拖放/选择区是表单区,保留一张 `panel-card rounded-lg`(全屏唯一卡),内部虚线 drop 区 `border border-dashed border-border rounded-md hover:border-primary/40`(虚线框是表单语义,豁免)。
- 解析结果区(139-191):`grid grid-cols-2` 四枚 `bg-muted/50 rounded-md p-2` 键值块 → 一张两列 **dl 键值表**:每行 `flex justify-between py-1.5 border-b border-border/50`,键 `text-[11px] text-muted-foreground`,值 `text-xs tabular-nums text-foreground`(飞书文档属性表式)。删除四小卡。
- 证据/说明引用块(190)`border-l-[3px]` 引文样式保留,`rounded-r-sm`。
- 异步进度:`h-1 bg-border rounded-sm + bg-primary`(A7 合规版),删除 spinner 之外的旋转彩圈。

### 5.13 深研 — `DeepResearch.tsx`(研究简报式:大纲树 + 数字,去四联 muted 盒)
- 页首 32 行 `w-8 h-8 bg-primary/10 rounded-lg` 底座删除:标题行改「色点 + T1 标题」或裸 T1。
- 证据来源列表(44-70):已是 `bg-muted/50 rounded-md` 行,改 `.list-row` + `divide-y divide-border`;展开答案块 `bg-muted/30 rounded-b-md` 保留但改 `rounded-b-sm text-xs leading-relaxed`。
- 四个 `rounded-xl border-border/70 bg-muted/40 p-3` 盒(86/115/138/161)→ **hairline 分区**:每区之间 `<div className="hr-hairline my-3" />`,区标题用 `.eyebrow`,内容直接排:
  - 相关院校迷你条形图(101):条形改 `bg-primary/20 rounded-sm` 高 6-14px 递增,不套卡;
  - 两枚 KPI 小卡(122/126)→ 一行双 KPI:`flex gap-6`,每枚 T6 数字 + T4 标签,数字间竖 hairline 分隔;
  - 匹配度进度条(148)按 A7 改数字 + `h-1 bg-primary` 细条(仅此一处保留条形,因它是真实指标);
  - 风险块(167)改 `border-l-[3px] border-l-destructive rounded-r-sm bg-destructive/5` 引文条。
- 51 行 `w-5 h-5 rounded-full` 数字圆(若为证据序号)改 `text-[11px] tabular-nums text-muted-foreground` 的「[1]」文本序号(学术脚注式)。

### 5.14 图表(右栏)— `ChartPanel.tsx`
- tab 切换(分数线/位次/薪资):沿用下划线式(v1 §5.9),激活项 `text-foreground font-medium` + 2px `bg-primary` 底线,非激活 `text-muted-foreground`;带 emoji 前缀的 tab(💰 等)删除 emoji,仅文字。
- 三枚 KPI(103 附近):统一 T6 数字 + T4 单位 + 左侧 3px 色条(v1 §5.9),卡片 `rounded-lg shadow-xs`。
- Recharts 令牌规范沿用 v1 §5.9。

### 5.15 采访(右栏)— `InterviewPanel.tsx`
- 输入区(58-92)是表单区,保留在 `border-b border-border bg-card` 带内,不另包卡。
- 下方三块 `panel-card p-3`(95/110/117)→ hairline 分区:`.eyebrow` 标题 + `divide-y divide-border` 列表;推荐问题按钮(121)`bg-muted/50 rounded-md` → `.list-row h-9 text-xs text-muted-foreground hover:text-foreground`(列表行语义)。

---

## 6. index.css / tailwind.config.js 具体改动清单

1. `--radius: 0.625rem → 0.375rem`(6px 基准;rounded-lg=6、md=4、sm=2、xs=0;xl=10px 仅登录卡/画布浮层可用)。同步 v1 §3 的圆角档位表。
2. `:root` 新增:`--border-strong: 40 12% 78%;` `.dark` 新增 `--border-strong: 218 18% 28%;`(表头底线/页首 hairline 可用 `border-border-strong`,不强制)。
3. `@layer components` 改/增:
   - `.panel-card { @apply bg-card border border-border rounded-lg shadow-xs; }`(原 rounded-xl shadow-sm);
   - `.panel-title` 不变;
   - 新增 `.eyebrow`、`.hr-hairline`、`.list-row`(代码见 §4.2/§4.1);
   - 新增 `.prose-doc { @apply text-[13px] leading-[1.75] text-foreground; }`(报告正文)。
4. tailwind.config.js:`boxShadow.xs` 保留;`borderRadius` 映射不动(随 --radius 自动收紧);无需新增 fontSize——阶梯全部用既有档 + 任意值。
5. body 字体栈不动(系统 CJK sans);`::selection`、focus 环、滚动条、滑块 thumb 全部沿用 v1。
6. 删除项核对:`.dark-scrollbar` 兼容别名在全部引用迁移后可删(v1 遗留事项,顺带 grep 收尾)。

---

## 7. 验收清单(实施者自查)

- [ ] grep 全站(业务组件):无 emoji 字面量、无 Sparkles、无漂浮粒子、无 `${color}1f` 底座、无 `rounded-full` 胶囊(豁免:图例色点、滑杆轨道、switch 基件)。
- [ ] 任一屏:同级重复条目 ≥3 时必为 hairline 列表而非卡片网格;每屏卡片框 ≤2 张。
- [ ] 任一屏色点/色条/彩徽章合计 ≤3 处;`--chart-N` 不出现在非图表装饰上(3px 档位色条除外)。
- [ ] 知识图谱:节点全部为 ≤8px 小圆(用户空心环)、无 emoji、无虚线、标签常显 10px;截图与 Obsidian graph 并排不违和。
- [ ] 五屏并排截图(广场/历史/AHP/资源/深研)版式结构互不相同,但字阶、hairline、间距节奏一致。
- [ ] 深浅两主题切换:无色相跳变(v1 验收标准继续生效);白名单外无写死 hex。
- [ ] 全部改动仅触 className/渲染分支/上述列出的常量与新增文件;业务逻辑、API、props、中文文案零变更。
