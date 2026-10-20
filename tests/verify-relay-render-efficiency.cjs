'use strict';
// Run the product's real DOM renderer. The DOM records every mutation so a
// repeated frame must be both visually identical and free of redundant writes.
const assert = require('node:assert/strict');
const { environment } = require('./helpers/render-harness.cjs');
const env = environment();
let checks = 0;
for (const id of ['4x100', '4x200', '4x400', '4x800', '4x1500', '100', '3000sc']) {
  env.setup(id);
  const state = env.qa.state,
    relay = id.startsWith('4x'),
    total = state.event.distance;
  for (const runner of state.runners) {
    for (const node of relay ? runner.athletes : [runner.active]) {
      const ring = node.querySelector('.selection-ring'),
        body = node.querySelector('.token-body'),
        label = node.querySelector('.point-label');
      for (const coordinate of ['cx', 'cy']) {
        assert.equal(ring.getAttribute(coordinate), '0');
        assert.equal(body.getAttribute(coordinate), '0');
        checks += 2;
      }
      for (const coordinate of ['inkCenterX', 'inkCenterY']) {
        assert.equal(Number(label.dataset[coordinate]), 0, 'glyph ink shares the athlete origin');
        checks++;
      }
      const w = Number(label.dataset.inkWidth),
        h = Number(label.dataset.inkHeight),
        radius = Number(body.getAttribute('r'));
      assert(
        w <= Number(label.dataset.maxInkWidth) + 1e-12 &&
          h <= Number(label.dataset.maxInkHeight) + 1e-12
      );
      assert(Math.hypot(w, h) < 2 * radius);
      checks += 2;
    }
    if (relay)
      runner.athletes.forEach((node, leg) => {
        assert.equal(
          node.querySelector('.point-label').textContent,
          String.fromCharCode(65 + Number(node.dataset.runner)) + String(leg + 1)
        );
        checks++;
      });
  }
  const clocks = new Set([
    0,
    0.001,
    4,
    6,
    8,
    total * 0.1,
    total * 0.25,
    total * 0.5,
    total * 0.75,
    total,
    state.clockFinish,
    state.clockFinish + 12,
  ]);
  if (relay)
    for (const route of state.routes)
      for (let leg = 1; leg <= 3; leg++) {
        const exchange =
          route.measuredMotion.distanceAtParameter((leg * total) / 4) + route.launchSetback;
        for (const offset of [-0.01, 0, 0.01]) clocks.add(exchange + offset);
      }
  for (const clock of clocks)
    for (const selected of [-1, 0, 3]) {
      env.frame(clock, selected);
      const expected = env.snapshot();
      env.resetCounts();
      env.frame(clock, selected);
      assert.deepEqual(env.snapshot(), expected, 'same frame has the same DOM');
      assert.equal(env.counts().writes, 0, 'stationary frames do not mutate the DOM');
      assert(
        env.counts().queries <= 2,
        'cached frames perform only the two shared scene queries, without per-athlete title lookups'
      );
      checks += 3;
      for (const runner of state.runners)
        if (relay)
          for (const [leg, node] of runner.athletes.entries()) {
            const actor = runner.frame.athletes[leg];
            assert.equal(node.getAttribute('display'), actor.visible ? '' : 'none');
            assert.equal(node.getAttribute('role'), actor.holding ? 'button' : 'img');
            assert.equal(
              node.getAttribute('data-selected'),
              String(Number(node.dataset.runner) === selected)
            );
            if (actor.visible)
              assert.equal(node.getAttribute('transform'), `translate(${actor.x} ${actor.y})`);
            checks += 4;
          }
    }
  assert.equal(
    env.document.querySelectorAll('.baton,.relay-baton,.relay-arm,.relay-hand,.relay-gesture')
      .length,
    0,
    'removed hand and baton decorations stay absent'
  );
  checks++;
}
// The old leg keeps its actual DOM node and focus while ownership changes.
env.setup('4x100');
const route = env.qa.state.routes[0],
  handover = route.measuredMotion.distanceAtParameter(100) + route.launchSetback;
env.frame(handover - 0.01, 0);
const focused = env.qa.state.runners[0].athletes[0];
env.document.activeElement = focused;
env.frame(handover + 0.01, 0);
assert.equal(env.document.activeElement, focused);
assert.equal(env.qa.state.runners[0].frame.activeLeg, 2);
checks += 2;
for (const [clock, first, common] of [
  [430, 1, 0],
  [440, 0.5, 0],
  [450, 0, 0],
  [650, 0, 0],
  [660, 0, 0.5],
  [670, 0, 1],
]) {
  env.setup('4x400');
  env.frame(clock);
  for (const [id, expected] of [
    ['first-exchange-zone', first],
    ['common-exchange-zone', common],
  ]) {
    const node = env.document.getElementById(id);
    assert.equal(Number(node.getAttribute('opacity')), expected);
    assert.equal(node.getAttribute('display'), expected > 0 ? '' : 'none');
    checks += 2;
  }
}
console.log(`${checks} renderer geometry, ownership, focus and mutation-cache checks passed.`);
