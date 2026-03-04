# Asteroid Source Acquisition Scripts (Phase 1)

This folder contains the TS-based catalog ingestion path for Phase 1 deterministic/procedural workflows.

## `catalog_fetcher.ts`

`catalog_fetcher.ts` fetches asteroid source catalogs from:

- JPL SBDB API (`sbdb_query.api`)
- MPCORB (`MPCORB.DAT`)

It applies normalization, schema alignment, deterministic ID assignment, de-duplication, and emits:

- a raw normalized snapshot
- provenance metadata describing fetch jobs, retries, cache state, checksums, and run schedule

## Quick run

```bash
npx tsx scripts/asteroid/catalog_fetcher.ts --dry-run
```

> `tsx` is assumed for direct TS execution in local workflows. If unavailable, run through a preferred TS runtime.

## CLI

| Flag | Description |
|---|---|
| `--source <jpl|mpc|jpl,mpc>` | Comma-separated source set.
| `--jpl-main-limit <n>` | JPL main/bright query row cap (default `4000`). |
| `--jpl-neo-limit <n>` | JPL near-Earth query row cap (default `800`). |
| `--jpl-trojan-limit <n>` | JPL Trojan query row cap (default `400`). |
| `--mpc-limit <n>` | MPC top rows kept after sort/filter (default `1200`). |
| `--mpc-max-h <value|null>` | Max absolute magnitude filter (`null` disables). |
| `--request-interval-ms <ms>` | Minimum interval between outbound requests.
| `--retry-attempts <n>` | Max retry count on transient errors.
| `--retry-timeout-ms <ms>` | Request timeout.
| `--retry-initial-delay-ms <ms>` | Retry initial backoff.
| `--retry-max-delay-ms <ms>` | Retry max backoff.
| `--cache-dir <path>` | Cache directory path (default `scripts/.cache/asteroid-fetcher`). |
| `--cache-ttl-hours <n>` | Cache validity window.
| `--output-dir <path>` | Output directory (`public/data/asteroid-phase2` default). |
| `--raw-output <path>` | Raw snapshot output path override.
| `--meta-output <path>` | Provenance JSON output path override.
| `--interval-minutes <n>` | Delay between cycles. `0` means single run.
| `--max-runs <n>` | Number of schedule cycles to execute.
| `--dry-run` | Parse and compute outputs without writing files.
| `--help` | Print full CLI help and exit.

## Source jobs (scheduler model)

Jobs are deterministic and reported in provenance as schedule entries:

- `jpl-main-belt`: JPL top targets by absolute magnitude
- `jpl-neo`: JPL near-Earth candidates
- `jpl-trojans`: JPL Jupiter Trojan candidates
- `mpc-orb`: MPCORB raw feed normalized and ranked by H

Each job record stores:
- `cadenceMinutes`
- `requestedAt` / `completedAt`
- `query`
- `responseBytes`
- `responseChecksum`
- `cacheHit` and `attempts`

## Normalization output (raw snapshot)

Default output: `public/data/asteroid-phase2/asteroid_raw_snapshot.json`

Top-level shape:

```json
{
  "version": 1,
  "generatedAt": "2026-03-04T...Z",
  "snapshotVersion": "catalog-fetcher-ts-1.0.0",
  "source": "jpl+mpc",
  "records": [
    {
      "id": "jpl:00001",
      "source": "jpl",
      "sourceBodyId": "00001",
      "displayName": "Ceres",
      "fullName": "(1) Ceres",
      "absMag": 3.35,
      "slopeG": 0.15,
      "diameterKm": 939.4,
      "albedo": null,
      "taxonomy": { "inferred": "C", "specB": null, "specT": null },
      "orbitClass": "main-belt",
      "selectionPriority": 1330,
      "orbit": {
        "epochJd": 2458000,
        "epochPacked": null,
        "aAu": 2.7656157,
        "e": 0.0795763,
        "iDeg": 10.58789,
        "ascendingNodeDeg": 80.24963,
        "argPeriapsisDeg": 73.29974,
        "meanAnomalyDeg": 231.53975,
        "periodDays": 1600.0,
        "epochSource": "jpl"
      },
      "raw": { "sourceRecord": {}, "sourceVersion": "JPL SBDB" },
      "sourceMeta": {
        "queryId": "jpl-main",
        "sourceVersion": "JPL SBDB",
        "normalizedAt": "2026-03-04T...Z"
      }
    }
  ],
  "counts": {
    "total": 1,
    "bySource": { "jpl": 1, "mpc": 0 },
    "byOrbitClass": { "main-belt": 1 },
    "byTaxonomy": { "C": 1, "S": 0, "M": 0 }
  },
  "schema": { ... }
}
```

## Provenance metadata output

Default output: `public/data/asteroid-phase2/asteroid_raw_snapshot.provenance.json`

```json
{
  "pipelineVersion": "catalog-fetcher-ts-1.0.0",
  "generatedAt": "2026-03-04T...Z",
  "runTag": "2026-03-04T...-...",
  "source": "jpl+mpc",
  "config": {
    "sources": ["jpl", "mpc"],
    "jplMainLimit": 4000,
    "mpcLimit": 1200,
    "cacheDir": "scripts/.cache/asteroid-fetcher",
    "requestIntervalMs": 1100,
    "intervalMinutes": 0,
    "maxRuns": 1
  },
  "schedule": [
    {
      "id": "jpl-main-belt",
      "source": "jpl",
      "cadenceMinutes": 1440,
      "description": "JPL SBDB top targets",
      "lastRunAt": "2026-03-04T...Z"
    }
  ],
  "sourceRuns": [
    {
      "source": "jpl",
      "taskId": "jpl-main-belt",
      "requestedAt": "2026-03-04T...Z",
      "completedAt": "2026-03-04T...Z",
      "query": "https://ssd-api.jpl.nasa.gov/sbdb_query.api?...",
      "sourceVersion": "sbdb_query.api",
      "cacheHit": false,
      "attempts": 1,
      "rawRows": 4000,
      "normalizedRows": 3921,
      "status": "ok",
      "responseBytes": 123456,
      "responseChecksum": "...sha256..."
    }
  ]
}
```

## Determinism notes for downstream targets

- IDs are stable by source + normalized body identifier.
- Rows are sorted by `selectionPriority` before persistence.
- Duplicate IDs are merged deterministically by higher priority.
- `selectionPriority` is currently source-biased (`jpl` > `mpc`) with magnitude/orbit heuristics for repeatable ranking.
