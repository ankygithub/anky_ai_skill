#!/bin/bash
# 华书 v3 - 一键版本更新 + 构建
# 用法: ./update.sh [all|patch|minor|major|build] ["更新说明"]

set -e

VERSION_FILE="version.json"
ACTION=${1:-all}
MESSAGE=${2:-"更新"}

echo "📦 华书 v3 更新脚本"
echo "   动作: $ACTION"
echo "   说明: $MESSAGE"
echo ""

# 确保在 templates 目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 读取当前版本
CURRENT_VERSION=$(node -e "console.log(require('./version.json').version)")
echo "📦 当前版本: $CURRENT_VERSION"

# 根据动作执行
if [ "$ACTION" == "all" ]; then
    echo "🔄 开始构建所有产物..."
    node build-all.js --products all
elif [ "$ACTION" == "patch" ] || [ "$ACTION" == "minor" ] || [ "$ACTION" == "major" ] || [ "$ACTION" == "build" ]; then
    echo "🔄 更新版本并构建所有产物..."
    node build-all.js --products all --version "$ACTION"
else
    echo "❌ 未知动作: $ACTION"
    echo "   可用动作: all, patch, minor, major, build"
    exit 1
fi

echo ""
echo "✅ 更新完成！"
