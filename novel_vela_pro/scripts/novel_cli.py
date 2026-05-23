#!/usr/bin/env python3
"""
Novel Vela Pro CLI - 工程化管理的AI小说创作工作台

融合 novel_vela 的工程化基础设施 + novel-generator-pro 的创作指导能力
"""
import click
import os
import sys
import shutil

# 添加 core 到路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

from core.db import NovelDB
from core.rag import RAGRetriever
from core.context import ContextManager
from core.learnings import LearningsManager
from core.error_logger import ErrorLogger
from core.diagram import DiagramGenerator
from core.sync_manager import SyncManager
from core.index_manager import IndexManager


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def find_novel_db(project_dir: str = ".") -> str:
    """查找 novel.db"""
    direct = os.path.join(project_dir, "plan", "novel.db")
    if os.path.exists(direct):
        return direct
    if os.path.isdir(project_dir):
        for entry in os.listdir(project_dir):
            if entry.startswith("《") and entry.endswith("》"):
                db_path = os.path.join(project_dir, entry, "plan", "novel.db")
                if os.path.exists(db_path):
                    return db_path
    raise FileNotFoundError(f"未找到 novel.db，请确认项目目录：{project_dir}")


def get_novel_info(db_path: str) -> dict:
    """获取小说基本信息"""
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.execute("SELECT * FROM novels WHERE status != 'template' LIMIT 1")
        row = cursor.fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def get_novel_dir(project_dir: str, novel_name: str) -> str:
    """获取小说项目目录"""
    if os.path.exists(os.path.join(project_dir, "plan", "novel.db")):
        return project_dir
    return os.path.join(project_dir, f"《{novel_name}》")


# ---------------------------------------------------------------------------
# CLI Group
# ---------------------------------------------------------------------------

@click.group()
@click.option("--project", "-p", default=".", help="小说项目目录")
@click.pass_context
def cli(ctx, project):
    """Novel Vela Pro - 工程化管理的AI小说创作工作台"""
    ctx.ensure_object(dict)
    ctx.obj["project"] = project


# ---------------------------------------------------------------------------
# init - 初始化引擎（含10维智能引导）
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("novel_name")
@click.option("--genre", default="", help="小说类型")
@click.option("--words", default=600000, help="总字数")
@click.option("--chapters", default=100, help="总章数")
@click.option("--words-per-chapter", default=6000, help="每章字数")
@click.pass_context
def init(ctx, novel_name, genre, words, chapters, words_per_chapter):
    """初始化新小说项目（含完整模板）"""
    project_dir = ctx.obj.get("project", ".")
    novel_dir = os.path.join(project_dir, f"《{novel_name}》")

    if os.path.exists(novel_dir):
        click.echo(f"错误：目录已存在 {novel_dir}")
        return

    # 创建目录结构
    dirs = [
        os.path.join(novel_dir, "plan", "01-基础配置"),
        os.path.join(novel_dir, "plan", "02-核心设定"),
        os.path.join(novel_dir, "plan", "03-角色设定"),
        os.path.join(novel_dir, "plan", "04-世界观"),
        os.path.join(novel_dir, "plan", "05-情节规划"),
        os.path.join(novel_dir, "plan", "06-阶段规划"),
        os.path.join(novel_dir, "characters", "主角"),
        os.path.join(novel_dir, "characters", "重要配角"),
        os.path.join(novel_dir, "characters", "NPC"),
        os.path.join(novel_dir, "小说正文"),
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)

    # 初始化数据库
    target_db = os.path.join(novel_dir, "plan", "novel.db")
    with NovelDB(target_db) as db:
        novel_id = db.create_novel({
            "name": novel_name,
            "genre": genre,
            "total_chapters": chapters,
            "words_per_chapter": words_per_chapter,
            "total_words": words,
            "status": "planning",
        })

    # 初始化 .learnings/
    lm = LearningsManager(novel_dir)
    template_dir = os.path.join(os.path.dirname(SCRIPT_DIR), ".learnings-template")
    if os.path.exists(template_dir):
        lm.init_from_template(template_dir)

    # 生成模板文件
    _generate_init_templates(novel_dir, novel_name, genre, words, chapters, words_per_chapter)

    # 自动索引到 RAG
    click.echo("   正在建立向量索引...")
    rag = None
    try:
        with NovelDB(target_db) as db:
            novel = db.get_novel_by_name(novel_name)
            if novel:
                rag = RAGRetriever(target_db)
                idx = IndexManager(db, rag, novel["id"])
                results = idx.index_novel_settings(novel_dir)
                total = sum(results.values())
                click.echo(f"   ✅ 向量索引已建立：{total} 个切片")
    except Exception as e:
        click.echo(f"   ⚠️ 向量索引建立失败：{e}")
    finally:
        if rag:
            try:
                rag.close()
            except Exception:
                pass

    click.echo(f"✅ 小说项目已创建：{novel_dir}")
    click.echo(f"   数据库：{target_db}")
    click.echo(f"   记忆系统：{lm.learnings_dir}")
    click.echo(f"   模板文件：plan/01-04 已生成")


def _generate_init_templates(novel_dir: str, novel_name: str, genre: str,
                              words: int, chapters: int, words_per_chapter: int):
    """生成初始化模板文件"""

    # 01-基础配置
    config_md = os.path.join(novel_dir, "plan", "01-基础配置", "小说基本信息.md")
    with open(config_md, "w", encoding="utf-8") as f:
        f.write(f"""# 小说基本信息

## 基础信息
- **小说名称**：{novel_name}
- **类型**：{genre or '待填写'}
- **总字数**：{words}
- **总章数**：{chapters}
- **每章字数**：{words_per_chapter}

## 写作参数
- **叙事视角**：待选择
- **故事结构**：待选择
- **目标受众**：待选择

## 状态
- 当前阶段：初始化完成
""")

    # 02-核心设定
    core_md = os.path.join(novel_dir, "plan", "02-核心设定", "核心设定模板.md")
    with open(core_md, "w", encoding="utf-8") as f:
        f.write("""# 核心设定模板

> 本文件定义小说的核心规则体系。所有后续创作必须遵循此处设定的规则。

## 一、金手指/特殊能力设定

### 能力名称
[待填写]

### 能力等级/成长体系
| 阶段 | 名称 | 解锁条件 | 主要能力 | 限制/代价 |
|------|------|----------|----------|-----------|
| 阶段1 | [名称] | [条件] | [能力] | [限制] |

### 使用规则
- [规则1]
- 禁止事项：
  - [禁止1]

## 二、力量/修炼体系

### 境界划分
| 境界 | 名称 | 特征 | 数量占比 |
|------|------|------|----------|
| 1 | [名称] | [特征] | [占比] |

## 三、核心规则

### 世界运行的基本法则
- [法则1]

### 禁忌/限制
- [禁忌1]

---
> **状态**：待填充
""")

    # 03-角色设定
    char_md = os.path.join(novel_dir, "plan", "03-角色设定", "角色总览模板.md")
    with open(char_md, "w", encoding="utf-8") as f:
        f.write("""# 角色总览模板

> 本文件是角色设定的总入口。

## 一、角色分类

### 主角
| 姓名 | 身份 | 核心特征 | 性格关键词 | 卡片文件 |
|------|------|----------|------------|----------|
| [姓名] | [身份] | [特征] | [关键词] | characters/主角/[姓名].md |

### 重要配角
| 姓名 | 与主角关系 | 定位 | 出场阶段 | 卡片文件 |
|------|-----------|------|----------|----------|
| [姓名] | [关系] | [定位] | [阶段] | characters/重要配角/[姓名].md |

### NPC
| 姓名 | 角色 | 功能 | 出现场景 | 卡片文件 |
|------|------|------|----------|----------|
| [姓名] | [角色] | [功能] | [场景] | characters/NPC/[姓名].md |

## 二、角色卡片模板

```markdown
# [角色名]

## 基本信息
- **姓名**：
- **年龄**：
- **身份**：
- **外貌**：

## 性格特征
- **外在表现**：
- **内在性格**：
- **说话方式**：

## 能力/实力
- **修炼境界**：
- **特殊能力**：
- **战斗风格**：

## 人物弧线
- **出场**：（第X章）
- **发展**：（经历哪些变化）
- **结局**：（最终去向）

## 与其他角色的关系
- 与[A]：（关系描述）

## 经典台词
1. ""
```

## 三、角色关系图

```mermaid
graph LR
    A[主角] --> B[角色B]
    A --> C[角色C]
```

---
> **状态**：待填充
""")

    # 04-世界观
    world_md = os.path.join(novel_dir, "plan", "04-世界观", "世界观框架模板.md")
    with open(world_md, "w", encoding="utf-8") as f:
        f.write("""# 世界观框架模板

> 本文件定义小说世界的整体架构。

## 一、世界格局

### 地理结构
```
[最高位面/核心区域]
├── [中级区域A]
│   ├── [低级区域A1] ← 主角起始地
│   └── [低级区域A2]
└── [特殊区域/禁地]
```

### 各区域详情

#### [区域名称 - 起始地]
- **位置**：世界中的相对位置
- **规模**：大小范围
- **特点**：环境、资源、人文特色
- **主要城市/地点**：
  - [城市1]：[简介]

## 二、势力分布

### 势力等级
| 等级 | 类型 | 示例 | 影响范围 |
|------|------|------|----------|
| 顶级 | [类型] | [示例] | [范围] |

### 主要势力
| 势力名称 | 势力等级 | 核心人物 | 领地/基地 | 与主角关系 |
|----------|----------|----------|-----------|-----------|
| [名称] | [等级] | [人物] | [基地] | [关系] |

## 三、力量层级

### 修炼/力量体系
（与《02-核心设定》保持一致）

### 实力对标
| 层级 | 典型表现 | 社会地位 | 代表人物 |
|------|----------|----------|----------|
| [层级] | [表现] | [地位] | [人物] |

## 四、种族/物种

| 种族 | 特征 | 分布 | 与人类关系 |
|------|------|------|-----------|
| [种族] | [特征] | [分布] | [关系] |

## 五、历史背景

### 重要历史事件
| 时间 | 事件 | 影响 |
|------|------|------|
| [时间] | [事件] | [影响] |

## 六、经济/货币体系

- 货币单位及换算
- 资源获取方式

---
> **状态**：待填充
""")


# ---------------------------------------------------------------------------
# outline - 大纲管理
# ---------------------------------------------------------------------------

@cli.group()
def outline():
    """全书大纲管理"""
    pass


@outline.command()
@click.pass_context
def generate(ctx):
    """生成全书大纲模板"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        if not novel:
            click.echo("错误：未找到小说信息")
            return

        novel_dir = get_novel_dir(project_dir, novel["name"])
        outline_path = os.path.join(novel_dir, "plan", "05-情节规划", "全书大纲.md")

        content = f"""# 《{novel['name']}》全书大纲

> 状态：草稿

## 一、故事梗概

[待生成]

## 二、分阶段剧情

### 阶段1
- **章节范围**：
- **核心剧情**：
- **爽点设计**：
- **地图**：

## 三、主要人物弧线

## 四、关键转折点

## 五、世界观框架

---
**注意**：本大纲由AI生成，请审阅并修改。
"""
        with open(outline_path, "w", encoding="utf-8") as f:
            f.write(content)
        click.echo(f"✅ 大纲模板已生成：{outline_path}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@outline.command()
@click.pass_context
def show(ctx):
    """查看大纲"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])
        outline_path = os.path.join(novel_dir, "plan", "05-情节规划", "全书大纲.md")
        if os.path.exists(outline_path):
            with open(outline_path, "r", encoding="utf-8") as f:
                click.echo(f.read()[:2000])
        else:
            click.echo("大纲文件不存在")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# stage - 阶段规划
# ---------------------------------------------------------------------------

@cli.group()
def stage():
    """阶段规划管理"""
    pass


@stage.command(name="list")
@click.pass_context
def stage_list(ctx):
    """列出所有阶段"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            stages = db.get_stages(novel["id"])
            if not stages:
                click.echo("暂无阶段规划")
                return
            click.echo(f"{'序号':<6}{'名称':<20}{'章节范围':<15}{'字数':<10}{'状态'}")
            click.echo("-" * 60)
            for s in stages:
                click.echo(f"{s['stage_number']:<6}{s['name']:<20}第{s['start_chapter']}-{s['end_chapter']}章{s['word_count'] or 0:<10}{s['status']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@stage.command()
@click.argument("stage_number", type=int)
@click.option("--name", required=True, help="阶段名称")
@click.option("--start", required=True, type=int, help="起始章节")
@click.option("--end", required=True, type=int, help="结束章节")
@click.option("--words", type=int, help="阶段字数")
@click.option("--map", "map_name", default="", help="主要地图")
@click.pass_context
def add(ctx, stage_number, name, start, end, words, map_name):
    """添加阶段规划"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            stage_id = db.create_stage({
                "novel_id": novel["id"],
                "stage_number": stage_number,
                "name": name,
                "start_chapter": start,
                "end_chapter": end,
                "word_count": words,
                "map_name": map_name,
            })
            novel_dir = get_novel_dir(project_dir, novel["name"])
            stage_dir = os.path.join(novel_dir, "plan", "06-阶段规划", f"阶段{stage_number}-{name}")
            os.makedirs(stage_dir, exist_ok=True)
            os.makedirs(os.path.join(stage_dir, "章节蓝图"), exist_ok=True)

            outline_path = os.path.join(stage_dir, "阶段概要.md")
            with open(outline_path, "w", encoding="utf-8") as f:
                f.write(f"""# 阶段{stage_number}：{name}

## 基本信息
- **章节范围**：第{start}章 - 第{end}章
- **预计字数**：{words or '待计算'}
- **主要地图**：{map_name or '待设定'}

## 阶段剧情概要
[待填写]

## 阶段目标
[待填写]

## 阶段爽点
[待填写]

## 出场人物
[待生成]
""")
            click.echo(f"✅ 阶段已添加：{name}（第{start}-{end}章）")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# blueprint - 章节蓝图
# ---------------------------------------------------------------------------

@cli.group()
def blueprint():
    """章节蓝图管理"""
    pass


@blueprint.command()
@click.argument("start", type=int)
@click.argument("end", type=int)
@click.pass_context
def generate(ctx, start, end):
    """生成章节蓝图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        with NovelDB(db_path) as db:
            for cn in range(start, end + 1):
                chapter_id = db.create_chapter({
                    "novel_id": novel["id"],
                    "chapter_number": cn,
                    "status": "blueprinted",
                })
                stages = db.get_stages(novel["id"])
                target_stage_dir = None
                for s in stages:
                    if s["start_chapter"] <= cn <= s["end_chapter"]:
                        target_stage_dir = os.path.join(
                            novel_dir, "plan", "06-阶段规划",
                            f"阶段{s['stage_number']}-{s['name']}", "章节蓝图"
                        )
                        break
                if not target_stage_dir:
                    target_stage_dir = os.path.join(novel_dir, "plan", "06-阶段规划", "章节蓝图")

                os.makedirs(target_stage_dir, exist_ok=True)
                bp_path = os.path.join(target_stage_dir, f"第{cn:03d}章蓝图.md")
                with open(bp_path, "w", encoding="utf-8") as f:
                    f.write(f"""# 第{cn}章蓝图

## 目标
[待填写]

## 场景列表

### 场景1
- **目的**：
- **情绪**：
- **字数预算**：
- **出场人物**：
- **关键事件**：

## 伏笔操作
- [埋下]
- [回收]

## 爽点标记
- [ ]
""")
                db.update_chapter(chapter_id, {"blueprint_md_path": bp_path})
        click.echo(f"✅ 已生成第{start}-{end}章蓝图")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@blueprint.command()
@click.argument("chapter_number", type=int)
@click.pass_context
def show(ctx, chapter_number):
    """查看章节蓝图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            chapter = db.get_chapter(novel["id"], chapter_number)
            if chapter and chapter.get("blueprint_md_path") and os.path.exists(chapter["blueprint_md_path"]):
                with open(chapter["blueprint_md_path"], "r", encoding="utf-8") as f:
                    click.echo(f.read())
            else:
                click.echo("蓝图不存在")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# context - 上下文管理
# ---------------------------------------------------------------------------

@cli.group()
def context():
    """上下文管理（强制读取接口）"""
    pass


@context.command()
@click.argument("chapter_number", type=int)
@click.option("--rag/--no-rag", default=True, help="是否启用RAG召回")
@click.pass_context
def get(ctx, chapter_number, rag):
    """获取写作上下文报告"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            ctx_mgr = ContextManager(db, novel["id"])
            rag_results = None
            if rag:
                rag_retriever = None
                try:
                    rag_retriever = RAGRetriever(db_path)
                    chapter = db.get_chapter(novel["id"], chapter_number)
                    query = f"第{chapter_number}章"
                    if chapter and chapter.get("title"):
                        query += f" {chapter['title']}"
                    rag_results = rag_retriever.search(query, top_k=5, novel_id=novel["id"])
                except Exception as e:
                    click.echo(f"⚠️ RAG召回失败：{e}", err=True)
                finally:
                    if rag_retriever:
                        try:
                            rag_retriever.close()
                        except Exception:
                            pass

            report = ctx_mgr.build_context_report(chapter_number, rag_results)
            click.echo(report)
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# write - 写作
# ---------------------------------------------------------------------------

@cli.command()
@click.argument("chapter_number", type=int)
@click.pass_context
def write(ctx, chapter_number):
    """写作指定章节"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        click.echo("=== 正在加载上下文 ===")
        click.echo(f"请确保已执行：python scripts/novel_cli.py context get {chapter_number}")

        with NovelDB(db_path) as db:
            chapter = db.get_chapter(novel["id"], chapter_number)

        if not chapter or not chapter.get("blueprint_md_path"):
            click.echo(f"⚠️ 第{chapter_number}章蓝图不存在")
            return

        stage_number = 1
        with NovelDB(db_path) as db:
            stages = db.get_stages(novel["id"])
            for s in stages:
                if s["start_chapter"] <= chapter_number <= s["end_chapter"]:
                    stage_number = s["stage_number"]
                    break

        click.echo(f"\n=== 第{chapter_number}章写作准备 ===")
        click.echo("写作流程：1.读取上下文 → 2.按场景生成 → 3.自动合并 → 4.去AI味 → 5.复核 → 6.保存")

        body_dir = os.path.join(novel_dir, "小说正文", f"第{stage_number}部")
        os.makedirs(body_dir, exist_ok=True)
        body_path = os.path.join(body_dir, f"{chapter_number:03d}.md")
        click.echo(f"正文将保存至：{body_path}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# character - 人物管理
# ---------------------------------------------------------------------------

@cli.group()
def character():
    """人物管理"""
    pass


@character.command(name="list")
@click.pass_context
def character_list(ctx):
    """列出所有人物"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            characters = db.get_characters(novel["id"])
            if not characters:
                click.echo("暂无人物")
                return
            click.echo(f"{'姓名':<12}{'类型':<12}{'状态':<10}{'重要度':<8}{'确认'}")
            click.echo("-" * 50)
            for char in characters:
                confirmed = "✓" if char["is_confirmed"] else " "
                click.echo(f"{char['name']:<12}{char['type']:<12}{char['status']:<10}{char['importance']:<8}{confirmed}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@character.command()
@click.argument("name")
@click.option("--type", default="supporting", help="人物类型")
@click.option("--importance", default=5, type=int, help="重要度1-10")
@click.option("--confirmed/--no-confirmed", default=False, help="是否用户确认")
@click.pass_context
def add(ctx, name, type, importance, confirmed):
    """添加人物"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            char_id = db.create_character({
                "novel_id": novel["id"],
                "name": name,
                "type": type,
                "importance": importance,
                "is_confirmed": 1 if confirmed else 0,
            })

            # 自动索引到 RAG
            rag = None
            try:
                rag = RAGRetriever(db_path)
                idx = IndexManager(db, rag, novel["id"])
                content = f"角色：{name}\n类型：{type}\n重要度：{importance}"
                idx.index_text(content, "character", char_id)
                click.echo(f"   ✅ 已索引到向量库")
            except Exception as e:
                click.echo(f"   ⚠️ 向量索引失败：{e}")
            finally:
                if rag:
                    try:
                        rag.close()
                    except Exception:
                        pass

            click.echo(f"✅ 人物已添加：{name}（ID: {char_id}）")
            if not confirmed and type != "npc":
                click.echo("   ⚠️ 该人物尚未确认")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# map - 地图管理
# ---------------------------------------------------------------------------

@cli.group(name="map")
def map_cmd():
    """地图管理"""
    pass


@map_cmd.command(name="list")
@click.pass_context
def map_list(ctx):
    """列出所有地图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        with NovelDB(db_path) as db:
            novel = get_novel_info(db_path)
            maps = db.get_maps(novel["id"])
            if not maps:
                click.echo("暂无地图")
                return
            click.echo(f"{'名称':<15}{'层级':<6}{'实力水平':<12}{'状态'}")
            click.echo("-" * 40)
            for m in maps:
                click.echo(f"{m['name']:<15}{m.get('level', ''):<6}{m.get('power_level', ''):<12}{m['status']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# rag - 向量检索
# ---------------------------------------------------------------------------

@cli.group()
def rag():
    """RAG向量检索"""
    pass


@rag.command()
@click.argument("query")
@click.option("--type", "source_type", help="按类型过滤")
@click.option("--top-k", default=5, help="返回结果数量")
@click.pass_context
def search(ctx, query, source_type, top_k):
    """语义搜索相关设定"""
    project_dir = ctx.obj.get("project", ".")
    retriever = None
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        retriever = RAGRetriever(db_path)
        results = retriever.search(query, top_k=top_k, novel_id=novel["id"], source_type=source_type)
        if not results:
            click.echo("未找到相关设定")
            return
        click.echo(f"搜索：'{query}' 找到 {len(results)} 条结果\n")
        for i, r in enumerate(results, 1):
            click.echo(f"{i}. [{r['source_type']}] (距离: {r['distance']:.4f})")
            click.echo(f"   {r['content'][:200]}...")
            click.echo()
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")
    except Exception as e:
        click.echo(f"搜索失败：{e}")
    finally:
        if retriever:
            try:
                retriever.close()
            except Exception:
                pass


@rag.command()
@click.pass_context
def rebuild(ctx):
    """重建向量索引"""
    project_dir = ctx.obj.get("project", ".")
    retriever = None
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        retriever = RAGRetriever(db_path)
        retriever.rebuild_index(novel_id=novel["id"])
        click.echo("✅ 向量索引已重建")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")
    finally:
        if retriever:
            try:
                retriever.close()
            except Exception:
                pass


@rag.command()
@click.pass_context
def status(ctx):
    """查看向量索引状态"""
    project_dir = ctx.obj.get("project", ".")
    retriever = None
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        retriever = RAGRetriever(db_path)
        info = retriever.get_status(novel_id=novel["id"])
        click.echo(f"向量索引状态：")
        click.echo(f"  总切片数：{info['total_chunks']}")
        click.echo(f"  嵌入模型：{info['model']}")
        click.echo(f"  Ollama地址：{info['ollama_url']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")
    finally:
        if retriever:
            try:
                retriever.close()
            except Exception:
                pass


@rag.command()
@click.pass_context
def index(ctx):
    """手动执行完整索引（文件+数据库）"""
    project_dir = ctx.obj.get("project", ".")
    rag = None
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        click.echo("=== 开始重建向量索引 ===")
        with NovelDB(db_path) as db:
            rag = RAGRetriever(db_path)
            idx = IndexManager(db, rag, novel["id"])
            results = idx.full_index(novel_dir)

        click.echo(f"\n✅ 索引完成")
        click.echo(f"  设定文件切片：{sum(results['files'].values())}")
        for src_type, count in results["files"].items():
            click.echo(f"    - {src_type}: {count}")
        click.echo(f"  人物索引：{results['characters']}")
        click.echo(f"  地图索引：{results['maps']}")
        click.echo(f"  阶段索引：{results['stages']}")
        click.echo(f"  总计：{results['total_chunks']} 个切片")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")
    except Exception as e:
        click.echo(f"索引失败：{e}")
    finally:
        if rag:
            try:
                rag.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# audit - 审查与同步
# ---------------------------------------------------------------------------

@cli.group()
def audit():
    """审查与同步"""
    pass


@audit.command()
@click.argument("chapter_number", type=int)
@click.pass_context
def chapter(ctx, chapter_number):
    """审查章节"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            chapter = db.get_chapter(novel["id"], chapter_number)
            if not chapter:
                click.echo(f"错误：第{chapter_number}章不存在")
                return

            click.echo(f"=== 审查报告：第{chapter_number}章 ===\n")
            click.echo("【审查维度1】蓝图符合度")
            if chapter.get("blueprint_md_path") and os.path.exists(chapter["blueprint_md_path"]):
                click.echo("  ✅ 蓝图文件存在")
            else:
                click.echo("  ⚠️ 蓝图文件缺失")

            click.echo("\n【审查维度2】人物一致性")
            active_chars = db.get_active_characters(novel["id"], chapter_number)
            click.echo(f"  当前活跃人物：{len(active_chars)}位")

            click.echo("\n【审查维度3】伏笔处理")
            foreshadowing = db.get_active_foreshadowing(novel["id"], chapter_number)
            click.echo(f"  待回收伏笔：{len(foreshadowing)}条")

            click.echo("\n【审查维度4】章节状态")
            click.echo(f"  当前状态：{chapter['status']}")

            click.echo("\n=== 审查完成 ===")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@audit.command(name="range")
@click.argument("range_str")
@click.pass_context
def audit_range(ctx, range_str):
    """批量审查，如 1-10"""
    try:
        start, end = map(int, range_str.split("-"))
    except ValueError:
        click.echo("错误：范围格式应为 起始-结束")
        return
    click.echo(f"批量审查第{start}-{end}章...")
    for cn in range(start, end + 1):
        click.echo(f"\n--- 第{cn}章 ---")
        ctx.invoke(chapter, chapter_number=cn)


# ---------------------------------------------------------------------------
# sync - 同步管理
# ---------------------------------------------------------------------------

@cli.group()
def sync():
    """同步管理"""
    pass


@sync.command()
@click.pass_context
def db_to_md(ctx):
    """将DB内容同步到Markdown和.learnings/"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        with NovelDB(db_path) as db:
            # 同步到 .learnings/
            lm = LearningsManager(novel_dir)
            sync_mgr = SyncManager(db, lm)
            sync_mgr.sync_db_to_learnings(novel["id"])

            # 同步人物总览
            characters = db.get_characters(novel["id"])
            char_md_dir = os.path.join(novel_dir, "plan", "03-角色设定")
            os.makedirs(char_md_dir, exist_ok=True)
            char_md_path = os.path.join(char_md_dir, "人物总览.md")
            with open(char_md_path, "w", encoding="utf-8") as f:
                f.write("# 人物总览\n\n")
                f.write("| 姓名 | 类型 | 状态 | 势力 | 修为 | 首次出场 |\n")
                f.write("|------|------|------|------|------|----------|\n")
                for char in characters:
                    f.write(f"| {char['name']} | {char['type']} | {char['status']} | {char.get('faction', '')} | {char.get('cultivation_level', '')} | {char.get('first_appearance', '')} |\n")

            # 同步到 RAG 向量库
            click.echo("   正在同步到向量索引...")
            try:
                rag = RAGRetriever(db_path)
                idx = IndexManager(db, rag, novel["id"])
                results = idx.full_index(novel_dir)
                click.echo(f"✅ 向量索引同步完成：{results['total_chunks']} 个切片")
            except Exception as e:
                click.echo(f"   ⚠️ 向量索引同步失败：{e}")
            finally:
                if rag:
                    try:
                        rag.close()
                    except Exception:
                        pass

            click.echo(f"✅ 同步完成")
            click.echo(f"   .learnings/：{lm.learnings_dir}")
            click.echo(f"   人物总览：{char_md_path}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@sync.command()
@click.pass_context
def check(ctx):
    """检查一致性"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        with NovelDB(db_path) as db:
            lm = LearningsManager(novel_dir)
            sync_mgr = SyncManager(db, lm)
            result = sync_mgr.check_consistency(novel["id"])

            click.echo("=== 一致性检查报告 ===")
            if result["consistent"]:
                click.echo("✅ DB 与 .learnings/ 一致")
            else:
                click.echo("⚠️ 发现不一致：")
                for issue in result["issues"]:
                    click.echo(f"   - {issue['type']}: DB={issue['db_count']}, Learnings={issue['learnings_count']}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# diagram - 图解生成
# ---------------------------------------------------------------------------

@cli.group()
def diagram():
    """Mermaid图解生成"""
    pass


@diagram.command()
@click.pass_context
def character(ctx):
    """生成人物关系图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            characters = db.get_characters(novel["id"])
            if not characters:
                click.echo("暂无人物数据")
                return
            click.echo(DiagramGenerator.character_relationship(characters))
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@diagram.command()
@click.pass_context
def timeline(ctx):
    """生成剧情时间线图"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            stages = db.get_stages(novel["id"])
            if not stages:
                click.echo("暂无阶段数据")
                return
            click.echo(DiagramGenerator.plot_timeline(stages))
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# error - 错误记录
# ---------------------------------------------------------------------------

@cli.group()
def error():
    """错误记录管理"""
    pass


@error.command()
@click.option("--category", required=True, help="错误分类")
@click.option("--severity", required=True, help="严重级别")
@click.option("--desc", required=True, help="错误描述")
@click.option("--location", help="错误位置")
@click.option("--fix", help="建议修复")
@click.pass_context
def log(ctx, category, severity, desc, location, fix):
    """记录错误"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            logger = ErrorLogger(db)
            error_id = logger.log(novel["id"], category, severity, desc, location, fix)
            click.echo(f"✅ 错误已记录（ID: {error_id}）")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@error.command()
@click.pass_context
def report(ctx):
    """生成错误报告"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)

        with NovelDB(db_path) as db:
            logger = ErrorLogger(db)
            click.echo(logger.generate_report(novel["id"]))
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# learnings - 记忆系统
# ---------------------------------------------------------------------------

@cli.group()
def learnings():
    """.learnings/ 记忆系统管理"""
    pass


@learnings.command()
@click.pass_context
def status(ctx):
    """查看记忆系统状态"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        lm = LearningsManager(novel_dir)
        files = lm.list_files()
        click.echo(f"=== .learnings/ 状态 ===")
        click.echo(f"记忆文件数：{len(files)}")
        for f in files:
            click.echo(f"  ✅ {f}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


@learnings.command()
@click.argument("filename")
@click.pass_context
def read(ctx, filename):
    """读取记忆文件"""
    project_dir = ctx.obj.get("project", ".")
    try:
        db_path = find_novel_db(project_dir)
        novel = get_novel_info(db_path)
        novel_dir = get_novel_dir(project_dir, novel["name"])

        lm = LearningsManager(novel_dir)
        content = lm.read(filename)
        if content:
            click.echo(content)
        else:
            click.echo(f"文件不存在或为空：{filename}")
    except FileNotFoundError as e:
        click.echo(f"错误：{e}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cli()
