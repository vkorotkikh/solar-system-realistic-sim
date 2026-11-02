#!/usr/bin/env node
import { runBrowserDiagnostic } from './scripts/run-browser-diagnostic.mjs';

process.exitCode = await runBrowserDiagnostic('debug');
