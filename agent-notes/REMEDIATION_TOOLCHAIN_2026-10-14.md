# Strict typing and dependency remediation, 2026-10-14

## SCN-025: zero strict diagnostics

The integrated effort branch now passes `npm run typecheck`, which executes
`tsc --project tsconfig.json --strict --noEmit`. This combines controller-owned
rendering/local-planner contracts, the event agent's SMBH contracts, and the
accessibility agent's typed composition. `tsconfig.json` was not relaxed, no
production file was excluded, and the old diagnostic budget was not enlarged.

The science workflow now runs that zero-error gate in addition to its existing
historical ratchet. The ratchet alone is no longer the acceptance criterion.

## SCN-028: dependency advisories

- Baseline audit: 11 affected packages, including two critical and six high.
- Vite upgraded to the patched 7.3.7 line; Vitest upgraded to 5.0.4, which
  supports the repository's Node 22.23.2 and Vite 7 runtime.
- Two attempts to install Vitest 4.1.11 with npm 10.9.8 hit Arborist's
  `Cannot read properties of null (reading 'edgesOut')` while resolving optional
  peer sets, including after a clean locked install. No `--force`,
  `--legacy-peer-deps`, engine relaxation, or audit suppression was used.
- Vitest 5.0.4 resolved normally with the pinned npm. Compatible transitive
  patches were then applied using `npm audit fix --ignore-scripts`.
- Final audit at this checkpoint: **zero reported vulnerabilities** across
  all severities. This is the registry's current advisory assessment, not proof
  that no unknown vulnerability exists.
- The added exact Playwright 1.64.0 and Node type dependencies from the UI
  branch were retained. No new production dependency was introduced.

All installation and project validation commands used Node 22.23.2 and npm
10.9.8 from `/tmp/solar-remediation-toolchain-20261014`, rather than the host's
default Node 24/npm 11.

## Checkpoint validation

`npm run typecheck` passed with zero diagnostics. `npm test` on Vitest 5.0.4
passed **520 tests**, with the two explicitly opt-in EGL shader tests skipped
in that default invocation. Those skips are not labeled passes; independent
physical-GPU shader and planetary screen checks are documented separately in
`REMEDIATION_HARDWARE_2026-10-14.md`. Clean-lock installation, build and the
combined optional-runtime/full-backend gates are recorded in subsequent
integration evidence, not presumed from this checkpoint.

The master register should retain `FIX_AVAILABLE_UNMERGED` until this effort
lands in `main`, even though the local scoped gates pass.
