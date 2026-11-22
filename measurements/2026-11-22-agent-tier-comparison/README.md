# Which Claude tier runs the route-planning agent (epic issue C12)

**Question.** The planner agent (`backend/planner/agent`) has no default model; `PLANNER_AGENT_MODEL` picks one. Which is the cheapest Claude tier that answers the spec's 13 acceptance prompts correctly, inside the 30-second prompt limit, and what does each tier cost per prompt?

**Status, 2026-11-22.** Preregistered (`prereg.md`, all sections and diagnostics pass `gstack-eval-plan prereg --check`), blinding checked, zero-cost dry run done. The priced pilot waits for an Anthropic credential and the owner's approval of its spend; see "Before the pilot".

## What runs

- `prompts.jsonl`: the 13 prompts of spec section 9: the eight trips of check 1, the two plans of check 8 and the three app prompts of check 9, each with the canonical request a correct agent would send.
- `run_tiers.py run`: each prompt through `run_agent` on each arm, three runs, arms alternating run by run, on one fixed `today`. A provider error retries the run once after 30 s, then counts as `provider_error`.
- The checks (`prereg.md`, Scoring) are rules over the reply and a direct planner call on the canonical request: the right trip, its dates, flight time and delta-v, the launch window named, the number check passed, delta-v within 5% (Sun trips) or 10% (moon and named-orbit trips), plans scheduled with their tie respected, and the three app actions.
- `run_tiers.py score`: per arm, run pass rate, prompts passing in 2 of 3 runs, p95 seconds, measured cost per prompt, and every failed check.
- `run_tiers.py decoys`: six edited replies the scorer must reject. `run_tiers.py blinding`: nothing the model sees carries an eval word. `run_tiers.py summarize`: the diagnostic counts.

## Run

From any directory, in the measured checkout's pinned test environment (`$CHECKOUT` is the checkout of the code under test, `$HERE` this folder):

```bash
uv run --offline --python 3.12.13 --with-requirements "$CHECKOUT/ci/backend-test-requirements.txt" \
  python "$HERE/run_tiers.py" run --checkout "$CHECKOUT" --stub \
  --arms claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5,claude-fable-5-2 --runs 1 --today 2026-11-23 --out "$HERE/out/stub"
uv run ... python "$HERE/run_tiers.py" decoys --checkout "$CHECKOUT" --out "$HERE/out/stub"
uv run ... python "$HERE/run_tiers.py" score "$HERE/out/stub/records.jsonl"
```

Drop `--stub` for a priced run; it needs `ANTHROPIC_API_KEY` or an `ant auth login` profile. Raw output of each run stays in its `out/<name>/` folder (`context.json` records the commit, date and Python version).

## Before the pilot

1. A credential for the Anthropic API on this machine.
2. `claude-fable-5-2` added to gstack's `lib/pricing.ts` ($8 / $40 per MTok, cache reads $0.20), or that arm dropped: without the row the spend ledger cannot admit it.
3. The owner's approval of the pilot: three prompts per arm, estimated at $0.95 for all four arms, capped at $3 (`prereg.md`, Stop rules).

## Findings

**Zero-cost dry run, 2026-11-22** (`out/stub-2026-11-22/`, checkout `fix/planner-agent-followups` at `7df4c99`, `today` 2026-11-23, load average 1.1):
- The stub model, which calls the tools a correct agent would and quotes their results, passed all 52 runs: 13 prompts on four arms.
- The pipeline therefore works end to end on the real planner: canonical searches, the agent loop, the scorer and the records. The slowest 5% of runs took 5.6 s or less, all of it planner time.
- `run_tiers.py decoys` rejected all six decoys, each on the check it was built to break.
- `gstack-eval-plan dry-run` passed for the Haiku, Sonnet and Opus arms (`out/eval-plan-dry-run/dry-run.json`). It checked the price rows, the 16,000-token output budget, the retry text, a reservation under the $20 cap, and the tier question. With the Fable arm it fails only on its missing price row.
- Preparing the run found that the agent capped each reply at 8,000 tokens, below the 8,192 floor, although thinking is always on. It is fixed in PR #117 (`7df4c99`, 16,000 tokens), so the comparison measures the fixed agent.

Model behaviour is not measured yet: that is the priced pilot.
