# SCN-049: stale Kuiper reactivation verification and correction

Worktree: `solar-remediation-20261014-lifecycle-review`.
Starting HEAD: `ef460b558c82dba6809a0f73200e6efa1dade356`.
This is a scoped local integration candidate, not a resolved-in-main claim.

## Finding and actual producer evidence

The defect exists. A frame produced for activation A can remain pending in an
ASGI send while the receiver processes deactivate and activation B. B can
produce its own snapshot before A's pending frame reaches the client. Command
FIFO does not establish an ordering boundary across the outbound transport.
The old client's revocation flag clears on B's activation and admits A's stale
Kuiper positions and metadata into the rendering caches.

The inherited, untracked `backend/tests/test_kuiper_subscription_ordering.py`
was preserved and extended. Its approved harness correction changes
`asyncio.to_thread(runner.stop())` to `asyncio.to_thread(runner.stop)`. This
repairs runner cleanup; it does not repair the production race.

Before production edits, that corrected harness captured native output through
`SimulationRunner._run_frames -> KuiperBeltEngine.get_state`, with commands
passing through `_ws_receive_loop -> send_command -> _handle_command` and
delivery through `_ws_send_loop -> _ws_send_text`. An event barrier held A's
actual serialized send until B had produced. No payload was invented, no frames
were reordered, and no arbitrary sleep decided the race. The real endpoint
handshake was separately captured through `_serve_simulation_websocket`.

The REBOUND/WHFast runner was paused, with 32 base Kuiper particles and RNG seed
20261014. The captured A and B snapshots contain 36 and 38 positions respectively,
including generated companions. The unchanged client failed the new regression
at `expect(client.latestKuiper).toBeNull()`: it had accepted A's positions.
That red run had 1 failed test and 11 tests deselected by the name filter.

Preserved evidence:

- `agent-notes/artifacts/scn049-reactivation/baseline-wire.json`: native capture before the protocol fix.
- `agent-notes/artifacts/scn049-reactivation/baseline-client.txt`: original client failure.
- `src/frontend/app/fixtures/kuiper-subscription-ordering.json`: fresh native capture after the protocol fix, including the actual handshake and both frames.
- `agent-notes/artifacts/scn049-reactivation/targeted-backend.txt`, `targeted-client.txt`, `full-backend.txt`, and `full-client.txt`: exact test output.

## Bounded production correction

The backend advertises `kuiper_subscription_version: 1` in its handshake.
The upgraded client sends a fresh opaque `subscription_id` for each actual
activation send, including replay on a replacement socket. The runner binds
that ID to a successful activation and echoes it as `kuiper_subscription_id`
alongside each associated Kuiper snapshot. Snapshot construction and command
handling remain owned by the same runner thread.

`backend/sim/kuiper_subscription.py` validates optional IDs as 1-64 ASCII
letters, digits, underscores or hyphens. Both WebSocket normalization and direct
runner commands use it. Successful legacy activation clears any previous ID;
deactivation, epoch-driven deactivation, and handled Kuiper activation failure
also clear the ID.

After negotiation, the client updates Kuiper rendering caches only for the
currently expected ID. Missing, malformed, or mismatched IDs cannot repopulate
those caches. The admitted raw `latestState` and ordinary body updates continue
to arrive, and omitted Kuiper frames retain the matching accepted snapshot.
Existing object metadata, AU positions, AU/yr velocities, binary-model labels,
legacy arrays, explicit revocation, socket ownership guards, and hidden-frame
isolation remain intact. Duplicate handshakes cannot downgrade a negotiated
session. No numerical tolerance or producer/transport cadence was changed.

Peers without the new capability retain the existing untagged protocol and
legacy acceptance behavior. This compatibility mode cannot distinguish stale
reactivation frames; the protection requires an upgraded server and client.

## Validation

Python: 3.12.13, using the existing exact `ci/backend-test-requirements.txt`.
Node: 24.21.0. The previous session's `/tmp/solar-remediation-toolchain-20261014`
was absent; this run does not claim validation on the package-declared Node
22.23.2 toolchain.

Commands ran from the assigned worktree:

```sh
PYTHONPATH=backend uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python backend/tests/test_kuiper_subscription_ordering.py > src/frontend/app/fixtures/kuiper-subscription-ordering.json

PYTHONPATH=backend uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest backend/tests/test_kuiper_subscription_ordering.py backend/tests/test_kuiper_velocity_units.py backend/tests/test_kuiper_binary.py backend/tests/test_server_validation.py backend/tests/test_ws_resource_contract.py backend/tests/test_sim_contracts.py -q

node node_modules/vitest/vitest.mjs run src/frontend/app/simulationClient.subscription.test.ts src/frontend/app/simulationClient.test.ts src/frontend/app/simulationClient.kuiper.test.ts src/frontend/app/simulationClient.lifecycleReview.test.ts src/frontend/app/frameLifecycle.test.ts src/frontend/app/frameLifecycle.ownershipReview.test.ts

PYTHONPATH=backend uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt python -m pytest backend/tests -q
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --project tsconfig.json --strict --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.ui-tests.json --noEmit
git diff --check
```

Results:

- Targeted backend: **91 passed, 2 warnings**, 7.77 seconds. Includes 17 new native producer and subscription boundary cases.
- Targeted frontend: **69 passed**, six files, zero skips. Includes all 12 new subscription regressions against the fresh native capture.
- Full backend: **3,173 passed, 13 skipped, 2 warnings**, 145.34 seconds.
- Full configured Vitest: **708 passed, 415 skipped**, 68 files passed and one skipped, 1.94 seconds.
- Strict production TypeScript: **exit 0**.
- Strict UI-test TypeScript: **exit 0**.
- Whitespace check: **exit 0** before report staging.

The two backend warnings concern Starlette's deprecated httpx TestClient path
and the deprecated anyio BlockingPortal alias. No failure was suppressed and
no new skip was introduced. Skipped tests are not passing evidence.

The new tests also cover tagged/legacy activation transitions, invalid command
IDs without replacing native state, stale null clearing, duplicate-handshake
downgrade, reconnect replay identities, metadata retention, and body-state
admission independently of Kuiper cache admission.

## Integration and remaining limits

Only the protocol implementation, inherited capture harness, dedicated client
regressions, generated capture/evidence, and this report belong to this change.
The parent ownership/hidden-frame fixes were not redone. No global master
tracker, unrelated worktree, remote branch, or main integration was changed.

The proof uses the native producer and production WebSocket helpers with an
in-memory transport barrier, then the real client with a socket test double.
It establishes the contract defect and its correction; it does not claim a
live-browser or deployed-network incident reproduction. Legacy peers retain
their documented ambiguity. Numerical policy and scientific-model remediation
outside this subscription boundary remain outside this task.
