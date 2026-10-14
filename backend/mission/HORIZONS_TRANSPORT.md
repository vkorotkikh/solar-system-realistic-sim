# Horizons transport ownership

SCN-063 decision: accept bounded loss of remote capacity when a transport stalls.

The process owns at most one active Horizons transport worker. The absolute
request deadline and cancellation stop the caller's wait. A live worker retains
the sole semaphore permit until its actual `finally` block exits, including when
a peer drips bytes frequently enough to avoid socket timeouts. Further callers
time out waiting for capacity; they cannot create additional abandoned reads.
Local Kepler planning remains available because it does not use that permit.

A permanently blocked read can remove remote capacity for the process lifetime.
Recovery is transport completion or process restart, never early semaphore release.
Terminable subprocess/socket transport ownership is a future availability option,
not a prerequisite for this explicitly accepted bounded contract. Python threads
are not claimed to be forcibly cancellable.

SCN-073: automatic redirects are disabled. The owner follows at most three
redirects, validates the initial URL and every hop against HTTPS,
`ssd.jpl.nasa.gov`, port 443 (or omitted), and rejects credentials/fragments.
Relative same-host redirects are allowed. Every hop consumes an external-request
budget unit and shares the same absolute deadline and worker permit. Redirect
loops, cross-host hops, and HTTPS downgrades fail with a typed protocol error.

Tests: `test_ephemeris_service_safety.py` (stalled read, owner cancellation,
single-flight and global serialization), `test_horizons_redirect_contract.py`
(actual urllib redirect handler, forbidden hops, relative hops, loop and budget).
