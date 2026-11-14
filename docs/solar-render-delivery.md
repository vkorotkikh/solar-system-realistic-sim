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

Geometry is a function of the requested epoch, so a hash can match only when
the next request is for a byte-identical epoch. Reuse therefore applies to
repeated requests at the same epoch, such as a paused simulation or a retry; it
does not apply during playback, except at the Real time stop described below.
Measured over real HTTP at
`fidelity=high&max_features=180`, one second of simulated time already changes
all three arrays (corona features, PFSS lines and Parker lines). While the
simulation plays, every poll sends complete geometry, about **262 KB gzip**; a
same-epoch poll with reuse is about 2.8 KB. Deltas are not sent.

The browser requests the start of the 0.01-day step that holds the clock
reading (`solarPhysicsRequestJd`, owner decision of 2026-11-03). Polls share a
step only below 28.8× real time, so the speed slider has a **Real time** stop
(one simulated second per second) between 0 and +12 h/s. At that stop about 29
consecutive 30 s polls ask for the same epoch; after the first, the backend
serves them from its exact ready-result cache and the geometry reuse above
applies. Every other stop is too fast: the slowest, ±12 h/s, crosses about
1,500 steps per poll. A paused clock, or one at 0 d/s, already repeats its
exact epoch. Tabs or clients whose clocks fall inside the same step can also
share the backend's cache. The drawn state trails the clock by under 0.01 d
(14.4 simulated minutes, about 0.14° of solar rotation). An epoch already on the grid, such as 00:00 UTC,
is requested unchanged. The backend still answers other callers at exactly the
epoch they request.

HTTP gzip is negotiated through `Accept-Encoding`; no custom browser header or
CORS preflight is needed. The server caps a render response at **512 KiB encoded**
and **2 MiB decoded**. Without gzip the same encoded cap applies to plain JSON.
A state above either cap returns structured HTTP 413
`solar_delivery_budget_exceeded`, preserving the last accepted state in the
client. There is no silent truncation or mixed-epoch geometry. The browser also
bounds its decompressed response stream at 2 MiB. Render responses carry an
`X-Solar-Delivery: render-v1` header, exposed through CORS; when it is present
and `Content-Length` exceeds 512 KiB the browser rejects before reading any body,
and otherwise checks the supplied `Content-Length` after parsing. Old complete
responses (no header) are accepted up to the decoded cap.

At the default cadence this bounds two successful response bodies per minute at
**1 MiB encoded**, excluding HTTP/TLS overhead, realtime observations and explicit
forced refreshes. Because every playing poll carries complete geometry, this is
the bound that applies during playback. Same-epoch polls with reuse (a paused
simulation) have a separate **16 KiB acceptance budget** in the native HTTP
test; it is not a playback figure. This is a delivery bound, not a provider
latency or compute-speed promise: geometry is still computed and authenticated
through the existing request-owned worker before hashing. A future computation
cache would need its own cancellation and freshness proof.

Keeping the client's last accepted response does not keep it on screen indefinitely.
The renderer clears its backend state when the absolute simulation/snapshot epoch
separation exceeds `max(30, abs(rateDaysPerSec) * replacementGapSec)` days. The rate is
the last running one: pausing, or setting 0 d/s, keeps it. The replacement gap is the
longest a running clock waits for its next snapshot through one failed poll, 104 s with
the defaults. The state is also cleared after five consecutive refresh failures, or
after five minutes spent retrying. That counts the failed attempts and the waits between
them, each wait only up to the retry the client scheduled, so time in a hidden tab does
not count. Arrivals beyond the separation limit are not drawn.
The Sun chip labels separation above one day as "time-lapse: state lags N d";
after clearing, procedural fallback identifies the removed state's date unless
the model-range notice takes precedence. A usable new snapshot restores backend state.

Observed forcing remains disabled until separately validated. The qualified
single-epoch GONG/WSA corpus, raw AIA tile spatial rejection and provider-cache
contracts are unaffected by wire reuse. A compact response cannot promote an
observed geometry frame or make synthetic geometry observationally calibrated.
