'use strict';
const assert = require('node:assert/strict');
const harness = require('./helpers/app-harness.cjs');
const { tokenPoint, visibleToken } = require('./helpers/follow-target.cjs');
let checks = 0,
  maxPixelError = 0;
function centred(h, label, width = 1280, height = 720) {
  const box = h.box(),
    point = tokenPoint(h),
    scale = Math.min(width / box[2], height / box[3]),
    error = Math.hypot(point.x - box[0] - box[2] / 2, point.y - box[1] - box[3] / 2) * scale;
  maxPixelError = Math.max(maxPixelError, error);
  assert(error < 0.01, `${label}: painted athlete is ${error} screen pixels off centre`);
  assert.equal(h.api.state.view, 'follow', label + ': following remains active');
  assert.equal(
    visibleToken(h).getAttribute('aria-pressed'),
    'true',
    label + ': target is selected'
  );
  checks++;
}
function maximumZoom(h) {
  h.api.zoom(1e12);
  h.flush();
  assert(
    h.box()[2] <= 0.100000001 || h.box()[3] <= 0.050000001,
    'test reaches the production zoom limit'
  );
}
function seek(h, distance) {
  const slider = h.nodes.get('timeline');
  slider.value = String(distance);
  slider.dispatch('input', { target: slider });
}
// This guard fails by thousands of pixels when the camera follows the hidden
// grip/baton proxy instead of the visible athlete circle.
{
  const h = harness();
  h.api.selectTeam(2);
  maximumZoom(h);
  centred(h, 'relay body versus hidden baton proxy');
}
const h = harness();
for (const event of h.events) {
  h.api.changeEvent(event.id);
  for (const index of [0, Math.min(7, h.api.state.runners.length - 1)]) {
    h.api.state.distance = 0;
    h.api.state.view = 'manual';
    h.api.setBox([10, 10, 64, 36]);
    h.api.selectTeam(index);
    centred(h, event.id + ' selection ' + index);
    maximumZoom(h);
    centred(h, event.id + ' maximum zoom ' + index);
    for (const distance of [0.001, event.distance * 0.43, event.distance, event.distance + 8]) {
      seek(h, distance);
      centred(h, event.id + ' seek ' + distance + '/' + index);
    }
    // Recentring must use the newest position while retaining unpainted zoom.
    h.svg.dispatch('wheel', { clientX: 100, clientY: 650, deltaY: 90 });
    seek(h, event.distance * 0.21);
    h.flush();
    centred(h, event.id + ' pending wheel and seek ' + index);
    h.api.togglePlay();
    h.flush(1000);
    h.flush(1100);
    centred(h, event.id + ' playback ' + index);
    h.api.togglePlay();
  }
}
// Locate each physical handover in clock distance, then independently compare
// the rendered active token with the camera on both sides of that change.
for (const event of h.events.filter((e) => e.kind.startsWith('relay'))) {
  h.api.changeEvent(event.id);
  h.api.selectTeam(2);
  maximumZoom(h);
  const route = h.api.state.routes[2],
    unit = h.api.state.runners[2].model.config.unit;
  function clockAt(parameter) {
    let lo = 0,
      hi = h.api.raceEndDistance();
    for (let i = 0; i < 55; i++) {
      const mid = (lo + hi) / 2;
      if (h.api.courseParameter(route, mid) < parameter) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const legs = new Set();
  for (let leg = 1; leg <= 4; leg++) {
    seek(h, clockAt((leg - 0.5) * unit));
    legs.add(Number(visibleToken(h).dataset.leg));
    centred(h, event.id + ' visible leg ' + leg);
    if (leg === 4) continue;
    for (const delta of [-0.001, -0.000001, 0.000001, 0.001]) {
      seek(h, clockAt(leg * unit + delta));
      centred(h, event.id + ' handover ' + leg + '/' + delta);
    }
  }
  assert.deepEqual([...legs], [1, 2, 3, 4], event.id + ' follows all four visible holders');
}
for (const [width, height] of [
  [390, 740],
  [2560, 800],
]) {
  const h = harness(width, height);
  h.api.selectTeam(2);
  maximumZoom(h);
  centred(h, width + '×' + height + ' deep zoom', width, height);
  seek(h, 420);
  centred(h, width + '×' + height + ' after handover', width, height);
}
console.log(JSON.stringify({ checks, maxPixelError, tolerancePixels: 0.01 }));
