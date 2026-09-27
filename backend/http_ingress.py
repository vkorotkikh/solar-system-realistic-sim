"""Fail-closed application ingress checks for network deployments.

Connection, slow-header, and keepalive limits belong to the HTTP server or
gateway.  This module is the ASGI boundary for request metadata that has
already reached the application: it bounds the parsed scope and rejects
ambiguous framing before request bodies or application models are consumed.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass

from starlette.responses import JSONResponse


_CANONICAL_CONTENT_LENGTH = re.compile(rb"(?:0|[1-9][0-9]*)\Z")
_MAX_ORIGIN_BYTES = 512


def scope_route_path(scope: Mapping[str, object]) -> str:
    """Return the same app-relative path Starlette uses for route dispatch.

    ASGI servers retain a trailing slash in ``root_path``.  Stripping it here
    changes ``/api/`` + ``/api//route`` into ``//route``, while Starlette
    dispatches that scope as ``/route``.  Security middleware must classify
    the exact path seen by the router, including the special ``root_path='/'``
    case.
    """

    path = scope.get("path")
    if not isinstance(path, str):
        return ""
    root_path = scope.get("root_path", "")
    if not isinstance(root_path, str) or not root_path:
        return path
    if not path.startswith(root_path):
        return path
    if path == root_path:
        return ""
    if path[len(root_path)] == "/":
        return path[len(root_path) :]
    return path


@dataclass(frozen=True, slots=True)
class NetworkRequestLimits:
    max_path_bytes: int
    max_query_bytes: int
    max_header_count: int
    max_header_name_bytes: int
    max_header_value_bytes: int
    max_header_bytes: int
    max_body_bytes: int

    def __post_init__(self) -> None:
        if any(
            value <= 0
            for value in (
                self.max_path_bytes,
                self.max_query_bytes,
                self.max_header_count,
                self.max_header_name_bytes,
                self.max_header_value_bytes,
                self.max_header_bytes,
                self.max_body_bytes,
            )
        ):
            raise ValueError("network request limits must be positive")


class NetworkRequestShapeMiddleware:
    """Bound a network-profile ASGI request before body consumption.

    The upstream HTTP server remains responsible for limiting sockets,
    keepalive, slow headers, and slow bodies.  The downstream body limiter is
    responsible for enforcing the same byte ceiling on streamed/chunked body
    messages.  This middleware rejects malformed declarations and bounds all
    request-shape collections visible in an ASGI scope.
    """

    def __init__(
        self,
        app,
        *,
        enabled: Callable[[], bool],
        limits: NetworkRequestLimits,
        cors_allowed_origins: frozenset[str] = frozenset(),
    ) -> None:
        self.app = app
        self.enabled = enabled
        self.limits = limits
        self.cors_allowed_origins = cors_allowed_origins

    def _cors_error_headers(self, scope) -> dict[str, str]:
        headers = scope.get("headers", ())
        if not isinstance(headers, (list, tuple)):
            return {}
        # The cardinality failure path must remain O(configured limit), not
        # O(attacker-supplied headers). No CORS metadata is emitted when the
        # collection itself is already invalid because uniqueness cannot be
        # established without rescanning unbounded input.
        if len(headers) > self.limits.max_header_count:
            return {}
        origin_bytes: bytes | None = None
        for item in headers:
            if (
                not isinstance(item, (list, tuple))
                or len(item) != 2
                or not isinstance(item[0], bytes)
                or not isinstance(item[1], bytes)
            ):
                return {}
            raw_name, raw_value = item
            # Avoid copying/lowercasing an attacker-sized name on an error
            # path. The primary validator will report the precise violation.
            if len(raw_name) > self.limits.max_header_name_bytes:
                continue
            if raw_name.lower() != b"origin":
                continue
            if origin_bytes is not None:
                return {}
            if (
                not raw_value
                or len(raw_value) > self.limits.max_header_value_bytes
                or len(raw_value) > _MAX_ORIGIN_BYTES
            ):
                return {}
            origin_bytes = raw_value
        if origin_bytes is None:
            return {}
        try:
            origin = origin_bytes.decode("ascii")
        except UnicodeDecodeError:
            return {}
        if origin not in self.cors_allowed_origins:
            return {}
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }

    def _error(
        self,
        scope,
        status_code: int,
        code: str,
        message: str,
    ) -> JSONResponse:
        headers = {"Cache-Control": "private, no-store"}
        headers.update(self._cors_error_headers(scope))
        return JSONResponse(
            status_code=status_code,
            headers=headers,
            content={
                "detail": {
                    "code": code,
                    "message": message,
                    "retryable": False,
                }
            },
        )

    async def _reject(
        self,
        scope,
        receive,
        send,
        *,
        status_code: int,
        code: str,
        message: str,
    ) -> None:
        response = self._error(scope, status_code, code, message)
        await response(scope, receive, send)

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http" or not self.enabled():
            await self.app(scope, receive, send)
            return

        raw_path = scope.get("raw_path")
        if raw_path is None:
            try:
                raw_path = str(scope.get("path", "")).encode("utf-8")
            except UnicodeEncodeError:
                raw_path = None
        if not isinstance(raw_path, bytes):
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="invalid_request_path",
                message="Request path encoding is invalid.",
            )
            return
        if len(raw_path) > self.limits.max_path_bytes:
            await self._reject(
                scope,
                receive,
                send,
                status_code=414,
                code="path_too_large",
                message="Request path exceeds the network-profile byte limit.",
            )
            return

        query = scope.get("query_string", b"")
        if not isinstance(query, bytes):
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="invalid_query_string",
                message="Request query encoding is invalid.",
            )
            return
        if len(query) > self.limits.max_query_bytes:
            await self._reject(
                scope,
                receive,
                send,
                status_code=414,
                code="query_too_large",
                message="Request query exceeds the network-profile byte limit.",
            )
            return

        headers = scope.get("headers", ())
        if not isinstance(headers, (list, tuple)):
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="invalid_request_headers",
                message="Request headers are malformed.",
            )
            return
        if len(headers) > self.limits.max_header_count:
            await self._reject(
                scope,
                receive,
                send,
                status_code=431,
                code="too_many_headers",
                message="Request contains too many headers.",
            )
            return

        header_bytes = 0
        values: dict[bytes, list[bytes]] = {
            b"content-length": [],
            b"transfer-encoding": [],
            b"content-encoding": [],
            b"origin": [],
        }
        for item in headers:
            if (
                not isinstance(item, (list, tuple))
                or len(item) != 2
                or not isinstance(item[0], bytes)
                or not isinstance(item[1], bytes)
            ):
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="invalid_request_headers",
                    message="Request headers are malformed.",
                )
                return
            raw_name, raw_value = item
            if len(raw_name) > self.limits.max_header_name_bytes:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=431,
                    code="header_name_too_large",
                    message="A request header name exceeds the byte limit.",
                )
                return
            if len(raw_value) > self.limits.max_header_value_bytes:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=431,
                    code="header_value_too_large",
                    message="A request header value exceeds the byte limit.",
                )
                return
            header_bytes += len(raw_name) + len(raw_value)
            if header_bytes > self.limits.max_header_bytes:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=431,
                    code="headers_too_large",
                    message="Aggregate request headers exceed the byte limit.",
                )
                return
            name = raw_name.lower()
            if name in values:
                values[name].append(raw_value)

        content_lengths = values[b"content-length"]
        transfer_encodings = values[b"transfer-encoding"]
        content_encodings = values[b"content-encoding"]
        origins = values[b"origin"]

        if len(origins) > 1:
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="ambiguous_origin",
                message="Request must contain at most one Origin header.",
            )
            return
        if origins:
            try:
                origins[0].decode("ascii")
            except UnicodeDecodeError:
                origin_valid = False
            else:
                origin_valid = 0 < len(origins[0]) <= _MAX_ORIGIN_BYTES
            if not origin_valid:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="invalid_origin",
                    message="Origin header is malformed or exceeds its byte limit.",
                )
                return

        if len(content_lengths) > 1:
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="ambiguous_content_length",
                message="Request must contain at most one Content-Length header.",
            )
            return
        if content_lengths and transfer_encodings:
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="ambiguous_request_framing",
                message="Content-Length and Transfer-Encoding cannot be combined.",
            )
            return

        content_length: int | None = None
        if content_lengths:
            raw_content_length = content_lengths[0]
            if _CANONICAL_CONTENT_LENGTH.fullmatch(raw_content_length) is None:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="invalid_content_length",
                    message="Content-Length must be a canonical non-negative integer.",
                )
                return
            encoded_limit = str(self.limits.max_body_bytes).encode("ascii")
            exceeds_limit = (
                len(raw_content_length) > len(encoded_limit)
                or (
                    len(raw_content_length) == len(encoded_limit)
                    and raw_content_length > encoded_limit
                )
            )
            if exceeds_limit:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=413,
                    code="request_body_too_large",
                    message="Request body exceeds the network-profile byte limit.",
                )
                return
            content_length = int(raw_content_length)

        if len(transfer_encodings) != 0:
            if (
                len(transfer_encodings) != 1
                or transfer_encodings[0].strip().lower() != b"chunked"
            ):
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="unsupported_transfer_encoding",
                    message="Only canonical chunked transfer encoding is supported.",
                )
                return

        if len(content_encodings) != 0:
            if (
                len(content_encodings) != 1
                or content_encodings[0].strip().lower() != b"identity"
            ):
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=415,
                    code="unsupported_content_encoding",
                    message="Compressed request bodies are not supported.",
                )
                return

        method = str(scope.get("method", "")).upper()
        if method in {"GET", "HEAD"} and (
            (content_length is not None and content_length > 0)
            or bool(transfer_encodings)
        ):
            await self._reject(
                scope,
                receive,
                send,
                status_code=400,
                code="safe_method_body_forbidden",
                message="Request bodies are not accepted for GET or HEAD.",
            )
            return

        await self.app(scope, receive, send)


class NetworkSafeMethodBodyMiddleware:
    """Reject every network-profile GET/HEAD body after authentication.

    Metadata-only checks cannot detect HTTP/2 bodies that omit both framing
    headers. This boundary consumes exactly the first ASGI request event under
    a short idle deadline, rejects any bytes or continued stream, and replays a
    valid empty event for downstream compatibility.
    """

    def __init__(
        self,
        app,
        *,
        enabled: Callable[[], bool],
        body_idle_timeout_s: float,
    ) -> None:
        self.app = app
        self.enabled = enabled
        self.body_idle_timeout_s = max(0.001, float(body_idle_timeout_s))

    async def _error(
        self,
        scope,
        receive,
        send,
        *,
        status_code: int,
        code: str,
        message: str,
    ) -> None:
        response = JSONResponse(
            status_code=status_code,
            headers={"Cache-Control": "private, no-store"},
            content={
                "detail": {
                    "code": code,
                    "message": message,
                    "retryable": False,
                }
            },
        )
        await response(scope, receive, send)

    async def __call__(self, scope, receive, send) -> None:
        if (
            scope.get("type") != "http"
            or not self.enabled()
            or str(scope.get("method", "")).upper() not in {"GET", "HEAD"}
        ):
            await self.app(scope, receive, send)
            return

        try:
            first_message = await asyncio.wait_for(
                receive(),
                timeout=self.body_idle_timeout_s,
            )
        except TimeoutError:
            await self._error(
                scope,
                receive,
                send,
                status_code=408,
                code="request_body_idle_timeout",
                message="Request body event did not arrive before the idle deadline.",
            )
            return

        if first_message.get("type") == "http.request":
            body = first_message.get("body", b"")
            if not isinstance(body, bytes):
                await self._error(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="invalid_request_body",
                    message="Request body event is malformed.",
                )
                return
            if body or first_message.get("more_body", False) is not False:
                await self._error(
                    scope,
                    receive,
                    send,
                    status_code=400,
                    code="safe_method_body_forbidden",
                    message="Request bodies are not accepted for GET or HEAD.",
                )
                return

        replayed = False

        async def replay_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return first_message
            return await receive()

        await self.app(scope, replay_receive, send)
