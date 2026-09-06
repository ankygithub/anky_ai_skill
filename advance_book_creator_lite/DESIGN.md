# advance_book_creator_lite 技能设计说明文档

> 深度调研主题 → 生成书籍级PDF手册的完整技术方案

---

## 一、架构概述

### 1.1 核心设计理念

**MD-first架构**：以 Markdown 作为内容源格式，通过自动化转换生成所有产物。

```
┌─────────────────────────────────────────────────────────────────┐
│                        内容创作层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ 00-cover.md │  │ part01.md   │  │ 99-backpage │  ...        │
│  │   (封面)     │  │  (正文)      │  │   (尾页)     │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
└─────────┼────────────────┼────────────────┼────────────────────┘
          │                │                │
          └────────────────┴────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      转换处理层 (convert-md.js)                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. YAML frontmatter 解析                                │   │
│  │  2. ::: 围栏块提取（steps/compare）                       │   │
│  │  3. 合法HTML白名单保护（svg/figure/img/hr）               │   │
│  │  4. Markdown → HTML 转换（含 [!TIP] callout 识别）        │   │
│  │  5. 目录自动提取生成 + 围栏块渲染                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      产物生成层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ build.js │  │build-pdf │  │build-md  │  │build-    │        │
│  │ (单文件  │  │.js       │  │.js       │  │reader.js │        │
│  │  HTML)   │  │ (PDF)    │  │(Markdown)│  │(阅读器)  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      输出产物                                    │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐       │
│  │ {title}-v{x}   │ │ {title}-v{x}   │ │ {title}-v{x}   │       │
│  │    .html       │ │    .pdf        │ │    .md         │       │
│  │  (单文件网页)   │ │  (带精确书签)   │ │  (Markdown)    │       │
│  └────────────────┘ └────────────────┘ └────────────────┘       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    reader/  (多文件阅读器)                │   │
│  │  - index.html (框架页)                                   │   │
│  │  - shared/ (主题样式+交互脚本)                            │   │
│  │  - content/ (分章节内容页)                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 内容格式 | Markdown + YAML frontmatter | 源内容编写 |
| 转换引擎 | Node.js + 正则处理 | MD→HTML转换 |
| PDF渲染 | Playwright + pdf-lib | 精确书签PDF生成 |
| 样式系统 | CSS Variables + 7套主题 | 主题切换 |
| 阅读器 | Vanilla JS + iframe | 多文件阅读体验 |

---

## 二、核心模块详解

### 2.1 convert-md.js - Markdown转换器

**职责**：将 Markdown 片段转换为 HTML 片段，是整个流程的核心转换引擎。

#### 2.1.1 主要功能

| 功能模块 | 说明 |
|---------|------|
| `parseFrontmatter()` | 解析 YAML frontmatter，提取元数据 |
| `extractFenceBlocks()` | 提取 `:::steps` / `:::compare` 围栏块，替换为占位符 |
| `protectLegalHtml()` | 合法HTML白名单保护（svg/figure/img/hr），原样保留 |
| `scanForbiddenHtml()` | 扫描禁用HTML标签（div/span/table等），记录警告 |
| `mdToHtml()` | Markdown到HTML的核心转换（含 `[!TIP]` callout 识别与渲染） |
| `renderSteps()` / `renderCompare()` | 将围栏块渲染为 step-card / compare-block 结构 |

#### 2.1.2 组件渲染机制（lite 版）

组件语法 Markdown 原生化，**写作时不写 HTML，转换器生成组件结构**：

```javascript
// 1. 提取 ::: 围栏块（代码块内的 ::: 不误判）
const { md, fenceBlocks } = extractFenceBlocks(body);

// 2. 保护合法 HTML（svg/figure/img/hr），其余 HTML 只记录警告
const { md, htmlBlocks } = protectLegalHtml(md);

// 3. mdToHtml 内识别 [!TIP]/[!WARN]/[!NOTE] 引用块为 callout 占位符
//    占位符在行内转换（粗体/链接）完成后组装，callout 正文支持 Markdown

// 4. 围栏块渲染：内部列表项 → step-card / compare-block 结构
//    项内 **加粗** 成为标题，续行（表格/代码块）通过 mdToHtml 递归转换
```

#### 2.1.3 输出报告

转换完成后生成两份警告报告（不阻断构建）：
- `output/convert-md-warnings.json` - 机器可读格式
- `output/convert-md-warnings.txt` - 人类可读格式

硬拦截（禁用HTML标签、标题层级）由 check-md.js 门禁负责。

### 2.2 build.js - 单文件HTML构建器

**职责**：将 HTML 片段合并为完整的单文件 HTML。

#### 2.2.1 核心特性

- **片段排序**：强制顺序 cover → toc → 正文 → backpage
- **主题面板**：7套主题切换（锐利审稿print-proof默认、墨纸暖棕、暖米纸、科技蓝、卡其灰、森林绿、暗夜黑金）
- **阅读设置**：字号调节（小/中/大）、内容宽度调节
- **目录面板**：滑动式目录导航

#### 2.2.2 构建后健康检查

```javascript
function postBuildHealthCheck(htmlContent, outputFilePath) {
  // 1. 检查降级块数量
  // 2. 检查HTML标签平衡（整体）
  // 3. 检查关键结构完整性（封面、目录、内容、导航栏）
  // 4. 生成健康报告 output/build-health-report.json
}
```

### 2.3 build-pdf.js - PDF生成器（两遍渲染）

**职责**：生成带精确书签的PDF文件。

#### 2.3.1 测量 + 模拟分页算法

```
测量（Playwright 单次打开）：
  1. 打开 HTML，用 getBoundingClientRect().top + window.scrollY
     测量每个 h2.section-title 的绝对位置与章节内容高度
  2. 测量每个 h3 相对父 h2 的偏移（offsetFromParent）

模拟分页：
  1. 按 CSS 强制分页规则（每个 h2 章节从新页顶部开始）
     结合页面内容高度，推算每个 h2 的起始页码
  2. h3 页码 = 父章节起始页 + floor(offsetFromParent / 内容高度)

生成：
  1. 渲染 PDF（单次渲染）
  2. 按推算页码用 pdf-lib 创建书签（h2/h3 两级，UTF-16 中文）
```

若 `output/bookmarks.json` 已存在则优先复用其中的书签数据。

#### 2.3.2 书签结构

- 支持 h2 + h3 嵌套层级
- 封面、目录、尾页作为固定书签
- 使用 UTF-16BE with BOM 编码支持中文

### 2.4 build-md.js - Markdown导出器

**职责**：将 HTML 转换回 Markdown 格式。

**特点**：
- 零依赖，内置转换逻辑
- 支持标题、段落、粗体/斜体、代码块、表格、列表
- 自动添加 YAML frontmatter

### 2.5 build-reader.js - 多文件阅读器构建器

**职责**：生成交互式多文件网页阅读器。

#### 2.5.1 目录结构

```
reader/
├── index.html          # 框架页（导航栏+目录侧边栏+iframe内容区）
├── shared/
│   ├── theme.css       # 共享主题样式
│   ├── content.css     # 内容页样式
│   └── reader.js       # 交互逻辑（主题切换、字号调节、页面加载）
└── content/
    ├── cover.html      # 封面
    ├── toc.html        # 目录
    ├── part01.html     # 正文各部分
    └── ...
```

#### 2.5.2 交互特性

- 目录导航（点击跳转对应章节）
- 主题切换（7套主题）
- 字号调节（小/中/大）
- 内容宽度调节
- 响应式布局（移动端适配）
- 跨 iframe 设置同步（postMessage）

### 2.6 build-all.js - 统一构建入口

**职责**：协调所有构建步骤，提供统一的构建入口。

#### 2.6.1 构建流程

```
1. fragments 预处理（MD → HTML）
2. 构建单文件 HTML
3. 构建多文件阅读器
4. 构建 PDF（精确书签）
5. 构建 Markdown
6. 门禁检查（确认所有产物已生成）
7. 输出构建摘要
```

#### 2.6.2 CLI参数

| 参数 | 说明 |
|------|------|
| `--products html,reader,pdf,md` | 指定要构建的产物 |
| `--products all` | 构建所有产物（默认） |
| `--source <path>` | 指定数据源（独立数据源调用模式） |
| `--type md\|html` | 指定数据源类型 |
| `--no-gate` | 跳过门禁检查 |
| `--version major\|minor\|patch\|build` | 版本更新 |

---

## 三、数据流与处理流程

### 3.1 标准工作流程

```
阶段1: 初始化项目
  └─ node scripts/init-project.js <目录> <标题>
     └─ 生成项目骨架（PROJECT.md、version.json、styles.css、构建脚本）

阶段2: 规划
  └─ 编辑 PROJECT.md（章节大纲、Agent分工方案、采集标注）
  └─ 编辑 fragments/00-cover.md（真实书名/副标题/作者）

阶段3: 素材采集（按需）
  └─ 仅对标注"需要采集"的章节并行采集
     └─ 搜索 → WebFetch → 深度提炼 → materials/chapter-{NN}/s{MM}.md

阶段4: 写作
  └─ 多Agent并行写作 → fragments/*.md
     ├─ 00-cover.md（封面）
     ├─ part01-xxx.md（正文）
     └─ 99-backpage.md（尾页）

阶段5: 构建
  └─ node build-all.js --products all
     ├─ [0] convert-md.js: MD → HTML 片段
     ├─ [1] build.js: HTML片段 → 单文件HTML
     ├─ [2] build-reader.js: HTML片段 → 多文件阅读器
     ├─ [3] build-pdf.js: HTML → PDF（两遍渲染精确书签）
     ├─ [4] build-md.js: HTML → Markdown
     └─ [5] 门禁检查

阶段6: 版本更新
  └─ node build-all.js --products all --version patch|minor|major "更新说明"
```

### 3.2 转换详细流程

```
convert-md.js 处理单个MD文件：

1. 读取文件内容
   └─ 解析 YAML frontmatter（type, title, subtitle, author, version）

2. 根据 type 字段分派处理
   ├─ type=cover → generateCoverHtml()
   ├─ type=backpage → generateBackpageHtml()
   └─ type=chapter → 正文处理流程

3. 正文处理流程
   ├─ scanForbiddenHtml(body) - 扫描禁用HTML标签（div/span/table等）→ 记录警告
   │
   ├─ extractFenceBlocks(body) - 提取 :::steps / :::compare 围栏块
   │  └─ 代码块内的 ::: 不误判；未闭合围栏记录警告
   │
   ├─ protectLegalHtml(md) - 合法HTML白名单保护（svg/figure/img/hr）
   │  └─ 替换为占位符原样保留，不平衡仅记录警告
   │
   ├─ mdToHtml(protectedMd) - Markdown转换
   │  ├─ 提取目录数据（h2/h3）
   │  ├─ 处理代码块/行内代码/表格
   │  ├─ 识别 [!TIP]/[!WARN]/[!NOTE] 引用块 → callout 占位符
   │  ├─ 处理标题（生成全局唯一id）
   │  ├─ 处理段落、列表
   │  └─ 行内转换后组装 callout（正文支持Markdown）
   │
   ├─ 恢复合法HTML块 + 渲染围栏块（renderSteps/renderCompare）
   └─ 生成 part{N}.html 片段文件

4. 生成目录片段（01-toc.html）
   └─ 从所有正文章节提取的目录数据生成

5. 输出警告报告
   └─ output/convert-md-warnings.json & .txt
```

---

## 四、文件结构规范

### 4.1 项目目录结构

```
{项目名}/
├── PROJECT.md                  # 项目中枢（大纲+进度+数据速查）
├── DESIGN.md                   # 设计文档（含 rebuild 使用说明）
├── version.json                # 版本信息
├── styles.css                  # 共享CSS（7套主题）
│
├── build.js                    # 单文件HTML构建
├── build-pdf.js                # PDF渲染+精确书签
├── build-md.js                 # Markdown导出
├── build-reader.js             # 多文件阅读器构建
├── build-all.js                # 统一构建入口
├── convert-md.js               # MD→HTML转换器（组件Markdown原生化渲染）
├── check-md.js                 # MD片段门禁检查
├── fix-md.js                   # MD片段自动修复（标题层级）
│
├── lib/                        # 共享模块
│   └── fence-scan.js           # 共享围栏状态机
│
├── scripts/                    # 辅助脚本
│   └── rebuild.js              # 产物重建脚本
│
├── fragments/                  # 内容片段
│   ├── 00-cover.md             # 封面（YAML frontmatter）
│   ├── part01-xxx.md           # 正文Part
│   ├── part02-xxx.md           # ...
│   └── 99-backpage.md          # 尾页
│
├── assets/                     # 图片资源
├── research/                   # 调研资料 + MD模板参考
├── output/                     # 产物输出
│   ├── {title}-v{version}.html
│   ├── {title}-v{version}.pdf
│   ├── {title}-v{version}.md
│   ├── reader/
│   ├── bookmarks.json
│   ├── convert-md-warnings.json     # 转换警告报告（不阻断构建）
│   ├── convert-md-warnings.txt
│   └── build-health-report.json     # 构建健康报告
│
└── versions/                   # 历史产物存档
```

### 4.2 Markdown片段规范

#### 封面（00-cover.md）

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

#### 正文（part01-xxx.md）

```markdown
---
type: chapter
title: 第一章 章节标题
---

## 第一章 章节标题

### 1.1 小节标题

正文内容，支持 **粗体**、*斜体*、`行内代码`。

> [!TIP]
> 提示内容（Markdown 原生组件语法）
```

#### 尾页（99-backpage.md）

```markdown
---
type: backpage
---

## 文档结束

书籍标题 v1.0.0
作者名
```

---

## 五、错误处理与门禁策略（lite 版）

**设计原则**：组件语法 Markdown 原生化后，"HTML损坏"这一整类问题从源头消失。处理策略从"容忍并修复"转为"严查并拦截"。

### 5.1 分级处理

| 问题类型 | 处理层级 | 结果 |
|---------|---------|------|
| 禁用 HTML 标签（div/span/table/旧组件等） | check-md.js 门禁（error） | **阻断构建**，给出组件语法改写建议 |
| 非法自定义标签（`<callout-tip>` 等） | check-md.js 门禁（error） | **阻断构建** |
| YAML 缺失 / 标题层级错误 | build-all 内置门禁 + check-md | 阻断构建；层级错误可 `fix-md.js` 自动修复 |
| 围栏未闭合 / SVG不闭合 / 未知围栏类型 | convert-md 警告 | 不阻断，记录到 convert-md-warnings.txt |
| 标题跳级 | warning | 不阻断构建 |

### 5.2 报告输出

- **convert-md-warnings.txt**：人类可读的警告清单（围栏/HTML/对比块条目数问题）
- **convert-md-warnings.json**：机器可读的详细数据
- **build-health-report.json**：构建后整体健康状态
- **output/error-*.log**：门禁失败时的详细错误日志

---

## 六、扩展与定制

### 6.0 产物重建（rebuild.js）

**用途**：当 `fragments/` 下的 `.md` 内容已全部写完后，或修改了部分 `.md` 后需要重新生成所有产物时使用。

**位置**：项目目录下 `scripts/rebuild.js`

#### 基本用法

```bash
# 默认：全量重建所有产物（html + reader + pdf + md）
node scripts/rebuild.js

# 只构建 HTML + PDF（跳过阅读器和MD导出，速度更快）
node scripts/rebuild.js html,pdf

# 强制清理模式：先删除旧 .html 片段和 output/ 内容，再全量重建
node scripts/rebuild.js all --clean

# 已有 .html 但无 .md 时跳过检查（直接用现有 html 构建）
node scripts/rebuild.js --skip-md-check
```

#### CLI 参数说明

| 参数 | 说明 |
|------|------|
| `all` / `html,pdf,reader,md` | 指定要构建的产物类型，逗号分隔 |
| `--clean` | 强制清理模式：先删 fragments/*.html 和 output/* 再重建；**会自动附加 `--no-gate` 跳过产物门禁**（清理后部分构建时门禁必然失败） |
| `--skip-md-check` | 跳过 .md 文件存在性检查（适用于只有 .html 的场景） |

#### 工作原理

```
rebuild.js 执行流程：

1. 环境检测
   ├─ 检查 build-all.js 是否存在
   └─ 统计 fragments/ 下 .md 和 .html 文件数

2. 可选清理（--clean 模式）
   ├─ 删除 fragments/*.html（全部旧的 HTML 片段）
   └─ 清空 output/ 目录

3. 调用 build-all.js（核心构建链）
   ├─ [0] convert-md.js:  扫描 *.md → 生成 *.html（含实时 TOC）
   │   注意：每次运行会先清空旧 *.html 再重建，所以无需手动删除
   ├─ [1] build.js:       合并 *.html → 单文件 HTML
   ├─ [2] build-reader.js: 生成多文件阅读器
   ├─ [3] build-pdf.js:   Playwright 渲染 PDF + 模拟分页书签
   ├─ [4] build-md.js:    HTML 反导出为 Markdown
   └─ [5] 门禁检查：确认产物完整性

4. 输出结果摘要
```

#### 常见使用场景

| 场景 | 推荐命令 |
|------|---------|
| 首次构建 | `node build-all.js --products all` |
| 改了几个 `.md` 后重构建 | `node scripts/rebuild.js` |
| 只需要 HTML 和 PDF | `node scripts/rebuild.js html,pdf` |
| 构建结果有问题想彻底重来 | `node scripts/rebuild.js all --clean` |
| 手动删了 `fragments/*.html` 想从 MD 重建 | `node scripts/rebuild.js`（自动支持） |

#### 注意事项

- **TOC 是实时生成的**：每次运行 `convert-md.js` 都会从所有 `.md` 文件的标题重新提取目录，无需手动维护
- **Node 路径**：脚本使用 `process.execPath` 启动构建，无 bash/PATH 依赖
- **与版本更新的区别**：
  - `rebuild.js` = 重建产物（不改变版本号）
  - `build-all.js --version patch|minor|major` = 版本号升级 + 自动构建（改变 version.json）

### 6.1 添加新主题

在 `styles.css` 中添加：

```css
[data-theme="new-theme"] {
  --accent-primary: #xxx;
  --accent-secondary: #xxx;
  /* ... */
}
```

在 `build.js` 的 `themes` 数组中添加主题配置。

### 6.2 添加新组件

1. 在 `convert-md.js` 中新增 `:::名称` 围栏解析与渲染函数（参考 renderSteps/renderCompare）
2. 在 `styles.css` 中添加组件样式（结构类名由转换器生成，写作者不感知）
3. 在 `references/components-quickref.md` 中更新语法规范（唯一规范来源）
4. 视需要同步 epub-styles.css（EPUB 产物样式）

### 6.3 自定义PDF书签

修改 `build-pdf.js` 中的 `CUSTOM_BOOKMARKS` 数组：

```javascript
const CUSTOM_BOOKMARKS = [
  { title: '封面', id: null, isCustom: true, position: 'first' },
  { title: '目录', id: null, isCustom: true, position: 'toc' },
  // 添加自定义书签
  { title: '附录', id: 'appendix', isCustom: true },
];
```

---

## 七、性能考虑

### 7.1 优化点

| 优化项 | 说明 |
|--------|------|
| HTML保护机制 | 内嵌HTML块使用占位符保护，避免被MD转换器破坏 |
| 两遍渲染PDF | 第一遍测量精确页码，第二遍生成，避免重复计算 |
| 异步处理 | Playwright 操作使用 async/await，避免阻塞 |
| 文件缓存 | 片段文件按需读取，避免重复IO |

### 7.2 大文档处理建议

- 将内容拆分为多个 `part{N}.md` 文件
- 每个文件控制在 5000-10000 字以内
- 图片资源使用相对路径引用

---

## 八、依赖清单

### 8.1 必需依赖

```bash
npm install playwright pdf-lib
npx playwright install chromium
```

### 8.2 可选依赖

- Python 3（用于某些高级功能，当前版本未使用）

### 8.3 运行时依赖

- Node.js >= 16
- Chromium（Playwright自动管理）

---

## 九、版本历史

| 版本 | 日期 | 主要改进 |
|------|------|---------|
| lite | 2026-09 | 组件 Markdown 原生化（[!TIP]/:::steps/:::compare）、删除HTML保护修复链、门禁改禁用清单策略、组件规范单一来源化 |
| v4 | 2025-05 | MD-first架构、HTML标签自动检查修复、降级处理机制 |
| v3 | 2025-03 | HTML片段架构、自动书签生成 |

---

## 十、附录

### 10.1 相关文件

- `SKILL.md` - 技能使用文档
- `references/design-system.md` - CSS设计系统规范
- `references/source-grade-simple.md` - 信源等级规范

### 10.2 调试技巧

1. **查看警告报告**：检查 `output/convert-md-warnings.txt`
2. **健康检查**：查看 `output/build-health-report.json`
3. **片段预览**：直接打开 `fragments/*.html` 查看转换结果
4. **PDF书签调试**：查看 `output/bookmarks.json`

---

*文档生成时间：2026-09-04*
*技能版本：lite 1.0*
