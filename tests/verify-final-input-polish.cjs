// Exercise the real registered seek handlers and the real dynamic renderer.
// The reused camera seam replaces only static paint and glyph measurements.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  { createRequire } = require('node:module');
const harness = require('./helpers/app-harness.cjs'),
  results = [];
const { tokenPoint } = require('./helpers/follow-target.cjs');
function check(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, message: error.message });
  }
}
function near(actual, expected, message, tolerance = 1e-8) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((x, i) =>
    assert(Math.abs(x - expected[i]) < tolerance, message + ': ' + actual + ' vs ' + expected)
  );
}
function token(h) {
  const runner = h.api.state.runners[h.api.state.selected];
  return runner.active || runner.athletes.find((n) => n.getAttribute('role') === 'button');
}
function point(h) {
  const p = tokenPoint(h);
  return [p.x, p.y];
}
function selected(event) {
  const h = harness();
  h.api.changeEvent(event);
  h.api.state.distance = 23;
  h.api.selectTeam(2);
  return h;
}
function follow(h, size) {
  assert.equal(h.api.state.view, 'follow', 'seek retains follow mode');
  assert.equal(h.api.state.selected, 2, 'seek retains selected athlete/team');
  assert.equal(
    token(h).getAttribute('aria-pressed'),
    'true',
    'active athlete remains visibly selected'
  );
  const b = h.box();
  near(b.slice(2), size, 'seek preserves current follow zoom');
  near(
    [b[0] + b[2] / 2, b[1] + b[3] / 2],
    point(h),
    'follow camera centres the actual active athlete'
  );
}
function seek(h, d) {
  const slider = h.nodes.get('timeline');
  slider.value = String(d);
  slider.dispatch('input', { target: slider });
}
for (const event of ['100', '5000', '4x400']) {
  check(event + ' timeline input retains follow, zoom and active ownership', () => {
    const h = selected(event),
      size = h.box().slice(2);
    seek(h, event === '4x400' ? 420 : Math.min(47, h.api.state.event.distance));
    follow(h, size);
    h.api.state.distance += 9;
    h.api.update();
    follow(h, size);
  });
  for (const key of ['ArrowLeft', 'ArrowRight'])
    check(event + ' document ' + key + ' seek retains follow and zoom', () => {
      const h = selected(event),
        size = h.box().slice(2),
        before = h.api.state.distance;
      h.focus(null);
      const press = h.documentDispatch('keydown', { key, code: key });
      assert.equal(press.defaultPrevented, true, 'arrow shortcut suppresses scrolling');
      assert.equal(
        h.api.state.distance,
        Math.max(
          0,
          Math.min(
            h.api.state.event.distance,
            before + ((key === 'ArrowRight' ? 1 : -1) * h.api.state.event.distance) / 100
          )
        ),
        'arrow shortcut seeks exactly one percent within race bounds'
      );
      follow(h, size);
      h.api.state.distance += 7;
      h.api.update();
      follow(h, size);
    });
  check(event + ' pending follow wheel zoom survives timeline seek', () => {
    const h = selected(event),
      before = h.box(),
      deltaY = -63;
    h.svg.dispatch('wheel', { clientX: 100, clientY: 600, deltaY });
    const size = before.slice(2).map((v) => v * Math.exp(deltaY * 0.0018));
    seek(h, event === '4x400' ? 420 : 47);
    h.flush();
    follow(h, size);
  });
  check(event + ' drag after seeking pans and clears follow and selection', () => {
    const h = selected(event);
    seek(h, 47);
    const before = h.box(),
      scale = Math.max(before[2] / 1280, before[3] / 720),
      expected = [before[0] - 60 * scale, before[1] - 50 * scale, before[2], before[3]],
      assertCleared = () => {
        assert.equal(h.api.state.view, 'manual', 'camera remains in manual mode');
        assert.equal(h.api.state.selected, -1, 'former follow target is deselected');
        for (const runner of h.api.state.runners)
          for (const node of runner.active ? [runner.active] : runner.athletes) {
            assert.notEqual(node.getAttribute('aria-pressed'), 'true', 'selection ring is cleared');
            assert.notEqual(
              node.getAttribute('data-selected'),
              'true',
              'relay highlight is cleared'
            );
          }
      };
    h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { clientX: 360, clientY: 250 });
    h.svg.dispatch('pointerup');
    h.flush();
    near(h.box(), expected, 'drag pans the followed camera after seek without changing zoom');
    assertCleared();
    h.api.togglePlay();
    h.flush(1000);
    h.flush(1100);
    assert(h.api.state.distance > 47, 'race continues after leaving follow');
    near(h.box(), expected, 'playback cannot restore the cancelled follow');
    assertCleared();
    seek(h, 57);
    near(h.box(), expected, 'later seeking preserves the manually positioned camera');
    assertCleared();
    h.api.state.distance += 5;
    h.api.update();
    near(h.box(), expected, 'later athlete motion cannot restore the cancelled follow');
    assertCleared();
  });
  check(event + ' Space after seek starts and pauses without changing follow', () => {
    const h = selected(event),
      size = h.box().slice(2);
    seek(h, 47);
    h.focus(h.nodes.get('timeline'));
    const start = h.documentDispatch('keydown', { code: 'Space', key: ' ' });
    assert.equal(start.defaultPrevented, true, 'Space suppresses range activation');
    assert.equal(h.api.state.playing, true, 'Space starts playback');
    follow(h, size);
    h.documentDispatch('keydown', { code: 'Space', key: ' ', repeat: true });
    assert.equal(h.api.state.playing, true, 'held Space toggles only once');
    h.documentDispatch('keydown', { code: 'Space', key: ' ' });
    assert.equal(h.api.state.playing, false, 'Space pauses playback');
    follow(h, size);
  });
}
check('manual timeline seek preserves a committed camera', () => {
  const h = harness();
  h.api.changeEvent('100');
  h.api.state.view = 'manual';
  h.api.setBox([61, 33, 12, 6.75]);
  const before = h.box();
  seek(h, 47);
  near(h.box(), before, 'manual seek never changes camera');
  assert.equal(h.api.state.view, 'manual');
  assert.equal(h.api.state.distance, 47);
});
check('manual timeline seek preserves an unpainted zoom target', () => {
  const h = harness();
  h.api.changeEvent('100');
  h.api.state.view = 'manual';
  h.api.setBox([61, 33, 12, 6.75]);
  const box = h.box();
  h.svg.dispatch('wheel', { clientX: 600, clientY: 300, deltaY: -25 });
  const pending = [...h.frames.keys()];
  seek(h, 47);
  assert.equal(h.api.state.view, 'manual');
  h.flush();
  near(
    h.box().slice(2),
    box.slice(2).map((v) => v * Math.exp(-25 * 0.0018)),
    'manual seek retains pending wheel scale'
  );
  assert(pending.length > 0);
});
const report = {
  checks: results.length,
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  results,
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
