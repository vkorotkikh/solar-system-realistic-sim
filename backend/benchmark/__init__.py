"""Benchmark utilities for mission/trajectory accuracy reporting."""

from .accuracy import (
    BENCHMARK_DEFAULT_TIMEOUT_SECONDS,
    MAX_REFERENCE_FILE_BYTES,
    MAX_REFERENCE_SCENARIOS,
    benchmark_against_references,
    generate_accuracy_report,
    render_accuracy_report_markdown,
)

__all__ = [
    "BENCHMARK_DEFAULT_TIMEOUT_SECONDS",
    "MAX_REFERENCE_FILE_BYTES",
    "MAX_REFERENCE_SCENARIOS",
    "benchmark_against_references",
    "generate_accuracy_report",
    "render_accuracy_report_markdown",
]
