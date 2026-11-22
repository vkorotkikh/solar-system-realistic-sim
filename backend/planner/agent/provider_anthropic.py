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
import logging

import anthropic
from anthropic.lib.credentials import WorkloadIdentityError

from .loop import AssistantText, ModelReply, ProviderError, ToolCall, ToolResults, UserText

# Thinking is always on and its tokens count here: the API guide's non-streaming default, so an
# answer is not cut off. Only the tokens generated are billed.
MAX_TOKENS = 16_000
_log = logging.getLogger(__name__)
BETAS = ["server-side-fallback-2026-07-01"]


@functools.cache
def _client() -> anthropic.Anthropic:
    # The loop owns the time budget, so the SDK does not retry inside it.
    return anthropic.Anthropic(max_retries=0)


def _credentials_error(problem: str) -> ProviderError:
    """A credentials failure. The cached client is dropped, so the next prompt reads a new `ant auth login`;
    a new ANTHROPIC_API_KEY reaches only a restarted backend."""
    _client.cache_clear()
    return ProviderError("model_credentials", f"{problem} Set ANTHROPIC_API_KEY and restart the backend, or sign "
                         "in with `ant auth login`.", retryable=False)


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
        raise _credentials_error("The model provider rejected the credentials.") from exc
    except anthropic.APIStatusError as exc:
        raise ProviderError("model_error", f"The model provider returned HTTP {exc.status_code}.",
                            retryable=exc.status_code >= 500) from exc
    except TypeError as exc:  # anthropic 2.8.0 raises a plain TypeError when it finds no key or profile at all
        if "authentication method" not in str(exc):
            raise
        raise _credentials_error("The model provider has no credentials.") from exc
    except (anthropic.CredentialsError, WorkloadIdentityError) as exc:  # a profile that is broken or expired
        _log.warning("Model provider credentials failed to load: %s", exc)
        raise _credentials_error("The model provider could not load its credentials.") from exc
    except anthropic.AnthropicError as exc:
        _log.warning("Model provider call failed: %s", exc)  # the detail stays in the server log
        raise ProviderError("model_error", "The model provider call failed.", retryable=False) from exc

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
