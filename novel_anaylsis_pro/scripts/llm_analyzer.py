"""LLM深读引擎 - 网文风格解析的核心分析模块

提供十层技术分析（工程/情节/主角/配角/叙事/语言/修辞/场景/主题/体验）
和六维文学感知分析（情绪波纹/氛围质感/人性光谱/哀悼美学/节奏律动/作者签名）。
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import json
import re

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from .models.book import Book
from .models.chapter import Chapter, ChapterType
from .models.analysis_result import (
    AnalysisResult,
    StyleFeature,
    ProtagonistProfile,
    LanguageProfile,
    EmotionWaveProfile,
    Stability,
)


class LLMClient(ABC):
    """LLM客户端抽象基类，定义统一的对话接口"""

    @abstractmethod
    def chat(self, prompt: str, context: str = "", system_prompt: str = "") -> str:
        """发送对话请求并返回响应

        Args:
            prompt: 用户提示词
            context: 上下文文本（章节内容等）
            system_prompt: 系统提示词

        Returns:
            LLM返回的文本响应
        """
        pass


class OpenAILLMClient(LLMClient):
    """基于OpenAI SDK的客户端实现，兼容所有OpenAI格式API（GPT/Claude/DeepSeek等）"""

    def __init__(self, api_key: str = "", base_url: str = "",
                 model: str = "gpt-4o", max_tokens: int = 4096,
                 temperature: float = 0.3):
        if OpenAI is None:
            raise ImportError("请先安装openai库: pip install openai")
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature

    def chat(self, prompt: str, context: str = "", system_prompt: str = "") -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        full_content = f"{context}\n\n{prompt}" if context else prompt
        messages.append({"role": "user", "content": full_content})

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )

        return response.choices[0].message.content or ""


class PromptLoader:
    """Prompt模板加载器，从prompts目录加载各层分析模板"""

    # 十层技术分析维度映射
    LAYER_PROMPTS = {
        "engineering": "engineering.txt",
        "plot": "plot.txt",
        "protagonist": "protagonist.txt",
        "characters": "characters.txt",
        "narrative": "narrative.txt",
        "language": "language.txt",
        "rhetoric": "rhetoric.txt",
        "scenes": "scenes.txt",
        "themes": "themes.txt",
        "experience": "experience.txt",
    }

    # 六维文学感知维度映射
    LITERARY_PROMPTS = {
        "emotion_wave": "emotion_wave.txt",
        "atmosphere": "atmosphere.txt",
        "humanity": "humanity.txt",
        "mourning": "mourning.txt",
        "rhythm": "rhythm.txt",
        "signature": "signature.txt",
    }

    def __init__(self, prompts_dir: Optional[str] = None):
        """初始化加载器

        Args:
            prompts_dir: prompts模板目录路径，默认为scripts同级的prompts目录
        """
        if prompts_dir:
            self.prompts_dir = Path(prompts_dir)
        else:
            self.prompts_dir = Path(__file__).parent.parent / "prompts"
        self.prompts_dir.mkdir(parents=True, exist_ok=True)

    def load(self, key: str) -> str:
        """加载指定key对应的prompt模板

        Args:
            key: 维度标识符（如 engineering, emotion_wave 等）

        Returns:
            模板内容字符串，找不到则返回默认模板
        """
        filename = self.LAYER_PROMPTS.get(key) or self.LITERARY_PROMPTS.get(key)
        if not filename:
            return self._default_prompt(key)

        file_path = self.prompts_dir / filename
        if file_path.exists():
            return file_path.read_text(encoding="utf-8").strip()

        return self._default_prompt(key)

    def _default_prompt(self, key: str) -> str:
        """生成默认的兜底prompt模板

        当找不到对应模板文件时使用，确保系统不会因缺少模板而中断
        """
        defaults = {
            "engineering": (
                "请从工程架构角度分析这部网文的写作技术：\n"
                "1. 整体结构设计（章节节奏、伏笔布局、钩子设置）\n"
                "2. 信息投放策略（世界观揭露节奏、设定展示方式）\n"
                "3. 读者留存机制（悬念管理、期待值调控）\n"
                "请用结构化方式输出分析结果。"
            ),
            "plot": (
                "请分析这部网文的情节构建技术：\n"
                "1. 核心冲突设计与升级路径\n"
                "2. 转折点分布与合理性\n"
                "3. 副线与主线的交织方式\n"
                "请结合具体文本举例说明。"
            ),
            "protagonist": (
                "请深度解析主角的人物塑造：\n"
                "1. 道德坐标定位（价值观边界、底线位置）\n"
                "2. 决策模式与行为逻辑\n"
                "3. 成长弧线设计\n"
                "请给出具体的行为证据。"
            ),
            "characters": (
                "请分析配角的塑造策略：\n"
                "1. 配角功能分类（工具型/镜像型/对照型）\n"
                "2. 配角与主角的关系网络\n"
                "3. 记忆点设计（标签化特征）\n"
                "请列出主要配角的分析。"
            ),
            "narrative": (
                "请分析叙事技巧运用：\n"
                "1. 视角选择与切换策略\n"
                "2. 时间操控手法（倒叙/插叙/预叙）\n"
                "3. 信息差管理与读者知情权\n"
                "请结合具体段落说明效果。"
            ),
            "language": (
                "请进行语言学层面的风格分析：\n"
                "1. 句式特征（长短句比例、句式变化规律）\n"
                "2. 词汇偏好（高频词、特色表达）\n"
                "3. 对话风格（口语化程度、角色区分度）\n"
                "请给出量化指标和典型例句。"
            ),
            "rhetoric": (
                "请分析修辞手法的使用特点：\n"
                "1. 常用修辞类型及频率\n"
                "2. 修辞效果与文体适配度\n"
                "3. 独特的修辞创新或习惯用法\n"
                "请列举典型案例。"
            ),
            "scenes": (
                "请分析场景描写的技术：\n"
                "1. 场景切换节奏\n"
                "2. 感官调动策略（视觉/听觉/触觉侧重）\n"
                "3. 场景功能分类（过渡/高潮/日常）\n"
                "请总结场景描写的公式化特征。"
            ),
            "themes": (
                "请提炼作品的主题内核：\n"
                "1. 表层主题与深层主题\n"
                "2. 价值立场表达方式（显性/隐性）\n"
                "3. 作者信念体系推测\n"
                "请分析主题的一致性和演变。"
            ),
            "experience": (
                "请分析阅读体验的设计：\n"
                "1. 情绪曲线规划\n"
                "2. 沉浸感营造手段\n"
                "3. 爽点/虐点的分布策略\n"
                "请评估整体体验设计的成熟度。"
            ),
            "emotion_wave": (
                "请进行情绪波纹分析——捕捉文字中情绪的微观波动：\n"
                "1. 情绪压抑期的纹理特征（如何写「忍」）\n"
                "2. 情绪释放时的爆发模式\n"
                "3. 余韵处理方式（情绪残留的写法）\n"
                "请关注情绪书写的物理感和层次感。"
            ),
            "atmosphere": (
                "请分析氛围质感的营造：\n"
                "1. 氛围基调词和意象库\n"
                "2. 氛围转换的过渡技巧\n"
                "3. 环境-情绪的同频共振写法\n"
                "请提取可复用的氛围营造配方。"
            ),
            "humanity": (
                "请进行人性光谱扫描：\n"
                "1. 人物灰色地带的处理方式\n"
                "2. 道德困境的呈现策略\n"
                "3. 人性复杂度的表达深度\n"
                "请评价作品中的人性洞察力。"
            ),
            "mourning": (
                "请分析哀悼美学的运用（如有）：\n"
                "1. 丧失/告别场景的书写方式\n"
                "2. 悲伤的美学转化\n"
                "3. 创伤记忆的处理手法\n"
                "请关注悲伤书写中的克制与放纵平衡。"
            ),
            "rhythm": (
                "请分析文字的节奏律动：\n"
                "1. 段落呼吸感（长短交替规律）\n"
                "2. 叙事节奏的变化模式\n"
                "3. 高潮前的蓄势技巧\n"
                "请描述整体的节奏风格（如：紧凑型/舒缓型/波浪型）。"
            ),
            "signature": (
                "请识别作者的写作签名：\n"
                "1. 独特的表达习惯或口头禅\n"
                "2. 标志性的句式结构\n"
                "3. 个人化的审美偏好\n"
                "请总结这位作者的「指纹级」特征。"
            ),
        }
        return defaults.get(key, f"请从{key}维度分析以下网文内容，给出专业且详细的解读。")


class LLMAnalyzer:
    """LLM深读分析器 - 将采样后的章节喂给大模型进行多层技术+文学感知分析"""

    # 各维度最相关的章节类型映射
    LAYER_CHAPTER_MAP = {
        "engineering": None,          # 全部章节
        "plot": [ChapterType.CLIMAX, ChapterType.OPENING],
        "protagonist": [ChapterType.OPENING, ChapterType.CLIMAX, ChapterType.DAILY],
        "characters": [ChapterType.CLIMAX, ChapterType.DAILY],
        "language": None,             # 全部章节
        "scenes": [ChapterType.CLIMAX, ChapterType.DAILY],
        "experience": [ChapterType.CLIMAX, ChapterType.ENDING],
        "emotion_wave": [ChapterType.CLIMAX, ChapterType.DAILY, ChapterType.ENDING],
        "atmosphere": [ChapterType.CLIMAX, ChapterType.DAILY],
        "humanity": [ChapterType.DAILY, ChapterType.OPENING],
    }

    def __init__(self, llm_client: LLMClient, enable_literary: bool = True,
                 prompt_loader: Optional[PromptLoader] = None):
        """初始化分析器

        Args:
            llm_client: LLM客户端实例
            enable_literary: 是否启用六维文学感知分析
            prompt_loader: Prompt模板加载器，不传则自动创建
        """
        self.llm = llm_client
        self.enable_literary = enable_literary
        self.prompt_loader = prompt_loader or PromptLoader()

    def analyze_book(self, book: Book) -> AnalysisResult:
        """对单本书执行全量分析

        Args:
            book: 待分析的Book对象

        Returns:
            完整的AnalysisResult分析结果
        """
        result = AnalysisResult(
            book_title=book.title or book.file_path.stem,
            total_chars=book.total_chars,
            total_chapters=book.chapter_count,
        )

        all_layers = list(self.prompt_loader.LAYER_PROMPTS.keys())
        literary_layers = list(self.prompt_loader.LITERARY_PROMPTS.keys()) if self.enable_literary else []

        for layer_key in all_layers + literary_layers:
            try:
                layer_data = self.analyze_layer(book, layer_key)
                self._merge_layer_result(result, layer_key, layer_data)
            except Exception as e:
                print(f"[警告] 维度 {layer_key} 分析失败: {e}")

        return result

    def analyze_layer(self, book: Book, layer_key: str) -> dict:
        """分析单个维度

        Args:
            book: 待分析的Book对象
            layer_key: 分析维度标识符

        Returns:
            该维度的分析结果字典
        """
        selected_chapters = self._select_chapters_for_layer(book.chapters, layer_key)
        context = self._merge_chapters_for_context(selected_chapters)
        prompt_template = self.prompt_loader.load(layer_key)

        system_prompt = (
            "你是一位专业的网文分析师，擅长从技术和文学两个视角解构网络小说。"
            "你的分析需要兼具深度和可操作性，输出应该结构清晰、例证充分。"
            "对于每个维度，同时给出技术视角的描述和文学视角的感受。"
        )

        full_prompt = f"{prompt_template}\n\n请基于以下小说内容进行分析："

        response = self.llm.chat(prompt=full_prompt, context=context, system_prompt=system_prompt)

        return self._parse_response(response, layer_key)

    def _select_chapters_for_layer(self, chapters: list[Chapter], layer_key: str) -> list[Chapter]:
        """根据分析维度选择最相关的章节

        不同维度关注的重点不同：
        - 工程类维度需要全局视野，使用全部章节
        - 角色类维度需要关键节点，使用高潮/开篇/日常章节
        - 情感类维度需要情绪转折点，使用高潮/结尾章节

        Args:
            chapters: 全部章节列表
            layer_key: 分析维度

        Returns:
            筛选后的章节子集
        """
        target_types = self.LAYER_CHAPTER_MAP.get(layer_key)

        if target_types is None:
            return chapters

        selected = [ch for ch in chapters if ch.layer_type in target_types]
        return selected if selected else chapters

    def _merge_chapters_for_context(self, chapters: list[Chapter], max_chars: int = 8000) -> str:
        """合并章节内容为LLM上下文，控制token消耗

        策略：
        - 优先保留完整章节
        - 超出限制时按比例截断每章
        - 保留章节标题便于模型理解结构

        Args:
            chapters: 待合并的章节列表
            max_chars: 最大字符数限制

        Returns:
            合并后的上下文文本
        """
        parts = []
        total = sum(ch.char_count for ch in chapters)

        for ch in chapters:
            header = f"=== 第{ch.index}章 {ch.title} ===\n"
            if total <= max_chars:
                parts.append(f"{header}{ch.content}")
            else:
                ratio = max_chars / total
                allowed = int(ch.char_count * ratio)
                content = ch.content[:allowed] if allowed > 0 else ""
                parts.append(f"{header}{content}\n...(截断)")

        return "\n\n".join(parts)

    def _parse_response(self, response: str, layer_key: str) -> dict:
        """解析LLM返回的原始响应为结构化数据

        尝试提取JSON格式的结构化数据，
        如果解析失败则将原始文本包装为字典返回

        Args:
            response: LLM原始响应文本
            layer_key: 当前分析维度

        Returns:
            解析后的结果字典
        """
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            try:
                data = json.loads(json_match.group())
                if isinstance(data, dict):
                    data["raw_response"] = response
                    return data
            except json.JSONDecodeError:
                pass

        return {"raw_response": response, "layer": layer_key}

    def _merge_layer_result(self, result: AnalysisResult, layer_key: str, layer_data: dict):
        """将单层分析结果合并到最终的AnalysisResult中

        根据不同维度将数据填入对应字段：
        - 主角相关 → protagonist
        - 语言相关 → language
        - 情绪相关 → emotion_wave
        - 其他 → features 或对应字典字段

        Args:
            result: 目标AnalysisResult对象
            layer_key: 当前维度标识
            layer_data: 该维度的分析数据
        """
        raw_text = layer_data.get("raw_response", "")

        if layer_key == "protagonist":
            self._update_protagonist(result.protagonist, layer_data, raw_text)
        elif layer_key == "language":
            self._update_language(result.language, layer_data, raw_text)
        elif layer_key == "emotion_wave":
            self._update_emotion_wave(result.emotion_wave, layer_data, raw_text)
        elif layer_key == "scenes":
            scene_recipes = layer_data.get("scene_recipes", {})
            if isinstance(scene_recipes, dict):
                result.scene_recipes.update(scene_recipes)
            elif raw_text:
                result.scene_recipes[layer_key] = raw_text
        elif layer_key == "themes":
            beliefs = layer_data.get("author_beliefs", {})
            if isinstance(beliefs, dict):
                result.author_beliefs.update(beliefs)
            elif raw_text:
                result.author_beliefs[layer_key] = raw_text
        else:
            feature = self._create_feature_from_layer(layer_key, layer_data, raw_text)
            if feature:
                result.features.append(feature)

        if not result.overall_profile and raw_text and layer_key in ("engineering", "experience"):
            result.overall_profile = raw_text[:2000]

    def _update_protagonist(self, profile: ProtagonistProfile, data: dict, raw: str):
        """更新主角画像数据"""
        if "moral_coordinates" in data and isinstance(data["moral_coordinates"], dict):
            profile.moral_coordinates.update(data["moral_coordinates"])
        if "decision_patterns" in data and isinstance(data["decision_patterns"], dict):
            profile.decision_patterns.update(data["decision_patterns"])
        if "bottom_lines" in data and isinstance(data["bottom_lines"], list):
            profile.bottom_lines.extend(data["bottom_lines"])
        if "loss_tolerance_type" in data:
            profile.loss_tolerance_type = str(data["loss_tolerance_type"])
        if "revenge_scale_type" in data:
            profile.revenge_scale_type = str(data["revenge_scale_type"])
        if "emotional_temperature" in data and isinstance(data["emotional_temperature"], dict):
            profile.emotional_temperature.update(data["emotional_temperature"])

    def _update_language(self, profile: LanguageProfile, data: dict, raw: str):
        """更新语言特征数据"""
        numeric_fields = [
            ("avg_sentence_length", float), ("short_sentence_ratio", float),
            ("dialogue_ratio", float), ("paragraph_avg_length", float),
            ("four_char_density", float),
        ]
        for field_name, field_type in numeric_fields:
            if field_name in data:
                try:
                    setattr(profile, field_name, field_type(data[field_name]))
                except (ValueError, TypeError):
                    pass

        if "top_words" in data and isinstance(data["top_words"], list):
            profile.top_words.extend(data["top_words"])
        if "signature_sentences" in data and isinstance(data["signature_sentences"], list):
            profile.signature_sentences.extend(data["signature_sentences"])
        if "forbidden_patterns" in data and isinstance(data["forbidden_patterns"], list):
            profile.forbidden_patterns.extend(data["forbidden_patterns"])
        if "literary_voice" in data and isinstance(data["literary_voice"], dict):
            profile.literary_voice.update(data["literary_voice"])

    def _update_emotion_wave(self, profile: EmotionWaveProfile, data: dict, raw: str):
        """更新情绪波纹数据"""
        string_fields = [
            "suppression_texture", "suppression_feeling",
            "release_style", "release_feeling",
            "aftermath_mode", "emotional_residual",
        ]
        for field_name in string_fields:
            if field_name in data:
                setattr(profile, field_name, str(data[field_name]))

    def _create_feature_from_layer(self, layer_key: str, data: dict, raw: str) -> Optional[StyleFeature]:
        """从单层数据创建StyleFeature对象

        每个特征包含双视角描述：技术视角 + 文学视角
        """
        name_map = {
            "engineering": "工程架构",
            "plot": "情节构建",
            "characters": "配角塑造",
            "narrative": "叙事技巧",
            "rhetoric": "修辞手法",
            "themes": "主题内核",
            "experience": "体验设计",
            "emotion_wave": "情绪波纹",
            "atmosphere": "氛围质感",
            "humanity": "人性光谱",
            "mourning": "哀悼美学",
            "rhythm": "节奏律动",
            "signature": "作者签名",
        }

        technical_desc = data.get("technical_description") or raw[:500]
        literary_desc = data.get("literary_description") or ""
        writing_rule = data.get("writing_rule") or ""
        stability_str = data.get("stability", "medium")

        try:
            stability = Stability(stability_str)
        except ValueError:
            stability = Stability.MEDIUM

        return StyleFeature(
            name=name_map.get(layer_key, layer_key),
            stability=stability,
            applies_to=[layer_key],
            technical_description=technical_desc,
            literary_description=literary_desc,
            writing_rule=writing_rule,
            evidence=data.get("evidence", []),
        )
