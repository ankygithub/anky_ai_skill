#!/bin/bash
# 华书 v3 - 项目初始化脚本
# 在指定目录创建完整的书籍PDF项目骨架
#
# 用法：
#   bash init-project.sh <项目目录> <手册标题>
#   bash init-project.sh ./my-guide "Python完全指南"
#
# 前置依赖：
#   - Node.js >= 16
#   - Playwright: npm install playwright && npx playwright install chromium

set -e

PROJECT_DIR="${1:?用法: bash init-project.sh <项目目录> <手册标题>}"
TITLE="${2:?请提供手册标题，如: "Python完全指南"}"
TODAY=$(date +%Y-%m-%d)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SKILL_DIR/templates"

if [ -d "$PROJECT_DIR" ] && [ "$(ls -A "$PROJECT_DIR" 2>/dev/null)" ]; then
  echo "❌ 目录已存在且非空: $PROJECT_DIR"
  exit 1
fi

echo "📦 华书 v3 初始化项目: $TITLE"
echo "   目录: $PROJECT_DIR"
echo ""

# 创建目录结构
mkdir -p "$PROJECT_DIR"/{fragments,output,versions,research}

# 复制模板文件
cp "$TEMPLATES_DIR/styles.css" "$PROJECT_DIR/styles.css"
cp "$TEMPLATES_DIR/build.js" "$PROJECT_DIR/build.js"
cp "$TEMPLATES_DIR/build-reader.js" "$PROJECT_DIR/build-reader.js"
cp "$TEMPLATES_DIR/build-pdf.js" "$PROJECT_DIR/build-pdf.js"
cp "$TEMPLATES_DIR/build-md.js" "$PROJECT_DIR/build-md.js"
cp "$TEMPLATES_DIR/build-all.js" "$PROJECT_DIR/build-all.js"
cp "$TEMPLATES_DIR/convert-md.js" "$PROJECT_DIR/convert-md.js"
cp "$TEMPLATES_DIR/convert-html.js" "$PROJECT_DIR/convert-html.js"
cp "$TEMPLATES_DIR/update.sh" "$PROJECT_DIR/update.sh"
chmod +x "$PROJECT_DIR/update.sh"

# 复制MD片段模板
if [ -d "$TEMPLATES_DIR/fragments" ]; then
  cp "$TEMPLATES_DIR/fragments/"*.md "$PROJECT_DIR/fragments/" 2>/dev/null || true
fi
# 复制信源分级规范
cp "$SKILL_DIR/references/source-grade-simple.md" "$PROJECT_DIR/research/" 2>/dev/null || true

# 创建 version.json
cat > "$PROJECT_DIR/version.json" << EOF
{
  "version": "1.0.0",
  "build": 0,
  "lastUpdate": "$TODAY",
  "title": "$TITLE",
  "subtitle": "",
  "author": "",
  "authorTitle": "",
  "authorBio": "",
  "exclusive": "",
  "qrImage": "",
  "linkUrl": "",
  "linkText": "",
  "social": ""
}
EOF

# 创建 CHANGELOG.md
cat > "$PROJECT_DIR/CHANGELOG.md" << EOF
# $TITLE 更新日志

> 格式：\`[版本号] YYYY-MM-DD — 摘要\`
> 版本规则：大改（章节增删）→ 主版本号；内容更新 → 次版本号；修正/勘误 → 修订号
EOF

# 创建 PROJECT.md 模板
cat > "$PROJECT_DIR/PROJECT.md" << EOF
# $TITLE — 项目计划

> 目标：
> 规格：
> 状态：规划中

---

## 章节大纲

| Part | 节 | 标题 | 核心内容 | 信息来源 |
|------|----|------|---------|---------|
| 1 | 01 | | | |

---

## 调研资料索引

> 信源规范参考：research/source-grade-simple.md

| # | 文件 | 内容 | 状态 |
|---|------|------|------|
| 1 | research/ | | ⏳ |

---

## 进度追踪

| 步骤 | 状态 | 说明 |
|------|------|------|
| 调研 | ⏳ | |
| 规划 | ⏳ | |
| 写作 | ⬜ | |
| 构建 | ⬜ | |

---

## 关键数据速查

-
EOF

# 检查依赖
echo "🔍 检查依赖..."
HAS_NODE=true
HAS_PLAYWRIGHT=true

if ! command -v node &>/dev/null; then
  HAS_NODE=false
  echo "   ⚠️  未找到 Node.js — 请安装: https://nodejs.org/"
fi

if [ "$HAS_NODE" = true ]; then
  if ! node -e "require('playwright')" 2>/dev/null; then
    HAS_PLAYWRIGHT=false
    echo "   ⚠️  未找到 Playwright — 请运行:"
    echo "      npm install playwright pdf-lib"
    echo "      npx playwright install chromium"
  fi
fi

if [ "$HAS_NODE" = true ] && [ "$HAS_PLAYWRIGHT" = true ]; then
  echo "   ✅ Node.js + Playwright 就绪"
fi

echo ""
echo "✅ 项目已创建！"
echo ""
echo "   结构:"
echo "   $PROJECT_DIR/"
echo "   ├── PROJECT.md          # 项目计划"
echo "   ├── styles.css          # 共享CSS（6套主题）"
echo "   ├── build.js            # 单文件HTML构建"
echo "   ├── build-reader.js     # 多文件阅读器构建"
echo "   ├── build-pdf.js        # PDF生成（带书签）"
echo "   ├── build-md.js         # Markdown导出"
echo "   ├── build-all.js        # 统一构建入口+门禁"
echo "   ├── convert-md.js       # Markdown转片段"
echo "   ├── convert-html.js     # HTML转片段"
echo "   ├── update.sh           # 一键版本更新"
echo "   ├── version.json        # 版本信息"
echo "   ├── CHANGELOG.md        # 更新日志"
echo "   ├── fragments/          # Markdown片段"
echo "   │   ├── 00-cover.md"
echo "   │   ├── 99-backpage.md"
echo "   │   └── part01-章节示例.md"
echo "   ├── research/           # 调研资料"
echo "   │   └── source-grade-simple.md # 信源分级规范"
echo "   ├── output/             # 构建输出"
echo "   └── versions/           # 历史PDF存档"
echo ""
echo "   下一步:"
echo "   1. 编辑 PROJECT.md 填写大纲"
echo "   2. 在 fragments/ 下写Markdown片段"
echo "   3. 运行 ./update.sh all 构建所有产物"
echo ""
echo "   独立数据源模式:"
echo "   node build-all.js --source ./input.md --type md --products all"
