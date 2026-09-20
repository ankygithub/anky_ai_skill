# 华书 v3 设计系统（锐利印刷 Print Proof）

## 设计语言：墨与纸

白纸、近黑墨字、朱砂批注色、Scotch 双规则线、零柔影。
正文走 Windows 原生字体栈（Segoe UI + 微软雅黑 UI），
本地渲染即最锐利状态，不加载网络字体、无 FOUT 闪动。

## CSS变量系统（7套主题）

> **单一来源**：全部 token 的具体取值见 `templates/styles.css`，本文件只讲结构与铁律，
> 不复制数值（复制必然漂移）。

### Token 分组（每组 7 套主题各自持有完整定义）

| 分组 | token | 说明 |
|------|-------|------|
| 纸面 | `--bg-primary/secondary/card/elevated` | 背景（print-proof 为纯白纸面） |
| 墨色 | `--text-primary/secondary/muted` | 文字三级 |
| 批注 | `--accent-primary/secondary/cyan/rose/violet` | 朱砂/靛蓝等语义强调 |
| 规则线 | `--border-subtle/accent/strong` | `strong` 是墨线（章节双规则线） |
| **表格签名** | `--table-head-bg/color/rule`、`--table-border`、`--table-row-alt` | 墨底反白表头 + 主题色规则线 + 斑马纹 |
| 组件面 | `--code-*`、`--note-*-bg`、`--compare-*`、`--toc-active-bg`、`--nav-bg`、`--overlay-bg` | 各组件表面 |
| 选区 | `--selection-bg/color` | 划选文字的批注感 |

### 7套主题

1. **锐利审稿** (`:root` 与 `[data-theme="print-proof"]`) — 白纸近黑墨字、朱砂批注，**默认主题**
2. **墨纸暖棕** (`[data-theme=""]`) — 棕色系，温暖阅读
3. **暖米纸** (`[data-theme="warm-beige"]`) — 米色背景，柔和舒适
4. **科技蓝** (`[data-theme="tech-blue"]`) — 蓝色系，现代清爽
5. **卡其灰** (`[data-theme="khaki-gray"]`) — 灰色系，极简专业
6. **森林绿** (`[data-theme="forest-green"]`) — 绿色系，自然清新
7. **暗夜黑金** (`[data-theme="dark-gold"]`) — 深色背景，金色强调

### 主题铁律（v3 架构）

1. **组件层零硬编码**：组件样式只引用 CSS 变量，颜色一律来自主题 token——
   违反此条的直接后果就是"切主题没生效"（历史事故：覆盖层硬编码 #FFFFFF 压过全部主题变量）
2. **每套主题持有完整 token 集**：新增 token 必须在 7 个主题块中同时定义（run-tests 6e 有回归断言）
3. **表头在所有主题中一律墨底反白**：因此表头内部允许白色半透明分隔线（设计决定，非硬编码泄漏）

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
    <li><a href="#partN"><span class="toc-title-text">标题</span></a></li>
    <li class="toc-sub"><a href="#sectionN"><span class="toc-title-text">小节标题</span></a></li>
  </ul>
</div>
```

### 章节标题（PDF书签兼容）
```html
<!-- 必须保持此结构，否则PDF书签提取失败（由convert-md.js自动生成，勿手写） -->
<h2 class="section-title page-break" id="partN">章节标题</h2>
```

### Callout（转换器自动生成）

`> [!TIP]` / `> [!WARN]` / `> [!NOTE]` / `> [!IMPORTANT]` 引用块由 convert-md.js 转换为
`<div class="callout callout-{tip|warn|info|violet}"><div class="callout-title">标题</div>...<p>正文</p></div>` 结构。
写作时无需写此 HTML，语法详见 `components-quickref.md`。

### 步骤卡片（转换器自动生成）

`:::steps` 围栏转换为 `.step-card > .step-header(.step-phase/.step-title) + .step-body` 结构。

### 对比卡片（转换器自动生成）

`:::compare` 围栏转换为 `.compare-block > .compare-item(.compare-bad/.compare-good/.compare-center) > (.compare-label + .compare-content)` 结构。

### 图片
```html
<figure class="content-figure">
  <img src="../assets/xxx.png" alt="描述">
  <figcaption>图注</figcaption>
</figure>
```

### 分隔线
```html
<hr>
```

## 视觉红线

1. **纯白背景**：所有主题背景保持纯白或极浅灰，不使用渐变光晕
2. **PDF兼容**：所有交互元素（导航栏、面板、按钮）使用 `@media screen` 包裹，`@media print` 中隐藏
3. **h2结构铁律**：`<h2 class="section-title page-break" id="partN">` 结构不可更改，否则PDF书签提取失败
4. **字体栈**：正文用本地原生栈（"Segoe UI" + "Microsoft YaHei UI"），代码用 Consolas/Cascadia Mono；不加载网络字体（单文件与阅读器一致，EPUB 除外）
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

转换器 `generateCoverHtml()` 仅读取以下字段（lite 版收敛）：

| 字段 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `type` | ✅ | 固定值 `cover` | `cover` |
| `title` | ✅ | 书籍主标题（优先级高于 version.json） | `福州周边徒步游手册` |
| `subtitle` | ✅ | 副标题 | `周末半日亲子徒步指南` |
| `author` | ✅ | 作者名 | `AI助手` |
| `version` | ✅ | 版本号 | `1.0.0` |

> ⚠️ 顶部徽章固定为"参考指南"，不可配置；v4 的 `badge`/`enTitle`/`authorTitle`/`authorBio`/`exclusive`/`disclaimer` 字段在 lite 版**已停用**（写了不生效）。
> 00-cover.md 的正文内容不参与封面渲染（仅 `> 引用行` 在 subtitle 缺失时作为副标题兜底）。

### 封底 YAML 字段说明（99-backpage.md）

转换器 `generateBackpageHtml()` 仅读取以下字段：

| 字段 | 必填 | 说明 | 示例 |
|------|:----:|------|------|
| `type` | ✅ | 固定值 `backpage` | `backpage` |
| `title` | | 书籍标题（省略时回退 version.json） | |
| `author` | | 作者名（省略时回退 version.json） | |
| `version` | | 版本号（省略时回退 version.json） | |

> ⚠️ v4 的 `qrImage`/`linkUrl`/`linkText`/`social`/`footerNote` 字段在 lite 版**已停用**；99-backpage.md 的正文内容不参与封底渲染（输出为固定的"文档结束"页）。

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

> [!TIP]
> 提示内容（Markdown 原生组件语法）
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

### 组件语法速查（Markdown 原生）

lite 版组件全部使用 Markdown 语法书写，转换器自动生成 HTML 结构，**MD 中禁止写结构类 HTML**：

```markdown
> [!TIP] 标题（可选）
> 提示正文，支持 **Markdown**。

:::steps
- **步骤标题**：步骤说明
:::

:::compare
- **不推荐 ❌**：坏做法及原因
- **推荐 ✅**：好做法及原因
:::
```

**图片（唯一允许的 HTML 组件）：**
```html
<figure class="content-figure">
<img src="../assets/xxx.png" alt="描述">
<figcaption>图注</figcaption>
</figure>
```

### 禁止项

- ❌ 不要在MD中写结构类 HTML 标签（`div`/`span`/`table`/`ul`/`strong` 等），仅允许 `svg`/`figure`/`img`
- ❌ 不要用 `#` （h1）在chapter文件中，用 `##` 作为顶级标题
- ❌ 不要在代码块内演示组件语法后被当作组件处理（组件语法只在代码块外生效）
