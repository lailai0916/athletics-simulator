'use strict';
const assert = require('node:assert/strict');

// Inspect the painted token, independently of the camera and logical baton model.
function visibleToken(h, index = h.api.state.selected) {
  const runner = h.api.state.runners[index];
  const node = runner.active || runner.athletes.find((n) => n.getAttribute('role') === 'button');
  assert(node, 'selected athlete has an interactive token');
  assert.notEqual(node.getAttribute('display'), 'none', 'follow target is visible');
  return node;
}
function tokenPoint(h, index = h.api.state.selected) {
  const node = visibleToken(h, index),
    match = node.getAttribute('transform').match(/^translate\(([-\d.e+]+)\s+([-\d.e+]+)\)$/),
    body = node.querySelector('.token-body');
  assert(match, 'painted token exposes its world translation');
  assert(body, 'painted token has a circular body');
  return {
    x: Number(match[1]) + Number(body.getAttribute('cx')),
    y: Number(match[2]) + Number(body.getAttribute('cy')),
  };
}
module.exports = { visibleToken, tokenPoint };
