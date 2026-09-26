"""Fail-closed application ingress checks for network deployments.

Connection, slow-header, and keepalive limits belong to the HTTP server or
gateway.  This module is the ASGI boundary for request metadata that has
already reached the application: it bounds the parsed scope and rejects
ambiguous framing before request bodies or application models are consumed.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from starlette.responses import JSONResponse


_CANONICAL_CONTENT_LENGTH = re.compile(rb"(?:0|[1-9][0-9]*)\Z")


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
    ) -> None:
        self.app = app
        self.enabled = enabled
        self.limits = limits

    def _error(
        self,
        status_code: int,
        code: str,
        message: str,
    ) -> JSONResponse:
        return JSONResponse(
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
        response = self._error(status_code, code, message)
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
                raw_path = b""
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
            content_length = int(raw_content_length)
            if content_length > self.limits.max_body_bytes:
                await self._reject(
                    scope,
                    receive,
                    send,
                    status_code=413,
                    code="request_body_too_large",
                    message="Request body exceeds the network-profile byte limit.",
                )
                return

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
