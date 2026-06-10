---
name: advance_book_creator2.2
description: "Generate book-level PDF manuals from a topic. Invoke when user asks to write a book, create a PDF manual, or build a complete technical guide. MD-first: Markdown → HTML → PDF with precise bookmarks."
---

# advance_book_creator_v2.2

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
  # 进入scripts目录调用
  cd scripts
  & "C:\Program Files\Git\bin\bash.exe" "init-project.sh" "D:\AI应用开发入门" "AI应用开发入门——Java工程师转型指南"
  ```

**2. 规划**
- 生成大纲，编辑 `PROJECT.md`，包含：章节大纲表、Agent并行分工方案、进度追踪表
- **大纲中必须标注每章是否需要素材采集**（判断原则：包含"案例"/"数据"/"行业"/"实践"/"事故"→需要采集；纯理论/方法论→无需采集）
- 与用户确认大纲后进入素材采集

**3. 素材采集（替代原调研阶段）**

> **【核心变化】** 搜索不再是"强制全搜"，而是"按需采集"。只有大纲中标注了"需要采集"的章节才启动素材采集。

**3.1 素材采集执行**
- ✅ 只有标注了"需要采集"的章节才启动采集
- 采集方式：并行派发多个子Agent，每个负责一组章节
- 每个子Agent对每章执行迭代搜索（最多3轮，第1轮够用就不搜后续轮次）
- 搜索 → 评估结果质量 → 调整关键词 → 再搜 → 筛选 → WebFetch读全文 → 深度提炼 → 保存到素材库
- 素材库目录：`{项目目录}/materials/chapter-{NN}/s{MM}.md`
- 低质量素材不保存，直接丢弃
- ✅ 【铁律】3轮搜索都没结果 → 该章节标记为"无素材"，**不重新搜索**

**3.2 主流程质检**
- 所有子Agent采集完成后，主流程扫描materials/目录
- 检查每个素材文件：是否有深度提炼内容（不是只存URL）、quality字段是否为high/medium、内容是否与章节相关
- 无用素材直接删除
- ✅ 【铁律】被删除的素材**不重新搜索**，避免死循环

**4. 写作**

> **【写作前必做】** 每个写作Agent在开始写作前，**必须先完成以下两步**：
> 
> **第一步：读取组件规范**
> - 读取 `research/components-quickref.md` 组件速查表
> - 严格复制其中的HTML模板结构
> - **禁止自行发明组件结构、禁止自定义CSS类名**（如 `step-card`、`compare-title`、`flow-card` 等均为非法类名）
> 
> **第二步：读取素材库**
> 1. 检查 `materials/chapter-{NN}/` 目录是否存在
> 2. 如果存在，读取该目录下所有 `s*.md` 素材文件
> 3. 理解素材中的核心要点、可引用细节、与章节的关联
> 4. 写作时优先基于素材内容创作（尤其是案例和数据）
> 5. 如果素材目录不存在或为空，使用模型知识写作，不搜索

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
6. **素材使用规则（写作阶段必须遵守）**：
   - ✅ 【素材优先】如果对应章节有素材文件（materials/chapter-{NN}/），案例和数据类内容应优先基于素材创作
   - ✅ 【禁止虚构案例】如果素材库中有真实案例，禁止为了"好看"而虚构案例，应基于素材中的真实案例改编
   - ✅ 【信源标注】正文引用的外部事实，标注来源素材文件名（如"来源：chapter-11-s01"）
   - ✅ 【时效检查】技术类内容涉及版本、特性时，标注信息的时效性（如"截至2025年1月"），过期内容标记⚠️
   - ✅ 【矛盾处理】素材之间存在矛盾时，并列呈现各方观点，标注争议点
   - ✅ 【高风险确认】涉及安全、法律、医疗、金融等高风险领域的内容，完成后提示用户确认
   - ✅ 【可选补充搜索】如果素材库缺少某个关键信息，可单次调用WebSearch补充，但不强制
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

### 模式B：基于已有大纲（跳过规划和素材采集）

**适用场景**：已用第三方AI（如GPT-4、Claude等）生成完整计划文档，或已有详细大纲

**流程**：读取大纲 → 检查/补采集标注 → 素材采集（如需要） → 写作 → 构建

**与模式A的区别**：
- ✅ 跳过"规划"阶段：直接使用已有大纲
- ✅ 如果大纲已标注采集需求，可直接进入素材采集
- ⚠️ 如果大纲未标注采集需求，需先补标注（判断原则同模式A）

```bash
# 模式B的构建命令（与模式A相同）
node build-all.js --products all
```

## 信息获取策略

| 场景 | 推荐方式 | 说明 |
|------|---------|------|
| 素材采集（写作前） | 并行采集子Agent | 搜索→WebFetch→深度提炼→保存到素材库 |
| 写作时需要引用数据/案例 | 查询本地素材库 | 读取 materials/chapter-{NN}/ 下的素材文件 |
| 写作时发现素材库缺少关键信息 | 可选：单次WebSearch补充 | 仅在素材库确实缺少时使用，不强制 |
| 需要抓取网页内容解析 | WebFetch 工具 | 采集阶段使用，抓取全文后深度提炼 |

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
