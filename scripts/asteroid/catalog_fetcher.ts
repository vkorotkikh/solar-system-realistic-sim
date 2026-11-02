#!/usr/bin/env node
// Retired: this acquisition path inferred composition/albedo without observations.
console.error('The legacy asteroid fetcher is retired. Use the maintained pinned-source builder:\n' +
  '  python3 scripts/build_asteroid_phase1_dataset.py --offline --check\n' +
  '  python3 scripts/build_asteroid_phase1_dataset.py --offline --write\n' +
  'See scripts/asteroid/README.md for explicit source refresh and migration.');
process.exitCode = 1;
