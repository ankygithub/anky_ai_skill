# SVG基础规范

本文档继承自原SVG技能，定义所有技术图表必须遵循的基础规范。

## viewBox 与缩放

### 必须设置 viewBox
```svg
<!-- ✅ 正确：可缩放 -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">

<!-- ❌ 错误：固定尺寸，无法缩放 -->
<svg width="800" height="600">
```

### viewBox 规范
- 格式：`viewBox="0 0 width height"`
- 坐标必须从 (0, 0) 开始，避免偏移
- 禁止带单位：`viewBox="0 0 100px 100px"` 是错误的

## 无障碍

### Informative SVG（传达信息）
```svg
<svg role="img" aria-labelledby="chart-title">
  <title id="chart-title">图表标题</title>
  <!-- 内容 -->
</svg>
```

### Decorative SVG（纯装饰）
```svg
<svg aria-hidden="true" focusable="false">
  <!-- 内容 -->
</svg>
```

### ID 唯一性
- 同一页面内所有 inline SVG 的 ID 必须唯一
- 建议命名：`id="svg-pro-{图表类型}-{元素名}"`

## 样式

### currentColor 继承
```svg
<!-- ✅ 可主题化 -->
<svg fill="currentColor">
  <path d="..."/>
</svg>

<!-- ❌ 不可主题化 -->
<svg>
  <path fill="#000000" d="..."/>
</svg>
```

### CSS 变量（多色图标）
```svg
<svg>
  <style>
    .primary { fill: var(--icon-primary, currentColor); }
    .secondary { fill: var(--icon-secondary, #ccc); }
  </style>
  <path class="primary" d="..."/>
  <path class="secondary" d="..."/>
</svg>
```

## 嵌入方式

| 方式 | CSS样式 | 适用场景 |
|------|---------|---------|
| Inline `<svg>` | ✅ 完整控制 | 技术图表（推荐） |
| `<img src>` | ❌ 不可样式化 | 静态图标 |
| `<use>` sprite | ⚠️ 部分控制 | 图标系统 |

**技术图表必须使用 Inline SVG。**

## 优化

### SVGO 安全配置
```javascript
export default {
  plugins: [{
    name: 'preset-default',
    params: {
      overrides: {
        removeViewBox: false,
        removeTitle: false,
        removeDesc: false,
        cleanupIds: false,
      }
    }
  }]
};
```

### 安全移除项
- 编辑器元数据（Illustrator, Sketch）
- XML 注释
- 空组 `<g></g>`
- 未使用的 `<defs>`

## 编码

### 文件头
```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
```

### 中文处理
- 首选：UTF-8 编码声明
- 备选：XML 数字字符引用 `&#xXXXX;`
