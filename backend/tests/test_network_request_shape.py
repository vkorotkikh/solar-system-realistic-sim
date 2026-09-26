from __future__ import annotations

import asyncio
from typing import Any

import pytest

from http_ingress import NetworkRequestLimits, NetworkRequestShapeMiddleware


DEFAULT_LIMITS = NetworkRequestLimits(
    max_path_bytes=2_048,
    max_query_bytes=8_192,
    max_header_count=64,
    max_header_name_bytes=128,
    max_header_value_bytes=8_192,
    max_header_bytes=32_768,
    max_body_bytes=65_536,
)


def _scope(
    *,
    method: str = "POST",
    path: bytes = b"/trajectory/lambert",
    query: bytes = b"",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path.decode("ascii"),
        "raw_path": path,
        "query_string": query,
        "headers": headers or [],
        "client": ("198.51.100.10", 43210),
        "server": ("example.test", 443),
    }


def _exercise(
    scope: dict[str, Any],
    *,
    enabled: bool = True,
) -> tuple[bool, list[dict[str, Any]]]:
    downstream_called = False
    messages: list[dict[str, Any]] = []

    async def downstream(_scope, _receive, send) -> None:
        nonlocal downstream_called
        downstream_called = True
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    request_messages = [
        {"type": "http.request", "body": b"", "more_body": False}
    ]

    async def receive() -> dict[str, Any]:
        return request_messages.pop(0)

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    middleware = NetworkRequestShapeMiddleware(
        downstream,
        enabled=lambda: enabled,
        limits=DEFAULT_LIMITS,
    )
    asyncio.run(middleware(scope, receive, send))
    return downstream_called, messages


def _error(messages: list[dict[str, Any]]) -> tuple[int, bytes]:
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(
        message.get("body", b"")
        for message in messages
        if message["type"] == "http.response.body"
    )
    return int(start["status"]), body


@pytest.mark.parametrize(
    ("headers", "expected_code"),
    [
        (
            [(b"content-length", b"1"), (b"content-length", b"1")],
            b'"ambiguous_content_length"',
        ),
        (
            [(b"content-length", b"1"), (b"transfer-encoding", b"chunked")],
            b'"ambiguous_request_framing"',
        ),
        ([(b"content-length", b"+1")], b'"invalid_content_length"'),
        ([(b"content-length", b"01")], b'"invalid_content_length"'),
        ([(b"transfer-encoding", b"gzip")], b'"unsupported_transfer_encoding"'),
    ],
)
def test_network_ingress_rejects_ambiguous_or_noncanonical_framing(
    headers: list[tuple[bytes, bytes]],
    expected_code: bytes,
) -> None:
    called, messages = _exercise(_scope(headers=headers))

    status, body = _error(messages)
    assert called is False
    assert status == 400
    assert expected_code in body


@pytest.mark.parametrize(
    "headers",
    [
        [(b"content-encoding", b"gzip")],
        [(b"content-encoding", b"br")],
        [(b"content-encoding", b"identity"), (b"content-encoding", b"identity")],
    ],
)
def test_network_ingress_rejects_compressed_or_ambiguous_request_bodies(
    headers: list[tuple[bytes, bytes]],
) -> None:
    called, messages = _exercise(_scope(headers=headers))

    status, body = _error(messages)
    assert called is False
    assert status == 415
    assert b'"unsupported_content_encoding"' in body


@pytest.mark.parametrize("method", ["GET", "HEAD"])
@pytest.mark.parametrize(
    "headers",
    [
        [(b"content-length", b"1")],
        [(b"transfer-encoding", b"chunked")],
    ],
)
def test_network_ingress_rejects_declared_bodies_on_safe_methods(
    method: str,
    headers: list[tuple[bytes, bytes]],
) -> None:
    called, messages = _exercise(_scope(method=method, headers=headers))

    status, body = _error(messages)
    assert called is False
    assert status == 400
    assert b'"safe_method_body_forbidden"' in body


@pytest.mark.parametrize(
    ("scope", "expected_status", "expected_code"),
    [
        (
            _scope(query=b"x" * (DEFAULT_LIMITS.max_query_bytes + 1)),
            414,
            b'"query_too_large"',
        ),
        (
            _scope(path=b"/" + b"x" * DEFAULT_LIMITS.max_path_bytes),
            414,
            b'"path_too_large"',
        ),
        (
            _scope(headers=[(b"x" * 129, b"v")]),
            431,
            b'"header_name_too_large"',
        ),
        (
            _scope(headers=[(b"x-test", b"v" * 8_193)]),
            431,
            b'"header_value_too_large"',
        ),
        (
            _scope(headers=[(f"x-{index}".encode(), b"v") for index in range(65)]),
            431,
            b'"too_many_headers"',
        ),
        (
            _scope(headers=[(b"x-a", b"v" * 8_000) for _ in range(5)]),
            431,
            b'"headers_too_large"',
        ),
        (
            _scope(headers=[(b"content-length", b"65537")]),
            413,
            b'"request_body_too_large"',
        ),
        (
            _scope(headers=[(b"content-length", b"9" * 4_301)]),
            413,
            b'"request_body_too_large"',
        ),
    ],
)
def test_network_ingress_enforces_shape_limits_before_downstream(
    scope: dict[str, Any],
    expected_status: int,
    expected_code: bytes,
) -> None:
    called, messages = _exercise(scope)

    status, body = _error(messages)
    assert called is False
    assert status == expected_status
    assert expected_code in body


def test_network_ingress_accepts_canonical_bounded_chunked_post() -> None:
    called, messages = _exercise(
        _scope(
            headers=[
                (b"transfer-encoding", b"chunked"),
                (b"content-encoding", b"identity"),
            ]
        )
    )

    assert called is True
    assert _error(messages)[0] == 204


def test_local_profile_bypasses_network_specific_shape_policy() -> None:
    called, messages = _exercise(
        _scope(
            method="GET",
            query=b"x" * (DEFAULT_LIMITS.max_query_bytes + 1),
            headers=[(b"content-length", b"1")],
        ),
        enabled=False,
    )

    assert called is True
    assert _error(messages)[0] == 204
