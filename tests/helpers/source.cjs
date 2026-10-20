'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sourceDirectory = path.resolve(__dirname, '../../src');
function readSource(name) {
  return fs.readFileSync(path.join(sourceDirectory, name), 'utf8');
}
module.exports = { sourceDirectory, readSource };
