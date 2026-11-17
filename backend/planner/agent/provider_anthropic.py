"""The model call through the Anthropic API: the only module that imports the Anthropic SDK.

Credentials are resolved by the SDK: ANTHROPIC_API_KEY, or a profile from
`ant auth login`. Adding another provider means a sibling module with the same
call_model function.

Per request: strict tool schemas with automatic tool choice (current models
reject a forced choice), the answer constrained by a JSON schema, effort low,
the fixed system prompt and tools cached, and server-side fallback on a
safety refusal ("default" routes by refusal category; a model without a
fallback, such as Claude Haiku 5.5, returns the refusal unchanged).
"""

from __future__ import annotations

import functools

import anthropic

from .loop import AssistantText, ModelReply, ProviderError, ToolCall, ToolResults, UserText

MAX_TOKENS = 8_000
BETAS = ["server-side-fallback-2026-07-01"]


@functools.cache
def _client() -> anthropic.Anthropic:
    # The loop owns the time budget, so the SDK does not retry inside it.
    return anthropic.Anthropic(max_retries=0)


def _message(turn) -> dict:
    if isinstance(turn, UserText):
        return {"role": "user", "content": turn.text}
    if isinstance(turn, AssistantText):
        return {"role": "assistant", "content": turn.text}
    if isinstance(turn, ToolResults):
        return {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": call_id, "content": content, "is_error": is_error}
            for call_id, content, is_error in turn.results]}
    return {"role": "assistant", "content": turn.replay}  # a ModelReply: its blocks, thinking included, unchanged


def call_model(*, model: str, system: str, tools, answer_schema: dict, turns, timeout_s: float,
               client: anthropic.Anthropic | None = None) -> ModelReply:
    """One Messages API call over the conversation so far."""
    try:
        response = (client or _client()).with_options(timeout=timeout_s).beta.messages.create(
            model=model,
            max_tokens=MAX_TOKENS,
            betas=BETAS,
            fallbacks="default",
            cache_control={"type": "ephemeral"},
            system=system,
            tools=[{"name": tool.name, "description": tool.description, "input_schema": tool.input_schema,
                    "strict": True} for tool in tools],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": answer_schema}},
            messages=[_message(turn) for turn in turns],
        )
    except anthropic.APIConnectionError as exc:  # timeouts included
        raise ProviderError("model_unreachable", "The model provider could not be reached in time.",
                            retryable=True) from exc
    except anthropic.RateLimitError as exc:
        raise ProviderError("model_rate_limited", "The model provider is rate limiting requests. Retry shortly.",
                            retryable=True) from exc
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
        raise ProviderError("model_credentials", "The model provider rejected the credentials. Set "
                            "ANTHROPIC_API_KEY or sign in with `ant auth login`.", retryable=False) from exc
    except anthropic.APIStatusError as exc:
        raise ProviderError("model_error", f"The model provider returned HTTP {exc.status_code}.",
                            retryable=exc.status_code >= 500) from exc
    except anthropic.AnthropicError as exc:  # for example no credentials found at all
        raise ProviderError("model_error", f"The model provider call failed: {exc}", retryable=False) from exc

    usage = response.usage
    return ModelReply(
        stop=str(response.stop_reason),
        text="".join(block.text for block in response.content if block.type == "text"),
        tool_calls=tuple(ToolCall(block.id, block.name, dict(block.input))
                         for block in response.content if block.type == "tool_use"),
        usage={"input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
               "cache_read_input_tokens": usage.cache_read_input_tokens or 0,
               "cache_creation_input_tokens": usage.cache_creation_input_tokens or 0},
        model=response.model,
        replay=[block.to_dict() for block in response.content],
    )
