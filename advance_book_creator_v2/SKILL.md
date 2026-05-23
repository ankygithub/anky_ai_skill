---
name: advance_book_creator
description: 深度调研一个主题，生成书籍级PDF手册。MD-first架构：Markdown写作 → 自动转HTML片段 → 6套主题系统 → 语义化版本管理 → 多Agent并行写作 → Playwright渲染PDF → 精确书签（两遍渲染） → Markdown导出 → 多文件阅读器。
triggers:
  - 做一本书
  - 做个PDF手册
  - 做个完整指南
  - 做一本手册
  - 橙皮书
  - 电子书
  - 参考指南
  - 完整手册
  - 书籍级PDF
---

# advance_book_creator_v2

深度调研一个主题，生成书籍级PDF手册。**MD-first架构**：Markdown片段写作，自动转换为HTML片段，生成所有产物。

## v4 核心改进（相比huashu-book-pdf-v3）

| 特性 | v3 | v4 |
|------|-----|-----|
| 片段格式 | HTML片段（标签需严格闭合） | **Markdown片段**（天然闭合安全） |
| 目录生成 | 需要单独写01-toc.html | **构建时从所有正文自动提取** |
| 封面/尾页 | HTML模板 | **MD格式 + YAML frontmatter** |
| PDF书签精度 | offsetTop估算 | **两遍渲染 + scrollIntoView精确测量** |
| 特殊组件 | 全HTML | **内嵌HTML**（callout/step等少量用HTML） |

## 前置依赖

- Node.js >= 16
- Playwright：`npm install playwright pdf-lib && npx playwright install chromium`

## 项目结构

```
{项目名}/
├── PROJECT.md              # 项目中枢（大纲+进度+数据速查）
├── styles.css              # 共享CSS（6套主题，从templates/复制）
├── build.js                # HTML合并脚本（从templates/复制）
├── build-pdf.js            # PDF渲染+精确书签（从templates/复制）
├── build-md.js             # HTML → Markdown转换（从templates/复制）
├── build-reader.js         # 多文件阅读器（从templates/复制）
├── build-all.js            # 统一构建入口 + 产物门禁（从templates/复制）
├── convert-md.js           # Markdown → HTML片段（★增强版，从templates/复制）
├── convert-html.js         # HTML → HTML片段（兼容模式，从templates/复制）
├── update.sh               # 一键版本更新+构建（从templates/复制）
├── version.json            # {"title":"","subtitle":"","author":"","version":"1.0.0"}
├── fragments/              # ★ Markdown片段（纯.md）
│   ├── 00-cover.md         # 封面（YAML frontmatter + Markdown）
│   ├── part01-xxx.md       # 正文Part
│   ├── part02-xxx.md       # ...
│   └── 99-backpage.md      # 尾页
├── assets/                 # 图片资源
├── research/               # 调研资料
├── output/                 # 产物输出
└── versions/               # 历史产物存档
```

## 产物说明

| 产物 | 格式 | 用途 | 生成方式 |
|------|------|------|---------|
| 单文件HTML | `.html` | 网页展示，6套主题+导航栏+目录面板 | `node build.js` |
| 带精确书签PDF | `.pdf` | 打印/阅读，两遍渲染精确页码 | `node build-pdf.js` |
| Markdown | `.md` | 文档编辑/版本控制 | `node build-md.js` |
| 多文件阅读器 | `reader/` | 交互式网页阅读 | `node build-reader.js` |

## 两种工作模式

### 模式A：自动连续生成（完整工作流）

**1. 初始化项目**
✅ 【强制要求】必须调用bash脚本生成项目骨架，禁止手动逐个生成文件（节省90%Token，10秒完成）

> 参数顺序: `<项目目录名> <手册标题>`，比如`bash init-project.sh "D:\PYTHON应用开发入门" "Python完全指南"`就是在D盘根目录创建名为`PYTHON应用开发入门`的项目，标题为`Python完全指南`
> 两种调用位置都支持: 可以在skill根目录调用`scripts/xxx`，也可以进入scripts目录直接调用脚本
---
- 🎯 【全平台优先推荐】通用版（Windows Git Bash/WSL/Mac/Linux 100%兼容，99%场景用这个就够）：
  ```bash
  # 根目录调用示例
  & "C:\Program Files\Git\bin\bash.exe" "scripts/init-project.sh" "D:\AI应用开发入门" "AI应用开发入门——Java工程师转型指南"
  # 进入scripts目录调用示例
  cd scripts
  & "C:\Program Files\Git\bin\bash.exe" "init-project.sh" "D:\AI应用开发入门" "AI应用开发入门——Java工程师转型指南"
  ```

**2. 调研**
- 与用户确定主题和目标读者
- 拆分调研维度（6-12个方向）
- ✅ 【强制要求】每个维度调研必须先调用 WebSearch / search sub_agent 做网络搜索，禁止仅靠大模型内部知识库输出内容
- ✅ 【强制要求】搜索结果必须标注信源等级、来源URL、获取时间，未标注的调研内容视为无效（参考 `references/source-grade-simple.md` 规范）
- 启动多个background agent并行调研，每份保存到 `{项目目录}/research/YYYY-MM-{关键词}.md`

## 信息获取策略

| 场景 | 推荐方式 | 说明 |
|------|---------|------|
| 调研阶段收集背景知识 | Task(search) sub_agent | 用 SearchCodebase + Grep + Glob + Read 组合搜索 |
| 写作时需要查具体数据/事实 | WebSearch 工具（单次） | 直接调用，不走 skill 嵌套 |
| 需要抓取网页内容解析 | WebFetch 工具 | 抓取 URL 内容转为 markdown |
| 禁止 | multi-search-engine skill | 嵌套调用容易卡死 |

**3. 规划**
- 编辑 `PROJECT.md`，包含：章节大纲表、调研资料索引、Agent并行分工方案、进度追踪表
- 与用户确认大纲后进入写作

**4. 写作（★ 核心变化）**

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
2. **`##` = 大章节标题**（对应原HTML的 `<h2 class="section-title">`）
3. **`###` = 小节标题**（对应原HTML的 `<h3>`）
4. **`####` = 子小节**（对应原HTML的 `<h4>`）
5. **绝大多数内容用 Markdown 原生语法**：粗体 `**文字**`、表格、列表、代码块、引用 `>`
6. **防幻觉强制规则（写作阶段必须遵守）**：
   - ✅ 【强制搜索验证】所有涉及**具体数据、版本号、参数配置、API接口、事实陈述**的内容，必须调用WebSearch工具验证，禁止直接输出未验证的大模型内部知识
   - ✅ 【强制信源标注】正文引用的所有外部事实，必须在引用处或章节末尾标注信源来源，格式：`（来源：官方文档/论文URL，获取时间：202X-XX-XX）`
   - ✅ 【强制时效检查】技术类内容涉及版本、特性时，必须标注该信息的时效性（如"截至2025年1月"），过期内容自动标记⚠️
   - ✅ 【强制矛盾处理】同一主题存在多个信源且内容矛盾时，必须并列呈现各方观点，标注争议点，禁止单方面采信
   - ✅ 【强制高风险确认】涉及安全、法律、医疗、金融等高风险领域的内容，写作完成后必须提示用户确认关键事实，未经确认不得写入正文
7. **【强制】特殊组件使用规则（铁律）**：

以下场景**必须**使用对应内嵌HTML组件，**不得**用纯文本/普通Markdown替代。不使用组件会导致最终产物缺乏视觉层次和可读性。

#### 7.1 场景-组件映射表

| 当你要写... | 必须使用 | 触发条件 |
|------------|---------|---------|
| 章节核心要点、关键结论、重要总结 | `callout-tip` | 每个Part至少 **≥1个** |
| 安全警告、注意事项、禁忌、风险提示 | `callout-warn` | 出现"危险/禁止/不要/风险/⚠️"等 |
| 参考信息、数据来源、背景延伸 | `callout-info` | 出现"参考/来源/延伸/详情"等 |
| 2步以上的操作步骤、配置流程、安装指南 | `step` | 有序操作**必须使用** |
| 好坏对比、方案选型、优缺点比较 | `compare` | 有对比内容**必须使用** |
| 关键术语首次出现、需要强调的概念 | `tag-core` | 专业术语**建议使用** |
| 多分支决策、"如果…则…"逻辑 | `flow` | 决策树**建议使用** |

#### 7.2 每个Part的最低用量底线

每个 `partNN-xxx.md` 文件**必须满足**：
- ✅ 至少 **1个** callout 组件（tip/warn/info 任选）
- ✅ 如果包含操作步骤 → **必须**用 step 组件
- ✅ 如果包含对比内容 → **必须**用 compare 组件
- ❌ 禁止整个 Part 零组件（纯文本输出）

#### 7.3 组件模板（直接复制使用）

**Callout 提示块：**
```markdown
<div class="callout callout-tip">
<div class="callout-title">核心要点</div>
<p>本章最重要的3个结论：...</p>
</div>
```

**Callout 警告块：**
```markdown
<div class="callout callout-warn">
<div class="callout-title">注意</div>
<p>此处有安全风险/常见坑：...</p>
</div>
```

**Callout 信息块：**
```markdown
<div class="callout callout-info">
<div class="callout-title">参考</div>
<p>数据来源/背景补充：...</p>
</div>
```

**步骤流程块（2步以上操作时必须用）：**
```markdown
<div class="step">
<div class="step-num">1</div>
<div class="step-content"><h4>步骤标题</h4><p>步骤说明</p></div>
</div>
<div class="step">
<div class="step-num">2</div>
<div class="step-content"><h4>步骤标题</h4><p>步骤说明</p></div>
</div>
```

**对比块（有好坏/推荐对比时必须用）：**
```markdown
<div class="compare">
<div><p><strong>不推荐 ❌</strong></p><p>不好做法及原因</p></div>
<div><p><strong>推荐 ✅</strong></p><p>好做法及原因</p></div>
</div>
```

**标签（关键词强调）：**
```markdown
<span class="tag-core">重要术语</span>
```

#### ⚠️ 标签闭合铁律

使用内嵌HTML时，**必须**确保标签严格闭合，否则构建时会自动降级为纯文本块（丢失样式）。

**❌ 常见错误（会导致降级为文本）：**
- `<div>` 没有对应的 `</div>`
- 标签嵌套顺序错误：`<div><span></div></span>`
- 自闭合标签写错：`<br>` 应为 `<br/>`
- 标签名拼写错误：`<dvi>` 或 `</dv>`

**构建时的自动处理：**
- 简单缺失闭合标签 → 自动补全
- 复杂结构损坏 → 降级为纯文本块（保留文字内容，丢失样式）
- 降级后会生成报告到 `output/convert-md-fix-report.txt`

8. **禁止**：不要在MD中写 `<html><head><style><body>` 等页面级标签

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

| 图形类型 | 触发场景 | 方式 | 格式 |
|---------|---------|------|------|
| 架构图/流程图 | 技术书籍 | diagram-generator skill | SVG（嵌入HTML） |
| 数据图表 | 数据对比 | chart-image skill | PNG |
| 封面装饰图 | 需要视觉冲击 | canvas-design 或 byted-seedream-image-generate skill | PNG |

图片保存到 `assets/`，引用方式：
```html
<figure class="content-figure">
  <img src="../assets/arch-overview.svg" alt="架构图">
  <figcaption>图 1-1 架构总览</figcaption>
</figure>
```

**5. 构建**

```bash
# 一键构建所有产物
node build-all.js --products all

# 分步构建
node build-all.js --products html,pdf
```

`build-all.js` 会自动检测 `fragments/*.md`，先调用 `convert-md.js` 转换为 HTML 片段，再执行后续构建。

**6. 版本更新**

```bash
./update.sh patch "修正错误"    # 1.0.0 → 1.0.1
./update.sh minor "更新内容"    # 1.0.0 → 1.1.0
./update.sh major "新增章节"    # 1.0.0 → 2.0.0
```

### 模式B：独立数据源调用

```bash
cd templates
node build-all.js --source ./input.md --type md --products all
node build-all.js --source ./html-folder/ --type html --products pdf
```

## 产品门禁机制

```bash
node build-all.js --products all        # 默认全部，构建后检查4种产物
node build-all.js --products html,pdf   # 只生成指定产物
node build-all.js --products html --no-gate  # 跳过门禁
```

## 精确书签生成（v4新特性）

`build-pdf.js` 使用两遍渲染法：

1. **第一遍**：Playwright 打开HTML → 每个 h2/h3 调用 `scrollIntoView()` → 用 `window.scrollY + getBoundingClientRect().top` 获取绝对位置 → 计算精确页码
2. **第二遍**：重新渲染并生成PDF
3. 用第一遍测得的精确页码创建书签

相比v3的offsetTop方案，此方法能正确处理CSS强制分页、封面页不同margin等场景。

## 构建脚本参考

| 脚本 | 功能 |
|------|------|
| `build-all.js` | 统一构建入口 + MD预处理 + 门禁 |
| `build.js` | 单文件HTML构建 |
| `build-reader.js` | 多文件阅读器构建 |
| `build-pdf.js` | PDF生成（两遍渲染精确书签） |
| `build-md.js` | Markdown导出 |
| `convert-md.js` | ★ MD→HTML片段（支持内嵌HTML保护） |
| `convert-html.js` | HTML→HTML片段（兼容） |
| `update.sh` | 版本更新+构建 |

## 参考资料

| 需要时读取 | 文件 | 内容 |
|-----------|------|------|
| 写MD片段时 | `references/design-system.md` | CSS变量、主题、组件HTML速查、MD片段规范 |
| 新建项目时 | `templates/` 目录 | 可直接复制的骨架文件 |
