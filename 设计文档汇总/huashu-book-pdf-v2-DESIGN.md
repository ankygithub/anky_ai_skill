# huashu-book-pdf-v2 设计文档

## 概述

`huashu-book-pdf-v2`（又名 huashu-book-pdf2.1）是一个采用 **模块化HTML片段架构** 的书籍级PDF手册生成技能。它是 v3 架构的代表实现，通过 HTML 片段写作、语义化版本管理、多Agent并行写作、Playwright渲染PDF、自动书签、Markdown导出和多文件阅读器，提供完整的书籍生成能力。

本技能是 `advance_book_creator`（v4架构）的前身，核心差异在于使用HTML而非Markdown作为写作格式。

## 架构设计

### 整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                    huashu-book-pdf-v2                            │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 阶段1    │→│ 阶段2    │→│ 阶段3    │→│ 阶段4    │       │
│  │ 调研     │  │ 规划     │  │ 写作     │  │ 构建     │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│       ↓             ↓             ↓             ↓              │
│  research/*.md  PROJECT.md  fragments/*.html  output/          │
│                                                        │
│  ┌────────────────────────────────────────────────────────────┐│
│  │              构建流水线                                     ││
│  │  fragments/*.html → build.js → 单文件HTML                  ││
│  │                  → build-pdf.js → 带书签PDF                ││
│  │                  → build-md.js → Markdown                  ││
│  │                  → build-reader.js → 多文件阅读器           ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │              版本管理                                       ││
│  │  version.json → update.sh → versions/ 历史存档              ││
│  └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### 版本体系对比

| 维度 | huashu-book-pdf-v2 (v3) | advance_book_creator (v4) |
|------|-------------------------|---------------------------|
| 写作格式 | HTML片段 | Markdown片段 |
| 目录生成 | 手动编写 01-toc.html | 构建时自动提取 |
| 封面/尾页 | HTML模板 | MD格式 + YAML frontmatter |
| PDF书签 | offsetTop估算 | 两遍渲染精确测量 |
| 片段结构 | 需严格包裹 `.content` + `page-break` | 自然Markdown结构 |

## 核心模块

### 1. 调研模块

**工作流程：**
1. 与用户确定主题和目标读者
2. 拆分调研维度（6-10个方向）
3. 启动多个background agent并行调研
4. 每份调研保存到 `{项目目录}/research/YYYY-MM-{关键词}.md`
5. 调研完成后汇总，进入规划阶段

### 2. 规划模块

核心产出为 `PROJECT.md`，包含：
- 章节大纲表（Part + 节号 + 标题 + 核心内容 + 信息来源）
- 调研资料索引（路径 + 摘要 + 状态）
- Agent并行分工方案（关联性强的Part分给同一个agent）
- 进度追踪表 + 关键数据速查

同时需要修改 `build.js` 中的 `FRAGMENT_ORDER` 配置片段顺序。

### 3. 写作模块

**多Agent并行写作：** 每个agent输出一个HTML片段。

**写作规范（片段结构铁律）：**

每个正文片段**必须**遵循以下HTML结构：

```html
<div class="content">
  <h2 class="section-title page-break" id="partN">
    <span class="num">§0N</span> 标题
  </h2>
  <p class="section-en">English Title</p>
  <p class="section-intro">概述</p>
  <!-- 正文内容 -->
</div>
```

**三条规则：**
1. `<div class="content">` 包裹 → 控制左右边距（没有它内容顶边）
2. `id="partN"` 属性 → 目录锚点跳转需要，也是PDF书签的提取来源
3. `page-break` class → 每章从新页开始

**目录片段结构：**
```html
<div class="toc">
  <div class="toc-item">
    <a href="#partN">章节标题</a>
  </div>
</div>
```

**每个写作agent需要：**
1. 读取 `references/design-system.md` 了解可用组件和片段结构规范
2. 读取对应调研资料
3. 输出纯HTML片段（不含 `<html><head><style>` 标签，只写正文内容）

### 4. 构建模块

#### 4.1 构建单文件HTML

```bash
node build.js
```

将 `fragments/` 目录下的所有HTML片段按 `FRAGMENT_ORDER` 顺序合并，注入 `styles.css`，生成完整的单文件HTML。

#### 4.2 构建带书签的PDF

```bash
node build-pdf.js
```

**自动书签生成流程：**
1. 扫描HTML中所有 `<h2 class="section-title" id="xxx">` 元素
2. 自动提取 `id` 和标题文本作为书签
3. 用Playwright测量每个元素在文档中的绝对位置（`offsetTop` 累加）
4. 根据 `文档总高度 / PDF总页数` 动态计算每页高度
5. 将书签以 UTF-16BE with BOM 编码写入PDF

**书签配置：**
```javascript
const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null },    // id: null 表示不关联HTML元素
  { title: '目录', id: null },
];
```

**常见问题解决：**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 书签中文显示乱码 | `PDFString.of()` 对中文编码不正确 | 使用 `PDFHexString.of()` + UTF-16BE with BOM |
| 书签定位不准确 | 使用硬编码A4高度或视口相对坐标 | 用 `offsetTop` 累加获取绝对位置，动态计算页高 |

#### 4.3 构建Markdown

```bash
node build-md.js
```

将单文件HTML转换为Markdown格式，支持：
- 标题、段落、粗体/斜体
- 代码块、表格、列表
- 链接、HTML实体解码
- 自动添加YAML frontmatter

#### 4.4 构建多文件阅读器

```bash
node build-reader.js
```

调用 `huashu-book-html-converter` 技能，将单文件HTML转换为：
- `reader/index.html` — 框架页（顶部工具栏 + 左侧目录 + iframe 内容区）
- `reader/shared/` — 共享样式和脚本（4套主题）
- `reader/content/` — 各Part独立文件
- `reader/images/` — 提取的图片资源

支持目录导航、搜索过滤、主题切换、书签管理、快捷键等功能。兼容 `file://` 协议直接双击打开。

### 5. 版本管理模块

```bash
./update.sh patch "修正某个错误"     # 1.0.0 → 1.0.1
./update.sh minor "更新内容"          # 1.0.0 → 1.1.0
./update.sh major "新增章节"          # 1.0.0 → 2.0.0
./update.sh build                     # 仅增加build号
./update.sh all                       # 仅构建所有产物（不更新版本）
```

**自动流程：** 更新version.json → 写CHANGELOG → build HTML → 生成PDF → 生成Markdown → 生成阅读器 → 备份到versions/

## 工作流程

```
阶段1：调研
  ↓ 确定主题和读者 → 拆分调研维度 → 多Agent并行调研 → 汇总
  ↓
阶段2：规划
  ↓ 编辑 PROJECT.md → 修改 FRAGMENT_ORDER → 用户确认大纲
  ↓
阶段3：写作
  ↓ 多Agent并行输出 fragments/*.html（严格遵循片段结构铁律）
  ↓
阶段4：构建
  ↓ build.js → HTML
  ↓ build-pdf.js → PDF（带自动书签）
  ↓ build-md.js → Markdown
  ↓ build-reader.js → 多文件阅读器
  ↓
阶段5：版本更新
  ↓ ./update.sh <patch|minor|major|build|all>
```

### 项目结构

```
{项目名}/
├── PROJECT.md          # 项目中枢（大纲+进度+数据速查）
├── styles.css          # 共享CSS（从templates/复制）
├── build.js            # HTML合并脚本（FRAGMENT_ORDER配置）
├── build-pdf.js        # Playwright PDF渲染 + 自动书签
├── build-md.js         # HTML → Markdown转换
├── build-reader.js     # HTML → 多文件阅读器
├── update.sh           # 一键版本更新 + 构建所有产物
├── version.json        # {"version":"1.0.0","build":1,"lastUpdate":"","title":""}
├── CHANGELOG.md        # 更新日志
├── fragments/          # 内容片段（纯HTML，不含<html><head>）
│   ├── 00-cover.html   # 封面
│   ├── 01-toc.html     # 目录（需手动编写）
│   ├── part{N}-{中文简称}.html  # 正文Part
│   ├── appendix.html   # 附录
│   └── 99-backpage.html # 尾页
├── research/           # 调研资料
├── output/             # 产物输出目录
│   ├── {title}-v{version}.html
│   ├── {title}-v{version}.pdf
│   ├── {title}-v{version}.md
│   └── reader/
└── versions/           # 历史产物存档
```

### 产物说明

| 产物 | 格式 | 用途 | 生成方式 |
|------|------|------|---------|
| 单文件HTML | `.html` | 原始内容文件，可用于网页展示 | `node build.js` |
| 带书签PDF | `.pdf` | 打印/阅读，带导航书签 | `node build-pdf.js` |
| Markdown | `.md` | 文档编辑/版本控制/导入其他平台 | `node build-md.js` |
| 多文件阅读器 | `reader/` | 交互式网页阅读，支持搜索/主题切换 | `node build-reader.js` |

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 运行时 | Node.js >= 16 | 构建脚本执行环境 |
| PDF渲染 | Playwright (Chromium) | 网页→PDF渲染 |
| PDF操作 | pdf-lib | PDF书签写入 |
| 写作格式 | HTML片段（无<html><head>） | 内容创作 |
| 样式系统 | CSS（从templates/复制） | 视觉呈现 |
| 阅读器转换 | huashu-book-html-converter 技能 + Python 3 | 多文件阅读器生成 |
| 版本管理 | Bash脚本 + JSON | 语义化版本更新 |

## 数据流

```
用户输入主题
     ↓
[调研] 多Agent并行调研 → research/*.md
     ↓
[规划] PROJECT.md（大纲+分工+进度）
       build.js 修改 FRAGMENT_ORDER
     ↓
[写作] Agent输出 → fragments/
       ├── 00-cover.html
       ├── 01-toc.html（手动编写目录）
       ├── part01-xxx.html
       ├── part02-xxx.html
       └── 99-backpage.html
     ↓
[构建HTML] build.js
     合并 styles.css + 所有片段 → 单文件HTML
     ↓
[构建PDF] build-pdf.js
     Playwright打开HTML → offsetTop测量 → 书签编码 → PDF
     ↓
[构建MD] build-md.js
     HTML解析 → Markdown转换 → frontmatter添加
     ↓
[构建Reader] build-reader.js
     HTML拆分 → 框架页 + 内容页 + 共享样式
     ↓
[版本更新] update.sh
     version.json更新 → CHANGELOG写入 → 产物备份到versions/
     ↓
output/{产物文件}
```

## 关键设计决策

### 1. HTML片段 vs Markdown

**决策**：v2采用HTML片段作为写作格式。

**理由（v2时代的考量）：**
- HTML可以直接映射到CSS类名，视觉控制更精确
- `class="section-title page-break"` 等类名直接控制排版行为
- 不需要转换步骤，直接合并即可构建

**权衡（v4演进的原因）：**
- HTML标签需要严格闭合，AI容易生成不完整标签
- 目录需要手动编写 `01-toc.html`
- 书签精度受限于offsetTop估算

### 2. 片段结构铁律

**决策**：强制要求每个片段使用 `.content` 包裹 + `page-break` + `id` 锚点。

**理由：**
- `.content` 控制左右边距，没有它内容会顶边
- `page-break` 确保每章从新页开始，保证PDF排版质量
- `id` 属性是目录锚点和PDF书签的提取来源

**影响：** 写作Agent必须在prompt中明确告知此规范，否则PDF排版会出错。

### 3. 自动书签生成

**决策**：通过 `offsetTop` 累加获取元素绝对位置，动态计算页高来生成书签。

**理由：**
- 相比硬编码A4高度，动态计算能适应不同内容量
- UTF-16BE with BOM编码解决中文书签乱码问题

**局限（v4改进点）：** 无法正确处理CSS强制分页、封面页不同margin等场景。

### 4. 多文件阅读器独立转换

**决策**：多文件阅读器通过 `huashu-book-html-converter` 技能独立转换生成。

**理由：**
- 职责分离，构建脚本专注合并，转换技能专注拆分
- 支持4套主题切换，提供完整的交互式阅读体验
- 兼容 `file://` 协议，无需服务器即可使用

### 5. FRAGMENT_ORDER 配置

**决策**：在 `build.js` 中通过 `FRAGMENT_ORDER` 数组控制片段合并顺序。

**理由：**
- 显式控制顺序，避免文件系统排序不确定性
- 便于Agent在规划阶段修改顺序
- 灵活性高，支持按需增删片段

## 使用说明

### 前置依赖安装

```bash
# Node.js依赖
npm install playwright pdf-lib
npx playwright install chromium

# Python 3（多文件阅读器生成，可选）
```

### 快速开始

```bash
# 1. 初始化项目
bash scripts/init-project.sh <目录> <标题>

# 2. 修改 build.js 的 FRAGMENT_ORDER

# 3. 编辑 PROJECT.md（大纲+调研索引+进度）

# 4. 多Agent并行写作 → 确认大纲 → 并行写作
#    每个Agent必须遵循片段结构铁律

# 5. 构建所有产物
./update.sh all

# 或分步构建
node build.js        # HTML
node build-pdf.js    # PDF（带自动书签）
node build-md.js     # Markdown
node build-reader.js # 多文件阅读器
```

### 版本更新

```bash
./update.sh patch "修正某个错误"     # 1.0.0 → 1.0.1
./update.sh minor "更新内容"          # 1.0.0 → 1.1.0
./update.sh major "新增章节"          # 1.0.0 → 2.0.0
./update.sh build                     # 仅增加build号
./update.sh all                       # 仅构建所有产物（不更新版本）
```

### 产物输出目录

```
output/
├── {title}-v{version}.html      # 单文件HTML手册
├── {title}-v{version}.pdf       # 带书签的PDF手册
├── {title}-v{version}.md        # Markdown格式手册
└── reader/                       # 多文件交互式阅读器
    ├── index.html
    ├── shared/
    ├── content/
    └── images/
```

### 参考资料

| 需要时读取 | 文件 | 内容 |
|-----------|------|------|
| 写HTML片段时 | `references/design-system.md` | CSS变量、主题、组件HTML速查、视觉红线 |
| 新建项目时 | `templates/` 目录 | 可直接复制的骨架文件 |
| 多文件阅读器 | `huashu-book-html-converter` 技能 | HTML → 交互式阅读框架转换 |
