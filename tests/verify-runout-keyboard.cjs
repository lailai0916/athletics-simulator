'use strict';
// Run the registered document shortcut against the real race clock, runners and
// controls. The shared harness replaces only static paint and glyph measurement.
const assert = require('node:assert/strict'),
  harness = require('./helpers/app-harness.cjs');
let checks = 0;
function seek(h, from, key, expected, playing = false) {
  const s = h.api.state,
    timeline = h.nodes.get('timeline');
  s.distance = from;
  s.phase = from ? 'run' : 'marks';
  h.api.update();
  if (playing) h.api.togglePlay();
  const before = h.box();
  h.focus(null);
  const event = h.documentDispatch('keydown', { key, code: key });
  assert.equal(event.defaultPrevented, true, 'shortcut prevents page scrolling');
  assert.equal(s.distance, expected, `${s.event.id}: ${key} from ${from}`);
  assert.equal(s.playing, false, 'seeking pauses the shared race clock');
  assert.equal(s.phase, expected ? 'run' : 'marks', 'phase matches the sought position');
  assert.equal(
    Number(timeline.value),
    Math.min(expected, s.event.distance),
    'slider reflects nominal race progress'
  );
  assert.deepEqual(h.box(), before, 'keyboard seek preserves a manual camera');
  h.flush(1000);
  h.flush(1100);
  assert.equal(s.distance, expected, 'a cancelled playback frame cannot advance the seek');
  checks += 7;
}
const h = harness();
for (const { id } of h.events)
  for (const grouped of ['5000', '10000'].includes(id) ? [false, true] : [false]) {
    h.api.changeEvent(id);
    if (grouped) h.nodes.get('group-start').dispatch('click');
    h.api.state.view = 'manual';
    h.api.setBox([23, 41, 64, 36]);
    const nominal = h.api.state.event.distance,
      step = nominal / 100,
      finish = h.api.allFinishDistance(),
      tailStart = Math.max(nominal, finish),
      end = h.api.raceEndDistance();
    for (const from of [0, nominal * 0.35, nominal - step / 2, nominal]) {
      seek(h, from, 'ArrowRight', Math.min(nominal, from + step), from < end);
      seek(h, from, 'ArrowLeft', Math.max(0, from - step), from < end);
    }
    // Cover nominal 100%, trailing finishers, and the start, middle and end of
    // the eased run-out. A forward key must never send athletes backwards.
    for (const from of [
      nominal + 0.000001,
      tailStart,
      (tailStart + end) / 2,
      end - 0.000001,
      end,
    ]) {
      seek(h, from, 'ArrowRight', from, from < end);
      seek(h, from, 'ArrowLeft', nominal - step, from < end);
    }
    // Repeated keys remain bounded and use the visible slider as their origin.
    seek(h, end, 'ArrowLeft', nominal - step);
    seek(h, nominal - step, 'ArrowLeft', nominal - step - step);
    seek(h, nominal - step / 2, 'ArrowRight', nominal);
    seek(h, nominal, 'ArrowRight', nominal);
  }
console.log(`${checks} keyboard progress and run-out checks passed.`);
