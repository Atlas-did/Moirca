# Moirca 视觉重构设计规范 v1(设计总监定稿)

> 综合三份方案定稿:整体采用**方案1「墨蓝纸稿 Ink & Paper」的浅色学术工作台**为主基调(答辩投影、考生/家长审美优先,浅底投影可读性最高);深色模式采用**墨夜蓝同轴体系**(方案1深色令牌 + 方案2/3 的"单一真源、组件零写死色"纪律);知识图谱画布**保留深色画布嵌浅色工作台**的三段式构图(深轨 Sidebar + 浅纸工作台 + 墨蓝画布),这是有意的设计对比而非主题割裂。
>
> **总铁律(所有执行者必读)**:只改 className 与 index.css 令牌值,不改任何业务逻辑、API、路由、props 签名、中文文案、`src/components/ui/*` 基件内部。所有组件**零写死浅色 hex、零 slate-*/blue-*/amber-* 具象色、零 `dark:` 双份配色**——一律消费 shadcn 语义令牌(bg-background / bg-card / text-foreground / text-muted-foreground / border-border / bg-muted / text-primary / bg-accent 等)。深浅两套主题由 `.dark` 类一次性接管,ThemeToggle 切换后无组件需要单独适配。`dark:` 前缀仅允许用于语义色亮度微调(如 `dark:text-emerald-400`)与透明度修饰。

---

## 1. 色板与令牌源(src/index.css)

### 1.1 设计色卡(浅色 · 墨蓝纸稿)

| 角色 | Hex | 用途 |
|---|---|---|
| 纸底 Paper | `#F7F6F3` | 页面背景(warm neutral,非冷灰) |
| 卡白 Card | `#FFFFFF` | 卡片/面板/顶栏 |
| 墨蓝 Ink | `#1F3A5F` | primary:主按钮、激活态、链接、Logo 印章 |
| 深轨 Ink Rail | `#16233A` | Sidebar 深色轨道(两种模式下都是墨蓝锚点) |
| 赭橙 Ember | `#C05621` | 唯一强调色:收藏星、就业节点、关键点缀(全屏最多 1-2 处) |
| 墨黑 Canvas | `#101720` | 知识图谱画布清屏色(唯一保留的深色区域) |
| 正文 Ink Text | `#1B2430` | 标题与正文 |
| 辅灰 Muted | `#6E7480` | 说明文字、次要信息 |
| 纸线 Border | `#E5E3DE` | 边框、分隔线、表头淡底 |

### 1.2 `:root`(浅色)HSL 令牌——可直接照抄

```css
:root {
  --background: 40 20% 97%;          /* #F7F6F3 暖纸底 */
  --foreground: 220 25% 14%;         /* #1B2430 */
  --card: 0 0% 100%;                 /* #FFFFFF */
  --card-foreground: 220 25% 14%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 25% 14%;
  --primary: 213 50% 25%;            /* #1F3A5F 墨蓝 */
  --primary-foreground: 40 20% 98%;
  --secondary: 40 14% 94%;
  --secondary-foreground: 220 25% 14%;
  --muted: 40 14% 94%;
  --muted-foreground: 220 7% 46%;    /* #6E7480 */
  --accent: 40 14% 93%;              /* 悬浮底 */
  --accent-foreground: 213 50% 25%;
  --destructive: 0 68% 48%;
  --destructive-foreground: 0 0% 100%;
  --border: 40 12% 87%;              /* #E5E3DE */
  --input: 40 12% 85%;
  --ring: 213 50% 25%;
  --radius: 0.625rem;                /* 10px,统一圆角基准 */
  --chart-1: 212 55% 41%;            /* #2E6DA4 靛蓝(专业/主数据系列) */
  --chart-2: 157 49% 36%;            /* #2F8A6B 松绿(院校) */
  --chart-3: 24 71% 44%;             /* #C05621 赭橙(就业/警示) */
  --chart-4: 262 25% 50%;            /* #7A5FA0 灰紫(角色) */
  --chart-5: 38 57% 54%;             /* #D9A13B 沙金(用户/收藏) */
  --warning: 38 57% 54%;
  --success: 157 49% 36%;
}
```

### 1.3 `.dark`(深色 · 墨夜蓝)HSL 令牌——可直接照抄

深色与浅色**同轴不偏色**(同属蓝灰轴),三阶底色:background 7% → card 10-11% → border 21%。

```css
.dark {
  --background: 218 28% 7%;          /* #0D121C 墨夜蓝 */
  --foreground: 214 22% 88%;         /* #DCE2EA */
  --card: 218 26% 10%;               /* #141C29 */
  --card-foreground: 214 22% 88%;
  --popover: 218 26% 11%;
  --popover-foreground: 214 22% 88%;
  --primary: 214 45% 68%;            /* #7FA8D9 雾蓝(暗下提亮保对比) */
  --primary-foreground: 218 28% 8%;
  --secondary: 219 20% 16%;
  --secondary-foreground: 214 22% 88%;
  --muted: 219 20% 15%;
  --muted-foreground: 215 12% 62%;   /* #98A2B3 */
  --accent: 219 20% 17%;
  --accent-foreground: 214 22% 90%;
  --destructive: 0 55% 55%;
  --destructive-foreground: 0 0% 98%;
  --border: 218 18% 21%;
  --input: 218 18% 24%;
  --ring: 214 45% 68%;
  --chart-1: 212 55% 62%;            /* 暗下统一提亮约 15-20% 亮度 */
  --chart-2: 157 40% 52%;
  --chart-3: 24 75% 58%;
  --chart-4: 262 35% 66%;
  --chart-5: 38 70% 62%;
  --warning: 38 70% 62%;
  --success: 157 40% 52%;
}
```

### 1.4 Moirca custom 变量收编(消灭第二套取色源)

现有 `--bg / --bg-panel / --text / --text-muted / --card-bg / --border-color` 全部改为**回指 HSL 令牌**,写在 `:root` 末尾一组(两主题自动生效,删除现有两处 hex 定义):

```css
:root {
  --bg: hsl(var(--background));
  --bg-panel: hsl(var(--card));
  --text: hsl(var(--foreground));
  --text-muted: hsl(var(--muted-foreground));
  --card-bg: hsl(var(--card));
  --border-color: hsl(var(--border));
  --rail: 218 44% 16%;               /* 浅色下侧栏深轨 #16233A */
}
.dark { --rail: 218 26% 10%; }       /* 暗下侧栏与 card 同域 */
```

侧栏轨道统一用 `bg-[hsl(var(--rail))]`。

### 1.5 index.css 其余必改项

- range 滑块 thumb:`background: hsl(var(--primary)); border: 2px solid hsl(var(--card)); box-shadow: 0 0 0 1px hsl(var(--border));`(删除 `#3b82f6/#1e40af` 写死值);轨道由组件给 `bg-border`。
- 滚动条:`.dark-scrollbar` 改名为令牌化的 `.thin-scrollbar`(类名变更需同步 grep 全部引用),thumb 用 `hsl(var(--border))` / hover `hsl(var(--muted-foreground) / 0.5)`,浅深两态自动成立。
- 新增两个组件类,全站复用:

```css
@layer components {
  .panel-card { @apply bg-card border border-border rounded-xl shadow-sm; }
  .panel-title { @apply text-sm font-semibold text-foreground; }
}
```

---

## 2. 字体与字号层级

沿用系统字体栈(tailwind 默认 `font-sans`),不新增依赖。**全站只允许 4 档字号 + 1 档等宽**:

| 层级 | 规格 | 用途 |
|---|---|---|
| 页面/大标题 | `text-lg font-semibold`(18px) | 登录品牌、报告标题 |
| 面板标题 | `text-sm font-semibold text-foreground`(14px,`.panel-title`) | 卡片、面板头部 |
| 正文 | `text-[13px] text-foreground` | 表格、聊天气泡、列表主体 |
| 辅助文字 | `text-xs text-muted-foreground`(12px) / 密集处 `text-[11px]` | 说明、表头、时间戳、图例 |
| 等宽数字 | `tabular-nums`(正文同字号) | KPI 大数字、分数、位次、坐标轴;`font-mono` 仅用于日志终端 |

- KPI 大数字:`text-xl font-semibold tabular-nums text-foreground`,单位标签 `text-xs text-muted-foreground`。
- 表头附加 `tracking-wide`。

---

## 3. 形状语言

- **圆角档位**(`--radius: 0.625rem` 为基准):面板/卡片 `rounded-xl`;按钮/输入框/chip/徽章 `rounded-md`;头像方印 `rounded-lg`;气泡 `rounded-lg`(一角 `rounded-tl-sm`/`rounded-tr-sm` 区分方向)。禁用 `rounded-3xl/full`(头像圆除外)。
- **边框**:一律 `border border-border`(1px);强调卡允许 `border-primary/25`;禁止彩色粗边(左缘 3px 色条除外,见 §4)。
- **阴影档位**:仅两档——`shadow-xs`(卡片静置)/ `shadow-sm`(悬浮上浮、下拉、弹层)。**禁止 glow/发光/彩色渐变**;弹层可用 `shadow-md`。
- **间距节奏**:面板内边距 `p-4`,卡片间 `gap-3`,面板标题与内容间 `mt-2`,分区之间 `p-4`/`space-y-3`;页面级留白 `p-5`。同层级间距只允许 4/8/12/16/20 一档节奏。
- **图标**:统一 lucide-react,线条图标 `w-4 h-4`(行内)/ `w-[18px] h-[18px]`(导航)/ `w-5 h-5`(空状态),`strokeWidth` 保持 lucide 默认 2,全站不混用 emoji 图标(新替换见 §5)。

---

## 4. 组件样式模式

### 4.1 页面头部(顶栏)
`bg-card border-b border-border h-12 px-4`,标题 `text-[13px] font-medium text-foreground`,右侧动作区 `gap-2` 图标按钮(`h-8 w-8 rounded-md hover:bg-accent`)。删除 `dark:bg-slate-800` 之类平行硬编码。

### 4.2 卡片
一律 `.panel-card`(= `bg-card border border-border rounded-xl shadow-sm`)+ 可选 `.panel-title`。分区靠留白与 1px 细线,不靠色块。区别系列仅允许:左侧 `3px` 色条(`w-[3px] rounded-full bg-chart-N` 语义)或一枚小色点。

### 4.3 按钮
- Primary:`bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shadow-xs`(墨蓝主按钮)。
- Secondary/Ghost:`bg-secondary` / `ghost hover:bg-accent`。
- 破坏性:`bg-destructive`。所有按钮 `h-9`(顶栏小按钮 `h-8`)。

### 4.4 表格(志愿表、数据表)
- 表头:`sticky top-0 bg-muted/60 text-xs font-medium text-muted-foreground tracking-wide`,底边 `border-b border-border`。
- 行:斑马纹 `odd:bg-muted/30`(或 even,全站统一一种)+ `hover:bg-accent/50`,分隔线 `border-b border-border/60`,行高 `h-11`。
- 数字列 `tabular-nums text-right`。

### 4.5 表单
输入框走 shadcn Input 默认(`border-input`)+ `focus:ring-2 focus:ring-ring/30`;label `text-xs text-muted-foreground`。滑杆:轨道 `h-1.5 rounded-full bg-border`,thumb 走 §1.5 令牌样式。

### 4.6 聊天气泡(Agent 对话 / 多 Agent 辩论)
- 用户气泡:`bg-primary text-primary-foreground rounded-lg rounded-br-sm shadow-xs`,右侧对齐。
- Agent 气泡:`bg-card border border-border rounded-lg rounded-bl-sm`,左侧对齐;Agent 名字与头像用其主题色但仅出现在 `w-7 h-7` 头像圆(`ring-1 ring-border` + 12% 透明底),**正文与名字文字一律 `text-foreground`,不用彩虹名**(区分靠头像与署名小标签 `text-[11px] text-muted-foreground`)。
- 系统提示行:居中 `text-[11px] text-muted-foreground`。
- 发送按钮:`bg-primary` 实色。

### 4.7 标签页 / 图标导航条(重点:修复顶部图标换行)

**RightPanel 展开态顶栏**(现行 10 个图标+2字标签挤在 480px 内换行断字)——定稿方案为**图标按钮 + 悬浮提示 + 2px 下划线指示条**:

- 每个 tab 改为**仅图标按钮**:`w-9 h-9 (36px) rounded-md shrink-0 grid place-items-center`,lucide 图标 `w-[18px] h-[18px]`;中文标签放入 `title` 属性原生 tooltip(不引依赖)。
- 激活态:`text-primary bg-primary/10` + 底部 `2px` 指示条(framer-motion `layoutId` 复用现有动画),**不用**胶囊渐变。
- 容器:`flex items-center gap-1 overflow-x-auto scrollbar-none whitespace-nowrap`,行高统一 `h-11 px-2`;所有按钮 `shrink-0 whitespace-nowrap` 双保险。
- 折叠态竖栏:同款令牌,`w-10` 竖排图标,激活项 `bg-primary/10 text-primary`。
- **Sidebar 纵向导航**(永不换行的基准):`w-14`,图标 `w-[18px] h-[18px]`,激活项 `bg-white/10 text-white` + 左侧 2px `bg-primary-foreground` 指示条(`layoutId`),hover `bg-white/5`。

### 4.8 徽标 / 状态色
- 语义色:成功 `--success`(emerald 系)/ 警告 `--warning`(沙金)/ 危险 `--destructive`;徽章统一描边样式:`border-<语义>/40 bg-<语义>/10 text-<语义> dark:text-<语义亮版>`。
- 「冲稳保」:冲=destructive 系、稳=primary 系、保=success 系,只用这三档,不再引入第四色。
- 普通徽章/角色徽章:`bg-primary/10 text-primary rounded-md px-1.5 py-0.5 text-[11px]`。
- 收藏星:`fill` 用 `--chart-5`(沙金),不用亮黄。

---

## 5. 每屏指导

### 5.1 登录页(Login)
整页 `bg-background` 暖纸底 + 一层 `primary 5%` 径向光晕与 2% 细网格纹理(替代蓝青大渐变)。登录卡 `.panel-card rounded-2xl max-w-md`。左侧品牌区:墨蓝 `rounded-lg` 方印 Logo(纯 `bg-primary` + 白色 "M",**去掉蓝青渐变**)+ 墨蓝标题;赭橙仅作一处点缀(如 slogan 下划线或一枚图标)。三个特性位 emoji(🧠📊🗺️)换 lucide `Brain / BarChart3 / Share2` 线性图标 + `bg-muted rounded-lg` 圆角底。主按钮 `bg-primary`,「游客模式」ghost 样式。文案不动。

### 5.2 主界面三栏
- **Sidebar(左轨)**:`bg-[hsl(var(--rail))]`,深轨在浅色工作台中是墨蓝锚点、在深色下与画布同域。Logo 方印纯墨蓝;激活项见 §4.7;底部版本号 `text-white/40 text-[11px]`。
- **中间内容区**:`bg-background`,顶栏见 §4.1,面板见 §4.2。
- **RightPanel**:`bg-card border-l border-border`,tab 栏见 §4.7,内部聊天/报告区用 §4.6 气泡与 §5.6 报告规范。

### 5.3 知识图谱画布(KnowledgeGraph)
保留深色画布,形成"深轨 + 浅纸 + 墨画布"三段式构图。canvas 内硬编码色(渲染循环直接读取,不随主题切换,两种模式下均为墨夜蓝画布):

| 元素 | Hex |
|---|---|
| 清屏背景 | `#101720` |
| 网格线 | `rgba(255,255,255,0.02)`,步距 40 → **48px** |
| 专业节点 | `#2E6DA4`(靛蓝) |
| 院校节点 | `#2F8A6B`(松绿) |
| 就业节点 | `#C05621`(赭橙) |
| 角色节点 | `#7A5FA0`(灰紫) |
| 用户节点 | `#D9A13B`(沙金) |
| 连线 | `rgba(255,255,255,0.10)`,hover 邻边提至 `0.22` |
| 悬浮标签文字 | `#B9C2CF`(11px) |
| 选中描边 | `#E8EAED`(1.5px)+ 外圈同色 20% 光环 |

- 节点保持圆形,emoji 图标若可实现则换等价 lucide 图标,不可实现则保留。
- 左下图例:色块与新节点色一一对应,横排小圆点 chip(`w-2 h-2 rounded-full` + `text-[11px] text-muted-foreground`),底 `bg-[#141C29]/90 border border-white/10 rounded-lg`。
- **画布内三处浮层**(「图谱上下文」/节点信息卡/tooltip)统一:背景 `rgba(13,18,28,0.86)` + `border border-white/10 + rounded-lg`,标题 `text-[12px] font-medium text-[#DCE2EA]`,正文/键值 `text-[11px] text-[#98A2B3]`,至多一层 backdrop-blur。文字层级与浅色区字号规范一致。

### 5.4 AHP 对比(AHPMatrix)
- 整体卡片 `.panel-card`,内部子卡 `gap-3`。
- VS 对比卡去深蓝/teal 底 → `bg-muted/50`,两校名分别用 `text-primary`(墨蓝)与 `text-chart-3`(赭橙)区分,权重数字 `tabular-nums text-muted-foreground`。
- 滑杆:轨道 `bg-border`,thumb 走 §1.5 令牌样式(墨蓝,自动随主题)。
- CR 一致性徽章:`border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`;CR 超限时走 destructive 徽章同构。

### 5.5 志愿表(VolunteerTable)
表头/斑马纹/行规范见 §4.4。筛选 chips:选中 `bg-primary text-primary-foreground rounded-md`,未选 `bg-muted text-muted-foreground border border-border`。顶部「冲稳保」计数条:`bg-muted/40` 中性底 + 三档语义色小徽章(见 §4.8),不再用 `bg-blue-50/50` 彩底。收藏星 fill `--chart-5`。

### 5.6 报告渲染(报告页 / ReportPanel)
阅读型版面:正文 `text-[13px] leading-relaxed text-foreground`,章节标题 `text-sm font-semibold text-foreground mt-4`,容器 `max-w-none` 但左右 `px-4` 留白;引用/提示块 `bg-muted/60 border-l-[3px] border-primary rounded-r-md`;表格沿用 §4.4;数字 `tabular-nums`。禁止大面积色块底。

### 5.7 日志终端(Log)
`bg-[hsl(var(--foreground))] dark:bg-[hsl(var(--background))]` 不取——统一 `bg-[#141C29]`(墨夜蓝,与画布同域)`text-[#B9C2CF] font-mono text-[11px] leading-relaxed`,时间戳 `text-[#98A2B3]`,成功/警告行分别 `text-[#2F8A6B]`/`text-[#D9A13B]`(暗色系固定,因其底恒为深色);外框 `.panel-card` 包裹,滚动条 `.thin-scrollbar`。

### 5.8 Agent 广场(AgentPlaza)
- 主控卡:去蓝青渐变 → `bg-primary/[0.04] border border-primary/25 rounded-xl shadow-xs` + 左缘 3px `bg-primary` 竖条;徽章 `bg-primary/10 text-primary`。
- 六张 Agent 卡:`.panel-card`,hover 仅 `border-primary/40 + shadow-sm`(**去掉 scale 1.02**);头像统一 `w-10 h-10 rounded-xl`,底色用 agent.color 的 12-14% 透明度 + `ring-1 ring-border`(浅色档下若对比不足,叠加 `dark:` 不需要——底色透明度两态通用)。
- 琥珀「使用提示」框:改中性信息条 `bg-muted/60 border border-border border-l-[3px] border-l-primary rounded-r-md`,Info 图标 + `text-muted-foreground` 正文——消灭全页唯一高饱和黄。

### 5.9 数据分析(ChartPanel)
- 底部三张 KPI 卡(590 / 10800 / 14.5):去蓝/绿/橙三色底与大数字,统一 `bg-card border border-border rounded-xl shadow-xs`,数字 `text-xl font-semibold tabular-nums text-foreground`,仅以左侧 3px 色条或小色点区分系列(色取 `--chart-1/2/3`)。
- Recharts:折线/曲线用 `--chart-1`(墨蓝,暗下自动为雾蓝),网格虚线 `hsl(var(--border))`,坐标轴文字 `hsl(var(--muted-foreground))` 11px;tooltip 用令牌(`bg-popover border-border rounded-lg shadow-md text-popover-foreground`),不用黑底写死。
- tab 切换(分数线/位次/薪资)改下划线式,与 RightPanel 指示条交互一致(§4.7)。

---

## 6. 全局细节

- **滚动条**:全局与面板统一 `.thin-scrollbar`(6px,透明轨道,thumb `hsl(var(--border))`,hover `hsl(var(--muted-foreground)/0.5)`);RightPanel tab 条与横向滚动条用 `scrollbar-none` 隐藏。删除旧 `.dark-scrollbar` 引用。
- **focus 环**:全站统一 `focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 ring-offset-background`;输入类 `focus:ring-2 focus:ring-ring/30`。
- **过渡动画**:通用 `transition-colors duration-150`;面板/卡片 hover `duration-200`;tab 指示条与 Sidebar 激活指示条沿用 framer-motion `layoutId` spring。**禁用** hover scale 跳动与入场大位移;弹层用 `opacity+y 4px` 微动。
- **空状态**:居中 `py-10`,lucide 图标 `w-10 h-10 text-muted-foreground/50`,标题 `text-[13px] text-muted-foreground`,可选 ghost 小按钮;背景不加插画色块。
- **验收标准**(方案3 吸收):任一屏在两主题下截图对比,仅明度差异、无色相跳变;ThemeToggle 来回切换无残破面板;grep 全站不应再出现 `slate-`/`blue-`/`amber-`/`cyan-`/`teal-` 具象类(语义 emerald/red 用于徽章亮度微调除外)与写死 hex(画布/终端/侧栏深轨这三处白名单除外)。

---

## 附:白名单(允许写死的色)

1. 知识图谱 canvas 内部(§5.3 全表)——画布恒为深色,双主题不变。
2. 日志终端底与文字(§5.7)——终端恒为深色。
3. Sidebar 深轨 `--rail`(已令牌化,但属深轨专用变量)。
4. `--chart-*`/`--warning`/`--success` 本体定义于 index.css(这是它们唯一的家)。
