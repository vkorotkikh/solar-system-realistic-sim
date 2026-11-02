# Bounded solar rendering delivery

The first-party Sun client requests `GET /solar/physics?delivery=render-v1` at
its existing 30-second cadence. Every successful poll carries the current
requested epoch, wall freshness, activity and provenance. Geometry is lossless;
this transport does not quantize coordinates or change the physical model.
The default endpoint without this option still returns the complete version-2
state for scientific consumers.

A render response has a `delivery` descriptor with schema
`solar_render_delivery` version 1, a SHA-256 `geometry_version` and a
`geometry_included` boolean. The hash covers complete corona features, PFSS
lines and Parker lines. After accepting a complete response the client supplies
that hash as the next `geometry_version` query argument. On an exact match only
those three arrays are omitted; every other field is refreshed. The client
reattaches only arrays accepted with the same hash. Unknown versions, missing
arrays or an unsolicited reuse fail closed, retain the previous state and cause
the next poll to request complete geometry. New client instances start without
a hash. Complete responses from older servers remain supported.

HTTP gzip is negotiated through `Accept-Encoding`; no custom browser header or
CORS preflight is needed. The server caps a render response at **512 KiB encoded**
and **2 MiB decoded**. Without gzip the same encoded cap applies to plain JSON.
A state above either cap returns structured HTTP 413
`solar_delivery_budget_exceeded`, preserving the last accepted state in the
client. There is no silent truncation or mixed-epoch geometry. The browser also
bounds its decompressed response stream at 2 MiB and checks a supplied encoded
Content-Length for render responses. Old complete responses are accepted up to
the decoded cap.

At the default cadence this bounds two successful response bodies per minute at
**1 MiB encoded**, excluding HTTP/TLS overhead, realtime observations and explicit
forced refreshes. Identical geometry polls have a separate **16 KiB acceptance
budget** in the native HTTP test. This is a delivery bound, not a provider latency
or compute-speed promise: geometry is still computed and authenticated through
the existing request-owned worker before hashing. A future computation cache
would need its own cancellation and freshness proof.

Observed forcing remains disabled until separately validated. The qualified
single-epoch GONG/WSA corpus, raw AIA tile spatial rejection and provider-cache
contracts are unaffected by wire reuse. A compact response cannot promote an
observed geometry frame or make synthetic geometry observationally calibrated.
