#!/usr/bin/env python3
"""Terminal script for OpenAI Responses API with Codex model auto-selection."""

import argparse
import json
import os
import sys
from urllib import error, request

PREFERRED_CODEX_MODELS = [
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex",
    "gpt-5-codex",
    "codex-mini-latest",
]
FALLBACK_MODELS = ["gpt-5", "gpt-5-mini"]


def build_base_url(raw_base_url: str) -> str:
    base = (raw_base_url or "https://api.openai.com/v1").rstrip("/")
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    return base


def api_request(
    method: str,
    url: str,
    api_key: str,
    payload: dict | None = None,
    timeout: int = 120,
) -> dict:
    headers = {"Authorization": f"Bearer {api_key}"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        message = body.strip()
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                err = parsed.get("error")
                if isinstance(err, dict):
                    err_msg = err.get("message")
                    if isinstance(err_msg, str) and err_msg.strip():
                        message = err_msg
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"OpenAI API request failed ({exc.code}): {message}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error while calling OpenAI API: {exc.reason}") from exc

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenAI API returned a non-JSON response.") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("OpenAI API returned an unexpected JSON shape.")
    return parsed


def list_models(base_url: str, api_key: str) -> list[str]:
    payload = api_request("GET", f"{base_url}/models", api_key)
    data = payload.get("data")
    if not isinstance(data, list):
        return []

    model_ids = []
    for item in data:
        if isinstance(item, dict):
            model_id = item.get("id")
            if isinstance(model_id, str) and model_id:
                model_ids.append(model_id)
    model_ids.sort()
    return model_ids


def pick_model(available_model_ids: list[str], preferred_model_ids: list[str]) -> str | None:
    available = set(available_model_ids)
    for model_id in preferred_model_ids:
        if model_id in available:
            return model_id
    return None


def parse_prompt(args: argparse.Namespace) -> str | None:
    if args.prompt:
        return args.prompt.strip()
    if args.prompt_words:
        return " ".join(args.prompt_words).strip()
    if not sys.stdin.isatty():
        piped = sys.stdin.read().strip()
        if piped:
            return piped
    return None


def extract_output_text(response_payload: dict) -> str:
    output_text = response_payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    parts: list[str] = []
    output = response_payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") in {"output_text", "text"}:
                    text = block.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
    return "\n".join(parts).strip()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Send a prompt to OpenAI and prefer Codex models automatically."
    )
    parser.add_argument(
        "prompt_words",
        nargs="*",
        help="Prompt text (optional if --prompt or stdin is used).",
    )
    parser.add_argument("--prompt", help="Prompt text passed as a single argument.")
    parser.add_argument(
        "--model",
        help="Explicit model ID. If omitted, auto-picks the best available Codex model.",
    )
    parser.add_argument("--list-models", action="store_true", help="List available models and exit.")
    parser.add_argument(
        "--all-models",
        action="store_true",
        help="With --list-models, show all models instead of only codex/gpt-5.",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=800,
        help="Max output tokens for the response.",
    )
    parser.add_argument("--api-key", help="OpenAI API key. Defaults to OPENAI_API_KEY env var.")
    parser.add_argument(
        "--base-url",
        default=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        help="API base URL (default: https://api.openai.com/v1).",
    )
    parser.add_argument("--raw-json", action="store_true", help="Print raw JSON response to stderr.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    api_key = args.api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        parser.error("Missing API key. Set OPENAI_API_KEY or pass --api-key.")

    base_url = build_base_url(args.base_url)

    available_models: list[str] = []
    if args.list_models or not args.model:
        available_models = list_models(base_url, api_key)

    if args.list_models:
        if not available_models:
            print("No models returned for this API key.", file=sys.stderr)
            return 1
        filtered = available_models
        if not args.all_models:
            filtered = [m for m in available_models if ("codex" in m.lower() or m.startswith("gpt-5"))]
        if not filtered:
            print("No codex/gpt-5 models found for this API key.", file=sys.stderr)
            return 1
        print("\n".join(filtered))
        return 0

    prompt = parse_prompt(args)
    if not prompt:
        parser.error("Missing prompt. Pass text as an argument, --prompt, or pipe stdin.")

    model = args.model
    if not model:
        preferred = PREFERRED_CODEX_MODELS + FALLBACK_MODELS
        model = pick_model(available_models, preferred)
        if not model:
            print(
                "No preferred Codex/GPT-5 model found for this API key.\n"
                "Run with --list-models to inspect enabled models, then pass --model <id>.",
                file=sys.stderr,
            )
            return 1

    response_payload = api_request(
        "POST",
        f"{base_url}/responses",
        api_key,
        payload={
            "model": model,
            "input": prompt,
            "max_output_tokens": args.max_output_tokens,
        },
    )

    output_text = extract_output_text(response_payload)

    print(f"[model: {model}]", file=sys.stderr)
    if args.raw_json:
        print(json.dumps(response_payload, indent=2), file=sys.stderr)

    if output_text:
        print(output_text)
        return 0

    print("Model returned no text output. Use --raw-json for details.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
