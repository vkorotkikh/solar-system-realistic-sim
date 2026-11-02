# Contributing

Read [LICENSE](LICENSE), [NOTICE](NOTICE.md) and the
[distribution policy](docs/distribution-policy.md) before sharing this project.
The owner's permission requirement remains in effect.

Use Node 22.23.2, npm 10.9.8 and Python 3.12.13 (see the version files and
`ci/backend-test-requirements.txt`). Backend process isolation is supported on
Linux, including WSL2; see [platform support](docs/backend-platform-support.md).

```sh
npm ci
npm run typecheck
npm run typecheck:scripts
npm run test:types:ui
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
uv run --python 3.12.13 --with-requirements ci/backend-test-requirements.txt \
  python -m pytest backend/tests
```

For browser-only changes, use a targeted Playwright project and test while
developing, then run the configured matrix before landing. Hardware GPU
acceptance is separately identified; software rendering does not certify a
physical GPU. Optional native-engine skips must be reported explicitly.

Fix one finding in an atomic commit, including a meaningful failing regression
test before the repair. Preserve exact physical units, time scales, source
identities, finite-value checks and scientific acceptance limits. Never turn an
inconclusive calculation into a passing physical result. Refresh generated data
from pinned inputs offline before proposing an upstream update.

Keep new state/resource ownership consistent with
[ADR 0006](docs/adr/0006-runtime-composition-and-retained-apis.md). Update README
when shipped behavior changes. Retained APIs require their own contract tests;
a retained module is not a shipped UI feature. Document commands, results,
material limitations and independent review in the PR. Preserve uncommitted
work belonging to other contributors, and resolve competing changes explicitly.
