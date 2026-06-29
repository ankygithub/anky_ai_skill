#!/bin/bash
# 华书 v3 - EPUB生成脚本
# 用法: ./build-epub.sh [项目目录]

set -e

# 获取项目目录
if [ -z "$1" ]; then
  PROJECT_DIR="."
else
  PROJECT_DIR="$1"
fi

# 切换到项目目录
cd "$PROJECT_DIR"

echo "📚 开始生成 EPUB..."
echo "📁 项目目录: $(pwd)"

# 检查依赖
if [ ! -f "version.json" ]; then
  echo "❌ 错误: 未找到 version.json，请确保在项目目录下运行"
  exit 1
fi

if [ ! -d "fragments" ]; then
  echo "❌ 错误: 未找到 fragments 目录"
  exit 1
fi

# 运行 EPUB 生成器（使用新版 build-epub-pro.js）
if [ ! -f "build-epub-pro.js" ]; then
  echo "❌ 错误: 未找到 build-epub-pro.js"
  echo "   请确保项目目录包含 build-epub-pro.js 和 epub-styles.css"
  exit 1
fi

node build-epub-pro.js

echo ""
echo "✅ EPUB 生成完成!"
echo "📖 输出位置: output/"
