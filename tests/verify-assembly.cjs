'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { assembleApp, assemblePage } = require('../scripts/assemble.cjs');
const loadApp = require('./helpers/load-app.cjs');
const { readSource } = require('./helpers/source.cjs');
const application = assembleApp();
const page = assemblePage();
assert.equal(assembleApp(), application, 'application assembly is deterministic');
assert.equal(assemblePage(), page, 'page assembly is deterministic');
assert(
  !/\/\*__(?!(?:BOOTSTRAP|BOOTSTRAP_END|TRACE_SEGMENTS)__)[A-Z_]+__\*\//.test(page),
  'every product fragment resolves'
);
assert(/<!doctype html>/i.test(page));
assert(
  page.includes('MIT License\n\nCopyright (c) 2026 lailai'),
  'the standalone artifact carries its code license'
);
assert(/<style[\s>]/i.test(page));
assert(!/<script\b[^>]*\bsrc\s*=/i.test(page), 'runtime scripts are bundled into the page');
assert(
  !/<link\b[^>]*\brel=["']stylesheet["']/i.test(page),
  'runtime styles are bundled into the page'
);
const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 2, 'the standalone page has one catalog and one application script');
for (const [index, script] of scripts.entries())
  new vm.Script(script[1], { filename: `inline-script-${index}.js` });
new vm.Script(readSource('track-data.js') + '\n' + application, {
  filename: 'assembled-application.js',
});
const initialized = loadApp.withBootstrap('window.bootstrapSeamExecuted = true;');
const context = vm.createContext({ window: {}, document: { getElementById: () => ({}) } });
vm.runInContext(readSource('track-data.js') + '\n' + initialized, context);
assert.equal(
  context.window.bootstrapSeamExecuted,
  true,
  'test seam does not require native initialization'
);
assert.equal(
  context.window.TrackApp.events.length,
  21,
  'the assembled public catalog contains every supported event'
);
console.log(
  'Deterministic assembly, licensed standalone runtime and bootstrap seam checks passed.'
);
