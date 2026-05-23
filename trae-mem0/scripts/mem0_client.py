#!/usr/bin/env python3
"""
trae-mem0 记忆系统 - Mem0 REST API 客户端

使用火山引擎记忆库 Mem0 的 REST API 进行记忆的增删改查。
无需安装 mem0ai SDK，仅依赖 requests。

用法:
  python mem0_client.py add --content "xxx" --scope project --type preference
  python mem0_client.py search --query "xxx" --scope all --limit 10
  python mem0_client.py get-all --scope project
  python mem0_client.py update --memory-id "xxx" --content "new content"
  python mem0_client.py delete --memory-id "xxx"
  python mem0_client.py stats --scope all
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests


def load_config():
    script_dir = Path(__file__).resolve().parent
    config_paths = [
        script_dir.parent / "config.json",
        Path.home() / ".trae-cn" / "skills" / "trae-mem0" / "config.json",
    ]
    for cp in config_paths:
        if cp.exists():
            with open(cp, "r", encoding="utf-8") as f:
                return json.load(f)
    print(json.dumps({"status": "error", "message": "配置文件不存在，请先运行 setup.py"}))
    sys.exit(1)


config = load_config()
API_URL = config["api_url"].rstrip("/")
API_KEY = config["api_key"]
HEADERS = {
    "Authorization": f"Token {API_KEY}",
    "Content-Type": "application/json",
}


def get_project_name():
    return os.path.basename(os.getcwd())


def get_user_id(scope, project=None):
    if scope == "global":
        return "global"
    return f"proj:{project or get_project_name()}"


def api_post(path, data):
    url = f"{API_URL}{path}"
    resp = requests.post(url, headers=HEADERS, json=data, timeout=30)
    if resp.status_code >= 400:
        raise Exception(f"API POST {path} 失败: {resp.status_code} {resp.text}")
    return resp.json()


def api_get(path, params=None):
    url = f"{API_URL}{path}"
    resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
    if resp.status_code >= 400:
        raise Exception(f"API GET {path} 失败: {resp.status_code} {resp.text}")
    return resp.json()


def api_patch(path, data):
    url = f"{API_URL}{path}"
    resp = requests.patch(url, headers=HEADERS, json=data, timeout=30)
    if resp.status_code >= 400:
        raise Exception(f"API PATCH {path} 失败: {resp.status_code} {resp.text}")
    return resp.json()


def api_delete(path):
    url = f"{API_URL}{path}"
    resp = requests.delete(url, headers=HEADERS, timeout=30)
    if resp.status_code >= 400:
        raise Exception(f"API DELETE {path} 失败: {resp.status_code} {resp.text}")
    return resp.json()


def cmd_add(args):
    user_id = get_user_id(args.scope, args.project)
    metadata = {
        "type": args.type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if args.tags:
        metadata["tags"] = args.tags.split(",")
    if args.files:
        metadata["related_files"] = args.files.split(",")

    try:
        result = api_post("/v1/memories/", {
            "messages": [{"role": "user", "content": args.content}],
            "user_id": user_id,
            "metadata": metadata,
        })
        results_list = result.get("results", [])
        event_id = results_list[0].get("event_id", "") if results_list else ""
        print(json.dumps({
            "status": "ok",
            "event_id": event_id,
            "scope": args.scope,
            "user_id": user_id,
            "message": "记忆已提交，将在几分钟内完成处理",
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def _normalize_results(results):
    """标准化结果，将 API 返回的 memory 字段映射为 content"""
    for item in results:
        if "memory" in item and "content" not in item:
            item["content"] = item.pop("memory")
    return results


def cmd_search(args):
    try:
        all_results = []

        if args.scope in ("all", "project"):
            project_uid = get_user_id("project", args.project)
            proj_result = api_get("/v1/memories/", {
                "user_id": project_uid,
                "query": args.query,
            })
            proj_items = proj_result.get("results", [])
            for item in proj_items:
                item["_scope"] = "project"
            all_results.extend(proj_items)

        if args.scope in ("all", "global"):
            global_result = api_get("/v1/memories/", {
                "user_id": "global",
                "query": args.query,
            })
            global_items = global_result.get("results", [])
            for item in global_items:
                item["_scope"] = "global"
            all_results.extend(global_items)

        all_results = _normalize_results(all_results)

        print(json.dumps({
            "status": "ok",
            "results": all_results[:args.limit],
            "total": len(all_results),
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def cmd_get_all(args):
    try:
        all_results = []

        if args.scope in ("all", "project"):
            project_uid = get_user_id("project", args.project)
            proj_result = api_get("/v1/memories/", {"user_id": project_uid})
            proj_items = proj_result.get("results", [])
            for item in proj_items:
                item["_scope"] = "project"
            all_results.extend(proj_items)

        if args.scope in ("all", "global"):
            global_result = api_get("/v1/memories/", {"user_id": "global"})
            global_items = global_result.get("results", [])
            for item in global_items:
                item["_scope"] = "global"
            all_results.extend(global_items)

        all_results = _normalize_results(all_results)

        print(json.dumps({
            "status": "ok",
            "results": all_results,
            "total": len(all_results),
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def cmd_update(args):
    try:
        result = api_patch(f"/v1/memories/{args.memory_id}/", {
            "content": args.content,
        })
        print(json.dumps({"status": "ok", "memory_id": args.memory_id}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def cmd_delete(args):
    try:
        result = api_delete(f"/v1/memories/{args.memory_id}/")
        print(json.dumps({"status": "ok", "memory_id": args.memory_id}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def cmd_stats(args):
    try:
        stats = {}

        if args.scope in ("all", "project"):
            project_uid = get_user_id("project", args.project)
            proj_result = api_get("/v1/memories/", {"user_id": project_uid})
            proj_items = proj_result.get("results", [])
            stats["project"] = {
                "total": len(proj_items),
                "user_id": project_uid,
            }

        if args.scope in ("all", "global"):
            global_result = api_get("/v1/memories/", {"user_id": "global"})
            global_items = global_result.get("results", [])
            stats["global"] = {
                "total": len(global_items),
                "user_id": "global",
            }

        if args.scope == "all":
            stats["total"] = stats.get("project", {}).get("total", 0) + stats.get("global", {}).get("total", 0)

        print(json.dumps({"status": "ok", "stats": stats}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="trae-mem0 记忆系统客户端")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_add = subparsers.add_parser("add", help="添加记忆")
    p_add.add_argument("--content", required=True, help="记忆内容")
    p_add.add_argument("--scope", choices=["project", "global"], default="project", help="作用域")
    p_add.add_argument("--type", default="knowledge", help="类型: correction|bugfix|convention|preference|decision|knowledge|task")
    p_add.add_argument("--tags", default="", help="标签，逗号分隔")
    p_add.add_argument("--files", default="", help="相关文件，逗号分隔")
    p_add.add_argument("--project", default="", help="项目名（默认自动获取当前目录名）")

    p_search = subparsers.add_parser("search", help="搜索记忆")
    p_search.add_argument("--query", required=True, help="搜索关键词")
    p_search.add_argument("--scope", choices=["project", "global", "all"], default="all", help="搜索范围")
    p_search.add_argument("--limit", type=int, default=10, help="返回条数")
    p_search.add_argument("--project", default="", help="项目名")

    p_get = subparsers.add_parser("get-all", help="获取所有记忆")
    p_get.add_argument("--scope", choices=["project", "global", "all"], default="all", help="获取范围")
    p_get.add_argument("--project", default="", help="项目名")

    p_upd = subparsers.add_parser("update", help="更新记忆")
    p_upd.add_argument("--memory-id", required=True, help="记忆 ID")
    p_upd.add_argument("--content", required=True, help="新内容")

    p_del = subparsers.add_parser("delete", help="删除记忆")
    p_del.add_argument("--memory-id", required=True, help="记忆 ID")

    p_stats = subparsers.add_parser("stats", help="记忆统计")
    p_stats.add_argument("--scope", choices=["project", "global", "all"], default="all", help="统计范围")
    p_stats.add_argument("--project", default="", help="项目名")

    args = parser.parse_args()

    commands = {
        "add": cmd_add,
        "search": cmd_search,
        "get-all": cmd_get_all,
        "update": cmd_update,
        "delete": cmd_delete,
        "stats": cmd_stats,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()