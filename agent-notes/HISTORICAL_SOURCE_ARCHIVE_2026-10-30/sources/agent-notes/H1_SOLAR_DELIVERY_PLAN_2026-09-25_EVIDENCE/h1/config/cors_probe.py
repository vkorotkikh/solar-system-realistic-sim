"""CORS probe against a default-config backend.

For every candidate page origin, send
  * a simple GET (what the browser's fetch()/<img crossorigin> actually sends)
  * an OPTIONS preflight (what a browser would send if the client added a
    custom header such as X-API-Key)
to the fast /solar/physics path and to /solar/realtime/aia-tile (invalid
channel -> fast 400, no upstream call), and record the CORS response headers.
"""
from __future__ import annotations

import json
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8074"

PHYSICS = "/solar/physics?jd=2461308.5&fidelity=" + (sys.argv[2] if len(sys.argv) > 2 else "low") + "&max_features=64&forcing=synthetic&live_data=false"
AIA = "/solar/realtime/aia-tile?channel=not_a_channel"

ORIGINS = [
    ("npm run dev (vite default host)", "http://localhost:5173"),
    ("dev:ui default / dev via 127.0.0.1", "http://127.0.0.1:5173"),
    ("dev via IPv6 loopback", "http://[::1]:5173"),
    ("vite port fallback when 5173 busy", "http://localhost:5174"),
    ("dev:full --frontend-port 5180", "http://localhost:5180"),
    ("dev:full --host 0.0.0.0 opened from LAN IP", "http://192.168.1.10:5173"),
    ("npm run preview (default)", "http://localhost:4173"),
    ("npm run preview via 127.0.0.1", "http://127.0.0.1:4173"),
    ("legacy port 3000 http", "http://localhost:3000"),
    ("legacy port 3000 https", "https://localhost:3000"),
    ("static prod build on another host", "https://solar.example.com"),
    ("file:// or sandboxed iframe", "null"),
]


def probe(client: httpx.Client, path: str, origin: str) -> dict:
    out: dict = {}
    t0 = time.perf_counter()
    r = client.get(BASE + path, headers={"Origin": origin})
    out["get_status"] = r.status_code
    out["get_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    out["get_acao"] = r.headers.get("access-control-allow-origin")
    out["get_acac"] = r.headers.get("access-control-allow-credentials")
    out["get_vary"] = r.headers.get("vary")
    r = client.options(
        BASE + path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-api-key",
        },
    )
    out["preflight_status"] = r.status_code
    out["preflight_acao"] = r.headers.get("access-control-allow-origin")
    out["preflight_body"] = r.text[:60]
    return out


def main() -> None:
    rows = []
    with httpx.Client(timeout=30.0) as client:
        # No Origin at all (curl / same-origin navigation / server-side proxy hop)
        r = client.get(BASE + PHYSICS)
        rows.append({"mode": "no Origin header (curl / proxy hop)", "origin": None,
                     "physics": {"get_status": r.status_code,
                                 "get_acao": r.headers.get("access-control-allow-origin")},
                     "aia": None})
        for label, origin in ORIGINS:
            rows.append({
                "mode": label,
                "origin": origin,
                "physics": probe(client, PHYSICS, origin),
                "aia": probe(client, AIA, origin),
            })
    print(json.dumps(rows, indent=1))
    print("\nSUMMARY (browser verdict: allowed iff ACAO echoes the Origin)")
    print(f"{'origin':32} {'phys GET':>8} {'ACAO':>8} {'pre':>4} {'aia GET':>7} {'ACAO':>8} {'pre':>4}")
    for row in rows[1:]:
        p, a = row["physics"], row["aia"]
        ok = lambda v, o: "echo" if v == o else ("-" if v is None else v)
        print(f"{row['origin']:32} {p['get_status']:>8} {ok(p['get_acao'], row['origin']):>8} {p['preflight_status']:>4}"
              f" {a['get_status']:>7} {ok(a['get_acao'], row['origin']):>8} {a['preflight_status']:>4}")


if __name__ == "__main__":
    main()
