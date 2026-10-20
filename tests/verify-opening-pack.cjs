'use strict';
// Check the visible opening, not just the speed of each measured trajectory.
// These compactness limits describe the equal-cruise demonstration preset;
// they are not race rules or predictions of a real field's tactics.
const vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = {
  window: {},
  document: { getElementById: () => ({}) },
  Math,
  console,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};
vm.createContext(ctx);
vm.runInContext(
  require('./helpers/source.cjs').readSource('track-data.js') +
    '\n' +
    require('./helpers/load-app.cjs').withBootstrap(
      'window.OpeningPackQA={state,createRoutes,displayedPoint};'
    ),
  ctx
);
const Q = ctx.window.OpeningPackQA,
  G = ctx.window.TrackMath.geometry,
  R = G.r + 0.3,
  bend = Math.PI * R,
  lap = 2 * bend + 2 * G.straight;
const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Project onto the surveyed inner running line, independent of route parameters
// and the production arc-length table. Lateral room is not a time deficit.
function station(p) {
  if (p.x >= G.right) return R * Math.atan2(Math.max(0, p.x - G.right), p.y - G.cy);
  if (p.x <= G.left)
    return bend + G.straight + R * Math.atan2(Math.max(0, G.left - p.x), G.cy - p.y);
  return p.y < G.cy ? bend + G.right - p.x : lap - G.right + p.x;
}
function span(points) {
  const origin = station(points[0]),
    positions = points.map((p) => ((station(p) - origin + 1.5 * lap) % lap) - lap / 2);
  return Math.max(...positions) - Math.min(...positions);
}
let checks = 0;
const results = [];
for (const id of ['1000', '1500', 'mile', '2000', '3000', '5000', '10000', '3000sc'])
  for (const grouped of ['5000', '10000'].includes(id) ? [false, true] : [false]) {
    const event = ctx.window.TrackApp.events.find((e) => e.id === id);
    Object.assign(Q.state, { event, grouped });
    Q.createRoutes();
    const limit = grouped ? 8.5 : 6.5,
      crossings = Q.state.routes.map((r) => r.finishDistance),
      finishSpread = Math.max(...crossings) - Math.min(...crossings);
    assert(
      finishSpread <= limit,
      `${id}/${grouped}: no permanent opening penalty (${finishSpread} m)`
    );
    checks++;
    let maxOpeningSpan = 0,
      minClearance = Infinity;
    for (const d of [120, 130, 150, 180, 200, 240, 400]) {
      const points = Q.state.routes.map((r) => Q.displayedPoint(r, d)),
        projectedSpan = span(points);
      // An outer group is still merging after its protected first bend. Judge
      // whole-field compactness once both groups have had room to converge.
      if (!grouped || d >= 200) {
        assert(
          projectedSpan <= limit + 0.15,
          `${id}/${grouped}: compact opening at ${d} m (${projectedSpan} m)`
        );
        maxOpeningSpan = Math.max(maxOpeningSpan, projectedSpan);
        checks++;
      }
    }
    for (let d = 0; d <= 400; d += 0.25) {
      const points = Q.state.routes.map((r) => Q.displayedPoint(r, d));
      for (let i = 0; i < points.length; i++)
        for (let j = 0; j < i; j++)
          minClearance = Math.min(minClearance, separation(points[i], points[j]));
    }
    assert(
      minClearance >= 0.42,
      `${id}/${grouped}: compactness cannot overlap bodies (${minClearance})`
    );
    checks++;
    results.push({ event: id, grouped, finishSpread, maxOpeningSpan, minClearance });
  }
console.log(JSON.stringify({ checks, results }, null, 2));
