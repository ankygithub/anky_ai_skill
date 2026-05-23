# advance_book_creator_v2 技能设计说明文档

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
│  │  2. 内嵌HTML保护（callout/step/figure等）                 │   │
│  │  3. HTML标签闭合检查与自动修复                            │   │
│  │  4. Markdown → HTML 转换                                 │   │
│  │  5. 目录自动提取生成                                      │   │
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
| 样式系统 | CSS Variables + 6套主题 | 主题切换 |
| 阅读器 | Vanilla JS + iframe | 多文件阅读体验 |

---

## 二、核心模块详解

### 2.1 convert-md.js - Markdown转换器

**职责**：将 Markdown 片段转换为 HTML 片段，是整个流程的核心转换引擎。

#### 2.1.1 主要功能

| 功能模块 | 说明 |
|---------|------|
| `parseFrontmatter()` | 解析 YAML frontmatter，提取元数据 |
| `protectInlineHtml()` | 保护内嵌HTML块不被MD转换器破坏 |
| `protectDivBlocks()` | 使用平衡标签匹配算法提取div块 |
| `mdToHtml()` | Markdown到HTML的核心转换逻辑 |
| `validateAndFixHtmlBlock()` | HTML标签闭合检查与自动修复 |
| `degradeToSafeBlock()` | 降级处理：损坏HTML→安全文本块 |

#### 2.1.2 HTML标签检查与修复机制

```javascript
// 检查标签开启/闭合数量是否匹配
function checkHtmlTagBalance(html) {
  const tagPairs = [
    { name: 'div', open: /<div\b/g, close: /<\/div>/g },
    { name: 'span', open: /<span\b/g, close: /<\/span>/g },
    { name: 'p', open: /<p\b/g, close: /<\/p>/g },
    // ...
  ];
  // 返回不平衡的标签列表
}

// 自动修复策略
function attemptAutoFix(html, issues) {
  // 开启标签多于闭合 → 补全闭合标签
  // 闭合标签多于开启 → 删除多余闭合标签
}

// 降级处理：保留文字，丢弃标签
function degradeToSafeBlock(brokenHtml, reason) {
  const textContent = brokenHtml.replace(/<[^>]+>/g, ' ');
  return `<div class="degraded-block" data-degrade-reason="${reason}">
    <p>[内容已降级为文本：${reason}]</p>
    <p>${textContent}</p>
  </div>`;
}
```

#### 2.1.3 输出报告

转换完成后生成两份报告：
- `output/convert-md-fix-report.json` - 机器可读格式
- `output/convert-md-fix-report.txt` - 人类可读格式

### 2.2 build.js - 单文件HTML构建器

**职责**：将 HTML 片段合并为完整的单文件 HTML。

#### 2.2.1 核心特性

- **片段排序**：强制顺序 cover → toc → 正文 → backpage
- **Mustache占位符替换**：支持 `{{TITLE}}`、`{{AUTHOR}}` 等变量
- **主题面板**：6套主题切换（默认暖棕、暖米色、科技蓝、卡其灰、森林绿、暗夜黑金）
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

#### 2.3.1 两遍渲染算法

```
第一遍（测量）：
  1. Playwright 打开 HTML
  2. 对每个书签元素调用 scrollIntoView()
  3. 用 window.scrollY + getBoundingClientRect().top 获取绝对位置
  4. 计算页码：Math.floor(absoluteY / A4_HEIGHT)

第二遍（生成）：
  1. 重新渲染 HTML
  2. 生成 PDF 文件
  3. 用第一遍测得的精确页码创建书签
```

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
- 主题切换（6套主题）
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
  └─ bash scripts/init-project.sh <目录> <标题>
     └─ 生成项目骨架（PROJECT.md、version.json、styles.css、构建脚本）

阶段2: 调研
  └─ 多Agent并行调研 → research/YYYY-MM-{关键词}.md

阶段3: 规划
  └─ 编辑 PROJECT.md（章节大纲、Agent分工方案）

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
  └─ ./update.sh patch\|minor\|major "更新说明"
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
   ├─ protectInlineHtml(body, sourceFile)
   │  ├─ 保护自闭合标签（hr）
   │  ├─ 保护 span 标签（检查闭合状态）
   │  ├─ 保护 img 标签
   │  ├─ 保护 figure 块（检查闭合状态）
   │  └─ protectDivBlocks() - 平衡标签匹配
   │     └─ validateAndFixHtmlBlock() - 检查修复每个div块
   │        ├─ checkHtmlTagBalance() - 检查标签平衡
   │        ├─ attemptAutoFix() - 尝试自动修复
   │        └─ degradeToSafeBlock() - 降级处理（无法修复时）
   │
   ├─ mdToHtml(protectedMd) - Markdown转换
   │  ├─ 提取目录数据（h2/h3）
   │  ├─ 处理代码块
   │  ├─ 处理表格
   │  ├─ 处理引用/callout
   │  ├─ 处理标题（生成全局唯一id）
   │  └─ 处理段落、列表、链接等
   │
   ├─ 恢复内嵌HTML块（替换占位符）
   └─ 生成 part{N}.html 片段文件

4. 生成目录片段（01-toc.html）
   └─ 从所有正文章节提取的目录数据生成

5. 输出生成报告
   └─ output/convert-md-fix-report.json & .txt
```

---

## 四、文件结构规范

### 4.1 项目目录结构

```
{项目名}/
├── PROJECT.md                  # 项目中枢（大纲+进度+数据速查）
├── DESIGN.md                   # 设计文档（含 rebuild 使用说明）
├── version.json                # 版本信息
├── styles.css                  # 共享CSS（6套主题）
│
├── build.js                    # 单文件HTML构建
├── build-pdf.js                # PDF渲染+精确书签
├── build-md.js                 # Markdown导出
├── build-reader.js             # 多文件阅读器构建
├── build-all.js                # 统一构建入口
├── convert-md.js               # MD→HTML转换器（含标签检查修复）
├── convert-html.js             # HTML→HTML片段（兼容模式）
├── update.sh                   # 版本更新脚本
│
├── scripts/                    # 辅助脚本
│   └── rebuild.sh              # 产物重建脚本
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
│   ├── convert-md-fix-report.json   # HTML修复报告
│   ├── convert-md-fix-report.txt
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

<div class="callout callout-tip">
<div class="callout-title">核心建议</div>
<p>提示内容</p>
</div>
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

## 五、错误处理与降级策略

### 5.1 HTML标签闭合问题处理

| 问题类型 | 处理策略 | 结果 |
|---------|---------|------|
| 简单缺失闭合（如`<div>内容`） | 自动补全 | `<div>内容</div>` |
| 多余闭合标签 | 自动删除 | 删除多余的`</div>` |
| 复杂嵌套错误 | 降级为文本块 | 保留文字，移除标签 |
| 标签未找到闭合 | 降级为文本块 | 保留文字，移除标签 |

### 5.2 降级块样式

降级后的内容会被包装为：

```html
<div class="degraded-block" data-degrade-reason="标签不平衡: <div>开2/闭1">
  <p><em>[内容已降级为文本：标签不平衡: <div>开2/闭1]</em></p>
  <p>原始文本内容...</p>
</div>
```

### 5.3 报告输出

每次构建都会生成详细报告：

- **convert-md-fix-report.txt**：人类可读的问题清单和修复记录
- **convert-md-fix-report.json**：机器可读的详细数据
- **build-health-report.json**：构建后整体健康状态

---

## 六、扩展与定制

### 6.0 产物重建（rebuild.sh）

**用途**：当 `fragments/` 下的 `.md` 内容已全部写完后，或修改了部分 `.md` 后需要重新生成所有产物时使用。

**位置**：项目目录下 `scripts/rebuild.sh`

#### 基本用法

```bash
# 默认：全量重建所有产物（html + reader + pdf + md）
bash scripts/rebuild.sh

# 只构建 HTML + PDF（跳过阅读器和MD导出，速度更快）
bash scripts/rebuild.sh html,pdf

# 强制清理模式：先删除旧 .html 片段和 output/ 内容，再全量重建
bash scripts/rebuild.sh all --clean

# 已有 .html 但无 .md 时跳过检查（直接用现有 html 构建）
bash scripts/rebuild.sh --skip-md-check
```

#### CLI 参数说明

| 参数 | 说明 |
|------|------|
| `all` / `html,pdf,reader,md` | 指定要构建的产物类型，逗号分隔 |
| `--clean` | 强制清理模式：先删 fragments/*.html 和 output/* 再重建 |
| `--skip-md-check` | 跳过 .md 文件存在性检查（适用于只有 .html 的场景） |

#### 工作原理

```
rebuild.sh 执行流程：

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
   ├─ [3] build-pdf.js:   Playwright 渲染 PDF + 两遍书签测量
   ├─ [4] build-md.js:    HTML 反导出为 Markdown
   └─ [5] 门禁检查：确认产物完整性

4. 输出结果摘要
```

#### 常见使用场景

| 场景 | 推荐命令 |
|------|---------|
| 首次构建 | `node build-all.js --products all` |
| 改了几个 `.md` 后重构建 | `bash scripts/rebuild.sh` |
| 只需要 HTML 和 PDF | `bash scripts/rebuild.sh html,pdf` |
| 构建结果有问题想彻底重来 | `bash scripts/rebuild.sh all --clean` |
| 手动删了 `fragments/*.html` 想从 MD 重建 | `bash scripts/rebuild.sh`（自动支持） |

#### 注意事项

- **TOC 是实时生成的**：每次运行 `convert-md.js` 都会从所有 `.md` 文件的标题重新提取目录，无需手动维护
- **Node.js 路径**：脚本会自动检测 node 路径，兼容沙箱/PowerShell/cmd 环境；如果报错 `node: command not found`，可手动设置 `PATH`
- **与 `update.sh` 的区别**：
  - `rebuild.sh` = 重建产物（不改变版本号）
  - `update.sh` = 版本号升级 + 自动构建（改变 version.json）

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

1. 在 `convert-md.js` 的 `protectInlineHtml()` 中添加保护规则
2. 在 `styles.css` 中添加组件样式
3. 在 `SKILL.md` 中更新组件规范

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
| v4 | 2025-05 | MD-first架构、HTML标签自动检查修复、降级处理机制 |
| v3 | 2025-03 | HTML片段架构、自动书签生成 |

---

## 十、附录

### 10.1 相关文件

- `SKILL.md` - 技能使用文档
- `references/design-system.md` - CSS设计系统规范
- `references/source-grade-simple.md` - 信源等级规范

### 10.2 调试技巧

1. **查看修复报告**：检查 `output/convert-md-fix-report.txt`
2. **健康检查**：查看 `output/build-health-report.json`
3. **片段预览**：直接打开 `fragments/*.html` 查看转换结果
4. **PDF书签调试**：查看 `output/bookmarks.json`

---

*文档生成时间：2025-05-21*
*技能版本：v4.0*
