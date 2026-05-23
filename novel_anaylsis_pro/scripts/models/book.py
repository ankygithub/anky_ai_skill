from dataclasses import dataclass, field
from pathlib import Path
from .chapter import Chapter


@dataclass
class Book:
    file_path: Path
    title: str = ""
    author: str = ""
    encoding: str = ""
    total_chars: int = 0
    chapters: list[Chapter] = field(default_factory=list)
    raw_text: str = ""

    @property
    def chapter_count(self) -> int:
        return len(self.chapters)
