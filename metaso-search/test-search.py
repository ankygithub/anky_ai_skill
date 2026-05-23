#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Metaso Search 测试脚本
用于验证优化后的搜索功能
"""

import subprocess
import sys
import os

# 设置 API Key
os.environ["METASO_API_KEY"] = "mk-68B9659D521E87724EDBA808E7FD10F4"

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "scripts", "search.py")

def run_test(test_name, args, expect_success=True):
    """运行测试用例"""
    print(f"\n{'='*60}")
    print(f"测试：{test_name}")
    print(f"命令：python {SCRIPT_PATH} {' '.join(args)}")
    print('='*60)
    
    cmd = [sys.executable, SCRIPT_PATH] + args
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    
    success = result.returncode == 0
    
    if success:
        print(f"✅ 测试通过")
        # 显示部分输出
        output = result.stdout[:500]
        if len(result.stdout) > 500:
            output += "..."
        print(f"输出预览:\n{output}")
    else:
        print(f"❌ 测试失败")
        print(f"错误输出:\n{result.stderr}")
    
    if expect_success and not success:
        print(f"⚠️  预期成功但实际失败")
    elif not expect_success and success:
        print(f"⚠️  预期失败但实际成功")
    
    return success


def main():
    """主测试函数"""
    print("\n" + "="*60)
    print("Metaso Search 优化版本测试套件")
    print("="*60)
    
    tests = [
        # 测试 1: 基本搜索（快捷参数）
        {
            "name": "基本搜索（-q 参数）",
            "args": ["-q", "人工智能发展", "-s", "3"],
            "expect_success": True
        },
        
        # 测试 2: JSON 输入
        {
            "name": "JSON 输入方式",
            "args": ['{"q":"AI 技术","size":3}'],
            "expect_success": True
        },
        
        # 测试 3: 文本格式输出
        {
            "name": "文本格式输出",
            "args": ["-q", "机器学习", "-s", "2", "--format", "text"],
            "expect_success": True
        },
        
        # 测试 4: 摘要格式输出
        {
            "name": "摘要格式输出",
            "args": ["-q", "深度学习", "-s", "3", "--format", "summary"],
            "expect_success": True
        },
        
        # 测试 5: 详细调试模式
        {
            "name": "详细调试模式",
            "args": ["-q", "神经网络", "-s", "2", "-v"],
            "expect_success": True
        },
        
        # 测试 6: 带 AI 摘要
        {
            "name": "包含 AI 摘要",
            "args": ["-q", "大模型", "-s", "2", "--include-summary"],
            "expect_success": True
        },
        
        # 测试 7: 空查询（应失败）
        {
            "name": "空查询（应失败）",
            "args": ["-q", ""],
            "expect_success": False
        },
        
        # 测试 8: 帮助信息
        {
            "name": "帮助信息",
            "args": ["--help"],
            "expect_success": True
        },
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            success = run_test(
                test["name"],
                test["args"],
                test.get("expect_success", True)
            )
            
            if success:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"\n❌ 测试异常：{test['name']}")
            print(f"异常信息：{e}")
            failed += 1
    
    # 总结
    print("\n" + "="*60)
    print("测试总结")
    print("="*60)
    print(f"总测试数：{len(tests)}")
    print(f"✅ 通过：{passed}")
    print(f"❌ 失败：{failed}")
    print(f"成功率：{passed/len(tests)*100:.1f}%")
    print("="*60 + "\n")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
