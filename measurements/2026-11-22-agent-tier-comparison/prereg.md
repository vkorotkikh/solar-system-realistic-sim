# Which Claude tier runs the route-planning agent

Epic issue C12 (records/specs/2026-11-12-planner-rework-agent-epic-draft.md, section 8 row C12 and section 9 checks 1-5, 8 and 9). The agent under test is `backend/planner/agent` (`run_agent` with `provider_anthropic.call_model`) from a checkout of the code being measured; the runner is `run_tiers.py` in this folder.

## Bars
lesson: the cheapest Claude tier that answers the planner's 13 acceptance prompts correctly inside the 30-second prompt limit, and what each tier costs per prompt
- run_pass_rate: share of the 39 runs (13 prompts x 3) in which every check of that prompt passes; pass at >= 0.90; higher is better
- prompt_coverage: prompts that pass in at least 2 of their 3 runs; pass at 13 of 13; higher is better
- p95_seconds: 95th-percentile wall time of one prompt (`usage.seconds`); pass at <= 30; lower is better
- cost_per_prompt: measured from each run's token usage and the price table; pass at <= $0.25; lower is better

## Decisions
- if one or more tiers meet every bar: set PLANNER_AGENT_MODEL to the cheapest of them and record it, with its measured cost per prompt and pass rate, in the README's agent settings
- if Haiku 5.5 meets every bar: use Haiku 5.5, and keep the other tiers' rows only as the record
- if only Fable 5.2 meets every bar: fix the checks Opus 5.5 failed (system prompt or tool descriptions) and rerun the pilot on Opus 5.5 before choosing Fable
- if no tier meets every bar: set no model; fix the agent for the most-failed checks and rerun the pilot before any full run

## Arms
Every arm: the same code at the measured commit (fixed system prompt, seven strict tools, JSON answer schema, effort low, adaptive thinking as each model defaults, max_tokens 16,000, server-side fallbacks "default", 30 s per prompt), the same 13 prompts on the same fixed `today`, three runs each. Per-item cost from `gstack-eval-plan arms` at 15,000 input and 1,500 output tokens per prompt (the spec's estimate; C12 replaces it with measured figures).
- claude-haiku-5-5: $0.0022 per prompt
- claude-sonnet-5-5: $0.0450 per prompt
- claude-opus-5-5: $0.0900 per prompt
- claude-fable-5-2: $0.1800 per prompt at $8 / $40 per MTok (claude-api reference, cached 2026-11-03); its row is missing from gstack's lib/pricing.ts, so this arm waits for that row before the pilot

## Comparison
stack: none
why: each arm is the same application (system prompt, tools, answer schema, loop) calling a different model id through the Anthropic API; no arm loads gstack or any other skill stack, and the model never sees a skill file

## Scoring
judge: none
Every check is a rule over the agent's reply JSON and a direct planner call on the prompt's canonical request:
- trips (8): status ok, the reply shows a trip, its resolved ends and trip type match the canonical request, it has departure and arrival dates, flight time and total delta-v, the text names its departure and arrival dates (check 3), the number check passed or corrected it (check 4), and its total delta-v is within 5% (Sun trips) or 10% (moon and named-orbit trips) of the canonical planner answer (check 2)
- plans (2): the reply shows a plan, every trip in it is scheduled, the second trip leaves no sooner than the gap after the first arrives, and the number check passed or corrected it (check 8)
- app actions (3): "show me Europa" queues focus_on moon-jupiter-europa, or asks which Europa with the moon among its options; "jump to the day we arrive", asked after "Earth to Mars" with that trip sent back as the plan, queues set_date on the shown trip's arrival date; "hide the asteroid belt" queues set_layer asteroid_belt off (check 9)
- every prompt: its wall time counts toward p95_seconds (check 5)
paired: yes (the same prompts, date and code on every arm)
interval: 95%
mdd: 0.25 in run_pass_rate (39 runs per arm, pass rates near 0.85: standard error of a difference about 0.08, so differences under about 25 points are not told apart); the decision uses each tier's bars, not a difference between tiers

## Decoys
Six replies the scorer must fail, made by editing real replies from the stub dry run: a trip to the wrong destination; a trip whose text omits the arrival date; an answer the number check replaced; a plan whose crew leaves before the cargo has arrived plus 60 days; set_date on a day other than the arrival; a run stopped at its limit. They run through the scorer before the pilot and again before the full run. A decoy that passes means the scorer is broken: the run stops.

## Stop rules
- spend cap: $20 for the whole run; $3 for the pilot
- a pilot run whose check results contradict the decoys (any decoy accepted)
- every pilot run of every arm missing run_pass_rate: fix the agent first
- budget_exhausted from the spend ledger
- a provider error (rate limit, overload, unreachable) retries that run once after 30 s; a second failure records the run as provider_error, excluded from the pass rate and reported
- an arm the account cannot use (for example Fable 5.2 under zero data retention) stops for that arm and is reported as unavailable

## Held-out exposure
| set | prior exposure (which runs, which models) | reservation (what this run may read) |
|---|---|---|
| none | the 13 prompts are the spec's own, public in the repository since 2026-11-12 | all 13 are development rows |

## Blinding
fixture root: none. The model has no file access; it sees the fixed system prompt, the seven tool definitions and their results, the app-state line and the user's words. None of them carries an eval word (checked by `run_tiers.py blinding` against the measured checkout). There is no judge.

## Diagnostics
summarizer: python3 measurements/2026-11-22-agent-tier-comparison/run_tiers.py summarize {fixture}
fixture: measurements/2026-11-22-agent-tier-comparison/fixture-records.jsonl
| diagnostic | expected |
|---|---|
| replaced | 1 |
| provider_errors | 1 |
| questions | 1 |
| stopped | 1 |
| decoys_accepted | 1 |
