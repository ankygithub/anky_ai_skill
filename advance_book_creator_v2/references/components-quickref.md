# 华书 v4 组件速查表

> **写作铁律**：以下每个组件的 HTML 结构必须**原样复制使用**，禁止修改标签名、禁止自定义类名！
>
> 所有组件都是 `<div>` 或 `<span>` 标准标签，**没有**自定义标签名。
> 记忆口诀：不要创造任何新的 CSS 类名（如 step-card、compare-title、flow-card 等）。

---

## 0. 语义 → 组件 速查映射

| 你要表达的内容 | 用哪个组件 | 模板章节 |
|---------------|-----------|---------|
| 章节核心要点、关键结论 | `callout-tip` | §1 |
| 安全警告、风险、禁忌 | `callout-warn` | §2 |
| 参考信息、数据来源 | `callout-info` | §3 |
| 重点概念突出（紫色） | `callout-violet` | §4 |
| 2 步以上的操作流程 | `step` | §5 |
| 好坏/推荐对比 | `compare` | §6 |
| 关键术语强调 | `tag-core` | §7 |
| 数据流程/处理链路 | `flow` | §8 |
| 目录结构/文件树 | `file-tree` | §9 |
| **决策树/多分支判断** | `flow`（多个 flow-step + 条件） | §8 |
| 架构图/示意图 | 内嵌 SVG | §10 |

> **决策树不要写成 step**：决策树是"如果…则…"的多分支，用 `flow`；只有线性"第一步→第二步→第三步"才用 `step`。

---

## 1. Callout 提示块（蓝色）

**场景**：章节核心要点、关键结论、重要总结

```html
<div class="callout callout-tip">
<div class="callout-title">核心要点</div>
<p>本章最重要的3个结论：...</p>
</div>
```

---

## 2. Callout 警告块（橙色）

**场景**：安全警告、注意事项、禁忌、风险提示

```html
<div class="callout callout-warn">
<div class="callout-title">注意</div>
<p>此处有安全风险/常见坑：...</p>
</div>
```

---

## 3. Callout 信息块（灰色）

**场景**：参考信息、数据来源、背景延伸

```html
<div class="callout callout-info">
<div class="callout-title">参考</div>
<p>数据来源/背景补充：...</p>
</div>
```

---

## 4. Callout 紫色强调块

**场景**：紫色强调、要点突出、重要概念

```html
<div class="callout callout-violet">
<div class="callout-title">要点</div>
<p>重要概念/要点突出：...</p>
</div>
```

---

## 5. 步骤流程组件

**场景**：2步以上的操作步骤、配置流程、安装指南。有序操作**必须使用**，禁止用普通 Markdown 列表替代。

> ⚠️ **禁止在 `<div class="step">` 内混写 Markdown 列表**！下面这种写法是错误的，会导致渲染挤压、样式丢失，且构建前 `check-md.js` 会直接拦截：
> ```html
> <div class="step">
> 1. **先看覆盖**
> 2. **再看 TCO**
> </div>
> ```
> 正确做法：每步用 `step-num` + `step-content` 子结构（见下方模板），内部全部用纯 HTML。

有几步就写几组 `<div class="step">`：

```html
<div class="step">
<div class="step-num">1</div>
<div class="step-content"><h4>步骤标题</h4><p>步骤说明</p></div>
</div>
<div class="step">
<div class="step-num">2</div>
<div class="step-content"><h4>步骤标题</h4><p>步骤说明</p></div>
</div>
<div class="step">
<div class="step-num">3</div>
<div class="step-content"><h4>步骤标题</h4><p>步骤说明</p></div>
</div>
```

### 5.1 含表格/列表的复杂步骤

当步骤内需要表格或列表时，**必须使用HTML语法**（禁止混用Markdown表格/列表）：

```html
<div class="step">
<div class="step-num">1</div>
<div class="step-content">
<h4>配置数据源</h4>
<p>按以下顺序配置：</p>
<ul>
  <li><strong>Kafka连接</strong>：配置broker地址</li>
  <li><strong>Flink CDC</strong>：配置数据库连接</li>
</ul>
</div>
</div>
<div class="step">
<div class="step-num">2</div>
<div class="step-content">
<h4>参数对照表</h4>
<table>
<thead><tr><th>参数</th><th>默认值</th><th>说明</th></tr></thead>
<tbody>
<tr><td>batch.size</td><td>16384</td><td>批次大小</td></tr>
<tr><td>linger.ms</td><td>0</td><td>延迟发送</td></tr>
</tbody>
</table>
</div>
</div>
```

---

## 6. 对比块组件

**场景**：好坏对比、方案选型、优缺点比较。有对比内容**必须使用**。

### 6.1 简单对比（左右两栏）

```html
<div class="compare">
<div><p><strong>不推荐 ❌</strong></p><p>不好做法及原因</p></div>
<div><p><strong>推荐 ✅</strong></p><p>好做法及原因</p></div>
</div>
```

### 6.2 复杂对比（带标签和详细内容）

```html
<div class="compare-block">
<div class="compare-item compare-bad">
<div class="compare-label">左侧标题</div>
<div class="compare-content">
<p>说明文字</p>
<p><strong>关键点：</strong>重点内容</p>
</div>
</div>
<div class="compare-item compare-good">
<div class="compare-label">右侧标题</div>
<div class="compare-content">
<p>说明文字</p>
<p><strong>关键点：</strong>重点内容</p>
</div>
</div>
</div>
```

---

## 7. 核心术语标签

**场景**：关键术语首次出现、需要强调的概念。专业术语**建议使用**。

```html
<span class="tag-core">重要术语</span>
```

---

## 8. 流程图组件

**场景**：数据流程图、处理链路、步骤串联。有数据流/处理链路**必须使用**，禁止用普通 Markdown 箭头文本替代。

```html
<div class="flow">
<div class="flow-step">步骤1</div>
<div class="flow-arrow">→</div>
<div class="flow-step">步骤2</div>
<div class="flow-arrow">→</div>
<div class="flow-step">步骤3</div>
</div>
```

---

## 9. 文件树组件

**场景**：目录结构、文件层级、项目骨架展示。展示目录结构**建议使用**。

```html
<div class="file-tree">
<div class="folder">📁 文件夹</div>
<div class="indent file">📄 文件1</div>
<div class="indent file">📄 文件2</div>
</div>
```

---

## ⚠️ 写作禁令

| 禁止写法 | 正确写法 | 错误后果 |
|---------|---------|---------|
| `<callout-tip>...` | `<div class="callout callout-tip">...` | 标签无法识别，内容竖排显示 |
| `<callout-warn>...` | `<div class="callout callout-warn">...` | 标签无法识别，内容竖排显示 |
| `<callout-info>...` | `<div class="callout callout-info">...` | 标签无法识别，内容竖排显示 |
| `<callout-violet>...` | `<div class="callout callout-violet">...` | 标签无法识别，内容竖排显示 |
| `<tag-core>...` | `<span class="tag-core">...` | 样式不生效 |
| `<step>...` | `<div class="step">...` | 标签无法识别 |
| `<compare>...` | `<div class="compare">...` | 标签无法识别 |
| `<flow>...` | `<div class="flow">...` | 标签无法识别 |
| `<file-tree>...` | `<div class="file-tree">...` | 标签无法识别 |
| 自定义类名如 `step-card` | 必须使用上表中的标准类名 | CSS 无对应样式，渲染为纯文本 |
| HTML组件内使用Markdown语法如 `**加粗**`、`- 列表`、`\|表格\|` | 使用 `<strong>`、`<ul><li>`、`<table>` | 渲染为原始文本，格式不生效 |

---

## 标签闭合铁律

- `<div>` 必须有对应的 `</div>`
- 标签嵌套顺序必须正确：`<div><span></span></div>`
- 自闭合标签：`<br/>` 不是 `<br>`
- 标签名拼写必须正确

构建时的自动处理：
- 简单缺失闭合标签 → 自动补全
- 复杂结构损坏 → 降级为纯文本块（保留文字内容，丢失样式）

---

## 10. 内嵌 SVG 图形

**场景**：架构图、流程图、示意图。技术书籍中最常用的图形方式。

**正确写法**（直接写 SVG 标签，不要用代码块包裹）：

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520" font-family="sans-serif">
  <rect width="960" height="520" fill="#faf8f5"/>
  <!-- 图形内容 -->
</svg>
```

**错误写法**（会导致显示为代码文本）：

```markdown
```svg
<svg xmlns="http://www.w3.org/2000/svg" ...>
  ...
</svg>
```
```

**生成方式**：
1. 调用 `diagram-generator` skill 生成 SVG 代码
2. 将生成的代码直接粘贴到 Markdown 中
3. 确保删除代码块标记（```svg 和 ```）

**注意事项**：
- SVG 代码会被 `convert-md.js` 自动识别为 HTML 保护
- 不需要额外包裹 `<div>`，除非需要特殊样式
- 如需图注，使用 `<figure>` 包裹：

```html
<figure class="content-figure">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520">
    <!-- SVG 内容 -->
  </svg>
  <figcaption>图 1-1 架构总览</figcaption>
</figure>
```
