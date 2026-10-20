'use strict';
// Isolate each VM-based suite in a child process. Run from any working directory.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const suites = fs
  .readdirSync(__dirname)
  .filter((name) => /^verify-.*\.cjs$/.test(name))
  .sort();
let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 || result.error) {
    failed++;
    process.stderr.write(
      `FAIL ${suite}\n${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}\n`
    );
  } else process.stdout.write(`PASS ${suite}\n`);
}
process.stdout.write(`${suites.length - failed}/${suites.length} regression suites passed.\n`);
process.exitCode = failed ? 1 : 0;
