from dataclasses import dataclass
from enum import Enum


class ChapterType(str, Enum):
    OPENING = "opening"
    CLIMAX = "climax"
    DAILY = "daily"
    ENDING = "ending"


@dataclass
class Chapter:
    index: int
    title: str = ""
    content: str = ""
    char_count: int = 0
    layer_type: ChapterType | None = None
    score: float = 0.0
