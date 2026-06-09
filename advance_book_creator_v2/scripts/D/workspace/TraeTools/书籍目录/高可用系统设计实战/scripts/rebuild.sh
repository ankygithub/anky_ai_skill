#!/bin/bash
# 华书 v4 - 产物重建脚本
# 用途：fragments 下 .md 已就绪时，清理旧产物并全量重新构建
#
# 用法：
#   bash rebuild.sh                    # 重建所有产物（html+reader+pdf+md）
#   bash rebuild.sh html,pdf          # 只重建指定产物
#   bash rebuild.sh all --clean        # 强制清理后重建（含清output目录）
#
# 前置依赖：Node.js + Playwright（与 init-project.sh 相同）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$PROJECT_DIR/build-all.js" ]; then
  echo "❌ 未找到 build-all.js，请确认在正确的项目目录下运行"
  exit 1
fi

# ===== CLI参数解析 =====
PRODUCTS="all"
CLEAN_MODE=false
SKIP_MD_CHECK=false

for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN_MODE=true ;;
    --skip-md-check) SKIP_MD_CHECK=true ;;
    html|pdf|reader|md|all)
      PRODUCTS="$arg"
      ;;
    *,*)
      PRODUCTS="$arg"
      ;;
  esac
done

echo "🔄 华书 v4 产物重建脚本"
echo "   项目: $PROJECT_DIR"
echo "   产物: $PRODUCTS"
[ "$CLEAN_MODE" = true ] && echo "   模式: 强制清理 (--clean)"
echo ""

# ===== 检查 fragments 目录 =====
FRAGMENTS_DIR="$PROJECT_DIR/fragments"

if [ ! -d "$FRAGMENTS_DIR" ]; then
  echo "❌ fragments 目录不存在: $FRAGMENTS_DIR"
  exit 1
fi

# 统计文件
MD_COUNT=$(find "$FRAGMENTS_DIR" -maxdepth 1 -name '*.md' -not -name '.*' | wc -l)
HTML_COUNT=$(find "$FRAGMENTS_DIR" -maxdepth 1 -name '*.html' | wc -l)

echo "📂 fragments 状态:"
echo "   .md 文件: $MD_COUNT 个"
echo "   .html 文件: $HTML_COUNT 个"
echo ""

if [ "$SKIP_MD_CHECK" != true ] && [ "$MD_COUNT" -eq 0 ]; then
  echo "⚠️  fragments 目录下没有 .md 文件"
  echo "   如果已有 .html 片段想直接构建，请加 --skip-md-check 参数"
  echo ""
  read -p "   是否继续？(y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
  fi
fi

# ===== 清理旧产物 =====
if [ "$CLEAN_MODE" = true ]; then
  echo "🧹 [清理] 删除旧产物..."

  # 清理 fragments 下的旧 html
  if [ "$HTML_COUNT" -gt 0 ]; then
    rm -f "$FRAGMENTS_DIR"/*.html
    echo "   ✅ 已清除 $HTML_COUNT 个旧 HTML 片段"
  fi

  # 清理 output 目录
  OUTPUT_DIR="$PROJECT_DIR/output"
  if [ -d "$OUTPUT_DIR" ]; then
    rm -rf "$OUTPUT_DIR"/*
    echo "   ✅ 已清空 output/ 目录"
  fi

  # 清理 reader 目录（如果在 output 内则已被清）
  READER_DIR="$OUTPUT_DIR/reader"
  if [ -d "$READER_DIR" ]; then
    rm -rf "$READER_DIR"/*
  fi

  echo ""
fi

# ===== 执行构建 =====
echo "🔨 开始构建..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_DIR"

BUILD_ARGS="--products $PRODUCTS"
if [ "$CLEAN_MODE" = true ]; then
  BUILD_ARGS="$BUILD_ARGS --no-gate"
fi

# 跨平台 Node.js 命令选择
# Windows 下 node.exe 也能在 Linux 上报错但不会崩溃，直接试
if node.exe -v >/dev/null 2>&1; then
  NODE="node.exe"
else
  NODE="node"
fi

$NODE build-all.js $BUILD_ARGS

EXIT_CODE=$?

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ 重建完成！产物位置:"
  echo "   HTML:  $PROJECT_DIR/output/"
  echo "   PDF:   $PROJECT_DIR/output/"
  echo "   Reader: $PROJECT_DIR/output/reader/"
  echo "   MD:    $PROJECT_DIR/output/"
else
  echo ""
  echo "❌ 构建失败，退出码: $EXIT_CODE"
  exit $EXIT_CODE
fi
