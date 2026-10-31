# Asteroid catalog maintenance

The former TypeScript acquisition command is retired. Its composition assignments
from orbital radius, ambiguous spectral labels and synthetic albedos were not
observations. Invoking `catalog_fetcher.ts` now fails before acquisition or writes
and prints the supported replacement. The unused `asteroidTaxonomyResolver.ts`
module has been removed; it had no runtime importers.

Use the maintained Python pipeline with committed, hash-checked provider inputs:

```sh
python3 scripts/build_asteroid_phase1_dataset.py --offline --check
python3 scripts/build_asteroid_phase1_dataset.py --offline --dry-run
python3 scripts/build_asteroid_phase1_dataset.py --offline --write
```

The default command previews without publishing. `--write` atomically publishes
binary, metadata and the sample as one directory generation. `--output-dir` can
select an external destination. Source acquisition is an explicit, separate
maintenance operation: inspect `python3 scripts/capture_catalog_sources.py --help`
and review the updated pinned responses and manifest before rebuilding.

The supported catalog is a largest-first prefix of diameter-bearing main-belt
asteroids, rather than a representative population. Missing taxonomy stays unknown
at every orbital radius. Ambiguous X/E/O types do not imply metallic composition;
only unambiguous Tholen M maps to M. Albedo is the observed source value or unknown.
No fallback generates a physical measurement. Coarse C/S/M visual families support
illustrative rendering and do not establish material composition.

Old normalized Phase 2 snapshots are unsupported inputs to the maintained builder.
Migrate consumers to the ACBF loader and its source metadata rather than translating
legacy `taxonomy.inferred` fields into measured properties. The current ACBF v2
bundle preserves source doubles; v1/ASPH reading remains available for historical
artifacts. See `src/data/asteroidCatalogBinaryFormat.md` for the native layouts.
