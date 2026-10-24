"""Re-enter Uvicorn without making the API module multiprocessing's main."""

import os
from pathlib import Path
import sys


_INVALID_INVOCATION = "Cannot preserve interpreter options for this invocation."


def original_interpreter_options(original: object) -> list[str]:
    """Keep CPython's actual option prefix, not a lossy reconstruction of flags.

    Stop before the file, stdin or c/m execution target. In particular, W/X
    operands are not execution targets, and bundled options before c/m survive.
    Only the consumed prefix matters; script arguments are deliberately ignored.
    """
    if (
        not isinstance(original, (list, tuple))
        or not original
        or not isinstance(original[0], str)
        or not original[0]
    ):
        raise RuntimeError(_INVALID_INVOCATION)
    result = []
    index = 1
    while index < len(original):
        token = original[index]
        if not isinstance(token, str) or not token:
            raise RuntimeError(_INVALID_INVOCATION)
        if token == "--":
            if index + 1 >= len(original):
                raise RuntimeError(_INVALID_INVOCATION)
            return result
        if token == "-" or not token.startswith("-"):
            return result
        if token == "--check-hash-based-pycs":
            if index + 1 >= len(original) or not isinstance(original[index + 1], str):
                raise RuntimeError(_INVALID_INVOCATION)
            result.extend(original[index:index + 2])
            index += 2
            continue
        if not token.startswith("--"):
            for offset, option in enumerate(token[1:], 1):
                if option in "cm":
                    if offset == len(token) - 1 and index + 1 >= len(original):
                        raise RuntimeError(_INVALID_INVOCATION)
                    if offset > 1:
                        result.append(token[:offset])
                    return result
                if option in "WX":
                    if offset == len(token) - 1:
                        if index + 1 >= len(original) or not isinstance(original[index + 1], str):
                            raise RuntimeError(_INVALID_INVOCATION)
                        result.append(token)
                        index += 1
                        token = original[index]
                    break
        result.append(token)
        index += 1
    raise RuntimeError(_INVALID_INVOCATION)


def reexec_uvicorn(*, host: str, reload: bool, ws_max_size: int) -> None:
    """Replace this launcher without adopting Uvicorn's CLI-only environment."""
    argv = [
        sys.executable,
        *original_interpreter_options(getattr(sys, "orig_argv", None)),
        "-m", "uvicorn", "server:app",
        "--app-dir", str(Path(__file__).resolve().parent),
        "--host", host,
        "--port", "8042",
        "--no-proxy-headers",
        "--ws-max-size", str(ws_max_size),
    ]
    if reload:
        argv.append("--reload")
    # The old programmatic run ignored Click's UVICORN_* inputs. Preserve all
    # other environment values (including Config's WEB_CONCURRENCY behavior).
    environment = {key: value for key, value in os.environ.items() if not key.startswith("UVICORN_")}
    os.execve(sys.executable, argv, environment)
