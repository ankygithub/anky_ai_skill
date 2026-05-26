# Markdown 渲染设计规范

> advance_book_creator_v2 项目的 Markdown → HTML 渲染规范，可供其他项目或技能复用。

---

## 文档结构

| 文件 | 用途 |
|------|------|
| `design-spec.md` | 渲染规则说明文档（本文档） |
| `rendering-examples.html` | HTML 单文件演示（Markdown 源码 + 渲染效果对照） |

---

## 一、渲染流水线

```
Markdown 源文件 (.md)
       │
       ├─ 阶段1：自定义标签 → 标准HTML (convertCustomTagsToHtml)
       ├─ 阶段2：保护代码块 (protectCodeBlocks)
       ├─ 阶段3：保护标准HTML (protectStandardHtml)
       ├─ 阶段4：Markdown → HTML 转换 (mdToHtml)
       │
       └─ 恢复所有占位符 → HTML 片段 (.html)
```

**核心原则**：
1. 先转换自定义标签为 HTML，再保护代码块
2. 被保护的 HTML 块在 Markdown 转换期间不处理
3. 转换完成后再按顺序恢复所有占位符

---

## 二、基础 Markdown 语法

### 2.1 标题

| Markdown | 输出 HTML | 说明 |
|----------|-----------|------|
| `## 标题` | `<h2 class="section-title page-break" id="part{N}">标题</h2>` | 大章节，自动分页，生成全局唯一 ID |
| `### 标题` | `<h3 id="section{N}">标题</h3>` | 小节，生成全局唯一 ID |
| `#### 标题` | `<h4>标题</h4>` | 子小节 |

**特殊处理**：
- `##` 标题的章节编号会自动修正为正确的中文数字（如"第零三章" → "第三章"）
- 所有 `##` 标题会添加 `.page-break` 类，PDF 渲染时强制分页
- 标题 ID 用于 PDF 书签生成和目录链接

### 2.2 行内格式化

| Markdown | 输出 HTML |
|----------|-----------|
| `**粗体文字**` | `<strong>粗体文字</strong>` |
| `*斜体文字*` | `<em>斜体文字</em>` |
| `` `行内代码` `` | `<code>行内代码</code>` |

**特殊处理**：行内代码在 Markdown 转换前先用占位符保护，防止 HTML 转义。

### 2.3 代码块

```markdown
```language
代码内容
```
```

**输出 HTML**：
```html
<pre><code class="language-{language}">代码内容</code></pre>
```

**特殊处理**：
- 语言标识符支持连字符（如 `ssh-config`）
- 代码内容经过 `escapeHtml()` 转义
- 代码块在 Markdown 转换前被占位符保护

### 2.4 表格

```markdown
| 列1 | 列2 | 列3 |
|:----|:---:|----:|
| 左对齐 | 居中 | 右对齐 |
| 数据 | 数据 | 数据 |
```

**输出 HTML**：
```html
<table>
<thead>
<tr><th style="text-align:left">列1</th><th style="text-align:center">列2</th><th style="text-align:right">列3</th></tr>
</thead>
<tbody>
<tr><td style="text-align:left">左对齐</td><td style="text-align:center">居中</td><td style="text-align:right">右对齐</td></tr>
<tr><td style="text-align:left">数据</td><td style="text-align:center">数据</td><td style="text-align:right">数据</td></tr>
</tbody>
</table>
```

**特殊处理**：
- 支持左对齐（`:---`）、居中（`:---:`）、右对齐（`---:`）
- 分隔行（第二行）仅包含 `-` 和 `:`

### 2.5 引用块

```markdown
> 这是引用文字
> 第二行
```

**输出 HTML**：
```html
<blockquote>
<p>这是引用文字 第二行</p>
</blockquote>
```

**特殊处理**：
- 引用块内部支持粗体、行内代码
- 引用块内部支持嵌套无序列表（`- ` 开头）
- 引用块内的列表会被自动识别并渲染为 `<ul>`

### 2.6 列表

| Markdown | 输出 HTML |
|----------|-----------|
| `- 项目` 或 `* 项目` | `<ul><li>项目</li></ul>` |
| `1. 项目` | `<ol><li>项目</li></ol>` |

**特殊处理**：
- 列表在 blockquote 内部时不处理
- 空行会终止列表
- 列表项可以跨行

### 2.7 链接与分隔线

| Markdown | 输出 HTML |
|----------|-----------|
| `[文字](URL)` | `<a href="URL">文字</a>` |
| `---` | `<hr>` |

---

## 三、特殊组件

### 3.1 组件总览

| 自定义标签 | 输出类 | 用途 | 最低用量 |
|-----------|--------|------|---------|
| `<callout-tip>` | `.callout.callout-tip` | 核心要点/建议 | 每个 Part ≥1 |
| `<callout-warn>` | `.callout.callout-warn` | 警告/风险/禁忌 | 按需 |
| `<callout-info>` | `.callout.callout-info` | 参考/来源/延伸 | 按需 |
| `<step number="N" title="...">` | `.step-card` | 操作步骤 | 2步以上必须 |
| `<compare left-title="..." right-title="...">` | `.compare-block` | 好坏对比 | 有对比必须 |
| `<span class="tag-core">` | `.tag-core` | 关键术语 | 建议使用 |
| `<figure class="content-figure">` | `.content-figure` | 图片容器 | 按需 |

### 3.2 Callout 提示块

#### 3.2.1 自定义标签写法

```markdown
<div class="callout callout-tip">
<div class="callout-icon">&#x1F4A1;</div>
<div class="callout-content">
<p>提示内容</p>
</div>
</div>
```

或者使用简化标签（由 convert-md.js 自动转换）：

```markdown
<callout-tip>
<p>提示内容</p>
</callout-tip>
```

#### 3.2.2 Markdown 引用块写法

convert-md.js 还支持从引用块自动检测并转换为 callout：

```markdown
> **核心建议**：这是提示内容
```
→ 转换为 `<div class="callout callout-tip">`

```markdown
> **注意**：这是警告内容
```
→ 转换为 `<div class="callout callout-warn">`

```markdown
> **信息**：这是信息内容
```
→ 转换为 `<div class="callout callout-info">`

#### 3.2.3 HTML 结构

```html
<div class="callout callout-{type}">
  <div class="callout-icon">{emoji}</div>
  <div class="callout-content">
    <p>内容</p>
  </div>
</div>
```

#### 3.2.4 渲染规则

| 类型 | 图标 | 颜色来源 |
|------|------|---------|
| tip | 💡 (💡) | `--accent-primary` |
| warn | ⚠️ (⚠) | `--accent-rose` |
| info | ℹ️ (ℹ) | `--accent-cyan` |

### 3.3 Step 步骤卡片

#### 3.3.1 自定义标签写法

```markdown
<step number="1" title="标题">
<p>步骤说明内容</p>
</step>
```

#### 3.3.2 输出 HTML 结构

```html
<div class="step-card" data-step="1">
  <div class="step-header">
    <div class="step-phase">
      <span class="step-phase-num">1</span>
      <span class="step-phase-label">阶段</span>
    </div>
    <div class="step-title">标题</div>
  </div>
  <div class="step-body">
    <p>步骤说明内容</p>
  </div>
</div>
```

#### 3.3.3 渲染规则

- 步骤卡片是独立组件，不互相连接
- 每个卡片左侧有一个 28px 圆形编号
- 顶部有 3px 渐变装饰线
- 支持 hover 效果（卡片上浮、阴影加深）
- 编号和标题放在卡片顶部标题栏

### 3.4 Compare 对比块

#### 3.4.1 自定义标签写法

```markdown
<compare left-title="不推荐 " right-title="推荐 ✅">
<div slot="left">
<p>不推荐的做法</p>
</div>
<div slot="right">
<p>推荐的做法</p>
</div>
</compare>
```

#### 3.4.2 输出 HTML 结构

```html
<div class="compare-block">
  <div class="compare-item compare-bad">
    <div class="compare-label">不推荐 ❌</div>
    <div class="compare-content">
      <p>不推荐的做法</p>
    </div>
  </div>
  <div class="compare-item compare-good">
    <div class="compare-label">推荐 ✅</div>
    <div class="compare-content">
      <p>推荐的做法</p>
    </div>
  </div>
</div>
```

#### 3.4.3 渲染规则

- 左右双栏布局，用 flex 排列
- 左栏（bad）红色调，右栏（good）绿色调
- 可选 `center-title` 和 `center` slot 实现三栏对比
- 内容过短或解析失败时自动降级为 callout-info 块

### 3.5 标签（Tag）

```markdown
<span class="tag-core">重要术语</span>
```

**输出**：保持不变（由 styles.css 渲染）

**渲染规则**：行内小圆角标签，主题色背景，用于强调专业术语。

### 3.6 图片容器

```html
<figure class="content-figure">
  <img src="图片路径" alt="描述">
  <figcaption>图 1-1 图片标题</figcaption>
</figure>
```

**渲染规则**：
- 图片最大宽度 100%
- 标题居中，灰色小字
- 打印时最大高度 85mm

### 3.7 封面（Cover）

#### 3.7.1 Markdown 源格式

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

#### 3.7.2 输出 HTML 结构

```html
<div class="cover">
  <div class="cover-badge">参考指南</div>
  <h1>书籍标题</h1>
  <p class="cover-subtitle">一句话描述</p>
  <div class="cover-meta">
    <span>作者名</span>
    <span>v1.0.0</span>
  </div>
</div>
```

#### 3.7.3 渲染规则

- 占满视口（min-height: 100vh）
- 内容垂直居中
- 顶部有 6px 主题色装饰线
- 大标题 + 副标题 + 作者/版本元信息

### 3.8 尾页（Backpage）

```html
<div class="backpage">
  <h2>文档结束</h2>
  <p>书籍标题 v1.0.0</p>
  <p>作者名</p>
</div>
```

### 3.9 目录（TOC）

```html
<div class="toc">
  <h2>目录</h2>
  <ul>
    <li><a href="#part1"><span class="toc-title-text">第一章 标题</span></a></li>
    <li class="toc-sub"><a href="#section1"><span class="toc-title-text">1.1 小节标题</span></a></li>
  </ul>
</div>
```

### 3.10 代码块标题

```html
<div class="code-title">标题文字</div>
<pre><code>代码内容</code></pre>
```

**渲染规则**：代码块上方的圆角标签，深色背景。

---

## 四、HTML 保护机制

### 4.1 保护占位符

| 占位符 | 保护内容 |
|--------|---------|
| `__CODE_BLOCK_N__` | 代码块 |
| `__HTML_PROTECT_N__` | 标准 HTML 块（div/figure/img/hr） |
| `__INLINE_CODE_N__` | 行内代码 |

### 4.2 跳过保护的 div

以下 class 的 div **不会被保护**（允许内部 Markdown 被转换）：

```
callout, callout-content, compare-block, compare-item, compare-content, step-card, step-body
```

### 4.3 恢复顺序

```
1. 恢复 HTML 块（此时 HTML 块内部可能包含代码块占位符）
2. 恢复代码块
3. 恢复行内代码
```

---

## 五、CSS 变量系统

### 5.1 主题变量

| 变量 | 用途 |
|------|------|
| `--font-scale` | 字号缩放（0.93 / 1.0 / 1.07） |
| `--accent-primary` | 主题主色 |
| `--accent-secondary` | 主题辅助色 |
| `--accent-cyan` | 信息色（info callout） |
| `--accent-rose` | 警告色（warn callout） |
| `--accent-violet` | 对比块中心栏颜色 |
| `--bg-primary` | 页面背景 |
| `--bg-secondary` | 次级背景（callout/code-title） |
| `--bg-card` | 卡片背景 |
| `--bg-elevated` | 浮层背景 |
| `--text-primary` | 主文本色 |
| `--text-secondary` | 次要文本色 |
| `--text-muted` | 淡化文本色 |
| `--border-subtle` | 细边框色 |
| `--border-accent` | 主题色边框 |
| `--shadow-warm` | 轻阴影 |
| `--shadow-deep` | 重阴影 |
| `--code-bg` | 代码背景 |
| `--code-text` | 代码文字色 |

### 5.2 六套主题

| 主题名 | 数据属性 | 主色 |
|--------|---------|------|
| 默认暖棕 | `[data-theme="warm"]` | `#92400E` |
| 暖米色 | `[data-theme="warm-beige"]` | `#78716C` |
| 科技蓝 | `[data-theme="tech-blue"]` | `#1D4ED8` |
| 卡其灰 | `[data-theme="khaki-gray"]` | `#475569` |
| 森林绿 | `[data-theme="forest-green"]` | `#166534` |
| 暗夜黑金 | `[data-theme="dark-gold"]` | `#D4A017` |

### 5.3 内容宽度

```css
.content { max-width: var(--content-max-width); }
```

| 模式 | 值 |
|------|-----|
| 窄 | `780px` |
| 中（默认） | `900px` |
| 宽 | `1200px` |
| 全宽 | `none` |

---

## 六、打印适配规则

### 6.1 通用打印规则

```css
@media print {
  .page-break { page-break-before: always; }
  .cover { page-break-after: always; }
  .backpage { page-break-before: always; }
  .toc { page-break-after: always; }
}
```

### 6.2 组件打印适配

| 组件 | 打印规则 |
|------|---------|
| 封面/尾页 | 100vh 高度 → 正常分页 |
| 步骤卡片 | 去除阴影和动画 |
| Callout | 降低背景色透明度 |
| 对比块 | 保留颜色区分 |
| 图片 | 最大高度 85mm |

---

## 七、响应式规则

### 7.1 断点

```css
@media (max-width: 768px) {
  /* 移动端适配 */
}
```

### 7.2 移动端适配项

| 元素 | 桌面端 | 移动端 |
|------|--------|--------|
| 目录面板 | 固定侧边栏 | 隐藏 |
| 导航栏 | 完整显示 | 部分隐藏 |
| Callout | 圆角 12px | 圆角 10px |
| 步骤卡片 | padding 32px | padding 24px 20px |
| 对比块 | 多列 | 堆叠为单列 |

---

## 八、特殊处理规则

### 8.1 章节编号修正

```javascript
correctChapterNumber(title, globalNum)
```

自动修正标题中的章节编号：
- "第零三章" → "第三章"
- "第03章" → "第三章"
- "第三章" → "第三章"（不变）

### 8.2 目录提取规则

- 仅从 `##` 和 `###` 标题提取
- 跳过代码块内的标题
- 跳过 HTML 保护占位符
- 生成 `tocData` 数组：`{ title, level, id }`

### 8.3 全局 ID 生成

- `##` 标题 → `id="part{N}"`（N 为全局递增）
- `###` 标题 → `id="section{N}"`（N 为全局递增）

### 8.4 降级处理

当 HTML 标签不平衡且无法自动修复时：

```html
<div class="degraded-block" data-degrade-reason="原因">
  <p><em>[内容已降级为文本：原因]</em></p>
  <p>纯文本内容...</p>
</div>
```

---

## 九、引用与参考

- 样式定义：`advance_book_creator_v2/templates/styles.css`
- 转换引擎：`advance_book_creator_v2/templates/convert-md.js`
- 项目设计：`advance_book_creator_v2/DESIGN.md`
- 技能文档：`advance_book_creator_v2/SKILL.md`
