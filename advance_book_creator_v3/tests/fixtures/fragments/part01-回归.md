---
type: chapter
title: 第一章 组件与转换回归
---

## 第一章 组件与转换回归

### 1.1 提示块全类型

> [!TIP]
> 多行 TIP，正文支持 **粗体**、`行内代码` 和 [链接](https://example.com)。

> [!WARN] 自定义标题
> 带标题的 WARN。

> [!NOTE]
> NOTE 块。

> [!IMPORTANT]
> IMPORTANT 块（violet）。

> **核心建议**：中文别名兼容，应转 callout-tip。

### 1.2 步骤块（含嵌套续行）

:::steps
- **含列表的步骤**：
  - **创建**：`python -m venv .venv`
  - **激活**：`source .venv/bin/activate`
- **含表格的步骤**：
  | 参数 | 默认值 |
  |------|--------|
  | batch.size | 16384 |
- **含代码块的步骤**：
  ```
  pip install langchain
  ```
:::

### 1.3 对比块

:::compare
- **不推荐 ❌**：左栏内容
- **推荐 ✅**：右栏内容
- **备注**：中栏内容
:::

### 1.4 代码围栏回归（行内三反引号事故）

```python
def strip_fence(text):
    return text.strip().removeprefix("```sql").removeprefix("```").removesuffix("```")

# 把检索结果同时给 prompt 和最终输出（答案要带引用出处）
rag_chain = build()
```

行内代码中的 `<div>` 与 `<span>` 不应触发门禁。

### 1.5 图形（合法HTML，必须闭合）

<figure class="content-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60">
  <rect width="200" height="60" fill="#eee"/>
  <text x="100" y="35" text-anchor="middle">图</text>
</svg>
<figcaption>图 1-1 测试图</figcaption>
</figure>

---
