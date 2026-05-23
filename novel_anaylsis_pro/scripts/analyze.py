"""网文作者风格解析技能 CLI入口 - 串联五阶段流水线"""
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import click
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint

from scripts.config import Config, SamplingConfig, AnalysisConfig
from scripts.text_preprocessor import TextPreprocessor
from scripts.sampler import StratifiedSampler
from scripts.stat_analyzer import StatAnalyzer
from scripts.llm_analyzer import OpenAILLMClient, LLMAnalyzer
from scripts.cross_validator import CrossValidator
from scripts.report_generator import ReportGenerator

console = Console()

BANNER = """[cyan]╔═══════════════════════════════════════╗
║   网文作者风格解析技能 v1.1        ║
╚═══════════════════════════════════════╝[/cyan]"""


@click.command()
@click.option("-i", "--input-dir", required=True, type=click.Path(exists=True), help="输入文件夹路径")
@click.option("-o", "--output-dir", default="./output", help="输出目录（默认 ./output）")
@click.option("-k", "--api-key", default="", help="LLM API Key")
@click.option("-u", "--base-url", default="", help="LLM Base URL")
@click.option("-m", "--model", default="gpt-4o", help="模型名（默认 gpt-4o）")
@click.option("--intensity", type=click.Choice(["low", "medium", "high"]), default="medium", help="分析强度（默认 medium）")
@click.option("--no-literary", is_flag=True, default=False, help="禁用文学感知维度")
@click.option("--stat-only", is_flag=True, default=False, help="仅统计层分析（不调用LLM）")
@click.option("--json", "export_json", is_flag=True, default=False, help="额外输出JSON")
def main(input_dir, output_dir, api_key, base_url, model, intensity,
         no_literary, stat_only, export_json):
    console.print(BANNER)

    config = _build_config(
        input_dir, output_dir, api_key, base_url, model,
        intensity, no_literary, export_json
    )

    try:
        config.validate()
    except ValueError as e:
        console.print(f"[red]✗ 配置校验失败: {e}[/red]")
        sys.exit(1)

    preprocessor = TextPreprocessor()
    sampler = StratifiedSampler(SamplingConfig())
    stat_analyzer = StatAnalyzer()
    report_gen = ReportGenerator()

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:

        task = progress.add_task("[cyan]阶段1: 加载文本文件...", total=None)
        books = preprocessor.load_directory(Path(config.input_dir))
        progress.update(task, completed=True)

    if not books:
        console.print("[red]✗ 未加载到任何书籍，请检查输入目录中的txt文件[/red]")
        sys.exit(1)

    console.print(f"\n[green]✔ 文本加载完成[/green] — 共 [cyan]{len(books)}[/cyan] 本书籍")
    book_info_table = Table(show_header=True, header_style="bold cyan", padding=(0, 2))
    book_info_table.add_column("序号", style="dim", width=5)
    book_info_table.add_column("书名", min_width=20)
    book_info_table.add_column("章节数", justify="right", width=8)
    book_info_table.add_column("总字数", justify="right", width=12)
    for idx, book in enumerate(books, 1):
        book_info_table.add_row(
            str(idx), book.title or "(未识别)",
            str(book.chapter_count), f"{book.total_chars:,}"
        )
    console.print(book_info_table)

    sampled_books = []
    for book in books:
        sampled_chapters = sampler.sample(book)
        sampled_books.append((book, sampled_chapters))

    console.print("\n[bold cyan]▶ 分层抽样结果:[/bold cyan]")
    sample_table = Table(show_header=True, header_style="bold cyan", padding=(0, 2))
    sample_table.add_column("书名", min_width=18)
    sample_table.add_column("采样章数", justify="right", width=10)
    sample_table.add_column("采样详情", min_width=40)
    for book, chapters in sampled_books:
        from scripts.models.chapter import ChapterType
        layer_counts = {}
        for ch in chapters:
            lt = ch.layer_type.value if ch.layer_type else "unknown"
            layer_counts[lt] = layer_counts.get(lt, 0) + 1
        detail_parts = [f"{k}:{v}" for k, v in sorted(layer_counts.items())]
        detail_str = ", ".join(detail_parts) if detail_parts else "-"
        sample_table.add_row(
            book.title or "(未识别)",
            str(len(chapters)),
            detail_str,
        )
    console.print(sample_table)

    console.print("\n[bold cyan]▶ 阶段2: 统计层分析...[/bold cyan]")
    all_stats = []
    for book in books:
        stats = stat_analyzer.analyze(book)
        all_stats.append(stats)

    stats_table = Table(show_header=True, header_style="bold cyan", padding=(0, 2))
    stats_table.add_column("书名", min_width=16)
    stats_table.add_column("平均句长", justify="right", width=10)
    stats_table.add_column("短句比(%)", justify="right", width=10)
    stats_table.add_column("对话比(%)", justify="right", width=10)
    stats_table.add_column("四字格密度", justify="right", width=12)
    for book, stats in zip(books, all_stats):
        stats_table.add_row(
            book.title or "(未识别)",
            f"{stats.get('avg_sentence_length', 0):.1f}",
            f"{stats.get('short_sentence_ratio', 0):.1f}",
            f"{stats.get('dialogue_ratio', 0):.1f}",
            f"{stats.get('four_char_density', 0):.2f}",
        )
    console.print(stats_table)

    llm_results = []
    cross_result = None

    if not stat_only:
        if not config.llm.api_key:
            console.print("[yellow]⚠ 未提供 API Key，跳过 LLM 分析。使用 --stat-only 可隐藏此提示。[/yellow]")
        else:
            llm_client = OpenAILLMClient(
                api_key=config.llm.api_key,
                base_url=config.llm.base_url,
                model=config.llm.model,
                max_tokens=config.llm.max_tokens,
                temperature=config.llm.temperature,
            )
            analyzer = LLMAnalyzer(
                llm_client=llm_client,
                enable_literary=not no_literary,
            )

            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                BarColumn(),
                TaskProgressColumn(),
                console=console,
            ) as progress:
                task = progress.add_task(
                    "[cyan]阶段3: LLM深读分析...",
                    total=len(books),
                )
                for book, _ in sampled_books:
                    progress.update(task, description=f"[cyan]正在分析: {book.title or book.file_path.stem}...")
                    result = analyzer.analyze_book(book)
                    llm_results.append(result)
                    progress.advance(task)

            console.print(f"\n[green]✔ LLM分析完成[/green] — 共分析了 [cyan]{len(llm_results)}[/cyan] 本书")

            validator = CrossValidator()
            cross_result = validator.validate(llm_results)

            stability_dist = {}
            for feat in cross_result.stable_features:
                key = feat.stability.value
                stability_dist[key] = stability_dist.get(key, 0) + 1

            console.print("\n[bold cyan]▶ 阶段4: 交叉验证 - 特征稳定度分布[/bold cyan]")
            stab_table = Table(show_header=True, header_style="bold cyan", padding=(0, 3))
            stab_table.add_column("稳定度", width=12)
            stab_table.add_column("特征数量", justify="right", width=10)
            stab_table.add_column("说明", min_width=24)
            stab_map_display = {
                "high": ("[green]HIGH (≥3本出现)[/green]", "跨作品一致性强，可信度高"),
                "medium": ("[yellow]MEDIUM (2本出现)[/yellow]", "部分作品共有，需结合语境判断"),
                "low": ("[red]LOW (仅1本出现)[/red]", "单本书特有，可能为偶然特征"),
            }
            for level in ["high", "medium", "low"]:
                count = stability_dist.get(level, 0)
                display_text, desc = stab_map_display.get(level, (level, ""))
                stab_table.add_row(display_text, str(count), desc)
            console.print(stab_table)

            console.print(f"  书籍专属特征: {sum(len(v) for v in cross_result.book_specific_features.values())} 个")

            console.print("\n[bold cyan]▶ 阶段5: 生成报告...[/bold cyan]")
            generated_files = report_gen.generate_all(cross_result, output_dir)
    else:
        console.print("\n[bold cyan]▶ 跳过LLM分析和报告生成（--stat-only 模式）[/bold cyan]")
        generated_files = []
        cross_result = None

    console.print(Panel(
        "[bold green]✅ 分析流程完成！[/bold green]\n\n"
        + (f"已生成 [cyan]{len(generated_files)}[/cyan] 个产物文件:" if generated_files else "当前为统计模式，未生成完整报告文件"),
        title="[cyan]完成信息[/cyan]",
        border_style="green",
    ))

    if generated_files:
        file_table = Table(show_header=False, padding=(0, 1))
        file_table.add_column("产物文件", style="cyan")
        for fp in generated_files:
            file_name = Path(fp).name
            file_size = Path(fp).stat().st_size
            size_str = _format_size(file_size)
            file_table.add_row(f"  📄 {file_name}  ({size_str})")
        console.print(file_table)
        console.print(f"\n[dim]输出目录: {os.path.abspath(output_dir)}[/dim]")


def _build_config(input_dir, output_dir, api_key, base_url, model,
                  intensity, no_literary, export_json):
    config = Config.from_env()
    config.input_dir = os.path.abspath(input_dir)
    if api_key:
        config.llm.api_key = api_key
    if base_url:
        config.llm.base_url = base_url
    if model:
        config.llm.model = model
    config.analysis.intensity = intensity
    config.analysis.enable_literary = not no_literary
    config.analysis.output_dir = os.path.abspath(output_dir)
    config.analysis.include_json = export_json
    return config


def _format_size(size_bytes):
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


if __name__ == "__main__":
    main()
