---
name: adv_book_creatorV3.3
description: "深度调研一个主题，生成一本书"
---

# adv_book_creatorV3.3

深度调研一个主题，生成书籍级PDF手册。**MD-first架构**：Markdown片段写作，自动转换为HTML片段，生成所有产物。

## 前置依赖

- Node.js >= 16

- Playwright（PDF 产物与 EPUB 图文封面排版需要）：`npm install -g playwright pdf-lib && npx playwright install chromium`

- highlight.js：**无需安装**——EPUB 高亮使用技能内置精简版 `templates/lib/hljs-bundle.js`（19 种常用语言，随 init 复制到项目 `lib/`）；环境中装了 `npm install highlight.js` 时自动优先用安装版（语言更全），两者都缺席时退化为内置迷你高亮

- 全局安装的 playwright 构建时需让 Node 找到模块：PowerShell 中先执行 `$env:NODE_PATH = (npm root -g)`

## 项目结构

```
{项目名}/
├── PROJECT.md              # 项目中枢（大纲+进度+数据速查）
├── CHANGELOG.md            # 更新日志
├── DESIGN.md               # 设计文档（含 rebuild 使用说明）
├── styles.css              # 共享CSS（7套主题，默认锐利审稿print-proof；组件样式唯一来源，从templates/复制）
├── build.js                # HTML合并脚本（从templates/复制）
├── build-pdf.js            # PDF渲染+精确书签（从templates/复制）
├── build-md.js             # Markdown导出（源头聚合式，从templates/复制）
├── build-reader.js         # 多文件阅读器（从templates/复制）
├── build-all.js            # 统一构建入口 + 门禁[0a]MD/[0b]组件/[0c]流程 + 产物门禁（从templates/复制）
├── convert-md.js           # Markdown → HTML片段（★组件原生化渲染，从templates/复制）
├── check-md.js             # ★ MD片段门禁检查（从templates/复制）
├── fix-md.js               # ★ MD片段自动修复-标题层级（从templates/复制）
├── build-epub-pro.js       # EPUB精排生成器（从templates/复制）
├── epub-styles.css         # EPUB专用样式（从templates/复制）
├── version.json            # {"title":"","fileTitle":"","subtitle":"","author":"","version":"1.0.0"}（fileTitle 仅产物文件名用，留空自动净化 title）
├── lib/
│   ├── fence-scan.js       # ★ 共享围栏状态机（convert-md/check-md/build-all 公共依赖）
│   ├── cover-select.js     # ★ 封面/图标风格解析（build-epub-pro/build/build-reader 公共依赖）
│   ├── footnote-pop.js     # ★ 脚注点击弹层（build/build-reader 内联的单一来源）
│   ├── flow-gate.js        # ★ 流程门禁共享逻辑（build-all [0c] 与 stage.js 共用；指纹唯一来源）
│   ├── hljs-bundle.js      # 内置 highlight.js 精简版（EPUB 代码高亮零安装）
│   └── hljs/               # hljs-bundle 的语言文件
├── scripts/
│   ├── rebuild.js          # 产物重建脚本（node scripts/rebuild.js [products] [--clean]）
│   └── stage.js            # ★ 流程门禁信号（node scripts/stage.js writing|review|revision --done）
├── fragments/              # ★ Markdown片段（纯.md）
│   ├── 00-cover.md         # 封面（YAML frontmatter + Markdown）
│   ├── ch01-xxx.md         # 正文章节（一章一文件）
│   ├── ch02-xxx.md         # ...
│   └── 99-backpage.md      # 尾页
├── assets/                 # 图片资源
├── materials/              # 素材库 + 流程留痕
│   ├── workflow.json       # ★ 流程门禁信号（由 scripts/stage.js 写入）
│   └── review/             # 编辑审查留痕（issues.md 意见清单 / resolved.md 核销）
├── research/               # 写作参考资料（组件速查/写作编排/术语纪律/编辑审查/MD模板，由 init 复制）
├── cover-images/           # 封面资源（library/ 风格库由 init 自动复制；cover.* 自定义封面；icon.* 自定义图标）
├── output/                 # 产物输出（html/pdf/md/epub + reader/）
└── versions/               # 历史产物存档
```

## 产物说明

| 产物       | 格式        | 用途                 | 生成方式                   |
| -------- | --------- | ------------------ | ---------------------- |
| 单文件HTML  | `.html`   | 网页展示，7套主题+导航栏+目录面板 | `node build.js`        |
| 带精确书签PDF | `.pdf`    | 打印/阅读，两遍渲染精确页码     | `node build-pdf.js`    |
| Markdown | `.md`     | 文档编辑/版本控制          | `node build-md.js`     |
| 多文件阅读器   | `reader/` | 交互式网页阅读            | `node build-reader.js` |
| EPUB电子书  | `.epub`   | 阅读器/手机阅读，嵌套目录+风格封面 | `node build-epub-pro.js` |

## 两种工作模式

### 模式A：自动连续生成（完整工作流）

**1. 初始化项目**
✅ 【强制要求】必须调用初始化脚本生成项目骨架，禁止手动逐个生成文件（节省90%Token，10秒完成）

> 参数顺序: `<项目目录名> <手册标题>`，比如`node scripts/init-project.js "D:\AI应用开发入门" "AI应用开发入门——Java工程师转型指南"`就是在D盘根目录创建名为`AI应用开发入门`的项目，标题为`AI应用开发入门——Java工程师转型指南`

- 🎯 【全平台】Node 版（Windows PowerShell / Git Bash / WSL / Mac / Linux 通用，无 bash 依赖）：

  ```bash
  # 在技能根目录调用
  node scripts/init-project.js "D:\AI应用开发入门" "AI应用开发入门——Java工程师转型指南"
  ```

**2. 规划**

- 生成大纲，编辑 `PROJECT.md`——它是全书唯一的中枢蓝图，按 book-planner 详细度逐模块填写：

  | 模块                                                | 作用                |
  | ------------------------------------------------- | ----------------- |
  | 一、书籍定位（一句话定位 / 书籍类型 / 是什么 / 不是什么 / 读完后的变化）        | 全书防漂移             |
  | 二、读者画像（8 维）                                       | 写作 Agent 校准语气     |
  | 三、术语表（标准名/英文/全称/首次出现章/禁用同义词）                      | 锁定用词，防生造名词（门禁会机械扫禁用词） |
  | 四、数据速查（全书共享硬事实：统一版本号 / 核心数字）                        | 各章共用，避免每章重复搜       |
  | 五、章节大纲（5.1 章清单 `chNN` / 5.2 Part 分组映射）                    | 每章价值 + 分组派发        |
  | 六、单章 Mini-Plan（核心论点/读完能做什么/必须包含/禁止重复/衔接/风险点/本章术语） | 每章给写作 Agent 的直接指令 |
  | 七、知识递进路线                                          | 结构防漏              |
  | 八、图表与组件规划                                         | 视觉元素制度化           |
  | 九、对抗性审查设计（主审身份 / 审查粒度 / 是否需跨章汇总）                          | 审查阶段按此执行           |
  | 十、风险清单                                            | 预案                |
  | 十一、进度追踪                                          | 状态                |
  | 十二、用户确认区                                         | 进入写作的门槛           |

- **信息获取（默认不搜）**：不再有独立采集阶段——写作时只有遇到"**不可编造的具体事实**"（真实数字/真实事件/最新版本号/官方配置值/真实评测数据）才现场搜一次，搜到**直接写进正文并加脚注标源**（判据见 §3.1）。概念、原理、通用步骤、观点一律用模型知识写

- **EPUB 封面确认（规划阶段必做）**：完成大纲后，根据图书类型预判 EPUB 封面风格——科技（编程技术）/ 素雅（学术教材，默认兜底）/ 复古（历史国学）/ 书券（典藏文集）/ 清新（科普教育）/ 日系（小说散文），详见「封面与图标风格」；**主动向用户反馈推荐风格及理由**。用户可指定其他风格（构建时 `--cover-style` 或 `version.json` 的 `coverStyle`），也可提供自定义图片（放 `cover-images/cover.*` 作封面、`icon.*` 作图标）。确认结论记入 PROJECT.md 用户确认区

- **编辑** **`fragments/00-cover.md`**：把 frontmatter 中的 `title/subtitle/author/version` 占位文字改为真实信息（封面渲染只读这5个字段，且优先级高于 version.json）

- **定书籍类型（规划阶段必做）**：确定全书属于哪一档——技术/专业、方法/技艺、商业/观点、人文/叙事、科普。**它决定术语表形态与编辑审查的加查维度**（见 `references/terminology-discipline.md` 第二节体裁映射）

- **建立术语表（规划阶段必做）**：按书籍类型起草——技术/科普给中英对照，方法/技艺存学科通用概念，人文/叙事改"用词台账"；列「中文标准名 / 英文 / 全称 / 首次出现章 / **禁用同义词**」。**禁用同义词列是把 AI 易自造的说法钉死**（如"抓变化""管道"）；用户确认后锁定

- 与用户确认（勾选用户确认区）后进入写作

**3. 信息获取（默认不搜；需要时现场搜、直接写正文）**

> **【核心变化】** 不再有独立的"素材采集阶段"，也不再产出 `materials/chapter-{NN}/sNN.md` 素材卡片——实测那些卡片与正文关系很弱，多半只被摘抄一两句，性价比低。
> 改为：写作时**确需真实事实**才现场搜一次，**搜到就直接写进正文并加脚注标源**，不做"提炼成卡片"的中间工序。

**3.1 何时才搜（判据）**

只有"**不可编造的具体事实**"才搜，任一为"是"才搜：

1. 要写**具体数字 / 时间线 / 真实事件**吗（不搜只能编）？
2. 要写**最新版本号 / 官方配置值 / API 现状**吗（不搜会过期出错）？
3. 要写**真实对比数据 / 评测结果**吗（不搜就是假的）？

三问全"否" → **不搜**，直接用模型知识写。
> 注意：**"操作步骤"本身不等于需要搜索**。通用步骤（装包、配置、跑命令）模型会写；只有"某版本特有的踩坑 / 官方非默认值"才算触发。
> **"想更充实"不是搜索理由**——概念、原理、通用步骤、观点一律不搜。

**3.2 执行**

- **由写作 Agent 自己**在写作过程中调用 WebSearch（不再单列采集子 Agent，也不再建素材卡片）。
- 每章搜索**最多 2 轮**；命中即可用；✅ 【铁律】2 轮无果 → 按模型知识写，**不硬搜**。
- 搜到的结论**直接写进正文**，并在该句加脚注 `[^n]` 标源（语法见 §4 第 6 条）。**脚注标源是底线，不能丢**。
- 确有长期参考价值的**原始件**（如官方 PDF / 长文档）才存到 `materials/`（默认空，不做卡片化提炼）。
- 高风险领域（安全 / 法律 / 医疗 / 金融）内容完成后提示用户确认。

**4. 写作**

**派发方式（控 token 关键）**：由主 Agent **按 PROJECT.md §5.2 的 Part 分组**派发写作子 Agent——**一个 Agent 写一个 Part 的若干章**（内容强相关，语气/术语更一致）；**不要每章派一个 Agent**（每个 Agent 都要重新装载固定载荷，Agent 越多越贵）。各 Part 可并行写（每章一个文件 `chNN-*.md`，互不冲突）。

> **【写作前必做】** 每个写作 Agent 在开始写作前，**必须先拿到以下三样**：
>
> **【编辑纪律】** 对**已存在文件**的多处修改必须**逐处串行执行**（改一处确认一处）——
> 并行提交同文件多处编辑会基于旧快照互相覆盖、静默丢内容（两次写作实测事故）。
> 不同文件之间的编辑可以并行。
>
> **第零步：本组章节指令（由主 Agent 内联，不读整份 PROJECT.md）**
>
> - **主 Agent** 把本组切片**内联**进子 Agent 的指令：**书籍定位 + 读者画像 + 术语表 + 数据速查 + 本组章节的大纲行 + 本组单章 Mini-Plan**（核心论点/读完能做什么/必须包含/禁止重复/衔接/风险点）
>
> - **子 Agent 不打开整份 `PROJECT.md`**——整份含全书所有章节的 Mini-Plan，只按本组切片写即可（省 token；确需更多上下文时再按需读）
>
> - 严格按 Mini-Plan 的"必须包含 / 禁止重复"执行，章节边界与承接以大纲"前置依赖"为准
>
> **第一步：读取组件规范**
>
> - 读取 `research/components-quickref.md` 组件速查表
>
> - 组件只使用 Markdown 语法：`> [!TIP]` / `:::steps` / `:::compare`
>
> - **禁止在 MD 中写 HTML 标签**（仅允许内嵌 SVG 与 figure/img 图形，门禁会拦截）
>
> **第二步：读取写作编排规范**
>
> - 读取 `research/writing-style.md`，本章每个小节从中选择编排模式
>
> - **相邻两个小节不得使用同一编排模式**，收尾方式轮换（详见该文件）
>
> - 提示块配额：每个 Part 最多 2-3 个，**禁止每个小节都用要点块收尾**
>
> **第三步：读取术语纪律（治"生造名词"）**
>
> - 读取 `research/terminology-discipline.md`，并对照 `PROJECT.md` 的**书籍类型**与**术语表**
> - **一律用领域通用词**，不得自造近义白话：技术书写"变更数据捕获（CDC）"不写"抓变化"、写"消息队列（Kafka）"不写"管道"；写作书写"叙述视角"不写"看事情的框框"
> - 术语**首次出现给足信息**（技术/科普给中英对照 `中文（English，全称）`；方法/人文给一次定义或出处）；**同一概念全书同一词**
> - 术语表"禁用同义词"列里列出的说法，一律禁止出现
> - 需要新增术语时，先补进 PROJECT.md 术语表再用

每个写作 agent 输出 **纯 Markdown 文件**（.md），必须遵循以下规范：

```markdown
---
type: chapter
title: 第一章 章节标题
---

## 第一章 章节标题

### 1.1 小节标题

正文内容，使用 **粗体**、*斜体*、`行内代码` 等 Markdown 语法。

更多内容……
```

**MD片段规范（铁律）**：

1. **YAML frontmatter 必填**：`type`（cover/chapter/backpage）、`title`
2. **`##` = 大章节标题**：格式 `## 第X章 章节标题`；**X 用汉字数字**（第一章/第二章……），全书统一，不要混用"第1章"与"第一章"
3. **`###` = 小节标题**：格式 `### X.Y 小节标题`（如 `### 1.1 小节标题`）
4. **`####` = 子小节**：格式 `#### X.Y.Z 子小节标题`（如 `#### 1.1.1 子小节标题`）
5. **绝大多数内容用 Markdown 原生语法**：粗体 `**文字**`、表格、列表、代码块、引用 `>`
6. **信息与素材规则（写作阶段必须遵守）**：

   - ✅ 【现场取信】需要真实事实（数字/时间线/版本号/评测数据）时，按 §3 现场搜一次，**搜到直接写进正文**——不做素材卡片，不建 `materials/chapter-{NN}/`

   - ✅ 【禁止虚构案例】没有真实来源的案例**不得编造**：要么按 §3 搜到真来源，要么明确写成"示意/假设"并标注

   - ✅ 【信源标注】正文引用的外部事实，用**脚注**标注来源：正文写 `[^n]`，所在段落之后（或章末）写 `[^n]: 来源：<URL 或出处>`；同一来源多处引用复用同一标记。语法与规则见 research/components-quickref.md 第 5 节（网页端与阅读器为**点击弹层**，EPUB 多看为弹窗）；每章 ≤5 个，只用于真正的出处

   - ✅ 【时效检查】技术类内容涉及版本、特性时，标注信息的时效性（如"截至2025年1月"），过期内容标记⚠️

   - ✅ 【矛盾处理】来源之间存在矛盾时，并列呈现各方观点，标注争议点

   - ✅ 【高风险确认】涉及安全、法律、医疗、金融等高风险领域的内容，完成后提示用户确认
7. **【强制】组件语法规则**：

组件全部使用 **Markdown 原生语法**，禁止在 MD 中写 HTML 标签（图形除外）。转换器在构建时自动生成结构与样式，写作者无需关心 CSS 类名。

> **完整语法见 `research/components-quickref.md`（唯一规范，写作 Agent 必读）**：提示块 `> [!TIP]/[!WARN]/[!NOTE]/[!IMPORTANT]`、步骤 `:::steps`、对比 `:::compare`、内嵌 SVG / `<figure>`、脚注 `[^n]`、文件树（`text` 代码块）。
> 该文件含「语法总表 / 图形（唯一允许的 HTML）/ 脚注 / EPUB 兼容等级 / 写作禁令」，此处**不重复**——避免两份组件规范漂移。

#### 7.1 组件使用配额（写作 Agent 自查，构建门禁不强制拦截）

每个章节文件 `chNN-*.md`：

- ✅ 提示块 **每章最多 2-3 个**，只放真正的关键转折或高危警告处；**禁止每个小节都用要点块收尾**（强调块通胀会让"关键"失效）
- ✅ 含操作步骤 → **必须**用 `:::steps`；含对比内容 → **必须**用 `:::compare`
- ✅ 编排模式遵循 `research/writing-style.md`：相邻小节不重复同一模式，收尾方式轮换
- ❌ 避免整个章节零组件（纯文本输出，缺乏视觉层次）

#### 7.2 HTML 使用边界

- **禁止**：结构类 HTML（`div`/`span`/`table`/`ul`/`strong`/自定义标签）与页面级标签（`<html>`/`<head>`/`<style>`/`<body>`）——门禁 `check-md.js` 会拦截构建
- **仅允许**：内嵌 `<svg>`、`<figure>`/`<img>`（图形场景）
- **组件内直接写 Markdown**（粗体、表格、代码块均可），由转换器统一处理
- 构建时：禁用标签 → 门禁拦截（error）并给改写建议；可疑写法（围栏 / SVG 未闭合）→ 记 `output/convert-md-warnings.txt`，不阻断

**封面文件 00-cover.md：**

```markdown
---
type: cover
title: 书籍标题
subtitle: 副标题
author: 作者名
version: 1.0.0
---

# 书籍标题

> 一句话描述
```

**尾页文件 99-backpage.md：**

```markdown
---
type: backpage
---

## 文档结束

书籍标题 v1.0.0
作者名
```

### 图形与图表生成

所有图形**默认内嵌 SVG**，由大模型在写作时直接生成——**不依赖任何外部图像/图表技能**（换用其他 Agent 时未必具备这些技能）。

| 图形类型             | 触发场景 | 方式          | 格式     |
| ---------------- | ---- | ----------- | ------ |
| 架构图/流程图/示意图      | 技术书籍 | 大模型直接生成 SVG | 内嵌 SVG |
| 数据图表（柱状/折线/饼图/散点等） | 数据对比 | 大模型直接生成 SVG | 内嵌 SVG |

> **数据图表一律手写内嵌 SVG**：简单数据展现（几项～十几项）直接由模型出图，无需任何图表技能。数据点过多（几十上百项）时先做聚合/取样，或只画关键变化段，别让 SVG 冗长难维护。

**内嵌 SVG（唯一推荐方式）：**

直接在 Markdown 中写原始 SVG 代码，**不要用代码块包裹**：

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520">
  <!-- SVG 内容 -->
</svg>
```

**生成方式**：在写作对话中直接让大模型生成——描述需要的图形，模型输出 SVG 代码，粘贴进 Markdown（删除代码块标记）。优势：写作流畅、迭代快、上下文匹配。

**外部文件引用（仅用户自备图片）：**

当用户提供现成图片（照片/截图/扫描件）时，存到 `assets/` 后引用：

```html
<figure class="content-figure">
  <img src="../assets/chapter-01-photo.png" alt="现场照片">
  <figcaption>图 1-1 现场照片</figcaption>
</figure>
```

⚠️ **重要约定**：

- 内嵌 SVG 不要用 ` ```svg ` 代码块包裹，否则会被当作代码显示

- 如果确实需要展示 SVG 代码（如教程），确保内容不是完整的 `<svg>...</svg>` 结构

**写作完成信号**：全书片段写完后运行 `node scripts/stage.js writing --done`（构建门禁 [0c] 依据）。

**5. 编辑审查（全书写完统一执行一次；资深编辑对抗审查）**

> **【强制环节】** 全书片段写完、封笔后，**必须**派**独立的审查 Agent**（新起 Agent，不继承写作上下文）统一审一次——这是治术语生造、语言生硬、空话夸大、案例编造、**稻草人假设**的主手段。规范见 `research/editor-review.md`。

- **时机与次数**：**全书写完后再审，只审一次**；写作中途不审。审查 → 落盘清单 → 统一修改 → 核销，结束，**不反复对抗**
- **双视角一个 Agent**：审查 Agent 兼具**领域主审**（身份由 `PROJECT.md`「对抗性审查设计」定：技术编辑 / 业务专家 / 科普编辑 / 学术编辑 / 文学编辑…）+ **普通读者**；**两视角各独立走一遍清单**（专家查术语/结论/时效/逻辑/案例真实；读者查生硬 AI 腔 / 空话 / 稻草人 / 读不懂 / 啰嗦）
- **粒度 = Part**：按 `PROJECT.md` §5.2 的 Part 分组审——**一个 Part（含其若干章）统一审一次**；**不做跨 Part 交叉分析**（连贯性交给规划阶段）
- **串行分段，不并行**：用**全新上下文**的审查 Agent **依次**审——每段审 **1–2 个 Part**（或临近 3–5 万 token 即切段），审完**追加写同一份 issues.md**，再起下一段。**不派并行 Agent、不合并多份意见**（并行重复装载依据、合并易漏行重号；单会话跑完全书则上下文被压缩、后半本审瞎）
- **提示词装配（干净上下文）**：审查 Agent 是**新会话、必须自带上下文**——取 `research/editor-review.md`「审查 Agent 提示词模板」，把 `PROJECT.md`「九、对抗性审查设计」的**主审身份 / 粒度**与**本次审查范围**填入 → 粘给它；**只给它规格文件与产物，不要粘写作过程或作者自评**（否则锚定审查者）
- **只落盘不改稿**：审查**只产出**一份全书意见清单 `materials/review/issues.md`（按 Part 分节；列：章节 | 级别 | 类型 | 原句 | **替换句/建议**）——**审查阶段不改稿**；"替换句"要写成可机械替换的整句
- **统一修改（外科手术式）+ 逐条核销**：审查完成后由**一个 Agent 串行**统一修改，**只就地替换被标记的句子**（**禁止重读整本 / 整段重写**——这是省 token 的关键）；再逐条核销写入 `materials/review/resolved.md`（`#N 已改` / `驳回：理由`）；**核销是极轻的收尾校验**，只读被改的句子
- **阶段信号（构建门禁依据）**：审查落盘后 `node scripts/stage.js review --done`；统一修改 + 核销后 `node scripts/stage.js revision --done`。重复标记某阶段会作废其后信号（重写→须重审，重审→须重核销）
- **必须给证据**：每条问题引原句（≤30 字）+ 类型 + 改写建议；**禁止为凑数编问题**
- **不误伤体裁**：文学里正当的修辞/节奏不可当 AI 腔误杀（`editor-review.md` §五 已内联适用边界）
- **构建门禁（真强制，纯机械）**：`build-all.js` 的 `[0c] 流程门禁` 校验——三段信号（writing/review/revision）+ 审查留痕 + 大纲 vs 片段（防漏写）+ 核销覆盖（防漏核销）+ 片段指纹（防改后未被重审），**任一不过即拒绝构建**；仅预览/中途构建可加 `--no-gate` 临时跳过
- **与门禁分工**：编辑审语义（术语/文风/稻草人），`check-md.js` 管语法（YAML/标题/HTML + 术语禁用词扫描），`build-all.js [0c]` 管流程信号与留痕，三道都要过

**6. 构建**

```bash
# 一键构建所有产物（html + reader + pdf + md + epub）
node build-all.js --products all

# 分步构建
node build-all.js --products html,pdf

# 指定封面风格（优先级高于 version.json.coverStyle 和自动识别）
node build-all.js --products all --cover-style 科技
```

`build-all.js` 会自动检测 `fragments/*.md`，先跑三道门禁（`[0a]` MD 源 / `[0b]` 组件语法 / `[0c]` 流程信号），再调用 `convert-md.js` 转换为 HTML 片段并构建。流程门禁不过时，依次补跑 `stage.js` 三段信号。

**7. 版本更新**

```bash
node build-all.js --products all --version patch "修正错误"   # 1.0.0 → 1.0.1
node build-all.js --products all --version minor "更新内容"   # 1.0.0 → 1.1.0
node build-all.js --products all --version major "新增章节"   # 1.0.0 → 2.0.0
```

### 模式B：基于已有大纲（跳过规划）

**适用场景**：已用第三方AI（如GPT-4、Claude等）生成完整计划文档，或已有详细大纲

**流程**：读取大纲 → 补建术语表（若缺） → 补「对抗性审查设计」（若缺） → 写作（需要时现场搜、直接写正文+脚注） → **全书写完统一编辑审查** → 构建

**与模式A的区别**：

- ✅ 跳过"规划"阶段：直接使用已有大纲
- ⚠️ 若已有大纲没有术语表，写作前先补建（见 `terminology-discipline.md`）
- ⚠️ 若计划文档没有"对抗性审查设计"（主审身份 / 审查粒度），写作前先补，供审查阶段使用
- ⚠️ 无独立采集阶段：需要真实事实时由写作 Agent 现场搜、直接写正文并加脚注（判据同 §3.1）
- ✅ **编辑审查（§5）不可跳过**，与模式A一致

```bash
# 模式B的构建命令（与模式A相同）
node build-all.js --products all
```

## 信息获取策略

| 场景 | 做法 |
| --- | --- |
| 写作时遇到"不可编造的具体事实" | 写作 Agent **自己现场 WebSearch**（最多 2 轮）→ **结论直接写进正文 + 脚注标源**（判据见 §3.1） |
| 概念 / 原理 / 通用步骤 / 观点 | 一律用模型知识写，**不搜** |
| 确有长期价值的原始件 | 才存到 `materials/`（默认空，不做卡片化提炼）；2 轮无果则按模型知识写 |

## 产品门禁机制

```bash
node build-all.js --products all        # 默认全部（5种产物），构建后检查产物
node build-all.js --products html,pdf   # 只生成指定产物
node build-all.js --products html --no-gate  # 跳过门禁
```

### MD 源文件验证门禁

构建前会自动检查 Markdown 片段的规范性：

| 检查项              | 说明                                    | 自动修复          |
| ---------------- | ------------------------------------- | ------------- |
| YAML frontmatter | 必须包含 `type` 和 `title`                 | ❌             |
| 章标题层级            | `第X章` 必须是 `##` (h2)                   | ✅ `fix-md.js` |
| 节标题层级            | `X.Y` 必须是 `###` (h3)                  | ✅ `fix-md.js` |
| 子节标题层级           | `X.Y.Z` 必须是 `####` (h4)               | ✅ `fix-md.js` |
| 标题跳级             | 禁止从 h2 直接跳到 h4                        | ❌             |
| 禁用结构类标签          | `div`/`span`/`table`/`<callout>` 等必须改为 Markdown 组件语法 | ❌             |
| 术语禁用词            | 扫 PROJECT.md 术语表「禁用同义词」列，命中即警告（**仅警告，不阻断**；表外新造词靠审查 Agent） | ❌             |

**门禁失败时的处理：**

```bash
# 1. 查看详细错误日志
ls output/error-*.log

# 2. 如果有标题层级错误，自动修复
node fix-md.js fragments --write

# 3. 修复后重新验证
node check-md.js fragments

# 4. 验证通过后重新构建
node build-all.js --products all
```

## 精确书签生成

`build-pdf.js` 使用"测量 + 模拟分页"方案：

1. **测量**：Playwright 打开 HTML，测量每个 `h2.section-title` 章节的绝对位置与内容高度，以及每个 `h3` 相对父章节的偏移
2. **模拟分页**：按 CSS 强制分页规则（每个 h2 章节从新页顶部开始）与页面内容高度，推算各书签页码（h3 为章节内偏移估算）
3. **生成**：渲染 PDF，按推算页码用 pdf-lib 写入书签（UTF-16 编码支持中文）

若 `output/bookmarks.json` 已存在则优先复用其中的书签数据；它能正确处理 CSS 强制分页、封面页不同 margin 等场景。

## EPUB 输出限制清单

EPUB 是可重排介质，与网页能力差异大。写作层必须遵守以下约束（转换器与门禁只兜底，不救火）：
- 不依赖 JavaScript / hover 交互 / sticky·fixed 布局
- 不依赖横向滚动与多栏布局（宽表格控制在 4 列内、横向流程必须可降级为 :::steps）
- 不依赖外链资源与运行时高亮（代码高亮在构建期静态完成）
- 不依赖自定义图标字体；emoji 仅作轻度点缀
- 所有组件必须在单列窄屏保持可读
- 阅读器可能强制重排空白：代码缩进由构建期 NBSP 保护，但不要依赖空格做精细对齐
- 脚注只用于正文信源标注（`[^n]` 语法，见 components-quickref 第 5 节），不放进 :::steps/:::compare/表格/代码块

## 构建脚本参考

| 脚本                   | 功能                                                   |
| -------------------- | ---------------------------------------------------- |
| `build-all.js`       | 统一构建入口 + MD预处理 + 门禁                                  |
| `build.js`           | 单文件HTML构建                                            |
| `build-reader.js`    | 多文件阅读器构建                                             |
| `build-pdf.js`       | PDF生成（两遍渲染精确书签）                                      |
| `build-epub-pro.js`  | EPUB精排生成器（零依赖打包、封面风格图文排版、代码高亮、图片打包）                 |
| `build-md.js`        | Markdown导出（源头聚合，含围栏降级/SVG降级/产物自检）    |
| `check-md.js`        | ★ MD片段门禁检查（标题层级、YAML、禁用HTML标签、术语禁用词扫描[警告级]）                       |
| `fix-md.js`          | ★ MD片段自动修复（标题层级规范化）                                  |
| `convert-md.js`      | ★ MD→HTML片段（组件Markdown原生化渲染）                         |
| `lib/fence-scan.js`  | ★ 共享围栏状态机（围栏判定的唯一实现）                                 |
| `lib/cover-select.js` | ★ 封面/图标风格解析（EPUB封面与HTML图标共用的选择逻辑）                    |
| `lib/footnote-pop.js` | ★ 脚注点击弹层（build/build-reader 构建期内联的单一来源）                  |
| `scripts/rebuild.js` | 产物重建（node scripts/rebuild.js \[products] \[--clean]） |
| `scripts/stage.js`   | ★ 流程门禁信号（node scripts/stage.js writing\|review\|revision --done） |
| `lib/flow-gate.js`   | ★ 流程门禁共享逻辑（build-all \[0c] 与 stage.js 共用；指纹唯一来源） |

## 封面与图标风格

EPUB 封面、单文件 HTML 与 reader 的书架图标共用一套风格体系。素材库在 `icon/`（技能目录），`init-project.js` 会整库复制到项目 `cover-images/library/`。

### 风格一览

| 风格 | 竖版封面（EPUB 用） | 方形图标（HTML/reader 用） | 适用图书类型 |
| ---- | -------------- | --------------------- | ---------- |
| 科技 | tech-portrait.jpg | tech-square.jpg | 编程/技术/AI/数据 |
| 素雅 | elegant-portrait.jpg | elegant-square.jpg | 学术/教材/工具书（**默认兜底**） |
| 复古 | retro-portrait.jpg | retro-square.jpg | 历史/国学/经典文学 |
| 书券 | ticket-portrait.jpg | ticket-square.jpg | 典藏/精装/文集/年报 |
| 清新 | fresh-portrait.jpg | fresh-square.jpg | 科普/入门/教育成长 |
| 日系 | japanese-portrait.jpg | japanese-square.jpg | 小说/散文/生活治愈 |

竖版约 1664×2496（≈2:3），渲染封面时叠加书名/副标题/作者排版并输出 1600×2400 PNG（需 Playwright；不可用时退化为原图封面）。方形 2048×2048。

> ⚠️ `icon/` 下的文件名必须保持纯 ASCII（如上表），**不要改回中文名**。技能被 Trae / WorkBuddy 等 Agent 安装复制时，非 ASCII 文件名会因编码错乱而损坏（中文的 GBK 字节被按 CP437 解释成 `┐╞╝╝╒²╖╜╨╬.jpg` 这类乱码）；损坏后 `readdirSync` 仍拷得到文件，但 [cover-select.js](lib/cover-select.js) 按注册名找不到 → 封面/图标静默回退「素雅」。ASCII 名在任何代码页下字节不变，不会触发该故障。

### 选择优先级（高 → 低）

1. **显式文件**：`cover-images/cover.*`（自定义封面）、`cover-images/icon.*`（自定义图标）
2. **显式指定**：CLI `--cover-style 科技` > `version.json` 的 `"coverStyle": "科技"`
3. **自动识别**：按书名/副标题关键词匹配（科技 → 书券 → 复古 → 素雅 → 日系 → 清新）
4. **兜底默认**：素雅

### 老项目迁移

`init-project.js` 之前创建的项目没有 `cover-images/library/` 与 `lib/cover-select.js`，手动复制技能目录的 `icon/*.jpg` → `cover-images/library/`、`templates/lib/cover-select.js` → `lib/` 即可；未复制时构建不报错，仅跳过封面/图标。

## 参考资料

| 需要时读取  | 文件                                  | 内容                                      |
| ------ | ----------------------------------- | --------------------------------------- |
| 写MD片段时 | `references/components-quickref.md` | ★ 组件语法唯一规范（\[!TIP]/:::steps/:::compare） |
| 写作前    | `references/writing-style.md`       | ★ 写作编排规范（5种模式轮换 + 收尾轮换 + 提示块配额）          |
| 写作前    | `references/terminology-discipline.md` | ★ 术语纪律（体裁映射 / 领域通用词 / 中英对照 / 禁用同义词；机械扫描并入 check-md.js，语义判定交审查 Agent）        |
| 全书写完后审查时 | `references/editor-review.md`       | ★ 对抗性编辑审查规范（全书写完统一审一次 / 一个 Agent 双视角 / Part 粒度 / issues.md 落盘 + resolved.md 核销 / 反AI腔速查 / 术语扫描边界）      |
| 定制样式时  | `references/design-system.md`       | CSS变量、主题、MD片段规范                         |
| 写MD片段时  | `references/md-templates/` 目录       | 3 个格式模板：`references/md-templates/00-cover.md`（封面）/ `references/md-templates/99-backpage.md`（尾页）/ `references/md-templates/ch01-chapter-example.md`（章节示例）；init 复制为 `research/md-template-*.md` |
| 新建项目时  | `templates/` 目录                     | 可直接复制的骨架文件                              |

