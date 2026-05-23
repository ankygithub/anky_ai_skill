"""全局配置管理"""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LLMConfig:
    provider: str = "openai"
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    max_tokens: int = 4096
    temperature: float = 0.3


@dataclass
class SamplingConfig:
    opening_count: int = 5
    climax_count: int = 5
    daily_count: int = 5
    ending_count: int = 3
    max_sample_chars_per_book: int = 60000


@dataclass
class AnalysisConfig:
    intensity: str = "medium"
    enable_literary: bool = True
    output_dir: str = ""
    include_json: bool = True


@dataclass
class Config:
    input_dir: str = ""
    llm: LLMConfig = field(default_factory=LLMConfig)
    sampling: SamplingConfig = field(default_factory=SamplingConfig)
    analysis: AnalysisConfig = field(default_factory=AnalysisConfig)

    @classmethod
    def from_env(cls):
        config = cls()
        config.input_dir = os.environ.get("NOVEL_INPUT_DIR", "")
        config.llm.api_key = os.environ.get("NOVEL_LLM_API_KEY", "")
        config.llm.base_url = os.environ.get("NOVEL_LLM_BASE_URL", "")
        config.llm.model = os.environ.get("NOVEL_LLM_MODEL", "gpt-4o")
        config.analysis.output_dir = os.environ.get("NOVEL_OUTPUT_DIR", "./output")
        return config

    def validate(self):
        if not self.input_dir or not os.path.isdir(self.input_dir):
            raise ValueError(f"输入目录不存在: {self.input_dir}")
        txt_files = [f for f in os.listdir(self.input_dir) if f.endswith('.txt')]
        if not txt_files:
            raise ValueError(f"输入目录中没有找到txt文件: {self.input_dir}")
        return True
