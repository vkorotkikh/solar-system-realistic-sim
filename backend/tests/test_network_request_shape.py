from __future__ import annotations

import asyncio
from typing import Any

import pytest
from starlette.middleware.cors import CORSMiddleware

from http_ingress import (
    NetworkRequestLimits,
    NetworkRequestShapeMiddleware,
    NetworkSafeMethodBodyMiddleware,
    scope_route_path,
)


DEFAULT_LIMITS = NetworkRequestLimits(
    max_path_bytes=2_048,
    max_query_bytes=8_192,
    max_header_count=64,
    max_header_name_bytes=128,
    max_header_value_bytes=8_192,
    max_header_bytes=32_768,
    max_body_bytes=65_536,
)


@pytest.mark.parametrize(
    ("root_path", "path", "expected"),
    [
        ("", "/trajectory/lambert", "/trajectory/lambert"),
        ("/", "//trajectory/lambert", "/trajectory/lambert"),
        ("/api", "/api/trajectory/lambert", "/trajectory/lambert"),
        ("/api/", "/api//trajectory/lambert", "/trajectory/lambert"),
        ("/api", "/api", ""),
        ("/api", "/apiary/trajectory/lambert", "/apiary/trajectory/lambert"),
    ],
)
def test_scope_route_path_matches_starlette_root_path_semantics(
    root_path: str,
    path: str,
    expected: str,
) -> None:
    assert scope_route_path({"root_path": root_path, "path": path}) == expected


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


def _response_headers(messages: list[dict[str, Any]]) -> dict[bytes, bytes]:
    start = next(message for message in messages if message["type"] == "http.response.start")
    return {bytes(name).lower(): bytes(value) for name, value in start["headers"]}


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


def test_network_ingress_rejects_duplicate_origin() -> None:
    called, messages = _exercise(
        _scope(
            method="OPTIONS",
            headers=[
                (b"origin", b"http://localhost:3000"),
                (b"origin", b"https://hostile.invalid"),
            ],
        )
    )

    status, body = _error(messages)
    assert called is False
    assert status == 400
    assert b'"ambiguous_origin"' in body


@pytest.mark.parametrize(
    ("scope", "expected_status", "expected_code"),
    [
        (
            _scope(
                method="OPTIONS",
                query=b"x" * (DEFAULT_LIMITS.max_query_bytes + 1),
                headers=[
                    (b"origin", b"http://localhost:3000"),
                    (b"access-control-request-method", b"GET"),
                ],
            ),
            414,
            b'"query_too_large"',
        ),
        (
            _scope(
                method="OPTIONS",
                headers=[
                    (b"origin", b"http://localhost:3000"),
                    (b"access-control-request-method", b"GET"),
                    (b"content-length", b"1"),
                    (b"transfer-encoding", b"chunked"),
                ],
            ),
            400,
            b'"ambiguous_request_framing"',
        ),
        (
            _scope(
                method="OPTIONS",
                headers=[
                    (b"origin", b"http://localhost:3000"),
                    (b"access-control-request-method", b"GET"),
                    (b"access-control-request-headers", b"x" * 9_000),
                ],
            ),
            431,
            b'"header_value_too_large"',
        ),
    ],
)
def test_network_shape_gate_runs_before_cors_preflight(
    scope: dict[str, Any],
    expected_status: int,
    expected_code: bytes,
) -> None:
    downstream_called = False
    sent: list[dict[str, Any]] = []

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    cors = CORSMiddleware(
        downstream,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )
    middleware = NetworkRequestShapeMiddleware(
        cors,
        enabled=lambda: True,
        limits=DEFAULT_LIMITS,
        cors_allowed_origins=frozenset({"http://localhost:3000"}),
    )

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    asyncio.run(middleware(scope, receive, send))

    status, body = _error(sent)
    headers = _response_headers(sent)
    assert downstream_called is False
    assert status == expected_status
    assert expected_code in body
    assert headers[b"cache-control"] == b"private, no-store"
    assert headers[b"access-control-allow-origin"] == b"http://localhost:3000"
    assert headers[b"access-control-allow-credentials"] == b"true"
    assert b"origin" in headers[b"vary"].lower()


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


def test_too_many_headers_does_not_rescan_unbounded_collection_for_cors() -> None:
    class CountingHeaders(list[tuple[bytes, bytes]]):
        iterations = 0

        def __iter__(self):
            for item in super().__iter__():
                self.iterations += 1
                yield item

    headers = CountingHeaders(
        [(b"origin", b"http://localhost:3000") for _ in range(10_000)]
    )

    called, messages = _exercise(_scope(method="OPTIONS", headers=headers))

    status, body = _error(messages)
    assert called is False
    assert status == 431
    assert b'"too_many_headers"' in body
    assert headers.iterations == 0


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


def test_network_ingress_rejects_unencodable_path_when_raw_path_is_absent() -> None:
    scope = _scope()
    scope.pop("raw_path")
    scope["path"] = "\ud800" * 3_000

    called, messages = _exercise(scope)

    status, body = _error(messages)
    assert called is False
    assert status == 400
    assert b'"invalid_request_path"' in body


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


@pytest.mark.parametrize(
    "headers",
    [
        [],
        [(b"content-length", b"0")],
    ],
)
def test_safe_method_body_guard_rejects_undeclared_body_bytes(
    headers: list[tuple[bytes, bytes]],
) -> None:
    downstream_called = False
    sent: list[dict[str, Any]] = []

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"x" * 70_000, "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    middleware = NetworkSafeMethodBodyMiddleware(
        downstream,
        enabled=lambda: True,
        body_idle_timeout_s=0.1,
    )
    asyncio.run(
        middleware(
            _scope(method="GET", headers=headers),
            receive,
            send,
        )
    )

    status, body = _error(sent)
    assert downstream_called is False
    assert status == 400
    assert b'"safe_method_body_forbidden"' in body


def test_safe_method_body_guard_replays_the_empty_request_event() -> None:
    received: list[dict[str, Any]] = []
    sent: list[dict[str, Any]] = []

    async def downstream(_scope, receive, send) -> None:
        received.append(await receive())
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    middleware = NetworkSafeMethodBodyMiddleware(
        downstream,
        enabled=lambda: True,
        body_idle_timeout_s=0.1,
    )
    asyncio.run(middleware(_scope(method="HEAD"), receive, send))

    assert received == [
        {"type": "http.request", "body": b"", "more_body": False}
    ]
    assert _error(sent)[0] == 204


def test_safe_method_body_guard_rejects_fragmented_empty_body_stream() -> None:
    downstream_called = False
    sent: list[dict[str, Any]] = []

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": True}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    middleware = NetworkSafeMethodBodyMiddleware(
        downstream,
        enabled=lambda: True,
        body_idle_timeout_s=0.1,
    )
    asyncio.run(middleware(_scope(method="GET"), receive, send))

    assert downstream_called is False
    assert _error(sent)[0] == 400


def test_safe_method_body_guard_has_a_bounded_idle_wait() -> None:
    downstream_called = False
    sent: list[dict[str, Any]] = []

    async def downstream(_scope, _receive, _send) -> None:
        nonlocal downstream_called
        downstream_called = True

    async def receive() -> dict[str, Any]:
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    middleware = NetworkSafeMethodBodyMiddleware(
        downstream,
        enabled=lambda: True,
        body_idle_timeout_s=0.01,
    )
    asyncio.run(middleware(_scope(method="GET"), receive, send))

    status, body = _error(sent)
    assert downstream_called is False
    assert status == 408
    assert b'"request_body_idle_timeout"' in body
