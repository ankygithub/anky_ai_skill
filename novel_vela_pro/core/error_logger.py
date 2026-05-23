"""
错误记录与分析模块
支持错误分类、记录和统计
"""
import os
from typing import Dict, List, Optional, Any
from datetime import datetime


# 错误严重级别
SEVERITY_LEVELS = {
    "critical": "严重 - 影响剧情逻辑或设定一致性",
    "major": "重要 - 影响阅读体验",
    "minor": "轻微 - 细节问题",
    "warning": "警告 - 建议改进",
}

# 错误分类
ERROR_CATEGORIES = {
    "character": "人物错误 - 性格/能力/状态不一致",
    "plot": "剧情错误 - 逻辑漏洞/时间线矛盾",
    "world": "世界观错误 - 设定冲突/规则破坏",
    "style": "文风错误 - 去AI味/风格偏离",
    "continuity": "连续性错误 - 前后文不一致",
    "grammar": "语法错误 - 错别字/病句",
    "other": "其他",
}


class ErrorLogger:
    """错误记录器"""

    def __init__(self, db):
        self.db = db

    def log(self, novel_id: int, category: str, severity: str,
            description: str, location: Optional[str] = None,
            suggested_fix: Optional[str] = None) -> int:
        """记录错误"""
        if category not in ERROR_CATEGORIES:
            category = "other"
        if severity not in SEVERITY_LEVELS:
            severity = "warning"

        return self.db.log_error({
            "novel_id": novel_id,
            "category": category,
            "severity": severity,
            "description": description,
            "location": location or "",
            "suggested_fix": suggested_fix or "",
        })

    def get_errors(self, novel_id: int, status: Optional[str] = None,
                   severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取错误列表"""
        return self.db.get_errors(novel_id, status=status, severity=severity)

    def get_summary(self, novel_id: int) -> Dict[str, Any]:
        """获取错误统计摘要"""
        all_errors = self.get_errors(novel_id)
        summary = {
            "total": len(all_errors),
            "open": len([e for e in all_errors if e["status"] == "open"]),
            "resolved": len([e for e in all_errors if e["status"] == "resolved"]),
            "by_severity": {},
            "by_category": {},
        }
        for severity in SEVERITY_LEVELS:
            summary["by_severity"][severity] = len([e for e in all_errors if e["severity"] == severity])
        for category in ERROR_CATEGORIES:
            summary["by_category"][category] = len([e for e in all_errors if e["category"] == category])
        return summary

    def resolve(self, error_id: int) -> bool:
        """解决错误"""
        return self.db.resolve_error(error_id)

    def generate_report(self, novel_id: int) -> str:
        """生成错误报告"""
        summary = self.get_summary(novel_id)
        open_errors = self.get_errors(novel_id, status="open")

        lines = [
            "# 错误记录报告",
            "",
            f"## 统计摘要",
            f"- 总错误数：{summary['total']}",
            f"- 待解决：{summary['open']}",
            f"- 已解决：{summary['resolved']}",
            "",
            "## 按严重级别分布",
        ]
        for severity, count in summary["by_severity"].items():
            lines.append(f"- {SEVERITY_LEVELS[severity]}：{count}")

        lines.extend(["", "## 按分类分布"])
        for category, count in summary["by_category"].items():
            lines.append(f"- {ERROR_CATEGORIES[category]}：{count}")

        if open_errors:
            lines.extend(["", "## 待解决错误"])
            for e in open_errors[:20]:
                lines.append(f"### [{e['severity']}] {e['category']} - {e['created_at']}")
                lines.append(f"- 位置：{e.get('location', 'N/A')}")
                lines.append(f"- 描述：{e['description']}")
                if e.get('suggested_fix'):
                    lines.append(f"- 建议修复：{e['suggested_fix']}")
                lines.append("")

        return "\n".join(lines)
