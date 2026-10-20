// Registered SVG/document input handlers run against the real camera and runners.
// Only the existing camera harness's static paint/label seams are reused.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  { createRequire } = require('node:module');
const harness = require('./helpers/app-harness.cjs');
const { tokenPoint } = require('./helpers/follow-target.cjs');
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
  const point = tokenPoint(h);
  return [point.x, point.y];
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
function assertManual(h) {
  assert.equal(h.api.state.view, 'manual', 'drag leaves the camera in manual mode');
  assert.equal(h.api.state.selected, -1, 'drag clears the selected athlete');
  for (const runner of h.api.state.runners)
    for (const node of runner.active ? [runner.active] : runner.athletes) {
      assert.notEqual(node.getAttribute('aria-pressed'), 'true', 'selection ring is cleared');
      assert.notEqual(node.getAttribute('data-selected'), 'true', 'relay selection is cleared');
    }
}
function panBox(box, dx, dy, width = 1280, height = 720) {
  const scale = Math.max(box[2] / width, box[3] / height);
  return [box[0] - dx * scale, box[1] - dy * scale, box[2], box[3]];
}
function key(h, active, code, key = code, extra = {}) {
  h.focus(active);
  const event = h.svg.dispatch('keydown', { target: active, code, key, ...extra });
  if (!event.propagationStopped) h.documentDispatch('keydown', event);
  return event;
}
for (const event of ['100', '5000', '4x400']) {
  for (const origin of ['full', 'manual', 'follow', 'pending-wheel', 'following-pending-wheel'])
    check(event + ' selection preserves ' + origin + ' zoom', () => {
      const h = harness();
      h.api.changeEvent(event);
      h.api.state.distance = 53;
      if (origin === 'manual') {
        h.api.state.view = 'manual';
        h.api.setBox([23, 41, 64, 36]);
      }
      if (origin === 'follow' || origin === 'following-pending-wheel') h.api.selectTeam(1);
      let size = h.box().slice(2);
      if (origin.includes('pending-wheel')) {
        h.svg.dispatch('wheel', { clientX: 920, clientY: 140, deltaY: -95 });
        size = size.map((v) => v * Math.exp(-95 * 0.0018));
      }
      h.api.selectTeam(2);
      assertFollow(h);
      near(h.box().slice(2), size, 'selection changes only camera centre');
      h.flush();
      assertFollow(h);
      near(h.box().slice(2), size, 'old queued wheel cannot overwrite selection zoom');
    });
  check(event + ' drag cancels follow, clears selection and pans at the existing scale', () => {
    const h = selected(harness(), event),
      before = h.box();
    h.clear();
    h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { clientX: 350, clientY: 240 });
    assertManual(h);
    h.svg.dispatch('pointerup');
    h.flush();
    near(h.box(), panBox(before, 50, 40), 'drag pans from the former follow camera');
    assertManual(h);
    assert.equal(h.stats.viewBoxWrites, 1, 'drag batches its camera update');
    for (const runner of h.api.state.runners) {
      const active =
        runner.active || runner.athletes.find((n) => n.getAttribute('role') === 'button');
      assert.equal(active.getAttribute('opacity'), '1', 'other athletes regain normal opacity');
    }
  });
  check(event + ' press and sub-threshold movement keep following', () => {
    const h = selected(harness(), event),
      before = h.box();
    h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
    assertFollow(h);
    h.svg.dispatch('pointermove', { clientX: 301, clientY: 201 });
    h.svg.dispatch('pointerup');
    h.flush();
    assertFollow(h);
    near(h.box(), before, 'click tolerance does not pan or deselect');
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
check('a click after dragging on the selected athlete cannot select it again', () => {
  const h = selected(harness()),
    active = token(h);
  h.svg.dispatch('pointerdown', { target: active, clientX: 300, clientY: 200 });
  h.svg.dispatch('pointermove', { target: active, clientX: 360, clientY: 240 });
  h.svg.dispatch('pointerup', { target: active });
  const click = h.svg.dispatch('click', { target: active, detail: 1 });
  h.flush();
  assert.equal(click.defaultPrevented, true, 'drag suppresses the native click');
  assertManual(h);
});
check('a drag armed before selection cancels the new follow when moved', () => {
  const h = harness();
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.api.selectTeam(2);
  const before = h.box();
  h.svg.dispatch('pointermove', { clientX: 350, clientY: 230 });
  h.svg.dispatch('pointerup');
  h.flush();
  near(h.box(), panBox(before, 50, 30), 'movement pans from the new follow centre');
  assertManual(h);
});
for (const order of ['playback-first', 'camera-first'])
  check(order + ' pending follow zoom survives drag cancellation during playback', () => {
    const h = selected(harness());
    h.api.togglePlay();
    h.flush(1000);
    const before = h.box(),
      factor = Math.exp(-80 * 0.0018),
      zoomed = [
        before[0] + (before[2] * (1 - factor)) / 2,
        before[1] + (before[3] * (1 - factor)) / 2,
        before[2] * factor,
        before[3] * factor,
      ],
      distance = h.api.state.distance;
    h.svg.dispatch('wheel', { clientX: 90, clientY: 650, deltaY: -80 });
    h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { clientX: 350, clientY: 240 });
    h.svg.dispatch('pointerup');
    assertManual(h);
    if (order === 'camera-first') {
      const callbacks = [...h.frames.entries()].reverse();
      h.frames.clear();
      for (const [id, fn] of callbacks) h.frames.set(id, fn);
    }
    h.flush(1100);
    assert(h.api.state.distance > distance, 'drag does not stop race playback');
    near(h.box(), panBox(zoomed, 50, 40), 'pending zoom and pan retain input order');
    const manual = h.box();
    h.api.state.distance += 7;
    h.api.update();
    near(h.box(), manual, 'moving former target cannot recenter a manual camera');
    assertManual(h);
  });
for (const pointerType of ['mouse', 'touch', 'pen'])
  check(pointerType + ' primary drag cancels follow only for the captured pointer', () => {
    const h = selected(harness()),
      before = h.box(),
      pointer = { pointerType, pointerId: 11, button: 0, buttons: 1 };
    h.svg.dispatch('pointerdown', { ...pointer, clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { ...pointer, pointerId: 12, clientX: 350, clientY: 240 });
    h.svg.dispatch('pointerup', { ...pointer, pointerId: 12 });
    assertFollow(h);
    h.svg.dispatch('pointermove', { ...pointer, clientX: 350, clientY: 240 });
    assertManual(h);
    h.svg.dispatch('pointercancel', pointer);
    h.flush();
    near(h.box(), panBox(before, 50, 40), 'primary pointer drag pans the field');
    const manual = h.box();
    h.svg.dispatch('pointermove', { ...pointer, clientX: 500, clientY: 400 });
    h.flush();
    near(h.box(), manual, 'cancelled pointer cannot continue to pan');
  });
for (const button of [1, 2])
  check('unsupported mouse button ' + button + ' does not cancel follow', () => {
    const h = selected(harness()),
      before = h.box();
    h.svg.dispatch('pointerdown', { button, clientX: 300, clientY: 200 });
    h.svg.dispatch('pointermove', { clientX: 350, clientY: 240, buttons: button === 1 ? 4 : 2 });
    h.svg.dispatch('pointerup');
    h.flush();
    assertFollow(h);
    near(h.box(), before, 'unsupported button has no pan action');
  });
check('unclicked mouse motion and released primary pointer keep following', () => {
  const h = selected(harness()),
    before = h.box();
  h.svg.dispatch('pointermove', { clientX: 600, clientY: 400, buttons: 0 });
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.svg.dispatch('pointermove', { clientX: 350, clientY: 240, buttons: 0 });
  h.svg.dispatch('pointerup');
  h.flush();
  assertFollow(h);
  near(h.box(), before, 'hover and released buttons are not panning gestures');
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
for (const event of ['4x100', '4x200', '4x400', '4x800', '4x1500'])
  check(event + ' keyboard shortcuts remain usable on the preceding relay leg', () => {
    const h = selected(harness(), event),
      previous = token(h),
      legDistance = h.api.state.event.distance / 4;
    h.focus(previous);
    h.api.state.distance = legDistance + 20;
    h.api.update();
    assert.equal(previous.getAttribute('role'), 'img', 'focused leg has handed over');
    assert.notEqual(token(h), previous, 'new leg now holds the baton');
    assertFollow(h);
    const before = h.box();
    key(h, previous, 'Enter', 'Enter');
    assertFollow(h);
    assert.equal(h.api.state.playing, false, 'Enter does not reactivate a former leg');
    key(h, previous, 'Space', ' ');
    assert.equal(h.api.state.playing, true, 'Space starts playback once after handover');
    key(h, previous, 'Space', ' ', { repeat: true });
    assert.equal(h.api.state.playing, true, 'held Space does not toggle twice');
    key(h, previous, 'Space', ' ');
    assert.equal(h.api.state.playing, false, 'Space pauses playback once after handover');
    assertFollow(h);
    const escape = key(h, previous, 'Escape', 'Escape');
    assert.equal(escape.defaultPrevented, true, 'Escape is handled on a former leg');
    assert.equal(escape.propagationStopped, true, 'Escape is not handled twice');
    assertManual(h);
    near(h.box(), before, 'deselection does not move the camera');
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
for (const language of ['zh-CN', 'en'])
  for (const playing of [false, true])
    check(
      language + ' six-speed cycle preserves playback, position and following: ' + playing,
      () => {
        const h = selected(harness(1280, 720, { language })),
          button = h.nodes.get('speed'),
          before = h.box(),
          distance = h.api.state.distance,
          lastTime = h.api.state.lastTime;
        assert.equal(h.api.state.speed, 1, 'default playback speed remains 1x');
        if (playing) h.api.togglePlay();
        for (const speed of [2, 4, 8, 0.25, 0.5, 1, 2, 4, 8, 0.25, 0.5, 1]) {
          button.dispatch('click');
          assert.equal(h.api.state.speed, speed, 'button cycles through all six speeds in order');
          assert.equal(button.textContent, speed + '×', 'visible multiplier matches playback rate');
          assert.equal(
            button.getAttribute('aria-label'),
            h.api.Locale.text('speed', { speed }),
            'accessible name announces the current multiplier'
          );
          assert.equal(h.api.state.playing, playing, 'speed changes preserve play/pause state');
          assert.equal(h.api.state.distance, distance, 'click does not seek or reset the race');
          assert.equal(h.api.state.lastTime, lastTime, 'click preserves the animation clock');
          near(h.box(), before, 'click preserves camera position and zoom');
          assertFollow(h);
        }
      }
    );
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
