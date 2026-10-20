// Registered SVG/document input handlers run against the real camera and runners.
// Only the existing camera harness's static paint/label seams are reused.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  { createRequire } = require('node:module');
const harness = require('./helpers/app-harness.cjs');
let checks = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    checks++;
    console.log('PASS ' + name);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
function near(actual, expected, message, tolerance = 1e-8) {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((x, i) =>
    assert(Math.abs(x - expected[i]) < tolerance, message + ': ' + actual + ' vs ' + expected)
  );
}
function selected(h, event = '4x400', index = 2) {
  h.api.changeEvent(event);
  h.api.state.distance = 53;
  h.api.selectTeam(index);
  return h;
}
function token(h, index = h.api.state.selected) {
  const runner = h.api.state.runners[index];
  return runner.active || runner.athletes.find((n) => n.getAttribute('role') === 'button');
}
function runnerPoint(h) {
  const runner = h.api.state.runners[h.api.state.selected];
  if (runner.frame) return [runner.frame.baton.x, runner.frame.baton.y];
  const m = token(h)
    .getAttribute('transform')
    .match(/translate\(([-\d.e+]+)\s+([-\d.e+]+)\)/);
  return [Number(m[1]), Number(m[2])];
}
function assertFollow(h, index = 2) {
  assert.equal(h.api.state.view, 'follow', 'follow mode remains active');
  assert.equal(h.api.state.selected, index, 'same athlete remains selected');
  assert.equal(
    token(h, index).getAttribute('aria-pressed'),
    'true',
    'active athlete keeps its selected state'
  );
  const b = h.box();
  near([b[0] + b[2] / 2, b[1] + b[3] / 2], runnerPoint(h), 'camera is centred on selected athlete');
}
function key(h, active, code, key = code, extra = {}) {
  h.focus(active);
  const event = h.svg.dispatch('keydown', { target: active, code, key, ...extra });
  if (!event.propagationStopped) h.documentDispatch('keydown', event);
  return event;
}
for (const event of ['100', '5000', '4x400']) {
  check(event + ' drag cannot pan or cancel follow', () => {
    const h = selected(harness(), event),
      before = h.box();
    h.clear();
    h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { clientX: 350, clientY: 240 });
    h.svg.dispatch('pointerup');
    h.flush();
    near(h.box(), before, 'follow drag keeps camera fixed');
    assertFollow(h);
    assert.equal(h.stats.viewBoxWrites, 0, 'ignored drag performs no camera commit');
  });
  check(event + ' follow zoom ignores cursor offset and retains selected target', () => {
    const h = selected(harness(), event),
      before = h.box();
    const inputs = [
      { clientX: 90, clientY: 100, deltaY: -80 },
      { clientX: 1200, clientY: 680, deltaY: -30 },
      { clientX: 700, clientY: 320, deltaY: 20 },
    ];
    for (const e of inputs) h.svg.dispatch('wheel', e);
    h.flush();
    const factor = Math.exp(inputs.reduce((sum, e) => sum + e.deltaY, 0) * 0.0018);
    near(
      h.box().slice(2),
      before.slice(2).map((v) => v * factor),
      'all wheel deltas affect scale'
    );
    assertFollow(h);
    h.api.state.distance += 7;
    h.api.update();
    assertFollow(h);
    near(
      h.box().slice(2),
      before.slice(2).map((v) => v * factor),
      'follow motion keeps adjusted scale'
    );
  });
  check(event + ' wheel also works while playback updates before its queued camera commit', () => {
    const h = selected(harness(), event);
    h.api.togglePlay();
    const before = h.box();
    h.svg.dispatch('wheel', { clientX: 100, clientY: 100, deltaY: -60 });
    h.api.state.distance += 5;
    h.api.update();
    h.flush();
    assertFollow(h);
    near(
      h.box().slice(2),
      before.slice(2).map((v) => v * Math.exp(-60 * 0.0018)),
      'playback does not discard queued zoom'
    );
  });
  check(event + ' athlete Space toggles playback once and preserves follow', () => {
    const h = selected(harness(), event),
      active = token(h),
      before = h.box();
    const start = key(h, active, 'Space', ' ');
    assert.equal(start.defaultPrevented, true, 'Space suppresses scrolling/default activation');
    assert.equal(h.api.state.playing, true, 'first Space starts race exactly once');
    assertFollow(h);
    near(h.box(), before, 'starting race preserves current camera');
    const repeated = key(h, active, 'Space', ' ', { repeat: true });
    assert.equal(repeated.defaultPrevented, true, 'held Space suppresses browser activation');
    assert.equal(h.api.state.playing, true, 'held key does not pause race');
    key(h, active, 'Space', ' ');
    assert.equal(h.api.state.playing, false, 'second Space pauses race exactly once');
    assertFollow(h);
  });
}
for (const order of ['playback-first', 'camera-first'])
  check(order + ' RAF ordering preserves wheel scale during motion', () => {
    const h = selected(harness());
    h.api.togglePlay();
    h.flush(1000);
    const before = h.box(),
      distance = h.api.state.distance;
    h.svg.dispatch('wheel', { clientX: 100, clientY: 650, deltaY: -40 });
    if (order === 'camera-first') {
      const callbacks = [...h.frames.entries()].reverse();
      h.frames.clear();
      for (const [id, fn] of callbacks) h.frames.set(id, fn);
    }
    h.flush(1100);
    assert(h.api.state.distance > distance, 'playback advances within the camera frame');
    assertFollow(h);
    near(
      h.box().slice(2),
      before.slice(2).map((v) => v * Math.exp(-40 * 0.0018)),
      'RAF ordering retains zoom dimensions'
    );
  });
for (const event of ['100', '5000', '4x400'])
  check(event + ' Space after completion replays while retaining target and scale', () => {
    const h = selected(harness(), event);
    h.api.state.distance = h.api.raceEndDistance();
    h.api.update();
    const finish = h.box(),
      active = token(h);
    const press = key(h, active, 'Space', ' ');
    assert.equal(press.defaultPrevented, true);
    assert.equal(h.api.state.distance, 0, 'completed race restarts');
    assert.equal(h.api.state.playing, true);
    assertFollow(h);
    near(h.box().slice(2), finish.slice(2), 'replay retains current follow zoom');
    assert.notDeepEqual(
      h.box().slice(0, 2),
      finish.slice(0, 2),
      'follow moves back to the selected athlete at the start'
    );
  });
check('a click after dragging on the selected athlete cannot deselect it', () => {
  const h = selected(harness()),
    active = token(h);
  h.svg.dispatch('pointerdown', { target: active, clientX: 300, clientY: 200 });
  h.svg.dispatch('pointermove', { target: active, clientX: 360, clientY: 240 });
  h.svg.dispatch('pointerup', { target: active });
  const click = h.svg.dispatch('click', { target: active, detail: 1 });
  h.flush();
  assert.equal(click.defaultPrevented, true, 'drag suppresses the native click');
  assertFollow(h);
});
check('manual drag armed before selecting cannot move a new follow camera', () => {
  const h = harness();
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.api.selectTeam(2);
  const before = h.box();
  h.svg.dispatch('pointermove', { clientX: 350, clientY: 230 });
  h.svg.dispatch('pointerup');
  h.flush();
  near(h.box(), before, 'stale manual drag cannot pan new follow');
  assertFollow(h);
});
check('Enter remains explicit athlete selection and deselection', () => {
  const h = harness(),
    active = h.api.state.runners[2].athletes[0];
  const select = key(h, active, 'Enter', 'Enter');
  assert.equal(select.defaultPrevented, true);
  assertFollow(h);
  const before = h.box();
  key(h, active, 'Enter', 'Enter');
  assert.equal(h.api.state.selected, -1);
  assert.equal(h.api.state.view, 'manual');
  near(h.box(), before, 'Enter deselection keeps camera position');
  assert.equal(active.getAttribute('aria-pressed'), 'false');
});
check('document Space preserves selection and ignores held repeats', () => {
  const h = selected(harness());
  h.focus(null);
  const start = h.documentDispatch('keydown', { code: 'Space', key: ' ' });
  assert.equal(start.defaultPrevented, true);
  assert.equal(h.api.state.playing, true);
  assertFollow(h);
  h.documentDispatch('keydown', { code: 'Space', key: ' ', repeat: true });
  assert.equal(h.api.state.playing, true, 'document held Space does not toggle twice');
  assertFollow(h);
  h.documentDispatch('keydown', { code: 'Space', key: ' ' });
  assert.equal(h.api.state.playing, false);
  assertFollow(h);
});
// Model native control tags accurately: the shared static-paint harness uses
// generic DIV placeholders for these IDs, while the page uses buttons/range.
for (const id of ['play', 'speed', 'group-start', 'timeline'])
  check(id + ' focus Space controls playback without activating the control', () => {
    const h = selected(harness(), '5000'),
      active = h.nodes.get(id),
      before = h.box(),
      speed = h.api.state.speed,
      grouped = h.api.state.grouped,
      distance = h.api.state.distance;
    active.tagName = id === 'timeline' ? 'INPUT' : 'BUTTON';
    if (id === 'timeline') {
      active.type = 'range';
      active.setAttribute('type', 'range');
    }
    h.focus(active);
    const start = h.documentDispatch('keydown', { target: active, code: 'Space', key: ' ' });
    assert.equal(start.defaultPrevented, true, 'Space prevents native button/range activation');
    assert.equal(h.api.state.playing, true, 'first Space starts playback');
    assertFollow(h);
    near(h.box(), before, 'focused control does not move follow camera');
    h.documentDispatch('keydown', { target: active, code: 'Space', key: ' ', repeat: true });
    assert.equal(h.api.state.playing, true, 'held Space does not trigger again');
    const pause = h.documentDispatch('keydown', { target: active, code: 'Space', key: ' ' });
    assert.equal(pause.defaultPrevented, true);
    assert.equal(h.api.state.playing, false, 'second Space pauses playback');
    assertFollow(h);
    assert.equal(h.api.state.speed, speed, 'Space does not activate speed cycling');
    assert.equal(h.api.state.grouped, grouped, 'Space does not toggle group start');
    assert.equal(h.api.state.distance, distance, 'Space does not seek the range');
  });
for (const control of ['text-input', 'textarea', 'select', 'contenteditable', 'event-picker'])
  check(control + ' keeps its native Space behavior', () => {
    const h = selected(harness()),
      active = new h.svg.constructor(
        control === 'textarea'
          ? 'textarea'
          : control === 'select'
            ? 'select'
            : control === 'text-input'
              ? 'input'
              : 'div'
      );
    if (control === 'text-input') {
      active.type = 'text';
      active.setAttribute('type', 'text');
    }
    if (control === 'contenteditable') {
      active.isContentEditable = true;
      active.setAttribute('contenteditable', 'true');
    }
    if (control === 'event-picker') {
      const picker = new h.svg.constructor('div');
      picker.setAttribute('class', 'event-picker');
      picker.append(active);
    }
    h.focus(active);
    const before = h.box();
    const event = h.documentDispatch('keydown', { target: active, code: 'Space', key: ' ' });
    assert.notEqual(event.defaultPrevented, true, 'editable/menu input retains native default');
    assert.equal(
      h.api.state.playing,
      false,
      'Space does not start playback while editing or choosing event'
    );
    assertFollow(h);
    near(h.box(), before, 'native text/menu input preserves follow camera');
  });
for (const modifier of ['metaKey', 'ctrlKey', 'altKey', 'isComposing', 'defaultPrevented'])
  check(modifier + ' Space does not start playback', () => {
    const h = selected(harness()),
      active = token(h),
      before = h.box();
    h.focus(active);
    const event = h.documentDispatch('keydown', {
      target: active,
      code: 'Space',
      key: ' ',
      [modifier]: true,
    });
    assert.equal(
      h.api.state.playing,
      false,
      'modified/composing/handled Space does not toggle play'
    );
    if (modifier !== 'defaultPrevented')
      assert.notEqual(event.defaultPrevented, true, 'modified Space is left to native handling');
    assertFollow(h);
    near(h.box(), before, 'ignored shortcut retains current camera');
  });
console.log(JSON.stringify({ passed: checks, failed: failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
