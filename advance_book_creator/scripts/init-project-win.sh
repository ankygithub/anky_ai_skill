#!/bin/bash
# Windows Git Bash 专用初始化脚本，100%兼容所有Windows Git环境，无依赖问题
# 用法: bash init-project-win.sh <项目目录> <手册标题>
# 示例: bash init-project-win.sh "AI开发指南" "AI应用开发入门实战"

# 强制切换到当前脚本所在的scripts目录，彻底解决路径问题
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

# 参数检查
if [ $# -lt 2 ]; then
    echo "用法: bash init-project-win.sh <项目目录> <手册标题>"
    echo "示例: bash init-project-win.sh \"AI开发指南\" \"AI应用开发入门实战\""
    exit 1
fi

PROJECT_DIR="$1"
TITLE="$2"
TPL_DIR="../templates"
REF_DIR="../references"

# 检查目录是否已存在且非空
if [ -d "$PROJECT_DIR" ] && [ "$(ls -A "$PROJECT_DIR" 2>/dev/null)" ]; then
    echo "错误: 目录已存在且非空: $PROJECT_DIR"
    exit 1
fi

echo "正在初始化项目: $TITLE"
echo "项目目录: $PROJECT_DIR"
echo ""

# 创建目录结构
mkdir -p "$PROJECT_DIR"/{fragments,output,versions,research}

# 复制所有模板文件（一键复制，不用单独写）
cp "$TPL_DIR"/*.{css,js,sh} "$PROJECT_DIR"/ >/dev/null 2>&1

# 复制MD片段模板
cp "$TPL_DIR"/fragments/*.md "$PROJECT_DIR"/fragments/ >/dev/null 2>&1

# 复制信源分级规范
cp "$REF_DIR"/source-grade-simple.md "$PROJECT_DIR"/research/ >/dev/null 2>&1

# 生成version.json
cat > "$PROJECT_DIR"/version.json <<EOF
{
  "version": "1.0.0",
  "build": 0,
  "title": "$TITLE",
  "subtitle": "",
  "author": ""
}
EOF

# 生成CHANGELOG.md
cat > "$PROJECT_DIR"/CHANGELOG.md <<EOF
# $TITLE 更新日志
> 格式: [版本号] 日期 - 更新说明
> 版本规则: 大版本(新增章节) -> v1.0.0, 内容更新 -> v1.1.0, 修复 -> v1.0.1
EOF

# 生成PROJECT.md
cat > "$PROJECT_DIR"/PROJECT.md <<EOF
# $TITLE - 项目计划
> 状态: 规划中
---
## 章节大纲
| 部分 | 小节 | 标题 | 核心内容 | 信息来源 |
|------|------|------|----------|----------|
| 1 | 01 | | | |
---
## 调研资料索引
> 信源规范参考: research/source-grade-simple.md
| # | 资料文件 | 内容 | 状态 |
|---|----------|------|------|
| 1 | research/ | | ⏳ |
---
## 进度跟踪
| 步骤 | 状态 | 说明 |
|------|------|------|
| 调研 | ⏳ | |
| 规划 | ⏳ | |
| 写作 | ⬜ | |
| 构建 | ⬜ | |
EOF

# 依赖检查（完全兼容Windows Git Bash，不用command -v）
echo "正在检查依赖..."
HAS_NODE=1
HAS_PLAYWRIGHT=1

# 检查Node.js（兼容方式）
if ! node --version >/dev/null 2>&1; then
    HAS_NODE=0
    echo "⚠️  未检测到Node.js，请先安装: https://nodejs.org/"
fi

# 检查Playwright
if [ $HAS_NODE -eq 1 ]; then
    if ! node -e "require('playwright')" >/dev/null 2>&1; then
        HAS_PLAYWRIGHT=0
        echo "⚠️  未检测到Playwright，请运行以下命令安装:"
        echo "   npm install playwright pdf-lib"
        echo "   npx playwright install chromium"
    fi
fi

if [ $HAS_NODE -eq 1 ] && [ $HAS_PLAYWRIGHT -eq 1 ]; then
    echo "✅ Node.js + Playwright 环境就绪"
fi

echo ""
echo "✅ 项目初始化完成！"
echo ""
echo "项目结构:"
echo "$PROJECT_DIR/"
echo "├── PROJECT.md          # 项目计划/大纲"
echo "├── styles.css          # 主题样式（支持6套主题）"
echo "├── build-all.js        # 统一构建入口"
echo "├── fragments/          # Markdown 内容片段"
echo "│   ├── 00-cover.md     # 封面"
echo "│   ├── 99-backpage.md  # 封底"
echo "│   └── part01-*.md     # 章节模板"
echo "├── research/           # 调研资料"
echo "│   └── source-grade-simple.md # 信源分级规范"
echo "├── output/             # 构建产物输出目录"
echo "└── versions/           # 历史版本归档"
echo ""
echo "下一步操作:"
echo "1. 编辑 PROJECT.md 完善章节大纲"
echo "2. 在 fragments/ 目录下编写 Markdown 内容"
echo "3. 运行 node build-all.js --products all 构建所有产物（HTML/PDF/阅读器）"
