---
name: huashu-book-pdf2.1
description: 深度调研一个主题，生成书籍级PDF手册。模块化HTML片段架构 + 语义化版本管理 + 多Agent并行写作 + Playwright渲染PDF + 自动书签 + Markdown导出 + 多文件阅读器。
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

# huashu-book-pdf

深度调研一个主题，生成书籍级PDF手册。模块化HTML片段架构 + 语义化版本管理 + 多Agent并行写作 + Playwright渲染PDF + 自动书签 + Markdown导出 + 多文件阅读器。

## 触发词

- 做一本书 / 做个PDF手册 / 做个完整指南 / 做一本XX的手册
- 橙皮书 / 电子书 / 参考指南 / 完整手册 / 书籍级PDF

## 工作流程

五个阶段：调研 → 规划 → 写作 → 构建 → 版本更新。

## 前置依赖

- Node.js >= 16
- Playwright：`npm install playwright pdf-lib && npx playwright install chromium`
- Python 3（用于多文件阅读器生成，可选）

## 项目结构

```
{项目名}/
├── PROJECT.md          # 项目中枢（大纲+进度+数据速查）
├── styles.css          # 共享CSS（从templates/复制）
├── build.js            # HTML合并脚本（从templates/复制）
├── build-pdf.js        # Playwright PDF渲染 + 自动书签（从templates/复制）
├── build-md.js         # HTML → Markdown转换（从templates/复制）
├── build-reader.js     # HTML → 多文件阅读器（从templates/复制）
├── update.sh           # 一键版本更新 + 构建所有产物（从templates/复制）
├── version.json        # {"version":"1.0.0","build":1,"lastUpdate":"","title":""}
├── CHANGELOG.md        # 更新日志
├── fragments/          # 内容片段（纯HTML，不含<html><head>）
│   ├── 00-cover.html / 01-toc.html
│   ├── part{N}-{中文简称}.html
│   ├── appendix.html / 99-backpage.html
├── research/           # 调研资料
├── output/             # 产物输出目录
│   ├── {title}-v{version}.html      # 单文件HTML手册
│   ├── {title}-v{version}.pdf       # 带书签的PDF手册
│   ├── {title}-v{version}.md        # Markdown格式手册
│   └── reader/                       # 多文件交互式阅读器
└── versions/           # 历史产物存档
```

## 产物说明

| 产物 | 格式 | 用途 | 生成方式 |
|------|------|------|---------|
| 单文件HTML | `.html` | 原始内容文件，可用于网页展示 | `node build.js` |
| 带书签PDF | `.pdf` | 打印/阅读，带导航书签 | `node build-pdf.js` |
| Markdown | `.md` | 文档编辑/版本控制/导入其他平台 | `node build-md.js` |
| 多文件阅读器 | `reader/` | 交互式网页阅读，支持搜索/主题切换 | `node build-reader.js` |

## 快速启动

```bash
# 1. 初始化项目
bash scripts/init-project.sh <目录> <标题>

# 2. 修改 build.js 的 FRAGMENT_ORDER

# 3. 编辑 PROJECT.md（大纲+调研索引+进度）

# 4. 多Agent并行写作 → 确认大纲 → 并行写作

# 5. 构建所有产物
./update.sh all

# 或分步构建
node build.js        # HTML
node build-pdf.js    # PDF（带自动书签）
node build-md.js     # Markdown
node build-reader.js # 多文件阅读器
```

## 阶段1：调研

1. 与用户确定主题和目标读者
2. 拆分调研维度（6-10个方向）
3. 启动多个background agent并行调研，每份保存到 `{项目目录}/research/YYYY-MM-{关键词}.md`
4. 调研完成后汇总，进入规划

## 阶段2：规划

编辑项目目录下的 `PROJECT.md`，包含：
- 章节大纲表（Part + 节号 + 标题 + 核心内容 + 信息来源）
- 调研资料索引（路径 + 摘要 + 状态）
- Agent并行分工方案（关联性强的Part分给同一个agent）
- 进度追踪表 + 关键数据速查

修改 build.js 中的 `FRAGMENT_ORDER`。与用户确认大纲后进入写作。

## 阶段3：写作

多Agent并行，每个agent输出一个HTML片段。

每个写作agent需要：
1. 读取 [references/design-system.md](references/design-system.md) 了解可用组件和**片段结构规范**
2. 读取对应调研资料
3. 输出纯HTML片段（不含 `<html><head><style>` 标签，只写正文内容）

### ⚠️ 片段结构铁律（必须在agent prompt中明确告知）

每个正文片段**必须**遵循以下结构，否则PDF排版会出错：

```html
<div class="content">
<h2 class="section-title page-break" id="partN"><span class="num">§0N</span> 标题</h2>
<p class="section-en">English Title</p>
<p class="section-intro">概述</p>
<!-- 正文 -->
</div>
```

三条规则：
- **`<div class="content">`** 包裹 → 控制左右边距（没有它内容顶边）
- **`id="partN"`** 属性 → 目录锚点跳转需要，也是PDF书签的提取来源
- **`page-break` class** → 每章从新页开始

目录片段使用 `.toc` + `.toc-item` + `<a href="#partN">` 结构。详见 design-system.md。

## 阶段4：构建

### 4.1 构建单文件HTML

```bash
node build.js       # 合并片段 → HTML
```

### 4.2 构建带书签的PDF

```bash
node build-pdf.js   # Playwright → PDF（自动生成书签）
```

**自动书签生成（v3 新增）：**

`build-pdf.js` 会自动从 HTML 中提取章节结构并生成 PDF 书签（导航）：

1. 扫描 HTML 中所有 `<h2 class="section-title" id="xxx">` 元素
2. 自动提取 `id` 和标题文本作为书签
3. 用 Playwright 测量每个元素在文档中的绝对位置（`offsetTop` 累加）
4. 根据 `文档总高度 / PDF总页数` 动态计算每页高度
5. 将书签以 UTF-16BE with BOM 编码写入 PDF

**书签配置（在 build-pdf.js 中修改）：**
```javascript
const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null },    // id: null 表示不关联HTML元素
  { title: '目录', id: null },
];
```

**常见问题：**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 书签中文显示乱码 | `PDFString.of()` 对中文编码不正确 | 使用 `PDFHexString.of()` + UTF-16BE with BOM |
| 书签定位不准确 | 使用硬编码A4高度或视口相对坐标 | 用 `offsetTop` 累加获取绝对位置，动态计算页高 |

**依赖：** `npm install playwright pdf-lib && npx playwright install chromium`

### 4.3 构建Markdown

```bash
node build-md.js    # HTML → Markdown
```

将单文件HTML转换为Markdown格式，支持：
- 标题、段落、粗体/斜体
- 代码块、表格、列表
- 链接、HTML实体解码
- 自动添加YAML frontmatter

### 4.4 构建多文件阅读器

```bash
node build-reader.js  # HTML → 多文件交互式阅读框架
```

调用 `huashu-book-html-converter` 技能，将单文件HTML转换为：
- `reader/index.html` — 框架页（顶部工具栏 + 左侧目录 + iframe 内容区）
- `reader/shared/` — 共享样式和脚本（4套主题）
- `reader/content/` — 各Part独立文件
- `reader/images/` — 提取的图片资源

支持目录导航、搜索过滤、主题切换、书签管理、快捷键等功能。
兼容 `file://` 协议直接双击打开。

**依赖：** Python 3 + `huashu-book-html-converter` 技能

### 一键构建所有产物

```bash
./update.sh all     # 构建HTML + PDF + Markdown + Reader
```

## 阶段5：版本更新

修改 `fragments/*.html` 后运行：

```bash
./update.sh patch "修正某个错误"     # 1.0.0 → 1.0.1
./update.sh minor "更新内容"          # 1.0.0 → 1.1.0
./update.sh major "新增章节"          # 1.0.0 → 2.0.0
./update.sh build                     # 仅增加build号
./update.sh all                       # 仅构建所有产物（不更新版本）
```

自动：更新version.json → 写CHANGELOG → build HTML → 生成PDF → 生成Markdown → 生成阅读器 → 备份到versions/

## 产物输出目录

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

## 参考资料

| 需要时读取 | 文件 | 内容 |
|-----------|------|------|
| 写HTML片段时 | [references/design-system.md](references/design-system.md) | CSS变量、主题、组件HTML速查、视觉红线 |
| 新建项目时 | `templates/` 目录 | 可直接复制的骨架文件 |
| 多文件阅读器 | `huashu-book-html-converter` 技能 | HTML → 交互式阅读框架转换 |
