# Independent review record — 2026-11-02

Base main: `4f97dce442cffb46fa9add8fb3a674534dd2333e`.

- SCN-035 initial implementation `ded9392`: independent reviewer reproduced a
  missing minimum-scope guard for the twelve retained local inputs (P2), and a
  contradictory NOTICE sentence (P3). Both were fixed in `49e70d7` with a failing
  omission regression followed by 13 passing distribution tests. Reviewer
  confirmed the fixes and the deliberate nonzero rights-check outcome.
- SCN-005 backend `9adf770`: independent review found no blocking lifecycle issue.
  The bounded wire result, original deadline, polling cancellation, nonzero-exit
  refusal and reap/quarantine ownership remain intact. Completion racing with a
  cancellation is a pre-existing boundary; owner cancellation still yields
  CancelledError and no live child is released from ownership.
- SCN-005 renderer `f72b7c0`: independent source/consumer review found no blocker.
  Three.js r182 includes define names and values in shader-program cache keys and
  copies defines during material cloning. Both body consumers construct per-body
  materials; no caller mutates the retired uniform. All terrain, normal, octave,
  geometry and antialiasing formulas are unchanged; Sun materials are separate.
  Reviewer ran 49 targeted rendering/consumer tests successfully.
- SCN-030 validator: root review found contradictory required-lane status could
  coexist with overall PASS, an unavailable-device contradiction, and malformed
  null-case handling. The implementer reproduced each with failing tests and
  repaired them; final integration evidence records the complete test run.
- SCN-041: root reviewed the independent basis, immutable source hashes, exact-time
  spacecraft/quality filtering and report qualification. No production science
  path or oracle changes are present. The new metrics remain descriptive external
  comparisons; they cannot satisfy application calibration or enable observations.

This record identifies reviewed scopes and findings. Final integration test and
build results are recorded separately; neither review nor tests grant legal
rights or substitute for actual assistive-technology/device observations.

An additional independent reviewer reproduced the three raw ACE pair residuals,
verified all new capture/header hashes and identical-query identity, and confirmed
the SCN-041 report reproduces exactly with no false application-calibration claim.
