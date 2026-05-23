#!/usr/bin/env python3
"""
trae-mem0 首次配置脚本
生成 config.json 配置文件
"""

import json
import os
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = SKILL_DIR / "config.json"


def setup():
    if CONFIG_PATH.exists():
        print(f"配置文件已存在: {CONFIG_PATH}")
        print("如需重新配置，请删除该文件后重新运行")
        return

    print("=" * 50)
    print("  trae-mem0 记忆系统 - 首次配置")
    print("=" * 50)

    api_url = input("请输入 Mem0 API 地址: ").strip()
    api_key = input("请输入 Mem0 API Key: ").strip()

    if not api_url or not api_key:
        print("错误: API 地址和 Key 不能为空")
        return

    config = {
        "api_url": api_url,
        "api_key": api_key,
    }

    try:
        SKILL_DIR.mkdir(parents=True, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        print(f"配置文件已生成: {CONFIG_PATH}")
        print("配置完成！")
    except Exception as e:
        print(f"写入配置文件失败: {e}")


if __name__ == "__main__":
    setup()