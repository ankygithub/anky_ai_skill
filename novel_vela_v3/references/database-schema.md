# 数据库Schema参考

## 表结构总览

```
novels（小说）
├── stages（阶段）
│   └── chapters（章节）
│       └── chapter_scenes（场景）
├── characters（人物）
│   ├── character_relations（关系）
│   └── character_appearances（出场记录）
├── maps（地图）
├── foreshadowing（伏笔）
├── versions（版本历史）
└── rag_chunks（RAG切片）
```

---

## novels - 小说项目表

存储小说基本信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| name | TEXT | NOT NULL | 小说名称 |
| genre | TEXT | | 类型（修仙/都市/科幻等） |
| sub_genre | TEXT | | 子类型 |
| target_audience TEXT | | 目标受众 |
| story_structure | TEXT | | 故事结构（三幕式/英雄之旅等） |
| narrative_perspective | TEXT | | 叙事视角（第一人称/第三人称等） |
| total_chapters | INTEGER | | 总章数 |
| words_per_chapter | INTEGER | | 每章目标字数 |
| total_words | INTEGER | | 总目标字数 |
| status | TEXT | DEFAULT 'planning' | 状态：planning/writing/completed |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

**特殊记录**：`__template__` 记录用于标识模版数据库

---

## stages - 阶段表

将全书拆分为多个阶段（部）。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| stage_number | INTEGER | NOT NULL | 阶段序号（1, 2, 3...） |
| name | TEXT | NOT NULL | 阶段名称 |
| description | TEXT | | 阶段描述 |
| word_count | INTEGER | | 阶段预计字数 |
| start_chapter | INTEGER | | 起始章节号 |
| end_chapter | INTEGER | | 结束章节号 |
| map_name | TEXT | | 主要地图名称 |
| status | TEXT | DEFAULT 'planned' | 状态：planned/in_progress/completed |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**业务规则**：
- `start_chapter` 和 `end_chapter` 定义该阶段的章节范围
- 章节编号连续，不跨阶段重复
- 对应"第X部"的概念

---

## characters - 人物表

存储所有人物数据。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| name | TEXT | NOT NULL | 姓名 |
| name_pinyin | TEXT | | 拼音（用于排序） |
| type | TEXT | NOT NULL | 类型：protagonist/deuteragonist/supporting/npc |
| status | TEXT | DEFAULT 'active' | 状态：active/dead/disappeared |
| first_appearance | INTEGER | | 首次出场章节 |
| last_appearance | INTEGER | | 最后出场章节 |
| death_chapter | INTEGER | | 死亡章节（如适用） |
| faction | TEXT | | 所属势力 |
| cultivation_level | TEXT | | 修为等级（修仙类适用） |
| importance | INTEGER | DEFAULT 1 | 重要度1-10 |
| is_confirmed | BOOLEAN | DEFAULT 0 | 是否用户确认（0=AI生成待审核） |
| md_file_path | TEXT | | 详细设定文档路径 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**业务规则**：
- `is_confirmed=0` 表示该人物由AI生成，需用户审阅确认
- NPC类人物可自动确认（`is_confirmed=1`）
- `status='dead'` 后不再出现在活跃人物列表

---

## maps - 地图表

存储世界观中的地点信息。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| name | TEXT | NOT NULL | 地图名称 |
| level | INTEGER | | 层级（1=大区域，2=具体地点） |
| parent_map_id | INTEGER | FOREIGN KEY → maps.id | 父级地图ID |
| description | TEXT | | 地点描述 |
| entry_condition | TEXT | | 进入条件 |
| power_level | TEXT | | 实力水平要求 |
| factions | TEXT | | 势力分布 |
| status | TEXT | DEFAULT 'active' | 状态 |

**层级示例**：
```
level 1: 东荒域
  └─ level 2: 青云宗
       └─ level 3: 外门
            └─ level 4: 弟子居所
```

---

## chapters - 章节表

记录所有章节的基本信息和状态。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| stage_id | INTEGER | FOREIGN KEY → stages.id | 所属阶段 |
| chapter_number | INTEGER | NOT NULL | 章节编号（全局连续） |
| title | TEXT | | 章节标题 |
| map_id | INTEGER | FOREIGN KEY → maps.id | 发生地点 |
| word_count | INTEGER | | 实际字数 |
| status | TEXT | DEFAULT 'planned' | 状态：planned/blueprinted/written/reviewed |
| md_file_path | TEXT | | 正文Markdown路径 |
| blueprint_md_path | TEXT | | 蓝图Markdown路径 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**状态流转**：
```
planned → blueprinted → written → reviewed
```

---

## foreshadowing - 伏笔表

管理伏笔的埋设和回收。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| description | TEXT | NOT NULL | 伏笔描述 |
| plant_chapter | INTEGER | | 埋设章节 |
| resolve_chapter | INTEGER | | 计划回收章节 |
| status | TEXT | DEFAULT 'planted' | 状态：planted/resolved/abandoned |
| importance | INTEGER | DEFAULT 1 | 重要度1-10 |

**查询模式**：
- 待回收：`status='planted' AND (resolve_chapter IS NULL OR resolve_chapter >= 当前章节)`

---

## rag_chunks - RAG内容表

存储向量检索的原始切片内容。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY | 自增主键 |
| novel_id | INTEGER | FOREIGN KEY → novels.id | 所属小说 |
| content | TEXT | NOT NULL | 切片文本内容 |
| source_type | TEXT | NOT NULL | 来源类型：character/map/lore/item/chapter |
| source_id | INTEGER | | 来源对象ID |
| chunk_index | INTEGER | DEFAULT 0 | 切片序号 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**配合使用**：
- 实际向量存储在 sqlite-vec 的虚拟表 `vec_chunks` 中
- 本表存储原始文本，便于查看和管理

---

## 辅助表

### character_relations - 人物关系表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| novel_id | INTEGER | 所属小说 |
| character_a_id | INTEGER | 人物A |
| character_b_id | INTEGER | 人物B |
| relation_type | TEXT | 关系类型（师徒/恋人/敌对等） |
| description | TEXT | 关系描述 |
| start_chapter | INTEGER | 关系开始章节 |
| end_chapter | INTEGER | 关系结束章节 |
| is_active | BOOLEAN | 是否有效 |

### character_appearances - 人物出场记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| character_id | INTEGER | 人物ID |
| chapter_number | INTEGER | 章节号 |
| scene_number | INTEGER | 场景号 |
| role | TEXT | 角色（主角/配角/路人） |
| action | TEXT | 关键行动 |

### chapter_scenes - 章节蓝图场景表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| chapter_id | INTEGER | 所属章节 |
| scene_number | INTEGER | 场景序号 |
| title | TEXT | 场景标题 |
| purpose | TEXT | 场景目的 |
| mood | TEXT | 情绪基调 |
| word_budget | INTEGER | 字数预算 |
| characters | TEXT | 出场人物（JSON/逗号分隔） |
| key_events | TEXT | 关键事件 |
| foreshadowing | TEXT | 伏笔操作 |
| climax_marker | BOOLEAN | 是否高潮 |

### versions - 版本历史表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| novel_id | INTEGER | 所属小说 |
| file_path | TEXT | 文件路径 |
| version_number | INTEGER | 版本号 |
| content_hash | TEXT | 内容哈希 |
| change_summary | TEXT | 变更摘要 |
| created_at | TIMESTAMP | 创建时间 |

---

## 索引建议

为提升查询性能，建议添加以下索引：

```sql
-- 人物查询
CREATE INDEX idx_characters_novel_type ON characters(novel_id, type);

-- 章节范围查询
CREATE INDEX idx_chapters_novel_number ON chapters(novel_id, chapter_number);

-- 伏笔查询
CREATE INDEX idx_foreshadowing_novel_status ON foreshadowing(novel_id, status, resolve_chapter);

-- RAG查询
CREATE INDEX idx_rag_chunks_novel_type ON rag_chunks(novel_id, source_type);
```

---

## 数据完整性规则

1. **删除级联**：删除小说时，应级联删除所有关联数据
2. **章节唯一性**：`(novel_id, chapter_number)` 应唯一
3. **阶段不重叠**：同一小说的阶段章节范围不应重叠
4. **人物确认**：重要人物（非NPC）必须用户确认后才可用于关键剧情
