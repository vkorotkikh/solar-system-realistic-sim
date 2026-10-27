# Remediation verification checkpoint: 4728428

All work remains on remediation/canonical-register-20261014 and isolated
agent worktrees. No remote push, PR or main merge occurred. Canonical landing
states are intentionally unchanged; construction passes are not main closure.

## Executed parent checks

| Revision/scope | Result | Retained log |
| --- | --- | --- |
| ec4e0bb: all backend/tests, ci and scripts/test_*.py, with SpiceyPy | 3224 passed, 12 skipped, 2 dependency deprecations; 142.81 s | /tmp/solar-full-backend-ec4e0bb-20261014.log |
| ec4e0bb: all configured frontend tests, PLANET_SHADER_GPU_TEST=1 | 683 passed, 413 skipped | /tmp/solar-full-frontend-ec4e0bb-20261014.log |
| ec4e0bb: real native Tudat test modules | 17 passed, zero skips | /tmp/solar-native-tudat-ec4e0bb-20261014.log |
| Integrated streaming PFSS/WSA/finite/independent-degree scope | 1200 passed, zero skips; 16.11 s | /tmp/solar-streaming-pfss-integrated-20261014.log |
| Native moon clean-checkout/source/oracle/catalog scope | 469 passed, zero skips; 9.14 s | /tmp/solar-moon-clean-checkout-integrated-20261014.log |
| Integrated controller/frame review | 114 passed, zero skips | /tmp/solar-frame-review-integrated-20261014.log |
| 4728428: latest AIA/cache/time precision evidence | 330 passed, zero skips, 2 dependency deprecations | /tmp/solar-aia-time-integrated-4728428-20261014.log |
| 4728428: full frontend with opt-in GPU tests | 690 passed, 413 skipped | /tmp/solar-frontend-4728428-20261014.log |
| 4728428: strict TypeScript | Exit 0, no diagnostics | /tmp/solar-types-4728428-20261014.log |
| Earlier a51bebc main handoff build | Exit 0; 969.15 kB main chunk warning retained | /tmp/solar-main-handoff-build-20261014.log |

The 413 frontend skips are unpromoted moon-candidate records, not accurate
production moons. Native Tudat evidence is reported separately; these counts
are overlapping scopes and must not be added as distinct test coverage. The
full backend run predates the latest AIA cache patch, which has its own fresh
330-case integration gate. The build is explicitly an earlier revision.

## Newly integrated fixes and evidence

- 59ea160: native moon generation no longer requires or creates an implicit
  candidate cache; Daphnis evaluation uses an OS temporary directory.
- a4cdb60: actual RTX 5090 asteroid residual/packing/legacy gates passed all
  189/175/125 cases at unchanged tolerances.
- 55067da: decorative interpolation uses the capped decorative clock;
  same-epoch PFSS snapshots replace old geometry; contradictory admission
  metadata fails closed.
- b123b7f: bounded degree-90 streaming evaluation and batched tracing.
- ec4e0bb: two fresh NASA held-out map/line pairs with original GET headers and
  byte identity against the earlier captures. Accuracy checks remain pending.
- 64cc9d4: AIA cached deliveries revalidate every channel's request coverage
  and recalculate freshness without confusing historical coverage with live age.
- 8b9b6b3: executable evidence of scalar-JD leap-boundary ambiguity, not a fix.
- 8f45e26: real zero-alpha coronal blending retains the source endpoint.
- 7681a0c: WebKit panel breakpoint race repair; agent reports 87 headless
  cross-browser passes. A final integrated matrix is still required.
- 4728428: startup profiling attributes catalog delay to blocking shader
  initialization, not the 83-123 ms full-count loader. Main startup work continues.

## Preserved failed parent harness

The initial actual-main solar hardware run is retained at
/tmp/solar-main-frame-55067da-20261014 and its adjacent .log file. It confirmed
RTX 5090, no page errors and all 235 surface-orientation probes, but the marker
footprints failed. The new harness wrongly used the physical-scale 1.03-radius
reference without accounting for the existing owner D3 display-height factor
0.15 around the enlarged Sun. That maps the test input to 1.0045 display radii.
This is a harness expectation mismatch, not an asserted production geometry bug.

The user was explicitly asked whether to correct the harness while preserving
the independent reference and 1-pixel tolerance. No correction has been made
without that answer. scripts/verify_solar_main_frame.py remains uncommitted.
The initial harness copy is retained alongside the failed run.

## Owner decisions and active work

The time-policy question is pending: reject ambiguous scalar-JD rounding bins
and provide a two-part-JD path, or explicitly document a rounding policy that
can remap a genuine leap-second instant. A scalar cannot recover discarded
identity; passing evidence tests do not make this runtime issue resolved.

Agents continue cold full-response PFSS acceptance and held-out accuracy,
remaining moon source/model cases and bounded promotion, startup scheduling,
independent streaming/lifecycle reviews, and final delivery/browser acceptance.
Owner licensing/deployment inputs and genuine assistive-technology/physical
device evidence remain separate unresolved requirements.
