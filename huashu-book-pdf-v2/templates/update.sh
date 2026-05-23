#!/bin/bash
# Book-PDF 版本更新脚本模板（v3 - 支持4种产物）
#
# 用法：
#   ./update.sh patch "修正某个错误"     # 修订：1.0.0 → 1.0.1
#   ./update.sh minor "更新某部分内容"     # 次版本：1.0.0 → 1.1.0
#   ./update.sh major "新增某个章节"       # 主版本：1.0.0 → 2.0.0
#   ./update.sh build                      # 仅增加build号，不改版本
#   ./update.sh all                        # 构建所有产物（不更新版本）
#
# 产物输出：
#   output/{title}-v{version}.html      # 单文件HTML手册
#   output/{title}-v{version}.pdf       # 带书签的PDF手册
#   output/{title}-v{version}.md        # Markdown格式手册
#   output/reader/                      # 多文件交互式阅读器

set -e
cd "$(dirname "$0")"

BUMP_TYPE="${1:-build}"
MESSAGE="${2:-无描述}"
TODAY=$(date +%Y-%m-%d)
VERSION_FILE="version.json"
CHANGELOG="CHANGELOG.md"

# 读取当前版本
CURRENT_VERSION=$(node -e "console.log(require('./$VERSION_FILE').version)")
CURRENT_BUILD=$(node -e "console.log(require('./$VERSION_FILE').build)")

# 计算新版本
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  build|all) ;; # 只增加build号或不改版本
  *) echo "❌ 未知类型: $BUMP_TYPE (可选: major/minor/patch/build/all)"; exit 1 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
NEW_BUILD=$((CURRENT_BUILD + 1))

if [ "$BUMP_TYPE" = "all" ]; then
  echo "📦 构建所有产物 (v$CURRENT_VERSION)"
else
  echo "📦 版本更新: v$CURRENT_VERSION (#$CURRENT_BUILD) → v$NEW_VERSION (#$NEW_BUILD)"
fi

# 更新 version.json（build类型只更新build号，其他类型更新版本号+build号）
if [ "$BUMP_TYPE" != "all" ]; then
  node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('$VERSION_FILE', 'utf-8'));
v.version = '$NEW_VERSION';
v.build = $NEW_BUILD;
v.lastUpdate = '$TODAY';
fs.writeFileSync('$VERSION_FILE', JSON.stringify(v, null, 2) + '\n');
"
fi

# 写入 CHANGELOG（仅版本变更时，非build/all类型）
if [ "$BUMP_TYPE" != "build" ] && [ "$BUMP_TYPE" != "all" ]; then
  node -e "
const fs = require('fs');
let log = fs.readFileSync('$CHANGELOG', 'utf-8');
const entry = '\n## [$NEW_VERSION] $TODAY — $MESSAGE\n\n- $MESSAGE\n';
const firstEntry = log.indexOf('\n## [');
if (firstEntry !== -1) {
  log = log.slice(0, firstEntry) + entry + log.slice(firstEntry);
} else {
  log += entry;
}
fs.writeFileSync('$CHANGELOG', log);
"
  echo "📝 CHANGELOG 已更新"
fi

# 构建 HTML
echo ""
echo "🔨 构建 HTML..."
node build.js

# 构建 PDF
echo ""
echo "📄 生成 PDF..."
node build-pdf.js

# 构建 Markdown
echo ""
echo "📝 生成 Markdown..."
node build-md.js

# 构建多文件阅读器
echo ""
echo "📚 生成多文件阅读器..."
node build-reader.js || echo "⚠️  阅读器生成失败（请检查 huashu-book-html-converter 技能是否安装）"

# 读取标题用于文件名
TITLE=$(node -e "console.log(require('./$VERSION_FILE').title)")

# 备份到 versions/ 目录（仅非build/all类型）
if [ "$BUMP_TYPE" != "build" ] && [ "$BUMP_TYPE" != "all" ]; then
  mkdir -p versions
  cp "output/$TITLE-v$NEW_VERSION.pdf" "versions/$TITLE-v$NEW_VERSION.pdf" 2>/dev/null || true
  cp "output/$TITLE-v$NEW_VERSION.html" "versions/$TITLE-v$NEW_VERSION.html" 2>/dev/null || true
  cp "output/$TITLE-v$NEW_VERSION.md" "versions/$TITLE-v$NEW_VERSION.md" 2>/dev/null || true
  echo "💾 备份完成"
fi

echo ""
echo "✅ 完成！"
echo ""
echo "📦 产物清单："
echo "   HTML:    output/$TITLE-v$NEW_VERSION.html"
echo "   PDF:     output/$TITLE-v$NEW_VERSION.pdf"
echo "   Markdown: output/$TITLE-v$NEW_VERSION.md"
echo "   Reader:  output/reader/index.html"
