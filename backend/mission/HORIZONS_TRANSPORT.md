# Horizons transport ownership

SCN-063 uses owned, terminable subprocess I/O, implemented in `e6a02d9` with
`sim.solar_http_transport.DeadlineHttpResponse`. There is no recorded owner
acceptance of permanent remote-capacity loss and no such acceptance is implied.

The process admits at most one Horizons transport owner at a time. Each HTTP
exchange runs in an isolated child with DNS, header and body I/O under the same
absolute deadline. The original maximum is 2.5 seconds, shortened by the active
planning deadline. Planning cancellation can return the caller earlier; it is
not proof that transport cleanup has completed.

The owner retains its semaphore permit while the child survives. Deadline expiry
closes the response and kills/reaps the child, closes its pipes, and only then
allows the owner's `finally` block to release the permit. Cleanup has its own
bounded kill/reap allowance, so 2.5 seconds is the acquisition budget, not a claim
that process creation and cleanup add zero wall time. Safety never depends on
releasing a permit while abandoned work remains alive. Local Kepler planning does
not use this permit. Python threads are not claimed to be forcibly cancellable.

SCN-073: automatic redirects are disabled. The owner follows at most three
redirects, classifies redirect statuses explicitly, and validates every hop against HTTPS,
`ssd.jpl.nasa.gov`, port 443 (or omitted), and rejects credentials/fragments.
Relative same-host redirects are allowed. Every hop consumes an external-request
budget unit and shares the same absolute deadline and worker permit. Redirect
loops, cross-host hops, and HTTPS downgrades fail with a typed protocol error.

Reads loop over the transport's 64 KiB chunks with a 2 MiB total response cap;
a short chunk is not assumed to be the complete body.

Tests: `test_ephemeris_service_safety.py` (stalled read, owner cancellation,
single-flight and global serialization), `test_horizons_redirect_contract.py`
(actual urllib redirect handler, forbidden hops, relative hops, loop and budget).
See `agent-notes/REMEDIATION_HORIZONS_TRANSPORT_2026-10-14.md` for actual blocked
DNS/header/body child kill/reap, cancellation, retained-permit and subsequent
capacity-recovery evidence. No external JPL availability or deployment SLA is
inferred from controlled subprocess tests.
