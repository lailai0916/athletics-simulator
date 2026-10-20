'use strict';
const assert = require('node:assert/strict');
const harness = require('./helpers/app-harness.cjs');
const { tokenPoint } = require('./helpers/follow-target.cjs');
let checks = 0;
function near(actual, expected, message, tolerance = 1e-8) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
  checks++;
}
function centre(box) {
  return [box[0] + box[2] / 2, box[1] + box[3] / 2];
}
function sameCentre(actual, expected, width, height, message) {
  const a = centre(actual),
    b = centre(expected),
    pixelsPerMetre = Math.min(width / actual[2], height / actual[3]);
  near((a[0] - b[0]) * pixelsPerMetre, 0, message + ' horizontal centre (px)', 1e-6);
  near((a[1] - b[1]) * pixelsPerMetre, 0, message + ' vertical centre (px)', 1e-6);
}
function validBox(box, width, height, message) {
  near(box[2] / box[3], width / height, message + ' aspect ratio');
  assert(box[2] >= 0.1 - 1e-10 && box[3] >= 0.05 - 1e-10, message + ' zoom-in bounds');
  assert(box[2] <= 1e5 + 1e-8 && box[3] <= 1e6 + 1e-8, message + ' zoom-out bounds');
  checks += 2;
}
function pixelAt(point, box, width, height) {
  const scale = Math.min(width / box[2], height / box[3]);
  return [
    40 + (width - box[2] * scale) / 2 + (point[0] - box[0]) * scale,
    25 + (height - box[3] * scale) / 2 + (point[1] - box[1]) * scale,
  ];
}

// Resizing a highly magnified camera must not stretch the view or displace its
// centre when one dimension reaches a limit. A subsequent inward wheel gesture
// must never enlarge the view because resize and wheel disagree on that limit.
for (const origin of ['manual', 'follow'])
  for (const [width, height] of [
    [390, 740],
    [320, 900],
    [3000, 300],
    [128, 1400],
  ])
    for (const limit of ['in', 'out']) {
      const h = harness();
      if (origin === 'follow') h.api.selectTeam(2);
      else h.api.state.view = 'manual';
      h.api.zoom(limit === 'in' ? 1e12 : 1e-12);
      h.flush();
      const before = h.box(),
        label = `${origin} ${limit} ${width}x${height}`;
      h.resize(width, height);
      const resized = h.box();
      validBox(resized, width, height, label);
      sameCentre(resized, before, width, height, label);
      assert.equal(h.api.state.view, origin, label + ' retains mode');
      if (origin === 'follow') {
        const point = tokenPoint(h),
          c = centre(resized);
        near(c[0], point.x, label + ' follows actual token centre x');
        near(c[1], point.y, label + ' follows actual token centre y');
      }
      h.api.zoom(limit === 'in' ? 1.001 : 0.999);
      h.flush();
      const zoomed = h.box();
      validBox(zoomed, width, height, label + ' next wheel');
      assert(
        limit === 'in' ? zoomed[2] <= resized[2] + 1e-10 : zoomed[2] >= resized[2] - 1e-8,
        label + ' next wheel cannot jump in the opposite direction'
      );
      sameCentre(zoomed, resized, width, height, label + ' centred wheel');
      h.clear();
      h.resize(width, height);
      assert.deepEqual(h.box(), zoomed, label + ' same-size resize is exact');
      assert.equal(h.stats.viewBoxWrites, 0, label + ' same-size resize does not repaint');
      checks += 4;
    }

// Consume the latest pending wheel before resize and discard its stale paint
// callback. Keep the target centred whether the race or camera RAF runs first.
for (const order of ['playback-first', 'camera-first']) {
  const h = harness();
  h.api.selectTeam(2);
  h.api.togglePlay();
  h.flush(1000);
  h.api.zoom(1e12);
  h.resize(320, 900);
  const resized = h.box();
  h.api.zoom(0.9);
  assert.equal(h.frames.size, 2, order + ' exercises queued race and camera callbacks');
  if (order === 'camera-first') {
    const frames = [...h.frames.entries()].reverse();
    h.frames.clear();
    for (const [id, callback] of frames) h.frames.set(id, callback);
  }
  h.flush(1100);
  const point = tokenPoint(h),
    box = h.box();
  validBox(box, 320, 900, order + ' pending wheel resize');
  near(box[2], resized[2] / 0.9, order + ' newest wheel uses resized width');
  near(box[3], resized[3] / 0.9, order + ' newest wheel uses resized height');
  near(centre(box)[0], point.x, order + ' playback keeps actual token centred x');
  near(centre(box)[1], point.y, order + ' playback keeps actual token centred y');
  assert.equal(h.api.state.view, 'follow');
  assert.equal(h.api.state.selected, 2);
  checks += 2;
}

// The pointer anchor is measured using SVG's centred meet transform, including
// letterboxing. Repeated wheel events are compared with world-to-pixel geometry,
// rather than another copy of the application's zoom formula.
for (const [width, height] of [
  [1280, 720],
  [320, 900],
  [3000, 300],
]) {
  const h = harness(width, height),
    point = [35.05, 42.025];
  h.api.state.view = 'manual';
  h.api.setBox([35, 42, 0.3, 0.3]);
  const pixel = pixelAt(point, h.box(), width, height);
  for (let i = 0; i < 12; i++) {
    h.svg.dispatch('wheel', { clientX: pixel[0], clientY: pixel[1], deltaY: -600 });
    h.flush();
    const after = pixelAt(point, h.box(), width, height);
    near(after[0], pixel[0], 'pointer anchor remains fixed horizontally at zoom limit', 1e-6);
    near(after[1], pixel[1], 'pointer anchor remains fixed vertically at zoom limit', 1e-6);
  }
}

// A drag armed before an extreme resize must use the newly bounded camera
// scale; releasing it through any fallback must not cause a later hover to pan.
for (const release of ['blur', 'buttons', 'capture', 'hidden']) {
  const h = harness();
  h.api.selectTeam(2);
  h.api.zoom(1e12);
  h.svg.dispatch('pointerdown', { clientX: 250, clientY: 200 });
  h.resize(320, 900);
  const before = h.box(),
    scale = Math.max(before[2] / 320, before[3] / 900);
  h.svg.dispatch('pointermove', { clientX: 270, clientY: 230 });
  if (release === 'blur') h.windowDispatch('blur');
  else if (release === 'buttons')
    h.svg.dispatch('pointermove', { clientX: 270, clientY: 230, buttons: 0 });
  else if (release === 'capture') h.svg.dispatch('lostpointercapture');
  else h.setHidden(true);
  h.flush();
  const panned = h.box();
  near(panned[0], before[0] - 20 * scale, release + ' resized drag scale x');
  near(panned[1], before[1] - 30 * scale, release + ' resized drag scale y');
  validBox(panned, 320, 900, release + ' drag keeps bounded camera');
  assert.equal(h.api.state.selected, -1, release + ' real drag clears selected token');
  assert.equal(h.api.state.view, 'manual', release + ' real drag clears follow');
  h.svg.dispatch('pointermove', { clientX: 800, clientY: 500, buttons: 1 });
  h.flush();
  assert.deepEqual(h.box(), panned, release + ' released drag cannot resume from hover');
  checks += 3;
}
console.log(`${checks} camera boundary and input continuity checks passed.`);
