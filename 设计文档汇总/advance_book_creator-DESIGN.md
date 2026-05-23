# advance_book_creator 设计文档

## 概述

`advance_book_creator` 是一个书籍级PDF手册生成技能，采用 **MD-first（Markdown优先）架构**。它支持深度调研一个主题后，通过多Agent并行写作、6套主题系统、语义化版本管理，最终生成多种格式的产物：单文件HTML、带精确书签的PDF、Markdown文档和多文件交互式阅读器。

本技能是 `huashu-book-pdf-v2`（v3架构）的升级版（v4架构），核心改进在于将写作格式从HTML片段切换为Markdown片段，大幅提升了内容安全性和开发效率。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    advance_book_creator                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 调研阶段  │→│ 规划阶段  │→│ 写作阶段  │→│ 构建阶段  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│       ↓             ↓             ↓             ↓           │
│  research/*.md  PROJECT.md  fragments/*.md  output/         │
│                                                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              构建流水线                               │  │
│  │  *.md → convert-md.js → *.html片段 → build.js → HTML│  │
│  │                                  → build-pdf.js → PDF│  │
│  │                                  → build-md.js → MD  │  │
│  │                                  → build-reader.js   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 版本演进关系

| 版本 | 核心特征 | 片段格式 | 书签精度 |
|------|----------|----------|----------|
| v3 (huashu-book-pdf-v2) | HTML片段架构 | HTML | offsetTop估算 |
| v4 (advance_book_creator) | MD-first架构 | Markdown | 两遍渲染精确测量 |

## 核心模块

### 1. 项目初始化模块

通过 `scripts/init-project.sh` 脚本一键生成项目骨架，包含：
- `PROJECT.md` — 项目中枢（大纲+进度+数据速查）
- `version.json` — 语义化版本信息
- `fragments/` — Markdown片段目录
- `assets/` — 图片资源目录
- `research/` — 调研资料目录
- `output/` — 产物输出目录
- `versions/` — 历史产物存档目录
- 构建脚本（从 `templates/` 复制）

### 2. 调研模块

**工作流程：**
1. 与用户确定主题和目标读者
2. 拆分调研维度（6-12个方向）
3. 每个维度先调用 WebSearch / Task sub_agent 做网络搜索
4. 启动多个background agent并行调研
5. 每份调研保存到 `research/YYYY-MM-{关键词}.md`

**信息获取策略：**

| 场景 | 推荐方式 | 禁止方式 |
|------|---------|---------|
| 调研阶段收集背景知识 | Task(search) sub_agent | - |
| 写作时查具体数据/事实 | WebSearch 工具（单次） | - |
| 需要抓取网页内容解析 | WebFetch 工具 | - |
| 综合搜索引擎 | - | multi-search-engine skill（容易卡死） |

**信源规范：** 参考 `references/source-grade-simple.md`，所有调研内容必须标注信源等级、来源URL、获取时间。

### 3. 规划模块

核心产出为 `PROJECT.md`，包含：
- 章节大纲表
- 调研资料索引
- Agent并行分工方案
- 进度追踪表

### 4. 写作模块

**MD片段规范（铁律）：**

- YAML frontmatter 必填：`type`（cover/chapter/backpage）、`title`
- `##` = 大章节标题（对应原HTML的 `<h2 class="section-title">`）
- `###` = 小节标题（对应原HTML的 `<h3>`）
- `####` = 子小节（对应原HTML的 `<h4>`）
- 绝大多数内容用 Markdown 原生语法
- 特殊组件用内嵌HTML（callout/step/compare/flow/tag等）
- **禁止**在MD中写 `<html><head><style><body>` 等页面级标签

### 5. 构建模块

构建脚本体系：

| 脚本 | 功能 |
|------|------|
| `convert-md.js` | Markdown → HTML片段（支持内嵌HTML保护） |
| `convert-html.js` | HTML → HTML片段（兼容模式） |
| `build-all.js` | 统一构建入口 + MD预处理 + 产物门禁 |
| `build.js` | 单文件HTML构建 |
| `build-pdf.js` | PDF生成（两遍渲染精确书签） |
| `build-md.js` | Markdown导出 |
| `build-reader.js` | 多文件阅读器构建 |
| `update.sh` | 版本更新+构建 |

### 6. 版本管理模块

基于语义化版本（SemVer）：
```bash
./update.sh patch "修正错误"    # 1.0.0 → 1.0.1
./update.sh minor "更新内容"    # 1.0.0 → 1.1.0
./update.sh major "新增章节"    # 1.0.0 → 2.0.0
```

## 工作流程

### 模式A：自动连续生成（完整工作流）

```
1. 初始化项目 ──→ bash init-project.sh <目录> <标题>
2. 调研         ──→ 多Agent并行调研 → research/*.md
3. 规划         ──→ 编辑 PROJECT.md → 用户确认大纲
4. 写作         ──→ 多Agent并行输出 fragments/*.md
5. 构建         ──→ node build-all.js --products all
6. 版本更新     ──→ ./update.sh <patch|minor|major>
```

### 模式B：独立数据源调用

```bash
cd templates
node build-all.js --source ./input.md --type md --products all
node build-all.js --source ./html-folder/ --type html --products pdf
```

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 运行时 | Node.js >= 16 | 构建脚本执行环境 |
| PDF渲染 | Playwright (Chromium) | 网页→PDF渲染 |
| PDF操作 | pdf-lib | PDF书签写入 |
| 写作格式 | Markdown (YAML frontmatter) | 内容创作 |
| 样式系统 | CSS（6套主题） | 视觉呈现 |
| 项目初始化 | Bash脚本 | 项目骨架生成 |

## 数据流

```
用户输入主题
     ↓
[调研] WebSearch → research/*.md
     ↓
[规划] PROJECT.md（大纲+分工+进度）
     ↓
[写作] Agent输出 → fragments/00-cover.md, part01-xxx.md, ..., 99-backpage.md
     ↓
[转换] convert-md.js → 每个.md转为HTML片段（保护内嵌HTML）
     ↓
[合并] build.js → 单文件HTML（styles.css + 所有片段）
     ↓
[PDF]  build-pdf.js → 两遍渲染精确书签PDF
     ↓
[MD]   build-md.js → Markdown导出
     ↓
[Reader] build-reader.js → 多文件阅读器
     ↓
output/{产物文件}
```

## 关键设计决策

### 1. MD-first vs HTML-first

**决策**：v4采用Markdown作为主要写作格式。

**理由**：
- Markdown天然标签闭合安全，无需担心HTML标签未闭合
- 写作效率高，AI生成Markdown比生成严格闭合的HTML更可靠
- 版本控制友好，Git diff更清晰
- 特殊组件通过内嵌HTML实现，兼顾灵活性

**权衡**：需要 `convert-md.js` 将Markdown转换为HTML片段后再构建。

### 2. 两遍渲染精确书签

**决策**：采用两遍渲染法生成PDF书签。

**流程**：
1. **第一遍**：Playwright打开HTML → 每个h2/h3调用 `scrollIntoView()` → 用 `window.scrollY + getBoundingClientRect().top` 获取绝对位置 → 计算精确页码
2. **第二遍**：重新渲染并生成PDF
3. 用第一遍测得的精确页码创建书签

**相比v3的优势**：能正确处理CSS强制分页、封面页不同margin等场景。

### 3. 自动目录提取

**决策**：构建时从所有正文自动提取目录，无需单独编写 `01-toc.html`。

**实现**：`build.js` 在合并片段时自动扫描所有 `##` 标题，生成TOC结构。

### 4. 产物门禁机制

**决策**：构建后自动检查4种产物是否都成功生成。

```bash
node build-all.js --products all        # 默认全部，构建后检查4种产物
node build-all.js --products html,pdf   # 只生成指定产物
node build-all.js --products html --no-gate  # 跳过门禁
```

### 5. 内嵌HTML组件规范

允许在Markdown中使用内嵌HTML实现特殊组件：
- `callout callout-tip` — 提示块
- `callout callout-warn` — 警告块
- `callout callout-info` — 信息块
- `step` — 步骤流程
- `compare` — 对比块
- `tag-core` — 标签
- `flow` — 流程决策树

标签必须严格闭合，否则构建时会自动降级为纯文本块。

## 使用说明

### 前置依赖安装

```bash
npm install playwright pdf-lib
npx playwright install chromium
```

### 快速开始

```bash
# 1. 初始化项目
& "C:\Program Files\Git\bin\bash.exe" "scripts/init-project.sh" "D:\项目目录" "项目标题"

# 2. 编辑PROJECT.md，规划大纲

# 3. 多Agent并行写作，输出fragments/*.md

# 4. 构建所有产物
& "C:\Program Files\nodejs\node.exe" build-all.js --products all
```

### 图形与图表集成

| 图形类型 | 触发场景 | 使用技能 | 输出格式 |
|---------|---------|---------|---------|
| 架构图/流程图 | 技术书籍 | diagram-generator skill | SVG（嵌入HTML） |
| 数据图表 | 数据对比 | chart-image skill | PNG |
| 封面装饰图 | 需要视觉冲击 | canvas-design 或 byted-seedream-image-generate skill | PNG |

图片保存到 `assets/`，在MD中使用 `<figure class="content-figure">` 引用。
