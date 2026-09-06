***

name: advance\_book\_creator\_lite
description: "Generate book-level PDF manuals from a topic. Invoke when user asks to write a book, create a PDF manual, or build a complete technical guide. MD-first: Markdown → HTML → PDF with precise bookmarks."
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# advance\_book\_creator\_lite

深度调研一个主题，生成书籍级PDF手册。**MD-first架构**：Markdown片段写作，自动转换为HTML片段，生成所有产物。

## lite 版组件改进（相比 v2.2）

| 特性     | v2.2                                 | lite                                         |
| ------ | ------------------------------------ | -------------------------------------------- |
| 特殊组件   | 内嵌HTML（11种，易混用、易损坏）                  | **Markdown原生化**（\[!TIP]/:::steps/:::compare） |
| HTML兼容 | 保护/修复/降级一整条容错链                       | **白名单放行**（仅SVG/figure/img），其余门禁拦截            |
| 组件规范来源 | SKILL.md/quickref/design-system 三处重复 | **quickref 唯一来源**                            |

## 前置依赖

- Node.js >= 16

- Playwright（仅 PDF 产物需要）：`npm install -g playwright pdf-lib && npx playwright install chromium`

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
├── build-md.js             # HTML → Markdown导出（从templates/复制）
├── build-reader.js         # 多文件阅读器（从templates/复制）
├── build-all.js            # 统一构建入口 + 产物门禁（从templates/复制）
├── convert-md.js           # Markdown → HTML片段（★组件原生化渲染，从templates/复制）
├── check-md.js             # ★ MD片段门禁检查（从templates/复制）
├── fix-md.js               # ★ MD片段自动修复-标题层级（从templates/复制）
├── build-epub-pro.js       # EPUB精排生成器（从templates/复制）
├── epub-styles.css         # EPUB专用样式（从templates/复制）
├── version.json            # {"title":"","subtitle":"","author":"","version":"1.0.0"}
├── lib/
│   └── fence-scan.js       # ★ 共享围栏状态机（convert-md/check-md/build-all 公共依赖）
├── scripts/
│   └── rebuild.js          # 产物重建脚本（node scripts/rebuild.js [products] [--clean]）
├── fragments/              # ★ Markdown片段（纯.md）
│   ├── 00-cover.md         # 封面（YAML frontmatter + Markdown）
│   ├── part01-xxx.md       # 正文Part
│   ├── part02-xxx.md       # ...
│   └── 99-backpage.md      # 尾页
├── assets/                 # 图片资源
├── materials/              # 素材库（采集阶段生成，chapter-{NN}/s{MM}.md）
├── research/               # 调研资料 + 组件速查表 + MD模板参考
├── cover-images/           # EPUB封面图片
├── output/                 # 产物输出
└── versions/               # 历史产物存档
```

## 产物说明

| 产物       | 格式        | 用途                 | 生成方式                   |
| -------- | --------- | ------------------ | ---------------------- |
| 单文件HTML  | `.html`   | 网页展示，7套主题+导航栏+目录面板 | `node build.js`        |
| 带精确书签PDF | `.pdf`    | 打印/阅读，两遍渲染精确页码     | `node build-pdf.js`    |
| Markdown | `.md`     | 文档编辑/版本控制          | `node build-md.js`     |
| 多文件阅读器   | `reader/` | 交互式网页阅读            | `node build-reader.js` |

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

- 生成大纲，编辑 `PROJECT.md`，包含：章节大纲表、Agent并行分工方案、进度追踪表

- **大纲中必须标注每章是否需要素材采集**（判断原则：包含"案例"/"数据"/"行业"/"实践"/"事故"→需要采集；纯理论/方法论→无需采集）

- **编辑** **`fragments/00-cover.md`**：把 frontmatter 中的 `title/subtitle/author/version` 占位文字改为真实信息（封面渲染只读这5个字段，且优先级高于 version.json）

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

> **【写作前必做】** 每个写作Agent在开始写作前，**必须先完成以下三步**：
>
> **【编辑纪律】** 对**已存在文件**的多处修改必须**逐处串行执行**（改一处确认一处）——
> 并行提交同文件多处编辑会基于旧快照互相覆盖、静默丢内容（两次写作实测事故）。
> 不同文件之间的编辑可以并行。
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
> **第三步：读取素材库**
>
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
2. **`##`** **= 大章节标题**（对应原HTML的 `<h2 class="section-title">`）

   - 格式：`## 第X章 章节标题`

   - 必须使用 `第X章` 前缀，方便构建系统识别

   - **X 用汉字数字**（第一章/第二章……），全书统一，不要混用"第1章"与"第一章"
3. **`###`** **= 小节标题**（对应原HTML的 `<h3>`）

   - 格式：`### X.Y 小节标题`（如 `### 1.1 小节标题`）

   - 必须使用 `X.Y` 编号前缀
4. **`####`** **= 子小节**（对应原HTML的 `<h4>`）

   - 格式：`#### X.Y.Z 子小节标题`（如 `#### 1.1.1 子小节标题`）

   - 必须使用 `X.Y.Z` 编号前缀
5. **绝大多数内容用 Markdown 原生语法**：粗体 `**文字**`、表格、列表、代码块、引用 `>`
6. **素材使用规则（写作阶段必须遵守）**：

   - ✅ 【素材优先】如果对应章节有素材文件（materials/chapter-{NN}/），案例和数据类内容应优先基于素材创作

   - ✅ 【禁止虚构案例】如果素材库中有真实案例，禁止为了"好看"而虚构案例，应基于素材中的真实案例改编

   - ✅ 【信源标注】正文引用的外部事实，标注来源素材文件名（如"来源：chapter-11-s01"）

   - ✅ 【时效检查】技术类内容涉及版本、特性时，标注信息的时效性（如"截至2025年1月"），过期内容标记⚠️

   - ✅ 【矛盾处理】素材之间存在矛盾时，并列呈现各方观点，标注争议点

   - ✅ 【高风险确认】涉及安全、法律、医疗、金融等高风险领域的内容，完成后提示用户确认

   - ✅ 【可选补充搜索】如果素材库缺少某个关键信息，可单次调用WebSearch补充，但不强制
7. **【强制】组件语法规则（lite 版）**：

组件全部使用 **Markdown 原生语法**，禁止在 MD 中写 HTML 标签（图形除外）。转换器在构建时自动生成组件结构和样式，写作者无需关心 CSS 类名，也不存在标签闭合问题。

#### 7.1 场景-语法映射表

| 当你要写...             | 必须使用             | 触发条件                |
| ------------------- | ---------------- | ------------------- |
| 章节核心要点、关键结论、重要总结    | `> [!TIP]`       | 每个Part至少 **≥1个**    |
| 安全警告、注意事项、禁忌、风险提示   | `> [!WARN]`      | 出现"危险/禁止/不要/风险/⚠️"等 |
| 参考信息、数据来源、背景延伸      | `> [!NOTE]`      | 出现"参考/来源/延伸/详情"等    |
| 重要概念、关键机制           | `> [!IMPORTANT]` | 核心机制强调              |
| 2步以上的操作步骤、配置流程、安装指南 | `:::steps`       | 有序操作**必须使用**        |
| 好坏对比、方案选型、优缺点比较     | `:::compare`     | 有对比内容**必须使用**       |
| 流程图、架构图             | 内嵌 SVG           | 直接写 `<svg>` 标签      |
| 术语强调                | `**粗体**`         | 原生 Markdown         |

#### 7.2 组件使用配额（写作 Agent 自查规范，构建门禁不强制拦截）

每个 `partNN-xxx.md` 文件：

- ✅ 提示块（\[!TIP]/\[!WARN]/\[!NOTE]）**每 Part 最多 2-3 个**，只放在真正的关键转折或高危警告处；**禁止每个小节都用要点块收尾**（强调块通胀会让"关键"失效）

- ✅ 如果包含操作步骤 → **必须**用 `:::steps`

- ✅ 如果包含对比内容 → **必须**用 `:::compare`

- ✅ 编排模式遵循 `research/writing-style.md`：相邻小节不重复同一模式，收尾方式轮换

- ❌ 避免整个 Part 零组件（纯文本输出，缺乏视觉层次）

#### 7.3 组件语法模板

完整语法与示例见 `references/components-quickref.md`（唯一规范，写作 Agent 必读）。速记：

```markdown
> [!TIP] 标题（可选）
> 正文，支持 **Markdown** 和 `行内代码`。

:::steps
- **步骤标题**：步骤说明
- **下一步标题**：说明
:::

:::compare
- **不推荐 ❌**：坏做法及原因
- **推荐 ✅**：好做法及原因
:::
```

#### ⚠️ HTML 使用边界（lite 版）

组件已 Markdown 原生化，**写作者无需写任何 HTML，也不存在标签闭合问题**：

- **禁止**：MD 中写结构类 HTML（`div`/`span`/`table`/`ul`/`strong`/自定义标签等），门禁（check-md.js）会拦截构建

- **仅允许**：内嵌 `<svg>`、`<figure>`/`<img>`（图形场景，详见 7.1）

- **禁止**：`<html>`、`<head>`、`<style>`、`<body>` 等页面级标签

- **组件内直接写 Markdown 语法**（粗体、表格、代码块均可），由转换器统一处理，不存在"HTML组件内Markdown不渲染"的历史问题

构建时的自动处理：

- 禁用 HTML 标签 → 构建前被门禁拦截（error），并给出改写建议

- 可疑写法（围栏未闭合、SVG不闭合等）→ 记录警告到 `output/convert-md-warnings.txt`，不阻断构建

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

| 图形类型        | 触发场景   | 推荐方式                                                | 格式           |
| ----------- | ------ | --------------------------------------------------- | ------------ |
| 架构图/流程图/示意图 | 技术书籍   | **大模型直接生成 SVG**                                     | 内嵌 SVG       |
| 数据图表        | 数据对比   | chart-image skill                                   | PNG          |
| 封面装饰图       | 需要视觉冲击 | canvas-design 或 byted-seedream-image-generate skill | PNG（assets/） |

**内嵌 SVG（推荐，默认方式）：**

直接在 Markdown 中写原始 SVG 代码，**不要用代码块包裹**：

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520">
  <!-- SVG 内容 -->
</svg>
```

**生成方式：**

1. **首选：在写作对话中直接让大模型生成**

   - 描述需要的图形，模型直接输出 SVG 代码

   - 复制粘贴到 Markdown 中（删除代码块标记）

   - 优势：写作流畅、迭代快、上下文匹配

**ASCII 图（允许但不推荐）**

**外部文件引用（特定场景）：**

仅用于封面、装饰图、数据图表。保存到 `assets/`，引用方式：

```html
<figure class="content-figure">
  <img src="../assets/chapter-01-diagram.svg" alt="架构图">
  <figcaption>图 1-1 架构总览</figcaption>
</figure>
```

⚠️ **重要约定**：

- 内嵌 SVG 不要用 ` ```svg ` 代码块包裹，否则会被当作代码显示

- 如果确实需要展示 SVG 代码（如教程），确保内容不是完整的 `<svg>...</svg>` 结构

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
node build-all.js --products all --version patch "修正错误"   # 1.0.0 → 1.0.1
node build-all.js --products all --version minor "更新内容"   # 1.0.0 → 1.1.0
node build-all.js --products all --version major "新增章节"   # 1.0.0 → 2.0.0
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

| 场景             | 推荐方式             | 说明                                |
| -------------- | ---------------- | --------------------------------- |
| 素材采集（写作前）      | 并行采集子Agent       | 搜索→WebFetch→深度提炼→保存到素材库           |
| 写作时需要引用数据/案例   | 查询本地素材库          | 读取 materials/chapter-{NN}/ 下的素材文件 |
| 写作时发现素材库缺少关键信息 | 可选：单次WebSearch补充 | 仅在素材库确实缺少时使用，不强制                  |
| 需要抓取网页内容解析     | WebFetch 工具      | 采集阶段使用，抓取全文后深度提炼                  |

## 产品门禁机制

```bash
node build-all.js --products all        # 默认全部，构建后检查4种产物
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
| 非法自定义标签          | `<callout>` 等必须改为 `<div class="...">` | ❌             |

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

若 `output/bookmarks.json` 已存在则优先复用其中的书签数据。相比 v3 的 offsetTop 方案，此方法能正确处理 CSS 强制分页、封面页不同 margin 等场景。

## 构建脚本参考

| 脚本                   | 功能                                                   |
| -------------------- | ---------------------------------------------------- |
| `build-all.js`       | 统一构建入口 + MD预处理 + 门禁                                  |
| `build.js`           | 单文件HTML构建                                            |
| `build-reader.js`    | 多文件阅读器构建                                             |
| `build-pdf.js`       | PDF生成（两遍渲染精确书签）                                      |
| `build-epub-pro.js`  | EPUB精排生成器（含代码高亮、图片打包）                                |
| `build-md.js`        | Markdown导出                                           |
| `check-md.js`        | ★ MD片段门禁检查（标题层级、YAML、禁用HTML标签）                       |
| `fix-md.js`          | ★ MD片段自动修复（标题层级规范化）                                  |
| `convert-md.js`      | ★ MD→HTML片段（组件Markdown原生化渲染）                         |
| `lib/fence-scan.js`  | ★ 共享围栏状态机（围栏判定的唯一实现）                                 |
| `scripts/rebuild.js` | 产物重建（node scripts/rebuild.js \[products] \[--clean]） |

## 参考资料

| 需要时读取  | 文件                                  | 内容                                      |
| ------ | ----------------------------------- | --------------------------------------- |
| 写MD片段时 | `references/components-quickref.md` | ★ 组件语法唯一规范（\[!TIP]/:::steps/:::compare） |
| 定制样式时  | `references/design-system.md`       | CSS变量、主题、MD片段规范                         |
| 新建项目时  | `templates/` 目录                     | 可直接复制的骨架文件                              |

