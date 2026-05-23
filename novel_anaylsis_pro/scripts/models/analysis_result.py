from dataclasses import dataclass, field
from enum import Enum


class Stability(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class StyleFeature:
    name: str
    stability: Stability
    applies_to: list[str] = field(default_factory=list)
    technical_description: str = ""
    literary_description: str = ""
    writing_rule: str = ""
    evidence: list[str] = field(default_factory=list)


@dataclass
class ProtagonistProfile:
    moral_coordinates: dict[str, int] = field(default_factory=dict)
    decision_patterns: dict[str, str] = field(default_factory=dict)
    bottom_lines: list[str] = field(default_factory=list)
    loss_tolerance_type: str = ""
    revenge_scale_type: str = ""
    emotional_temperature: dict[str, str] = field(default_factory=dict)


@dataclass
class LanguageProfile:
    avg_sentence_length: float = 0.0
    short_sentence_ratio: float = 0.0
    dialogue_ratio: float = 0.0
    paragraph_avg_length: float = 0.0
    four_char_density: float = 0.0
    top_words: list[tuple[str, float]] = field(default_factory=list)
    signature_sentences: list[str] = field(default_factory=list)
    forbidden_patterns: list[str] = field(default_factory=list)
    literary_voice: dict[str, str] = field(default_factory=dict)


@dataclass
class EmotionWaveProfile:
    suppression_texture: str = ""
    suppression_feeling: str = ""
    release_style: str = ""
    release_feeling: str = ""
    aftermath_mode: str = ""
    emotional_residual: str = ""


@dataclass
class AnalysisResult:
    book_title: str
    overall_profile: str = ""
    features: list[StyleFeature] = field(default_factory=list)
    protagonist: ProtagonistProfile = field(default_factory=ProtagonistProfile)
    language: LanguageProfile = field(default_factory=LanguageProfile)
    emotion_wave: EmotionWaveProfile = field(default_factory=EmotionWaveProfile)
    scene_recipes: dict[str, str] = field(default_factory=dict)
    author_beliefs: dict[str, str] = field(default_factory=dict)
    total_chars: int = 0
    total_chapters: int = 0


@dataclass
class CrossBookResult:
    author_name: str = ""
    books_analyzed: list[str] = field(default_factory=list)
    total_chars: int = 0
    total_chapters: int = 0
    stable_features: list[StyleFeature] = field(default_factory=list)
    book_specific_features: dict[str, list] = field(default_factory=dict)
    scene_recipes: dict[str, str] = field(default_factory=dict)
    author_beliefs: dict[str, str] = field(default_factory=dict)
    final_report_md: str = ""
    style_card_md: str = ""
    scene_templates_md: str = ""
    checklist_md: str = ""
    json_output: str = ""
