'use strict';
const assert = require('node:assert/strict');
const harness = require('./helpers/app-harness.cjs');
const { tokenPoint } = require('./helpers/follow-target.cjs');
let checks = 0;
function near(a, b, message, eps = 1e-8) {
  assert.equal(a.length, b.length, message);
  for (let i = 0; i < a.length; i++) {
    assert(Math.abs(a[i] - b[i]) < eps, `${message}: [${i}] ${a[i]} vs ${b[i]}`);
    checks++;
  }
}
function anchoredZoom(h, box, rect, ev) {
  const s = Math.min(rect.width / box[2], rect.height / box[3]),
    ax =
      h.api.state.view === 'follow'
        ? box[0] + box[2] / 2
        : box[0] + (ev.clientX - rect.left - (rect.width - box[2] * s) / 2) / s,
    ay =
      h.api.state.view === 'follow'
        ? box[1] + box[3] / 2
        : box[1] + (ev.clientY - rect.top - (rect.height - box[3] * s) / 2) / s,
    pixels = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? rect.height : 1),
    nw = Math.max(
      0.1,
      Math.min(1e5, box[2] / Math.exp(-Math.max(-600, Math.min(600, pixels)) * 0.0018))
    ),
    k = nw / box[2];
  return [ax - (ax - box[0]) * k, ay - (ay - box[1]) * k, nw, box[3] * k];
}
// Every initial fit keeps the surveyed field horizontal and entirely inside
// the visible court, including the floating controls' reserved margins.
for (const [width, height] of [
  [1280, 720],
  [844, 390],
  [720, 720],
  [600, 1000],
  [320, 568],
]) {
  const h = harness(width, height),
    b = h.box(),
    scale = Math.min(width / b[2], height / b[3]),
    label = `${width}x${height}`;
  assert.equal(
    h.nodes.get('world').getAttribute('transform') || '',
    '',
    label + ' field is not rotated'
  );
  checks++;
  for (const [x, y] of [
    [5, 17],
    [190, 17],
    [5, 116],
    [190, 116],
  ]) {
    const sx = (x - b[0]) * scale + (width - b[2] * scale) / 2,
      sy = (y - b[1]) * scale + (height - b[3] * scale) / 2;
    assert(sx >= 14 - 1e-8 && sx <= width - 14 + 1e-8, label + ' complete field fits horizontally');
    assert(
      sy >= 68 - 1e-8 && sy <= height - 80 + 1e-8,
      label + ' complete field clears floating controls'
    );
    checks += 2;
  }
}
// First regression: every wheel delta and changing mouse anchor are retained,
// while multiple native events share one SVG viewBox commit per paint frame.
{
  const h = harness(),
    before = h.box(),
    events = [
      { clientX: 340, clientY: 210, deltaY: -74 },
      { clientX: 710, clientY: 430, deltaY: -36 },
      { clientX: 930, clientY: 340, deltaY: 17 },
    ];
  let expected = before;
  for (const ev of events) {
    expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, ev);
    h.svg.dispatch('wheel', ev);
  }
  assert.equal(h.stats.viewBoxWrites, 0, 'wheel waits for the next animation frame');
  checks++;
  h.flush();
  assert.equal(h.stats.viewBoxWrites, 1, 'one wheel viewBox commit per frame');
  checks++;
  near(h.box(), expected, 'all wheel deltas and cursor anchors accumulated');
  assert.equal(h.stats.ctmReads, 0, 'wheel uses cached viewport projection');
  checks++;
}
// Pointer positions are absolute from pointerdown: do not sum movement twice.
{
  const h = harness(),
    before = h.box(),
    scale = Math.max(before[2] / 1280, before[3] / 720);
  h.svg.dispatch('pointerdown', { clientX: 310, clientY: 220 });
  for (const [clientX, clientY] of [
    [321, 226],
    [351, 245],
    [366, 252],
  ])
    h.svg.dispatch('pointermove', { clientX, clientY });
  h.svg.dispatch('pointerup');
  assert.equal(
    h.stats.viewBoxWrites,
    0,
    'drag waits for a paint frame even when pointerup happens first'
  );
  checks++;
  assert.equal(h.stats.rectReads, 1, 'drag captures its viewport rectangle once at pointerdown');
  checks++;
  h.flush();
  assert.equal(h.stats.viewBoxWrites, 1, 'all pointer moves share one camera commit');
  checks++;
  near(
    h.box(),
    [before[0] - 56 * scale, before[1] - 32 * scale, before[2], before[3]],
    'drag reaches the latest pointer position'
  );
}
// Translation changes the camera, not paint widths or detail thresholds.
{
  const h = harness(),
    b = h.box();
  h.api.setBox([b[0] + 3, b[1] - 2, b[2], b[3]]);
  assert.equal(h.stats.viewBoxWrites, 1, 'programmatic translation commits immediately');
  checks++;
  assert.equal(h.stats.clientReads, 0, 'pure translation does not read layout dimensions');
  checks++;
  assert.equal(h.stats.styleWrites, 0, 'pure translation does not rewrite paint widths');
  checks++;
  assert.equal(h.stats.lodWrites, 0, 'pure translation does not toggle detail classes');
  checks++;
}
// A resize consumes the latest logical camera even before its paint frame,
// preserves area/world centre without rotation, and refreshes cursor mapping.
{
  const h = harness(),
    ev = { clientX: 640, clientY: 400, deltaY: -90 },
    pending = anchoredZoom(h, h.box(), { left: 40, top: 25, width: 1280, height: 720 }, ev);
  h.svg.dispatch('wheel', ev);
  const centre = [pending[0] + pending[2] / 2, pending[1] + pending[3] / 2],
    w = Math.sqrt(pending[2] * pending[3] * 0.6),
    height = w / 0.6;
  h.resize(600, 1000);
  const expected = [centre[0] - w / 2, centre[1] - height / 2, w, height];
  near(
    h.box(),
    expected,
    'pending zoom survives wide to narrow resize without rotating its centre'
  );
  assert.equal(
    h.nodes.get('world').getAttribute('transform') || '',
    '',
    'narrow viewport keeps the field horizontal'
  );
  checks++;
  const writes = h.stats.viewBoxWrites;
  h.flush();
  assert.equal(
    h.stats.viewBoxWrites,
    writes,
    'stale queued zoom cannot overwrite resized viewport'
  );
  checks++;
  h.clear();
  const next = { clientX: 340, clientY: 525, deltaY: -12 };
  h.svg.dispatch('wheel', next);
  h.flush();
  near(
    h.box(),
    anchoredZoom(h, expected, { left: 40, top: 25, width: 600, height: 1000 }, next),
    'wheel uses updated viewport after resize'
  );
  assert.equal(h.stats.ctmReads, 0, 'narrow-screen wheel does not read screen CTM');
  checks++;
  const zoomed = h.box(),
    dragScale = Math.max(zoomed[2] / 600, zoomed[3] / 1000);
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 400 });
  h.svg.dispatch('pointermove', { clientX: 325, clientY: 435 });
  h.svg.dispatch('pointerup');
  h.flush();
  near(
    h.box(),
    [zoomed[0] - 25 * dragScale, zoomed[1] - 35 * dragScale, zoomed[2], zoomed[3]],
    'narrow-screen dragging retains the horizontal world axes'
  );
}
// Mixed native input remains chronological, including wheel during drag.
{
  const h = harness();
  let expected = h.box(),
    scale = Math.max(expected[2] / 1280, expected[3] / 720);
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.svg.dispatch('pointermove', { clientX: 320, clientY: 220 });
  expected = [expected[0] - 20 * scale, expected[1] - 20 * scale, expected[2], expected[3]];
  const first = { clientX: 400, clientY: 280, deltaY: -60 };
  h.svg.dispatch('wheel', first);
  expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, first);
  scale = Math.max(expected[2] / 1280, expected[3] / 720);
  h.svg.dispatch('pointermove', { clientX: 360, clientY: 250 });
  expected = [expected[0] - 40 * scale, expected[1] - 30 * scale, expected[2], expected[3]];
  const last = { clientX: 740, clientY: 470, deltaY: 20 };
  h.svg.dispatch('wheel', last);
  expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, last);
  h.svg.dispatch('pointercancel');
  h.flush();
  near(h.box(), expected, 'interleaved pan/zoom preserves all input in order');
  assert.equal(h.stats.viewBoxWrites, 1, 'mixed input commits one viewBox');
  checks++;
  assert.equal(h.stats.rectReads, 1, 'mixed drag and wheel share pointerdown viewport cache');
  checks++;
  assert.equal(h.stats.clientReads, 0, 'mixed input never reads live client dimensions');
  checks++;
}
// Default SVG meet projection includes letterboxing, and wheel units/clamps
// remain equivalent to the immediate sequential transform.
{
  const h = harness();
  h.api.setBox([4, 12, 100, 100]);
  h.clear();
  let expected = h.box();
  for (const ev of [
    { clientX: 90, clientY: 125, deltaY: -3, deltaMode: 1 },
    { clientX: 1000, clientY: 650, deltaY: 0.3, deltaMode: 2 },
    { clientX: 610, clientY: 360, deltaY: -9000 },
  ]) {
    expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, ev);
    h.svg.dispatch('wheel', ev);
  }
  h.flush();
  near(h.box(), expected, 'letterbox projection and all wheel delta modes');
  assert.equal(h.stats.viewBoxWrites, 1);
  checks++;
}
// Only changed overlay widths and threshold crossings mutate SVG styles.
{
  const h = harness();
  h.api.setBox([0, 0, 1280 / 20.5, 720 / 20.5]);
  h.clear();
  h.api.setBox([0, 0, 1280 / 21, 720 / 21]);
  assert.equal(
    h.stats.styleWrites,
    2,
    'only adaptive selection width and fading label opacity change above 20px/m'
  );
  checks++;
  assert.equal(h.stats.lodWrites, 0, 'same detail level causes no class mutation');
  checks++;
  h.api.setBox([0, 0, 1280 / 40, 720 / 40]);
  h.clear();
  h.api.setBox([0, 0, 1280 / 41, 720 / 41]);
  assert.equal(
    h.stats.styleWrites,
    1,
    'deep zoom changes only surface opacity, keeping physical overlay widths constant'
  );
  checks++;
  assert.equal(h.stats.lodWrites, 0, 'deep zoom does not repeat LOD class writes');
  checks++;
  h.api.setBox([0, 0, 1280 / 27, 720 / 27]);
  assert.equal(h.stats.lodWrites, 1, 'only fine-detail toggles when its threshold is crossed');
  checks++;
  for (const [name, value] of Object.entries(h.svg._style))
    assert(
      !['--lane-width', '--kerb-width', '--mark-width', '--start-width'].includes(name),
      'ground paint remains a CSS constant'
    );
  checks++;
}
// Reset preserves both a committed manual camera and an unpainted zoom target.
{
  const h = harness(),
    ev = { clientX: 900, clientY: 340, deltaY: -90 },
    expected = anchoredZoom(h, h.box(), { left: 40, top: 25, width: 1280, height: 720 }, ev);
  h.svg.dispatch('wheel', ev);
  h.api.state.distance = 117;
  h.api.reset();
  h.flush();
  near(h.box(), expected, 'reset retains queued manual camera');
  assert.equal(h.api.state.distance, 0);
  assert.equal(h.api.state.view, 'manual');
  checks += 2;
  const manual = h.box();
  h.api.state.distance = 245;
  h.clear();
  h.api.reset();
  near(h.box(), manual, 'reset retains committed manual camera');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks++;
}
// Follow keeps the chosen athlete centred without width/style layout reads;
// reset stops following before updating runners, so the camera stays still.
{
  const h = harness();
  h.api.state.selected = 2;
  h.api.state.distance = 184;
  h.api.setView('follow');
  h.api.update();
  h.clear();
  h.api.state.distance = 206;
  h.api.update();
  const b = h.box(),
    runner = tokenPoint(h, 2);
  near(
    [b[0] + b[2] / 2, b[1] + b[3] / 2],
    [runner.x, runner.y],
    'follow centres the painted athlete body'
  );
  assert.equal(h.stats.viewBoxWrites, 1);
  assert.equal(h.stats.clientReads, 0);
  assert.equal(h.stats.styleWrites, 0);
  assert.equal(h.stats.lodWrites, 0);
  checks += 4;
  h.clear();
  h.api.reset();
  near(h.box(), b, 'reset freezes follow camera');
  assert.equal(h.api.state.view, 'manual');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks += 2;
}
// Project selection keeps the latest pending camera input; it is independent
// of the old race. Double clicks must preserve this same unpainted input.
{
  const h = harness(),
    ev = { clientX: 500, clientY: 300, deltaY: -50 },
    expected = anchoredZoom(h, h.box(), { left: 40, top: 25, width: 1280, height: 720 }, ev);
  h.svg.dispatch('wheel', ev);
  h.nodes.get('event-select').value = '100';
  h.nodes.get('event-select').dispatch('change');
  h.flush();
  near(h.box(), expected, 'event selection preserves pending camera input');
  assert.equal(h.stats.viewBoxWrites, 1);
  assert.equal(h.api.state.event.id, '100');
  checks += 2;
  const next = { clientX: 500, clientY: 300, deltaY: -50 },
    pending = anchoredZoom(h, h.box(), { left: 40, top: 25, width: 1280, height: 720 }, next);
  h.svg.dispatch('wheel', next);
  const double = h.svg.dispatch('dblclick');
  h.flush();
  near(h.box(), pending, 'double click preserves queued zoom');
  assert.equal(h.api.state.view, 'manual');
  assert.equal(double.defaultPrevented, true, 'double click suppresses native zoom');
  checks += 2;
}
// Every event keeps a committed pan/zoom while starting a fresh race.
{
  const h = harness();
  h.svg.dispatch('wheel', { clientX: 600, clientY: 360, deltaY: -250 });
  h.flush();
  h.svg.dispatch('pointerdown', { clientX: 420, clientY: 250 });
  h.svg.dispatch('pointermove', { clientX: 475, clientY: 275 });
  h.svg.dispatch('pointerup');
  h.flush();
  const manual = h.box();
  assert.equal(h.events.length, 21, 'the camera regression covers all 21 event options');
  checks++;
  for (const { id } of h.events) {
    h.api.state.distance = 117;
    h.api.state.playing = true;
    h.api.state.selected = 1;
    h.clear();
    h.nodes.get('event-select').value = id;
    h.nodes.get('event-select').dispatch('change');
    h.flush();
    near(h.box(), manual, id + ' retains committed pan/zoom');
    assert.equal(h.stats.viewBoxWrites, 0, id + ' does not move camera');
    assert.equal(h.api.state.view, 'manual');
    assert.equal(h.api.state.distance, 0);
    assert.equal(h.api.state.playing, false);
    assert.equal(h.api.state.selected, -1);
    checks += 5;
  }
}
// Changing event freezes a follow camera before new athletes are rendered.
{
  const h = harness();
  h.api.state.selected = 2;
  h.api.state.distance = 206;
  h.api.setView('follow');
  h.api.update();
  const followed = h.box();
  h.clear();
  h.nodes.get('event-select').value = '100';
  h.nodes.get('event-select').dispatch('change');
  h.flush();
  near(h.box(), followed, 'event change freezes previous follow camera');
  assert.equal(h.api.state.view, 'manual');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks += 2;
  h.api.state.distance = 40;
  h.api.update();
  near(h.box(), followed, 'new race does not resume following an unrelated athlete');
}
// The entire expanded catalog also preserves a pending manual camera and a
// committed follow camera, rather than testing only the former Olympic list.
for (const origin of ['pending', 'follow']) {
  const h = harness();
  for (const { id } of h.events) {
    h.api.state.distance = Math.min(117, h.api.state.event.distance / 3);
    h.api.selectTeam(1);
    h.api.update();
    let expected = h.box();
    if (origin === 'pending') {
      const ev = { clientX: 710, clientY: 360, deltaY: -30 };
      expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, ev);
      h.svg.dispatch('wheel', ev);
    }
    h.clear();
    h.nodes.get('event-select').value = id;
    h.nodes.get('event-select').dispatch('change');
    h.flush();
    near(h.box(), expected, id + ' event change preserves ' + origin + ' camera');
    assert.equal(h.stats.viewBoxWrites, origin === 'pending' ? 1 : 0);
    assert.equal(h.api.state.view, 'manual');
    assert.equal(h.api.state.selected, -1);
    checks += 3;
  }
}
// Both long-distance group toggles rebuild competitors without touching the
// camera, including a wheel/drag target not yet committed by its paint frame.
for (const event of ['5000', '10000'])
  for (const origin of ['manual', 'follow'])
    for (const pending of ['none', 'wheel', 'drag']) {
      const h = harness();
      h.api.changeEvent(event);
      h.api.state.distance = 417;
      if (origin === 'follow') {
        h.api.selectTeam(2);
        h.api.update();
      } else {
        h.api.state.view = 'manual';
        h.api.setBox([112, 28, 42, 23.625]);
      }
      let expected = h.box();
      if (pending === 'wheel') {
        const ev = { clientX: 850, clientY: 300, deltaY: -65 };
        expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, ev);
        h.svg.dispatch('wheel', ev);
      } else if (pending === 'drag') {
        const scale = Math.max(expected[2] / 1280, expected[3] / 720);
        h.svg.dispatch('pointerdown', { clientX: 450, clientY: 300 });
        h.svg.dispatch('pointermove', { clientX: 485, clientY: 322 });
        h.svg.dispatch('pointerup');
        expected = [expected[0] - 35 * scale, expected[1] - 22 * scale, expected[2], expected[3]];
      }
      h.clear();
      h.nodes.get('group-start').dispatch('click');
      h.flush();
      const label = `${event} ${origin}/${pending}`;
      near(h.box(), expected, label + ' group start preserves camera');
      assert.equal(
        h.stats.viewBoxWrites,
        pending === 'none' ? 0 : 1,
        label + ' retains allowed pending camera input without refitting'
      );
      assert.equal(
        h.api.state.view,
        'manual',
        label + ' stops former follow before rebuilding athletes'
      );
      assert.equal(h.api.state.distance, 0);
      assert.equal(h.api.state.selected, -1);
      assert.equal(h.api.state.grouped, true);
      assert.equal(h.api.state.routes.length, 16);
      checks += 6;
      h.clear();
      h.nodes.get('group-start').dispatch('click');
      h.flush();
      near(h.box(), expected, label + ' returning to one group preserves camera');
      assert.equal(h.stats.viewBoxWrites, 0);
      assert.equal(h.api.state.grouped, false);
      assert.equal(h.api.state.routes.length, 12);
      checks += 3;
      h.api.state.distance = 53;
      h.api.update();
      near(h.box(), expected, label + ' rebuilt pack does not restart follow');
    }
// Empty-field double clicks, including both click events that precede the
// dblclick event in a browser, have no camera or athlete-selection side effect.
for (const origin of ['manual', 'follow'])
  for (const pending of [false, true]) {
    const h = harness();
    h.api.state.distance = 206;
    if (origin === 'follow') h.api.selectTeam(2);
    else {
      h.api.state.view = 'manual';
      h.api.setBox([112, 28, 42, 23.625]);
    }
    let expected = h.box();
    if (pending) {
      const ev = { clientX: 720, clientY: 420, deltaY: -45 };
      expected = anchoredZoom(h, expected, { left: 40, top: 25, width: 1280, height: 720 }, ev);
      h.svg.dispatch('wheel', ev);
    }
    const view = h.api.state.view,
      selected = h.api.state.selected;
    h.clear();
    h.svg.dispatch('click', { target: h.svg, clientX: 300, clientY: 200, detail: 1 });
    h.svg.dispatch('click', { target: h.svg, clientX: 300, clientY: 200, detail: 2 });
    const e = h.svg.dispatch('dblclick', { target: h.svg, clientX: 300, clientY: 200, detail: 2 });
    h.flush();
    near(h.box(), expected, `${origin}/${pending} background double click retains camera`);
    assert.equal(e.defaultPrevented, true);
    assert.equal(h.api.state.view, view);
    assert.equal(h.api.state.selected, selected);
    assert.equal(h.stats.viewBoxWrites, pending ? 1 : 0);
    checks += 4;
  }
// Explicit athlete input still enters follow, while the second click in a
// double-click sequence cannot immediately toggle selection back off.
{
  const h = harness(),
    token = h.api.state.runners[2].athletes[0],
    body = token.querySelector('.token-body');
  h.api.state.distance = 206;
  h.api.update();
  h.svg.dispatch('click', { target: body, detail: 1 });
  const followed = h.box();
  assert.equal(h.api.state.selected, 2);
  assert.equal(h.api.state.view, 'follow');
  checks += 2;
  h.clear();
  h.svg.dispatch('click', { target: body, detail: 2 });
  const double = h.svg.dispatch('dblclick', { target: body, detail: 2 });
  h.flush();
  near(h.box(), followed, 'athlete double click retains first-click follow');
  assert.equal(h.api.state.selected, 2);
  assert.equal(h.api.state.view, 'follow');
  assert.equal(h.stats.viewBoxWrites, 0);
  assert.equal(double.defaultPrevented, true);
  checks += 4;
  h.svg.dispatch('click', { target: body, detail: 1 });
  near(h.box(), followed, 'explicit deselection freezes current camera');
  assert.equal(h.api.state.selected, -1);
  assert.equal(h.api.state.view, 'manual');
  checks += 2;
  h.api.state.distance = 250;
  h.api.update();
  near(h.box(), followed, 'deselected athlete no longer moves camera');
}
// Only an actual active athlete button is a selection target. Waiting/retired
// runners and scenery near the token must not trigger proximity-based follow.
{
  const h = harness();
  h.api.state.view = 'manual';
  h.api.setBox([112, 28, 42, 23.625]);
  const before = h.box();
  h.clear();
  const active = h.api.state.runners[0].athletes[0],
    waiting = h.api.state.runners[0].athletes[1];
  h.svg.dispatch('click', { target: waiting.querySelector('.token-body'), detail: 1 });
  h.svg.dispatch('click', { target: h.nodes.get('world'), clientX: 0, clientY: 0, detail: 1 });
  h.flush();
  near(h.box(), before, 'waiting athlete and nearby scenery retain camera');
  assert.equal(h.api.state.selected, -1);
  assert.equal(h.stats.viewBoxWrites, 0);
  assert.equal(
    h.stats.ctmReads,
    0,
    'click selection does not scan all athletes with screen transforms'
  );
  checks += 3;
  h.svg.dispatch('keydown', { target: active, key: 'Enter', code: 'Enter' });
  assert.equal(h.api.state.selected, 0);
  assert.equal(h.api.state.view, 'follow');
  checks += 2;
  const followed = h.box();
  h.clear();
  const escape = h.svg.dispatch('keydown', { target: active, key: 'Escape', code: 'Escape' });
  h.flush();
  near(h.box(), followed, 'Escape cancels follow without fitting field');
  assert.equal(escape.defaultPrevented, true);
  assert.equal(h.api.state.selected, -1);
  assert.equal(h.api.state.view, 'manual');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks += 4;
  h.api.state.distance = 51;
  h.api.update();
  near(h.box(), followed, 'Escape keeps the former athlete from moving the camera');
  h.api.state.distance = 402;
  h.api.update();
  const retired = h.api.state.runners[0].athletes[0];
  assert.equal(retired.getAttribute('role'), 'img', 'old baton holder is no longer interactive');
  checks++;
  h.svg.dispatch('click', { target: retired.querySelector('.token-body'), detail: 1 });
  h.flush();
  near(h.box(), followed, 'retired athlete cannot enter follow');
  assert.equal(h.api.state.selected, -1);
  checks++;
}
// Play/pause and completed-race replay retain intentional follow. Replay
// follows the same athlete back to the start at the current zoom level.
for (const event of ['100', '4x400', '5000']) {
  const h = harness();
  h.api.changeEvent(event);
  h.api.state.distance = 20;
  h.api.selectTeam(1);
  const before = h.box();
  h.api.togglePlay();
  assert.equal(h.api.state.view, 'follow');
  assert.equal(h.api.state.selected, 1);
  checks += 2;
  h.flush(1000);
  h.flush(1100);
  assert(h.api.state.distance > 20);
  assert.notDeepEqual(h.box(), before, 'ongoing playback continues following its athlete');
  checks += 2;
  h.api.togglePlay();
  assert.equal(h.api.state.view, 'follow', 'pause preserves active follow');
  checks++;
  h.api.state.distance = h.api.raceEndDistance();
  h.api.update();
  const finish = h.box();
  h.clear();
  h.api.togglePlay();
  const start = h.box();
  near(start.slice(2), finish.slice(2), event + ' completed-race restart retains zoom');
  assert.notDeepEqual(
    start.slice(0, 2),
    finish.slice(0, 2),
    event + ' completed-race restart follows athlete back to start'
  );
  assert.equal(h.api.state.distance, 0);
  assert.equal(h.api.state.playing, true);
  assert.equal(h.api.state.view, 'follow');
  assert.equal(h.api.state.selected, 1);
  checks += 5;
  h.flush(2000);
  h.flush(2100);
  assert.notDeepEqual(
    h.box().slice(0, 2),
    start.slice(0, 2),
    event + ' restarted playback continues following selected athlete'
  );
  near(h.box().slice(2), finish.slice(2), event + ' restarted playback keeps follow zoom');
  checks++;
}
// Seeking retains an intentional follow target and its current scale. Manual
// cameras are covered separately; a selected athlete must never be left marked
// while its follow mode is silently cancelled by the timeline or arrow keys.
for (const input of ['timeline', 'ArrowLeft', 'ArrowRight']) {
  const h = harness();
  h.api.state.distance = 206;
  h.api.selectTeam(2);
  const before = h.box();
  h.clear();
  let event;
  if (input === 'timeline') {
    const timeline = h.nodes.get('timeline');
    timeline.value = '39.5';
    timeline.dispatch('input');
    assert.equal(h.api.state.distance, 39.5);
  } else {
    event = h.documentDispatch('keydown', { key: input, code: input });
    assert.equal(
      h.api.state.distance,
      206 + ((input === 'ArrowLeft' ? -1 : 1) * h.api.state.event.distance) / 100
    );
    assert.equal(event.defaultPrevented, true);
    checks++;
  }
  checks++;
  h.flush();
  near(h.box().slice(2), before.slice(2), input + ' seek preserves follow zoom');
  assert.equal(h.api.state.view, 'follow');
  assert.equal(h.api.state.selected, 2);
  assert.equal(h.api.state.playing, false);
  assert.equal(h.stats.viewBoxWrites, 1);
  checks += 4;
  let b = h.box(),
    runner = tokenPoint(h, 2);
  near(
    [b[0] + b[2] / 2, b[1] + b[3] / 2],
    [runner.x, runner.y],
    input + ' seek centres the actual active athlete'
  );
  h.api.state.distance += 1;
  h.api.update();
  b = h.box();
  runner = tokenPoint(h, 2);
  near(b.slice(2), before.slice(2), input + ' subsequent update retains follow zoom');
  near(
    [b[0] + b[2] / 2, b[1] + b[3] / 2],
    [runner.x, runner.y],
    input + ' subsequent update continues following the same team'
  );
}
// A window resize reprojects the existing view instead of applying a fixed
// follow zoom preset. Same-size resize notifications must be exact no-ops.
for (const origin of ['manual', 'follow']) {
  const h = harness();
  h.api.state.distance = 206;
  if (origin === 'follow') h.api.selectTeam(2);
  else h.api.state.view = 'manual';
  h.api.setBox([120, 31, 48, 27]);
  const old = h.box(),
    centre = [old[0] + old[2] / 2, old[1] + old[3] / 2];
  h.clear();
  h.resize(1280, 720);
  assert.deepEqual(h.box(), old, origin + ' same-size resize retains exact box');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks += 2;
  const nw = Math.sqrt(old[2] * old[3] * 0.6),
    nh = nw / 0.6;
  h.resize(600, 1000);
  const narrow = [centre[0] - nw / 2, centre[1] - nh / 2, nw, nh];
  near(h.box(), narrow, origin + ' resize preserves world centre and camera area');
  assert.equal(h.api.state.view, origin, 'resize preserves follow/manual mode');
  checks++;
  assert.equal(
    h.nodes.get('world').getAttribute('transform') || '',
    '',
    origin + ' narrow resize does not rotate the field'
  );
  checks++;
  const exact = h.box();
  h.clear();
  h.resize(600, 1000);
  assert.deepEqual(h.box(), exact, origin + ' repeated narrow resize has no numeric drift');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks += 2;
  if (origin === 'follow') {
    h.api.state.distance += 1;
    h.api.update();
    near(h.box().slice(2), narrow.slice(2), 'following after resize retains the adapted scale');
    assert.notDeepEqual(
      h.box().slice(0, 2),
      narrow.slice(0, 2),
      'follow remains active after resize'
    );
    checks++;
    const b = h.box(),
      runner = tokenPoint(h, 2);
    near(
      [b[0] + b[2] / 2, b[1] + b[3] / 2],
      [runner.x, runner.y],
      'narrow-screen follow centres the painted athlete without rotating coordinates'
    );
  } else {
    h.resize(1280, 720);
    near(h.box(), old, 'manual wide/narrow/wide resize restores its original centre and area');
  }
}
// At the zoom floor, ultrawide viewports retain their aspect ratio and
// pointer motion uses exactly the same legal dimensions that were painted.
{
  const h = harness(2000, 720),
    aspect = h.box()[2] / h.box()[3];
  h.svg.dispatch('pointerdown', { clientX: 400, clientY: 300 });
  h.api.zoom(1e6);
  h.flush();
  const b = h.box();
  assert(b[2] >= 0.1 && b[3] >= 0.05, 'both camera dimensions stay within physical bounds');
  checks++;
  assert(Math.abs(b[2] / b[3] - aspect) < 1e-8, 'zoom floor preserves the viewport aspect ratio');
  checks++;
  h.svg.dispatch('pointermove', { clientX: 410, clientY: 300 });
  h.flush();
  near(
    h.box(),
    [b[0] - 10 * Math.max(b[2] / 2000, b[3] / 720), b[1], b[2], b[3]],
    'drag scale agrees with bounded zoom'
  );
}
// Releasing before pointer capture (outside the SVG or over floating controls)
// cannot leave a drag armed; loss of pointer capture also terminates a drag.
{
  const h = harness(),
    before = h.box();
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.windowDispatch('pointerup', { pointerId: 1 });
  h.svg.dispatch('pointermove', { clientX: 500, clientY: 400, buttons: 0 });
  h.flush();
  near(h.box(), before, 'outside release clears an unstarted drag');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks++;
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  h.svg.dispatch('pointermove', { clientX: 320, clientY: 220 });
  h.flush();
  const afterDrag = h.box();
  h.clear();
  h.svg.dispatch('lostpointercapture', { pointerId: 1 });
  h.svg.dispatch('pointermove', { clientX: 500, clientY: 400, buttons: 0 });
  h.flush();
  near(h.box(), afterDrag, 'lost capture clears an active drag');
  assert.equal(h.stats.viewBoxWrites, 0);
  checks++;
}
// Cleanup must run at the release event itself, before a new press; this
// distinguishes the window/lost-capture hooks from the buttons=0 fallback.
for (const release of ['outside', 'capture', 'blur', 'hidden']) {
  const h = harness(),
    b = h.box(),
    scale = Math.max(b[2] / 1280, b[3] / 720);
  h.svg.dispatch('pointerdown', { clientX: 300, clientY: 200 });
  if (release === 'outside') h.windowDispatch('pointerup', { pointerId: 1 });
  else if (release === 'blur') h.windowDispatch('blur');
  else if (release === 'hidden') {
    h.setHidden(true);
    h.setHidden(false);
  } else h.svg.dispatch('lostpointercapture', { pointerId: 1 });
  h.svg.dispatch('pointerdown', { clientX: 500, clientY: 400 });
  h.svg.dispatch('pointermove', { clientX: 520, clientY: 420, buttons: 1 });
  h.flush();
  near(
    h.box(),
    [b[0] - 20 * scale, b[1] - 20 * scale, b[2], b[3]],
    release + ' cleanup allows a fresh drag origin'
  );
}
// Actual visibility handlers also reset a clock when no hidden RAF is fired,
// which is the normal fully suspended-tab path in Safari and Chromium.
{
  const h = harness();
  h.api.state.view = 'manual';
  h.api.setBox([112, 28, 42, 23.625]);
  const b = h.box();
  Object.assign(h.api.state, { distance: 96, speed: 1, playing: true, lastTime: 1000 });
  h.setHidden(true);
  assert.equal(h.api.state.lastTime, 0);
  h.setHidden(false);
  h.api.frame(63000);
  assert.equal(h.api.state.distance, 96);
  assert.equal(h.api.state.playing, true);
  checks += 3;
  near(h.box(), b, 'visibility resume keeps camera');
  h.api.frame(64000);
  assert.equal(h.api.state.distance, 106);
  checks++;
}
// Label and micro-surface detail fade continuously in physical zoom space;
// no new pixel-width approximation is applied to official ground markings.
{
  const h = harness();
  for (const [scale, surface, label] of [
    [20, 0, 0],
    [20.00012, 0, 0.00001],
    [28, 0, 2 / 3],
    [28.00028, 0.00001, 2 / 3 + 0.00028 / 12],
    [32, 1 / 7, 1],
    [42, 0.5, 1],
    [56, 1, 1],
    [80, 1, 1],
  ]) {
    h.api.setBox([0, 0, 1280 / scale, 720 / scale]);
    assert(
      Math.abs(Number(h.svg._style['--surface-detail-opacity']) - surface) < 1e-10,
      'surface opacity follows its continuous zoom interval'
    );
    assert(
      Math.abs(Number(h.svg._style['--label-opacity']) - label) < 1e-10,
      'label opacity follows its continuous zoom interval'
    );
    assert.equal(h.svg.classList.contains('fine-detail'), scale > 28);
    assert.equal(h.svg.classList.contains('detail-labels'), scale > 20);
    checks += 4;
  }
  h.clear();
  const b = h.box();
  h.api.setBox([b[0] + 1, b[1] + 1, b[2], b[3]]);
  assert.equal(h.stats.styleWrites, 0, 'pan never rewrites fading detail properties');
  assert.equal(h.stats.clientReads, 0);
  checks += 2;
}
// Relay gesture detail and physically tiny rubber grains have independent
// continuous opacity windows; neither can pop into view at a class threshold.
{
  const h = harness();
  for (const [scale, marker, rubber] of [
    [10, 0, 0],
    [10.00008, 0.00001, 0],
    [12, 0.25, 0],
    [14, 0.5, 0],
    [18, 1, 0],
    [180, 1, 0],
    [180.003, 1, 0.00001],
    [330, 1, 0.5],
    [480, 1, 1],
    [960, 1, 1],
  ]) {
    h.api.setBox([0, 0, 1280 / scale, 720 / scale]);
    assert(
      Math.abs(Number(h.svg._style['--marker-detail-opacity']) - marker) < 1e-10,
      'marker detail fades from10 to18px/m'
    );
    assert(
      Math.abs(Number(h.svg._style['--rubber-detail-opacity']) - rubber) < 1e-10,
      'rubber detail fades independently from180 to480px/m'
    );
    assert.equal(h.svg.classList.contains('marker-detail'), scale > 10);
    assert.equal(h.svg.classList.contains('rubber-detail'), scale > 180);
    checks += 4;
  }
  h.clear();
  const b = h.box();
  h.api.setBox([b[0] - 0.5, b[1] + 0.5, b[2], b[3]]);
  assert.equal(h.stats.styleWrites, 0);
  assert.equal(h.stats.lodWrites, 0);
  assert.equal(h.stats.clientReads, 0);
  checks += 3;
}
console.log(`${checks} camera input checks passed.`);
