const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ctx = {
  window: {},
  document: { getElementById: () => ({}) },
  localStorage: { getItem: () => null },
  console,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
};
vm.createContext(ctx);
const app = require('./helpers/load-app.cjs').withBootstrap('\n');
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
const M = ctx.window.TrackMath,
  events = ctx.window.TrackApp.events,
  g = M.geometry,
  finish = { x: g.right, y: g.cy + M.rho(1) };
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let checks = 0;
assert.equal(events.length, 21);
assert.equal(
  events.reduce((n, e) => n + e.genders.length, 0),
  40
);
checks += 2;
assert.equal(M.rho(1), 36.8);
assert(Math.abs(M.circuit(1) - 400) < 0.002);
checks += 2;
for (const e of events) {
  for (let lane = 1; lane <= 8; lane++) {
    const route = M.normalRoute(e, lane);
    for (const d of [0, e.distance * 0.1, e.distance * 0.3, e.distance * 0.6, e.distance]) {
      const p = route.position(d);
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), e.id + ' finite coordinates');
      checks++;
      assert(p.x >= 7 && p.x <= 190 && p.y >= 15 && p.y <= 115, e.id + ' bounds');
      checks++;
    }
    const p = route.position(e.distance);
    const expected = ['straight', 'lanes', 'relay100', 'relay200'].includes(e.kind)
      ? { x: g.right, y: g.cy + M.rho(lane) }
      : finish;
    const distance = gap(p, expected);
    assert(distance < 0.11, `${e.id}, lane ${lane}: endpoint error ${distance}`);
    checks++;
    if (e.kind === 'relay400') {
      const nominal800 = M.normalRoute(
        events.find((x) => x.id === '800'),
        lane
      );
      assert(
        gap(route.position(400), nominal800.start) < 0.004,
        '4x400 first exchange at 800 start'
      );
      checks++;
      assert(route.breakD > 515.5 && route.breakD < 515.7, '4x400 break only after third bend');
      checks++;
    }
    if (e.kind === 'break') {
      assert(route.breakD > 115.5 && route.breakD < 115.7, '800 break only after first bend');
      const before = route.position(route.breakD - 0.1);
      assert(Math.abs(before.y - (g.cy - M.rho(lane))) < 0.002, 'hold lane before break');
      checks += 2;
    }
  }
}
for (const id of ['5000', '10000'])
  for (const lane of [5, 6, 7, 8]) {
    const e = events.find((x) => x.id === id),
      route = M.outerGroupRoute(e, lane);
    for (let d = 0; d < route.breakD - 0.01; d += 0.5) {
      const p = route.position(d),
        cx = id === '5000' ? g.left : g.right;
      assert(
        Math.hypot(p.x - cx, p.y - g.cy) >= g.r + 4 * g.w - 0.01,
        'outer group stays outside lane5 inner edge'
      );
      checks++;
    }
    const p = route.position(e.distance);
    assert(gap(p, finish) < 0.12, `${id} outer group lane ${lane} endpoint ${gap(p, finish)}`);
    checks++;
  }
assert(Math.abs(M.scPre + 7 * M.scLap - 3000) < 1e-9);
assert(gap(M.scPoint(0), M.scPoint(M.scLap)) < 0.001);
checks += 2;
for (const e of events.filter((e) => e.kind === 'waterfall' || e.kind === 'steeple'))
  for (let i = 0; i < 12; i++) {
    const lane = 1 + (i * 6.7) / 11,
      route = M.waterfallRoute(e, lane);
    assert(
      gap(route.position(e.distance), finish) < 0.11,
      e.id + ' fractional start-position endpoint'
    );
    checks++;
  }
assert.deepEqual(
  Array.from(M.staggers.relay400),
  [0, 10.563, 22.086, 33.627, 45.185, 56.76, 68.352, 79.96]
);
checks++;
console.log(
  `${checks} geometry and rules checks passed; ${events.length} scenes / ${events.reduce((n, e) => n + e.genders.length, 0)} event variants.`
);
