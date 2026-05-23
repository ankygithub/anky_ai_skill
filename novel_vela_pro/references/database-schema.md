# 数据库 Schema 参考

## 表结构总览

### novels - 小说主表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| name | TEXT | 小说名称 |
| genre | TEXT | 类型 |
| sub_genre | TEXT | 子类型 |
| target_audience | TEXT | 目标受众 |
| story_structure | TEXT | 故事结构 |
| narrative_perspective | TEXT | 叙事视角 |
| total_chapters | INTEGER | 总章数 |
| words_per_chapter | INTEGER | 每章字数 |
| total_words | INTEGER | 总字数 |
| status | TEXT | 状态 |

### stages - 阶段表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| novel_id | INTEGER FK | 小说ID |
| stage_number | INTEGER | 阶段序号 |
| name | TEXT | 阶段名称 |
| description | TEXT | 描述 |
| start_chapter | INTEGER | 起始章节 |
| end_chapter | INTEGER | 结束章节 |

### characters - 人物表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| novel_id | INTEGER FK | 小说ID |
| name | TEXT | 姓名 |
| type | TEXT | 类型 |
| status | TEXT | 状态 |
| importance | INTEGER | 重要度1-10 |
| is_confirmed | BOOLEAN | 是否确认 |

### chapters - 章节表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| novel_id | INTEGER FK | 小说ID |
| chapter_number | INTEGER | 章节号 |
| title | TEXT | 标题 |
| status | TEXT | 状态 |
| blueprint_md_path | TEXT | 蓝图路径 |

### error_logs - 错误记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 主键 |
| novel_id | INTEGER FK | 小说ID |
| category | TEXT | 分类 |
| severity | TEXT | 严重级别 |
| description | TEXT | 描述 |
| status | TEXT | 状态 |

## 向量表

```sql
CREATE VIRTUAL TABLE vec_chunks USING vec0(
    embedding float[768],
    content_id INTEGER,
    source_type TEXT,
    chunk_index INTEGER
);
```
