#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Metaso AI Search CLI Tool
支持多种调用方式，自动处理环境变量和参数解析
"""

import sys
import json
import requests
import os
import argparse
from typing import Optional, Dict, Any


# API 配置
DEFAULT_API_URL = "https://metaso.cn/api/v1/search"
DEFAULT_TIMEOUT = 30
MAX_RETRIES = 2


def load_api_key() -> Optional[str]:
    """从多个来源加载 API Key"""
    # 1. 环境变量
    api_key = os.getenv("METASO_API_KEY")
    if api_key:
        return api_key.strip()
    
    # 2. 当前目录下的 .env 文件
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith("METASO_API_KEY="):
                    return line.split("=", 1)[1].strip()
    
    # 3. 用户主目录下的 .metaso_env 文件
    home_env = os.path.join(os.path.expanduser("~"), ".metaso_env")
    if os.path.exists(home_env):
        with open(home_env, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line.startswith("METASO_API_KEY="):
                    return line.split("=", 1)[1].strip()
    
    return None


def metaso_search(api_key: str, request_body: Dict[str, Any], verbose: bool = False) -> Dict[str, Any]:
    """
    执行搜索请求，带重试机制
    
    Args:
        api_key: API 密钥
        request_body: 请求体
        verbose: 是否显示详细信息
    
    Returns:
        搜索结果
    """
    url = DEFAULT_API_URL
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    if verbose:
        print(f"[DEBUG] URL: {url}", file=sys.stderr)
        print(f"[DEBUG] Request Body: {json.dumps(request_body, ensure_ascii=False)}", file=sys.stderr)
    
    # 重试机制
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.post(url, json=request_body, headers=headers, timeout=DEFAULT_TIMEOUT)
            
            if verbose:
                print(f"[DEBUG] Response Status: {response.status_code}", file=sys.stderr)
            
            # 处理 HTTP 错误
            if response.status_code >= 400:
                error_msg = f"HTTP {response.status_code}"
                try:
                    error_data = response.json()
                    if "errMsg" in error_data:
                        error_msg += f": {error_data['errMsg']}"
                    if "errCode" in error_data:
                        error_msg += f" (Code: {error_data['errCode']})"
                except:
                    error_msg += f": {response.text[:200]}"
                
                # 参数错误时尝试自动修正
                if response.status_code == 400 and attempt == 0:
                    print(f"[WARN] 第一次请求失败，尝试自动修正参数...", file=sys.stderr)
                    # 尝试使用替代参数名
                    if "scope" in request_body:
                        request_body["search_type"] = request_body.pop("scope")
                    if "size" in request_body:
                        request_body["count"] = request_body.pop("size")
                    if verbose:
                        print(f"[DEBUG] 修正后的 Request Body: {json.dumps(request_body, ensure_ascii=False)}", file=sys.stderr)
                    continue  # 重试
                
                raise requests.exceptions.HTTPError(error_msg, response=response)
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            last_error = e
            if attempt < MAX_RETRIES:
                print(f"[WARN] 请求失败 ({attempt + 1}/{MAX_RETRIES + 1}): {str(e)}", file=sys.stderr)
                continue
            raise
    
    # 所有重试都失败
    if last_error:
        raise last_error
    
    raise RuntimeError("搜索请求失败")


def validate_and_normalize_params(params: Dict[str, Any]) -> Dict[str, Any]:
    """
    验证并规范化参数
    
    Returns:
        规范化后的参数
    """
    # 必需参数检查
    if "q" not in params or not params["q"].strip():
        raise ValueError("错误：'q' (搜索关键词) 是必需参数，且不能为空。")
    
    # 规范化参数
    normalized = {
        "q": params["q"].strip(),
    }
    
    # 可选参数（使用 API 实际接受的参数名）
    if "scope" in params:
        normalized["search_type"] = str(params["scope"])
    elif "search_type" in params:
        normalized["search_type"] = str(params["search_type"])
    
    if "size" in params:
        size = int(params["size"])
        if size < 1 or size > 50:
            raise ValueError("错误：size 参数必须在 1-50 之间。")
        normalized["count"] = size
    elif "count" in params:
        count = int(params["count"])
        if count < 1 or count > 50:
            raise ValueError("错误：count 参数必须在 1-50 之间。")
        normalized["count"] = count
    else:
        normalized["count"] = 10  # 默认值
    
    # 布尔参数
    for bool_param in ["conciseSnippet", "includeSummary", "includeRawContent", "searchFile"]:
        if bool_param in params:
            val = params[bool_param]
            if isinstance(val, str):
                normalized[bool_param] = val.lower() in ("true", "1", "yes")
            else:
                normalized[bool_param] = bool(val)
    
    # 其他参数
    if "page" in params:
        normalized["page"] = int(params["page"])
    if "format" in params:
        normalized["format"] = str(params["format"])
    
    return normalized


def print_results(results: Dict[str, Any], output_format: str = "json"):
    """
    打印搜索结果
    
    Args:
        results: 搜索结果
        output_format: 输出格式 (json/text/summary)
    """
    if output_format == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    
    elif output_format == "text":
        # 文本格式输出
        webpages = results.get("webpages", [])
        total = results.get("total", 0)
        credits = results.get("credits", 0)
        
        print(f"搜索完成：共 {total} 条结果，消耗 {credits} credits\n")
        print("=" * 80)
        
        for i, page in enumerate(webpages, 1):
            title = page.get("title", "无标题")
            link = page.get("link", "")
            snippet = page.get("snippet", "")
            score = page.get("score", "")
            date = page.get("date", "")
            authors = page.get("authors", [])
            
            print(f"\n[{i}] {title}")
            if link:
                print(f"    链接：{link}")
            if score:
                print(f"    相关度：{score}")
            if date:
                print(f"    日期：{date}")
            if authors:
                print(f"    作者：{', '.join(authors)}")
            if snippet:
                # 清理 snippet 中的换行符
                clean_snippet = " ".join(snippet.split())
                print(f"    摘要：{clean_snippet[:200]}{'...' if len(clean_snippet) > 200 else ''}")
        
        print("\n" + "=" * 80)
    
    elif output_format == "summary":
        # 简洁摘要输出
        webpages = results.get("webpages", [])
        total = results.get("total", 0)
        
        print(f"找到 {total} 条结果，显示前 {len(webpages)} 条：\n")
        
        for i, page in enumerate(webpages, 1):
            title = page.get("title", "无标题")
            snippet = page.get("snippet", "")[:100]
            print(f"{i}. {title}")
            if snippet:
                print(f"   {snippet}...")
            print()


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="Metaso AI 搜索工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 基本搜索
  python search.py -q "人工智能最新发展"
  
  # JSON 参数方式
  python search.py '{"q":"AI 技术","size":5}'
  
  # 指定输出格式
  python search.py -q "AI" --format text
  
  # 详细模式
  python search.py -q "AI" -v
        """
    )
    
    # 参数组
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument(
        "json_input",
        nargs="?",
        help="JSON 格式的请求参数（如：'{\"q\":\"关键词\",\"size\":5}'）"
    )
    input_group.add_argument(
        "-q", "--query",
        help="搜索关键词（快捷方式）"
    )
    
    parser.add_argument(
        "-s", "--size",
        type=int,
        default=10,
        help="返回结果数量 (1-50, 默认：10)"
    )
    parser.add_argument(
        "-t", "--search-type",
        dest="search_type",
        default="webpage",
        help="搜索类型：webpage, news, paper 等 (默认：webpage)"
    )
    parser.add_argument(
        "--include-summary",
        action="store_true",
        help="包含 AI 生成的摘要"
    )
    parser.add_argument(
        "--concise",
        action="store_true",
        help="返回简洁摘要"
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="获取原始内容"
    )
    parser.add_argument(
        "-f", "--format",
        choices=["json", "text", "summary"],
        default="json",
        help="输出格式 (默认：json)"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="显示详细调试信息"
    )
    parser.add_argument(
        "--api-key",
        help="API Key（优先使用环境变量 METASO_API_KEY）"
    )
    
    args = parser.parse_args()
    
    # 解析输入参数
    params = {}
    
    if args.json_input:
        # JSON 输入方式
        try:
            params = json.loads(args.json_input)
        except json.JSONDecodeError as e:
            print(f"错误：JSON 解析失败 - {e}", file=sys.stderr)
            print("提示：请确保 JSON 格式正确，例如：'{\"q\":\"关键词\",\"size\":5}'", file=sys.stderr)
            sys.exit(1)
    
    elif args.query:
        # 快捷参数方式
        params = {
            "q": args.query,
            "size": args.size,
            "scope": args.search_type,
            "includeSummary": args.include_summary,
            "conciseSnippet": args.concise,
            "includeRawContent": args.raw
        }
    
    else:
        print("错误：请提供搜索参数", file=sys.stderr)
        print("用法 1: python search.py -q \"关键词\" [选项]", file=sys.stderr)
        print("用法 2: python search.py '{\"q\":\"关键词\",\"size\":5}'", file=sys.stderr)
        print("提示：运行 python search.py --help 查看完整帮助", file=sys.stderr)
        sys.exit(1)
    
    # 加载 API Key
    api_key = args.api_key or load_api_key()
    if not api_key:
        print("错误：未找到 API Key", file=sys.stderr)
        print("请设置环境变量 METASO_API_KEY，或在当前目录下创建 .env 文件", file=sys.stderr)
        print("示例：METASO_API_KEY=your_api_key_here", file=sys.stderr)
        sys.exit(1)
    
    # 验证和规范化参数
    try:
        request_body = validate_and_normalize_params(params)
    except ValueError as e:
        print(f"错误：{e}", file=sys.stderr)
        sys.exit(1)
    
    # 执行搜索
    if args.verbose:
        print(f"[INFO] 开始搜索：{request_body['q']}", file=sys.stderr)
        print(f"[INFO] API Key: {api_key[:8]}...{api_key[-4:]}", file=sys.stderr)
    
    try:
        results = metaso_search(api_key, request_body, verbose=args.verbose)
        
        if args.verbose:
            print(f"[INFO] 搜索完成，返回 {len(results.get('webpages', []))} 条结果", file=sys.stderr)
        
        # 输出结果
        print_results(results, output_format=args.format)
        
    except requests.exceptions.HTTPError as e:
        print(f"HTTP 错误：{e}", file=sys.stderr)
        if hasattr(e, 'response') and e.response is not None:
            print(f"响应内容：{e.response.text[:500]}", file=sys.stderr)
        sys.exit(1)
    
    except requests.exceptions.Timeout:
        print("错误：请求超时，请检查网络连接", file=sys.stderr)
        sys.exit(1)
    
    except Exception as e:
        print(f"错误：{e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
