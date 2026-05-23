"""四层分层抽样模块 - 从百万字网文中提取代表性章节"""

import re
from typing import Optional

from scripts.config import SamplingConfig
from scripts.models.book import Book
from scripts.models.chapter import Chapter, ChapterType


class StratifiedSampler:
    """
    四层分层采样器
    
    采样策略：
    1. OPENING (开篇): 固定取前N章，建立世界观和人物关系
    2. CLIMAX (高潮): 多指标打分 + 分散采样，识别战斗/冲突密集章节
    3. DAILY (日常): 反选逻辑，识别过渡性、生活化章节
    4. ENDING (收尾): 固定取最后N章，了解结局走向
    
    设计思路：
    - 网文通常百万字，LLM无法一次性分析全部内容
    - 需要提取"代表性样本"保留风格特征
    - 四层覆盖叙事弧线的不同阶段，避免偏差
    """

    # 情绪激烈词库（用于高潮检测）
    EMOTION_KEYWORDS = [
        "震惊", "突破", "碾压", "秒杀", "轰杀", "爆裂", "粉碎",
        "恐怖", "绝望", "狂暴", "毁灭", "血腥", "惨烈",
        "惊天", "动地", "逆转", "翻盘", "绝杀", "暴击",
        "怒吼", "咆哮", "撕裂", "斩断"
    ]

    # 战斗相关标题词（用于高潮检测）
    BATTLE_TITLE_KEYWORDS = [
        "战", "杀", "突破", "震惊", "打脸", "碾压",
        "逆袭", "决战", "灭", "屠", "斩", "破"
    ]

    # 生活化词汇（用于日常检测）
    DAILY_KEYWORDS = [
        "吃饭", "聊天", "修炼", "打坐", "逛街", "院子",
        "茶", "笑", "说", "阳光", "微风", "舒服",
        "休息", "散步", "晚餐", "早餐", "午餐", "闲聊",
        "惬意", "宁静", "温馨", "平淡", "日常", "悠闲"
    ]

    def __init__(self, config: Optional[SamplingConfig] = None):
        """
        初始化采样器
        
        Args:
            config: 抽样配置，为空则使用默认值
        """
        self.config = config or SamplingConfig()

    def sample(self, book: Book) -> list[Chapter]:
        """
        对单本书执行四层分层抽样
        
        算法流程：
        1. 提取开篇章节（固定数量）
        2. 识别高潮章节（多指标打分 + 区域分散）
        3. 识别日常章节（反选逻辑）
        4. 提取收尾章节（固定数量）
        5. 去重合并，按章节顺序返回
        
        Args:
            book: 已解析的书籍对象
            
        Returns:
            抽样后的章节列表（已标注 layer_type）
        """
        if not book.chapters:
            return []

        sampled_chapters: list[Chapter] = []
        selected_indices: set[int] = set()

        # 第一层：开篇（固定取前N章）
        opening_chapters = self._sample_opening(book)
        for ch in opening_chapters:
            ch.layer_type = ChapterType.OPENING
            selected_indices.add(ch.index)
        sampled_chapters.extend(opening_chapters)

        # 第二层：高潮（算法识别）
        climax_chapters = self._detect_climax_chapters(book, selected_indices)
        for ch in climax_chapters:
            ch.layer_type = ChapterType.CLIMAX
            selected_indices.add(ch.index)
        sampled_chapters.extend(climax_chapters)

        # 第三层：日常（反选逻辑）
        daily_chapters = self._detect_daily_chapters(book, selected_indices)
        for ch in daily_chapters:
            ch.layer_type = ChapterType.DAILY
            selected_indices.add(ch.index)
        sampled_chapters.extend(daily_chapters)

        # 第四层：收尾（固定取最后N章）
        ending_chapters = self._sample_ending(book)
        for ch in ending_chapters:
            # 收尾可能与前面重叠，跳过已选的
            if ch.index not in selected_indices:
                ch.layer_type = ChapterType.ENDING
                selected_indices.add(ch.index)
                sampled_chapters.append(ch)

        # 按章节索引排序，保持阅读顺序
        sampled_chapters.sort(key=lambda x: x.index)

        return sampled_chapters

    def _sample_opening(self, book: Book) -> list[Chapter]:
        """
        采样开篇章节
        
        策略：固定取前N章（默认5章）
        原因：开篇通常包含世界观建立、主角登场、核心矛盾引入，
              是理解整本书风格的基石
        
        Args:
            book: 书籍对象
            
        Returns:
            开篇章节列表
        """
        count = min(self.config.opening_count, book.chapter_count)
        return book.chapters[:count]

    def _sample_ending(self, book: Book) -> list[Chapter]:
        """
        采样收尾章节
        
        策略：固定取最后N章（默认3章）
        原因：结尾揭示最终走向、人物结局、主题升华
        
        Args:
            book: 书籍对象
            
        Returns:
            收尾章节列表
        """
        count = min(self.config.ending_count, book.chapter_count)
        return book.chapters[-count:]

    def _detect_climax_chapters(
        self, 
        book: Book, 
        exclude_indices: set[int]
    ) -> list[Chapter]:
        """
        识别高潮章节（多指标打分 + 区域分散采样）
        
        核心算法：
        1. 对每个候选章节计算综合得分（5个指标加权）
        2. 将全书划分为前/中/后三个区域
        3. 每个区域选取得分最高的N章（避免集中在某一阶段）
        
        五大指标：
        - 情绪词密度：高频出现激烈情绪词 → 冲突激烈
        - 对话密度突变：与上一章差异大 → 节奏转折
        - 短段落密集：快节奏信号（段落<30字占比>60%）
        - 标题含战斗词：直接暗示战斗场景
        - 字数偏长：重要情节通常篇幅较长（>3500字）
        
        Args:
            book: 书籍对象
            exclude_indices: 已选章节索引集合（需排除）
            
        Returns:
            高潮章节列表（已设置 score）
        """
        # 过滤掉已选章节
        candidates = [
            ch for ch in book.chapters 
            if ch.index not in exclude_indices
        ]
        
        if not candidates:
            return []

        # 计算每个章节的高潮得分
        scored_chapters = []
        for ch in candidates:
            score = self._climax_score(ch, book.chapters)
            ch.score = score
            scored_chapters.append((ch, score))

        # 按区域分散采样
        return self._regional_sample(
            scored_chapters, 
            self.config.climax_count,
            book.chapter_count
        )

    def _climax_score(
        self, 
        chapter: Chapter, 
        all_chapters: list[Chapter]
    ) -> float:
        """
        计算单个章节的"高潮程度"得分
        
        加权公式：
        score = w1*情绪密度 + w2*对话突变 + w3*短段比 + w4*标题词 + w5*字数因子
        
        权重设计思路：
        - 情绪词最直接反映冲突强度，权重最高(0.35)
        - 对话突变反映节奏变化，权重次之(0.20)
        - 短段落是快节奏的强信号(0.20)
        - 标题词是显式提示(0.15)
        - 字数因子辅助判断重要性(0.10)
        
        Args:
            chapter: 待评分章节
            all_chapters: 全部章节（用于计算上一章对话密度）
            
        Returns:
            0.0~1.0 的归一化得分
        """
        # 指标1：情绪词密度（归一化到千字频次）
        emotion_density = self._calc_keyword_density(
            chapter.content, 
            self.EMOTION_KEYWORDS
        )
        score_emotion = min(emotion_density / 10.0, 1.0)  # 10‰为满分

        # 指标2：对话密度突变（与上一章的差异）
        curr_dialogue = self._dialogue_ratio(chapter.content)
        prev_idx = chapter.index - 1
        if prev_idx >= 0 and prev_idx < len(all_chapters):
            prev_dialogue = self._dialogue_ratio(all_chapters[prev_idx].content)
            dialogue_diff = abs(curr_dialogue - prev_dialogue)
        else:
            dialogue_diff = 0.0
        score_dialogue = min(dialogue_diff * 2, 1.0)  # 差异50%即满分

        # 指标3：短段落密集度（段落<30字的占比）
        short_para_ratio = self._short_paragraph_ratio(chapter.content)
        score_rhythm = 1.0 if short_para_ratio > 0.6 else (short_para_ratio / 0.6)

        # 指标4：标题含战斗词
        title_has_battle = any(
            kw in chapter.title for kw in self.BATTLE_TITLE_KEYWORDS
        )
        score_title = 1.0 if title_has_battle else 0.0

        # 指标5：字数偏长（>3500字视为重要章节）
        score_length = 1.0 if chapter.char_count > 3500 else (chapter.char_count / 3500)

        # 加权求和
        total_score = (
            0.35 * score_emotion +
            0.20 * score_dialogue +
            0.20 * score_rhythm +
            0.15 * score_title +
            0.10 * score_length
        )

        return round(total_score, 4)

    def _detect_daily_chapters(
        self, 
        book: Book, 
        exclude_indices: set[int]
    ) -> list[Chapter]:
        """
        识别日常过渡章节（反选逻辑）
        
        与高潮检测相反的逻辑：
        - 低情绪词密度（非冲突状态）
        - 高生活词密度（日常活动描写）
        - 段落长度正常（80-250字，非快节奏短段）
        - 对话占比适中（15%-45%，非纯对话或纯叙述）
        
        应用场景：
        - 了解作者的日常文风、生活化描写能力
        - 平衡样本，避免只看到高强度情节
        - 捕捉角色互动的"正常态"
        
        Args:
            book: 书籍对象
            exclude_indices: 已选章节索引集合
            
        Returns:
            日常章节列表（已设置 score）
        """
        candidates = [
            ch for ch in book.chapters 
            if ch.index not in exclude_indices
        ]
        
        if not candidates:
            return []

        scored_chapters = []
        for ch in candidates:
            score = self._daily_score(ch)
            ch.score = score
            scored_chapters.append((ch, score))

        # 同样使用区域分散采样，但这次选"最高日常得分"
        return self._regional_sample(
            scored_chapters,
            self.config.daily_count,
            book.chapter_count
        )

    def _daily_score(self, chapter: Chapter) -> float:
        """
        计算单个章节的"日常程度"得分
        
        反选逻辑（与高潮相反）：
        - 低情绪词密度 → 越低越好
        - 高生活词密度 → 越高越好
        - 段落长度在80-250字区间 → 正常叙事节奏
        - 对话占比15-45% → 适中交互
        
        得分公式：
        score = w1*(1-情绪密度) + w2*生活词密度 + w3*段落正常度 + w4*对话适中度
        
        Args:
            chapter: 待评分章节
            
        Returns:
            0.0~1.0 的归一化得分
        """
        # 指标1：情绪词密度（越低越好）
        emotion_density = self._calc_keyword_density(
            chapter.content, 
            self.EMOTION_KEYWORDS
        )
        score_low_emotion = max(0, 1.0 - emotion_density / 5.0)  # 5‰以上扣分

        # 指标2：生活词密度（越高越好）
        daily_density = self._calc_keyword_density(
            chapter.content,
            self.DAILY_KEYWORDS
        )
        score_high_daily = min(daily_density / 8.0, 1.0)  # 8‰为满分

        # 指标3：段落长度正常度（80-250字最佳）
        avg_para_len = self._avg_paragraph_length(chapter.content)
        if 80 <= avg_para_len <= 250:
            score_para_len = 1.0
        elif avg_para_len < 80:
            score_para_len = avg_para_len / 80  # 太短像快节奏
        else:
            score_para_len = max(0, 1.0 - (avg_para_len - 250) / 200)  # 太长像说明文

        # 指标4：对话占比适中（15%-45%最佳区间）
        dialogue_ratio = self._dialogue_ratio(chapter.content)
        if 0.15 <= dialogue_ratio <= 0.45:
            score_dialogue = 1.0
        elif dialogue_ratio < 0.15:
            score_dialogue = dialogue_ratio / 0.15  # 太少
        else:
            score_dialogue = max(0, 1.0 - (dialogue_ratio - 0.45) / 0.45)  # 太多

        # 加权求和
        total_score = (
            0.30 * score_low_emotion +
            0.30 * score_high_daily +
            0.25 * score_para_len +
            0.15 * score_dialogue
        )

        return round(total_score, 4)

    @staticmethod
    def _dialogue_ratio(content: str) -> float:
        """
        计算文本中对话内容的占比
        
        算法：
        1. 使用正则匹配中文引号内的内容（"..." 或 '...'）
        2. 统计所有匹配到的对话总字符数
        3. 除以总字符数得到占比
        
        匹配规则：
        - 中文双引号："xxx"
        - 中文单引号：'xxx'
        
        Args:
            content: 章节正文
            
        Returns:
            0.0~1.0 的对话占比
        """
        if not content or len(content.strip()) == 0:
            return 0.0

        # 匹配中文引号内的对话内容
        dialogue_pattern = r'[""「](.*?)[""」]'
        matches = re.findall(dialogue_pattern, content, re.DOTALL)
        
        dialogue_chars = sum(len(m) for m in matches)
        total_chars = len(content.replace('\n', '').replace(' ', ''))  # 排除空白符
        
        if total_chars == 0:
            return 0.0
            
        return round(dialogue_chars / total_chars, 4)

    @staticmethod
    def _calc_keyword_density(content: str, keywords: list[str]) -> float:
        """
        计算关键词密度（千字频次）
        
        公式：(匹配次数 / 总字数) × 1000
        
        Args:
            content: 文本内容
            keywords: 关键词列表
            
        Returns:
            千字频次（例如 5.0 表示平均每千字出现5次）
        """
        if not content or len(content.strip()) == 0:
            return 0.0

        total_chars = len(content.replace('\n', '').replace(' ', ''))
        if total_chars == 0:
            return 0.0

        match_count = 0
        for keyword in keywords:
            # 使用 str.count 统计出现次数（简单高效）
            match_count += content.count(keyword)

        # 返回千字频次
        density = (match_count / total_chars) * 1000
        return round(density, 2)

    @staticmethod
    def _short_paragraph_ratio(content: str) -> float:
        """
        计算短段落占比（段落<30字的比例）
        
        用途：快节奏检测
        网文中短段落密集通常意味着：
        - 战斗场景（动作快速切换）
        - 紧张对峙（短句增强压迫感）
        - 高潮推进（信息密集输出）
        
        Args:
            content: 章节正文
            
        Returns:
            0.0~1.0 的短段落占比
        """
        if not content or content.strip() == '':
            return 0.0

        # 按换行分割段落（过滤空行）
        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]
        
        if not paragraphs:
            return 0.0

        short_count = sum(1 for p in paragraphs if len(p) < 30)
        return round(short_count / len(paragraphs), 4)

    @staticmethod
    def _avg_paragraph_length(content: str) -> float:
        """
        计算平均段落长度（字符数）
        
        用途：判断叙事节奏
        - <80字：快节奏/碎片化
        - 80-250字：正常叙事
        - >250字：慢节奏/说明文倾向
        
        Args:
            content: 章节正文
            
        Returns:
            平均段落字符数
        """
        if not content or content.strip() == '':
            return 0.0

        paragraphs = [p.strip() for p in content.split('\n') if p.strip()]
        
        if not paragraphs:
            return 0.0

        total_len = sum(len(p) for p in paragraphs)
        return round(total_len / len(paragraphs), 2)

    @staticmethod
    def _regional_sample(
        scored_chapters: list[tuple[Chapter, float]],
        target_count: int,
        total_chapters: int
    ) -> list[Chapter]:
        """
        区域分散采样算法
        
        目的：避免采样结果集中在书的某个阶段
        例如：不能全选前100章的高潮，而忽略后半部分
        
        算法步骤：
        1. 将全书分为三等份：前段(0-33%)、中段(33-66%)、后段(66-100%)
        2. 在每个区域内按得分降序排列
        3. 从每个区域轮流选取最高分章节，直到达到目标数量
        4. 若某区域耗尽，从剩余区域继续补齐
        
        Args:
            scored_chapters: [(章节, 得分)] 列表
            target_count: 目标采样数量
            total_chapters: 全书总章数
            
        Returns:
            采样后的章节列表
        """
        if not scored_chapters or target_count <= 0:
            return []

        # 定义三个区域的边界
        region_size = total_chapters // 3
        regions = {
            'front': (0, region_size),
            'middle': (region_size, region_size * 2),
            'back': (region_size * 2, total_chapters)
        }

        # 将章节分配到对应区域并排序
        region_buckets: dict[str, list[tuple[Chapter, float]]] = {
            'front': [],
            'middle': [],
            'back': []
        }

        for ch, score in scored_chapters:
            idx = ch.index
            if regions['front'][0] <= idx < regions['front'][1]:
                region_buckets['front'].append((ch, score))
            elif regions['middle'][0] <= idx < regions['middle'][1]:
                region_buckets['middle'].append((ch, score))
            else:
                region_buckets['back'].append((ch, score))

        # 每个区域内按得分降序排列
        for key in region_buckets:
            region_buckets[key].sort(key=lambda x: x[1], reverse=True)

        # 轮流从各区域选取（保证分散性）
        selected: list[Chapter] = []
        region_order = ['front', 'middle', 'back']
        pointers = {key: 0 for key in region_order}

        while len(selected) < target_count:
            any_remaining = False
            
            for region in region_order:
                if len(selected) >= target_count:
                    break
                    
                bucket = region_buckets[region]
                ptr = pointers[region]
                
                if ptr < len(bucket):
                    selected.append(bucket[ptr][0])
                    pointers[region] = ptr + 1
                    any_remaining = True

            # 所有区域都已耗尽则退出
            if not any_remaining:
                break

        return selected[:target_count]
