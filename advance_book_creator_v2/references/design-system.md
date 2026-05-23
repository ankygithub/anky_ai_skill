# 华书 v3 设计系统

## CSS变量系统（6套主题）

### 基础变量（默认暖棕主题）

```css
:root {
  --font-scale: 1;                    /* 字号缩放 */
  --content-width-scale: 1;           /* 内容宽度缩放 */
  --content-max-width: 900px;         /* 内容最大宽度 */
  --bg-primary: #FFFFFF;              /* 主背景（纯白） */
  --bg-secondary: #FAFAF9;            /* 次要背景 */
  --bg-card: #FFFFFF;                 /* 卡片背景 */
  --bg-elevated: #F5F5F4;             /* 提升背景 */
  --text-primary: #1C1917;            /* 主文字 */
  --text-secondary: #78716C;          /* 次要文字 */
  --text-muted: #A8A29E;              /* 弱化文字 */
  --accent-primary: #92400E;          /* 主强调色 */
  --accent-secondary: #78350F;        /* 次强调色 */
  --accent-cyan: #0F766E;             /* 青色强调 */
  --accent-rose: #BE123C;             /* 玫瑰色强调 */
  --accent-violet: #6D28D9;           /* 紫色强调 */
  --border-subtle: rgba(146, 64, 14, 0.12);   /* 细边框 */
  --border-accent: rgba(146, 64, 14, 0.3);    /* 强调边框 */
  --shadow-warm: 0 8px 32px rgba(146, 64, 14, 0.08);  /* 温暖阴影 */
  --shadow-deep: 0 20px 60px rgba(0, 0, 0, 0.1);      /* 深度阴影 */
  --gradient-primary: linear-gradient(135deg, #92400E 0%, #D97706 50%, #92400E 100%);
  --code-bg: #FAFAF9;                 /* 代码背景 */
  --code-text: #44403C;               /* 代码文字 */
  --table-head-bg: linear-gradient(135deg, rgba(146, 64, 14, 0.08), rgba(146, 64, 14, 0.03));
  --table-border: rgba(0, 0, 0, 0.05);
  --note-info-bg: rgba(15, 118, 110, 0.06);
  --note-tip-bg: rgba(146, 64, 14, 0.08);
  --note-warn-bg: rgba(190, 18, 60, 0.06);
  --note-violet-bg: rgba(109, 40, 217, 0.06);
  --compare-bad-bg: rgba(190, 18, 60, 0.05);
  --compare-bad-border: rgba(190, 18, 60, 0.15);
  --compare-good-bg: rgba(15, 118, 110, 0.05);
  --compare-good-border: rgba(15, 118, 110, 0.15);
  --toc-active-bg: rgba(146, 64, 14, 0.08);
  --nav-bg: rgba(255, 255, 255, 0.9);
}
```

### 6套主题

1. **默认暖棕** (`:root`) — 棕色系，温暖阅读
2. **暖米色** (`[data-theme="warm-beige"]`) — 米色背景，柔和舒适
3. **科技蓝** (`[data-theme="tech-blue"]`) — 蓝色系，现代清爽
4. **卡其灰** (`[data-theme="khaki-gray"]`) — 灰色系，极简专业
5. **森林绿** (`[data-theme="forest-green"]`) — 绿色系，自然清新
6. **暗夜黑金** (`[data-theme="dark-gold"]`) — 深色背景，金色强调

## 组件速查

### 封面
```html
<div class="cover">
  <div class="cover-badge">参考指南</div>
  <h1>标题</h1>
  <p class="cover-subtitle">副标题</p>
  <div class="cover-meta">
    <span>作者</span>
    <span>版本</span>
  </div>
</div>
```

### 目录
```html
<div class="toc">
  <h2>目录</h2>
  <ul>
    <li><a href="#part1"><span class="toc-num">§01</span><span class="toc-title-text">标题</span></a></li>
  </ul>
</div>
```

### 章节标题（PDF书签兼容）
```html
<!-- 必须保持此结构，否则PDF书签提取失败 -->
<h2 class="section-title page-break" id="part1">
  <span class="num">§01</span> 章节标题
</h2>
```

### Callout（4种类型）
```html
<div class="callout callout-info">
  <div class="callout-title">信息</div>
  <p>内容</p>
</div>

<div class="callout callout-tip">
  <div class="callout-title">核心建议</div>
  <p>内容</p>
</div>

<div class="callout callout-warn">
  <div class="callout-title">注意</div>
  <p>内容</p>
</div>

<div class="callout callout-violet">
  <div class="callout-title">要点</div>
  <p>内容</p>
</div>
```

### 引用块
```html
<blockquote>
  <p>引用内容</p>
</blockquote>
```

### 表格
```html
<table>
  <thead><tr><th>表头</th></tr></thead>
  <tbody><tr><td>内容</td></tr></tbody>
</table>
```

### 代码块
```html
<pre><code>代码内容</code></pre>
```

### 步骤流程（保留v2）
```html
<div class="step">
  <div class="step-num">1</div>
  <div class="step-content">
    <h4>步骤标题</h4>
    <p>步骤说明</p>
  </div>
</div>
```

### 文件树（保留v2）
```html
<div class="file-tree">
  <div class="folder">📁 文件夹</div>
  <div class="indent file">📄 文件</div>
</div>
```

### 流程图（保留v2）
```html
<div class="flow">
  <div class="flow-step">步骤1</div>
  <div class="flow-arrow">→</div>
  <div class="flow-step">步骤2</div>
</div>
```

### 对比块（保留v2）
```html
<div class="compare">
  <div>
    <p><strong>不推荐 ❌</strong></p>
    <p>不好的做法</p>
  </div>
  <div>
    <p><strong>推荐 ✅</strong></p>
    <p>好的做法</p>
  </div>
</div>
```

### 核心标签
```html
<span class="tag-core">标签</span>
```

### 分隔线
```html
<hr>
```

## 视觉红线

1. **纯白背景**：所有主题背景保持纯白或极浅灰，不使用渐变光晕
2. **PDF兼容**：所有交互元素（导航栏、面板、按钮）使用 `@media screen` 包裹，`@media print` 中隐藏
3. **h2结构铁律**：`<h2 class="section-title page-break" id="partN">` 结构不可更改，否则PDF书签提取失败
4. **字体栈**：正文使用 Noto Sans SC，代码使用 JetBrains Mono
5. **响应式**：支持移动端，内容区padding自适应

## MD片段编写规范（v4 新增）

### 文件类型与YAML

每个MD片段必须包含YAML frontmatter，`type`字段决定处理方式：

| type | 文件命名 | 说明 |
|------|---------|------|
| `cover` | `00-cover.md` | 封面（详见下方封面字段表） |
| `chapter` | `part01-xxx.md` ~ `part99-xxx.md` | 正文章节，`##`作为顶级标题 |
| `backpage` | `99-backpage.md` | 尾页（详见下方封底字段表） |

> **模板参考位置**：`references/md-templates/` 目录下有 3 个示例文件供 AI 写作时参考格式

### 封面 YAML 字段说明（00-cover.md）

| 字段 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `type` | ✅ | 固定值 `cover` | `cover` |
| `title` | ✅ | 书籍主标题 | `福州周边徒步游手册` |
| `subtitle` | ✅ | 副标题 | `周末半日亲子徒步指南` |
| `author` | ✅ | 作者名 | `AI助手` |
| `version` | ✅ | 版本号 | `1.0.0` |
| `lang` | | 语言代码 | `zh-CN` |
| `badge` | | 顶部徽章文字 | `参考指南` / `徒步手册` / `技术指南` |
| `enTitle` | | 英文副标题 | `Fuzhou Hiking Guide` |
| `authorTitle` | | 作者头衔/身份 | `资深户外爱好者` |
| `authorBio` | | 作者简介（1-2句） | `深耕福州户外路线5年` |
| `exclusive` | | 专属标识（可选） | `内部资料` / `限量版` |
| `disclaimer` | | 免责声明（支持多行） | `本文档在 AI 辅助下整理编写...` |

### 封底 YAML 字段说明（99-backpage.md）

| 字段 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `type` | ✅ | 固定值 `backpage` | `backpage` |
| `qrImage` | | 二维码图片路径 | `assets/qrcode.png` |
| `linkUrl` | | 外部链接地址 | `https://example.com` |
| `linkText` | | 链接显示文字 | `访问作者主页` |
| `social` | | 社交媒体信息 | `微博 @xxx / 微信 xxx` |
| `footerNote` | | 页脚备注（支持多行） | `内容仅供参考` |

### 章节模板

```markdown
---
type: chapter
title: 第一章 章节标题
---

## 第一章 章节标题

### 1.1 小节标题

正文内容……

### 1.2 另一个小节

<div class="callout callout-tip">
<div class="callout-title">核心建议</div>
<p>提示内容</p>
</div>
```

### 标题层级映射

| MD语法 | 生成HTML | 说明 |
|--------|---------|------|
| `## 标题` | `<h2 class="section-title page-break" id="partN">` | 顶级章节，自动生成id |
| `### 标题` | `<h3 id="sectionN">` | 小节，自动生成id |
| `#### 标题` | `<h4>` | 子小节 |

### 支持的Markdown语法

| 语法 | 示例 |
|------|------|
| 粗体 | `**加粗文字**` |
| 斜体 | `*斜体文字*` |
| 行内代码 | `` `code` `` |
| 代码块 | ` ```lang ` ... ` ``` ` |
| 表格 | `| A | B |` |
| 无序列表 | `- 项` 或 `* 项` |
| 有序列表 | `1. 项` |
| 引用 | `> 内容` |
| 链接 | `[文本](url)` |
| 分隔线 | `---` |

### 内嵌HTML组件速查

以下组件在MD中用内嵌HTML方式编写，CSS自动渲染样式：

**Callout（4种）：**
```html
<div class="callout callout-info">
<div class="callout-title">信息</div><p>内容</p>
</div>
<div class="callout callout-tip">
<div class="callout-title">核心建议</div><p>内容</p>
</div>
<div class="callout callout-warn">
<div class="callout-title">注意</div><p>内容</p>
</div>
<div class="callout callout-violet">
<div class="callout-title">要点</div><p>内容</p>
</div>
```

**步骤流程：**
```html
<div class="step">
<div class="step-num">1</div>
<div class="step-content"><h4>步骤标题</h4><p>说明</p></div>
</div>
```

**对比块：**
```html
<div class="compare">
<div><p><strong>不推荐 ❌</strong></p><p>不好的做法</p></div>
<div><p><strong>推荐 ✅</strong></p><p>好的做法</p></div>
</div>
```

**文件树：**
```html
<div class="file-tree">
<div class="folder">📁 文件夹</div>
<div class="indent file">📄 文件</div>
</div>
```

**流程图：**
```html
<div class="flow">
<div class="flow-step">步骤1</div>
<div class="flow-arrow">→</div>
<div class="flow-step">步骤2</div>
</div>
```

**图片：**
```html
<figure class="content-figure">
<img src="../assets/xxx.png" alt="描述">
<figcaption>图注</figcaption>
</figure>
```

### 禁止项

- ❌ 不要在MD中写 `<html>`、`<head>`、`<body>`、`<style>` 标签
- ❌ 不要用 `#` （h1）在chapter文件中，用 `##` 作为顶级标题
- ❌ 不要在代码块内嵌HTML组件（会被转义）
