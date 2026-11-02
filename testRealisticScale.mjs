#!/usr/bin/env node
// Retired scratch entrypoint: maintained Playwright tests own browser startup,
// failures and portable artifacts under test-results/.
const help = 'Retired scratch script. Run: npm run test:browser -- --project=chromium tests/browser/app-smoke.spec.ts';
if (process.argv.includes('--help')) console.log(help);
else { console.error(help); process.exitCode = 2; }
