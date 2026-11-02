"""Pass-through ASGI wrapper around backend/server.py:app for the H-1 browser matrix.

It changes nothing about request handling; it only appends one JSON line per HTTP request to
$REQLOG with path, Origin, Sec-Fetch-Mode, status, the Access-Control-Allow-Origin header the
inner app (incl. its CORSMiddleware) sent, time-to-response-start and total handler duration.
Run from the backend dir:  python -m uvicorn logged_backend:app --app-dir <this dir> ...
"""
import json
import os
import time

from server import app as inner  # noqa: E402  (backend dir is cwd / sys.path[0])

_LOG = open(os.environ["REQLOG"], "a", buffering=1)


def _h(pairs):
    return {k.decode("latin1").lower(): v.decode("latin1") for k, v in pairs}


async def app(scope, receive, send):
    if scope["type"] != "http":
        return await inner(scope, receive, send)
    t0 = time.time()
    hdr = _h(scope.get("headers", []))
    info = {"t0": round(t0, 3), "method": scope.get("method"), "path": scope["path"],
            "qs": scope.get("query_string", b"").decode("latin1")[:160], "origin": hdr.get("origin"),
            "fetch_mode": hdr.get("sec-fetch-mode"), "client": (scope.get("client") or [None])[0],
            "status": None, "acao": None}

    async def send2(msg):
        if msg["type"] == "http.response.start":
            info["status"] = msg["status"]
            info["acao"] = _h(msg.get("headers", [])).get("access-control-allow-origin")
            info["t_start"] = round(time.time() - t0, 3)
        await send(msg)

    try:
        await inner(scope, receive, send2)
    except BaseException as exc:  # record and re-raise
        info["exc"] = repr(exc)[:200]
        raise
    finally:
        info["dur"] = round(time.time() - t0, 3)
        _LOG.write(json.dumps(info) + "\n")
