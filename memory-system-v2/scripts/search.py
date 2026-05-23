#!/usr/bin/env python3
"""
memory-system-v2 记忆搜索脚本

纯 Python 标准库，无外部依赖。用于在记忆文件中搜索关键词。

用法:
  py.exe search.py search --query "关键词" --scope all
  py.exe search.py search --query "pnpm" --scope global --limit 5
  py.exe search.py search --query "Bug" --scope project --tags env
  py.exe search.py stats --scope all
  py.exe search.py list --scope project
"""

import argparse
import json
from pathlib import Path


HOME_DIR = Path.home()
GLOBAL_MEMORY_DIR = HOME_DIR / ".trae-cn" / "memory"
PROJECT_MEMORY_DIR = Path.cwd() / ".trae" / ".memory"


def read_file_lines(filepath):
    """读取文件行，自动尝试 UTF-8 和 GBK 编码"""
    for encoding in ("utf-8", "gbk"):
        try:
            with open(filepath, "r", encoding=encoding) as f:
                return f.readlines()
        except UnicodeDecodeError:
            continue
        except Exception:
            return []
    return []


def get_search_paths(scope, custom_path=None):
    if custom_path:
        base = Path(custom_path)
        if not base.exists():
            print(json.dumps({
                "status": "error",
                "message": f"自定义路径不存在: {base}",
            }, ensure_ascii=False, indent=2))
            return []
        if scope == "task":
            return [base / "tasks"]
        return [base]

    if scope == "global":
        return [GLOBAL_MEMORY_DIR]

    paths = []
    if scope in ("project", "all"):
        paths.append(PROJECT_MEMORY_DIR)
    if scope in ("task", "all"):
        paths.append(PROJECT_MEMORY_DIR / "tasks")
    if scope in ("global", "all"):
        paths.append(GLOBAL_MEMORY_DIR)
    return paths


def search_in_file(filepath, keyword):
    results = []
    lines = read_file_lines(filepath)
    if not lines:
        return results

    for i, line in enumerate(lines, 1):
        if keyword.lower() in line.lower():
            results.append({
                "line": i,
                "content": line.strip()[:200],
                "file": str(filepath),
            })
    return results


def filter_by_tags(filepath, tags):
    """检查文件是否包含指定的 Tags"""
    lines = read_file_lines(filepath)
    if not lines:
        return False
    content = "".join(lines).lower()
    for tag in tags:
        if tag.lower() in content:
            return True
    return False


def extract_summary(filepath, max_lines=5):
    """提取文件摘要（前几行非空内容）"""
    lines = read_file_lines(filepath)
    if not lines:
        return ""

    summary = []
    for line in lines[:max_lines]:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            summary.append(stripped[:150])
    return " | ".join(summary) if summary else ""


def cmd_search(args):
    keyword = args.query
    limit = args.limit
    tags = [t.strip() for t in args.tags.split(",")] if args.tags else []
    search_paths = get_search_paths(args.scope, args.path)

    all_results = []
    seen_files = set()

    for search_path in search_paths:
        if not search_path.exists():
            continue

        md_files = list(search_path.rglob("*.md"))
        for filepath in md_files:
            if "__pycache__" in str(filepath):
                continue
            if tags and not filter_by_tags(filepath, tags):
                continue
            matches = search_in_file(filepath, keyword)
            if matches:
                if filepath not in seen_files:
                    seen_files.add(filepath)
                    summary = extract_summary(filepath)
                    try:
                        rel = filepath.relative_to(search_path)
                    except ValueError:
                        rel = filepath
                    all_results.append({
                        "file": str(filepath),
                        "relative_path": str(rel),
                        "matches": len(matches),
                        "summary": summary,
                        "match_lines": matches[:3],
                    })

    all_results.sort(key=lambda x: x["matches"], reverse=True)
    if limit and limit > 0:
        all_results = all_results[:limit]

    print(json.dumps({
        "status": "ok",
        "keyword": keyword,
        "scope": args.scope,
        "total_files": len(all_results),
        "total_matches": sum(r["matches"] for r in all_results),
        "results": all_results,
    }, ensure_ascii=False, indent=2))


def cmd_stats(args):
    search_paths = get_search_paths(args.scope, args.path)
    stats = {}

    for search_path in search_paths:
        if not search_path.exists():
            continue

        md_files = list(search_path.rglob("*.md"))
        total_files = len([f for f in md_files if "__pycache__" not in str(f)])

        scope_name = "global" if str(search_path).startswith(str(GLOBAL_MEMORY_DIR)) else "project"
        if scope_name not in stats:
            stats[scope_name] = {"paths": [], "files": 0}
        stats[scope_name]["paths"].append(str(search_path))
        stats[scope_name]["files"] += total_files

    print(json.dumps({
        "status": "ok",
        "stats": stats,
    }, ensure_ascii=False, indent=2))


def cmd_list(args):
    search_paths = get_search_paths(args.scope, args.path)
    all_files = []

    for search_path in search_paths:
        if not search_path.exists():
            continue

        md_files = sorted(search_path.rglob("*.md"))
        for f in md_files:
            if "__pycache__" in str(f):
                continue
            summary = extract_summary(f, max_lines=3)
            all_files.append({
                "file": str(f),
                "summary": summary,
            })

    print(json.dumps({
        "status": "ok",
        "scope": args.scope,
        "total": len(all_files),
        "files": all_files,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="memory-system-v2 记忆搜索工具")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_search = subparsers.add_parser("search", help="搜索记忆")
    p_search.add_argument("--query", required=True, help="搜索关键词")
    p_search.add_argument("--scope", choices=["global", "project", "task", "all"], default="all", help="搜索范围")
    p_search.add_argument("--path", default="", help="自定义搜索路径")
    p_search.add_argument("--limit", type=int, default=0, help="限制返回结果数量（0=不限）")
    p_search.add_argument("--tags", default="", help="按标签过滤，逗号分隔（如: env,Python）")

    p_stats = subparsers.add_parser("stats", help="记忆统计")
    p_stats.add_argument("--scope", choices=["global", "project", "all"], default="all", help="统计范围")
    p_stats.add_argument("--path", default="", help="自定义路径")

    p_list = subparsers.add_parser("list", help="列出所有记忆文件")
    p_list.add_argument("--scope", choices=["global", "project", "task", "all"], default="all", help="列出范围")
    p_list.add_argument("--path", default="", help="自定义路径")

    args = parser.parse_args()

    commands = {
        "search": cmd_search,
        "stats": cmd_stats,
        "list": cmd_list,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
