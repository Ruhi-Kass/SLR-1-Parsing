#!/usr/bin/env node
// CommonJS wrapper: register ts-node then require the TS runner
try {
  require('ts-node').register({ transpileOnly: true, preferTsExts: true });
} catch (e) {
  console.error('ts-node is required to run TypeScript tests. Install with `npm install --save-dev ts-node`');
  process.exit(1);
}

try {
  require('./run_unit_tests.ts');
} catch (e) {
  console.error('Failed to execute run_unit_tests.ts:', e);
  process.exit(1);
}
