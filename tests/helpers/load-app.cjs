'use strict';
const assert = require('node:assert/strict');
const { assembleApp } = require('../../scripts/assemble.cjs');
const BEGIN = '/*__BOOTSTRAP__*/';
const END = '/*__BOOTSTRAP_END__*/';
function replaceBootstrap(source, body = '') {
  const begin = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  assert(begin >= 0 && end > begin, 'application has an explicit bootstrap test seam');
  return source.slice(0, begin) + body + '\n' + source.slice(end + END.length);
}
function loadApp() {
  return assembleApp();
}
loadApp.withBootstrap = (body = '') => replaceBootstrap(assembleApp(), body);
loadApp.replaceBootstrap = replaceBootstrap;
module.exports = loadApp;
