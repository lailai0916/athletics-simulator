'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
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
const source = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.ExtendedQA={state,createRoutes,displayedPoint,centerLane,raceEndDistance};\n'
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source, ctx);
const M = ctx.window.TrackMath,
  events = ctx.window.TrackApp.events,
  R = ctx.RelayMotion;
const harness = require('./helpers/app-harness.cjs');
const added = ['300', '1000', '2000', '3000', 'mile', '4x200', '4x800', '4x1500'],
  gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  finish = M.trackPoint(0);
let checks = 0,
  maxFinishError = 0,
  minSeparation = Infinity;
for (const id of added) {
  const e = events.find((e) => e.id === id);
  assert(e, id + ' present in picker catalog');
  checks++;
  const h = harness(),
    Q = h.api;
  Q.changeEvent(id);
  const relay = e.kind.startsWith('relay'),
    shared = relay ? R.configFor(e.kind).sharedTrack : e.kind === 'waterfall';
  assert.equal(Q.state.routes.length, relay || id === '300' ? 8 : 12);
  checks++;
  assert.equal(e.blocks, id === '300' || id === '4x200');
  checks++;
  if (relay) {
    assert.equal(R.configFor(e.kind).total, e.distance);
    checks++;
  }
  const models = relay ? Q.state.runners.map((runner) => runner.model) : null;
  const point = (i, d) =>
    models
      ? models[i].sample(d).athletes[models[i].sample(d).activeLeg - 1]
      : Q.displayedPoint(Q.state.routes[i], d);
  const clearance = relay ? 0.58 : 0.46;
  for (let i = 0; i < Q.state.routes.length; i++) {
    const route = Q.state.routes[i],
      end = route.position(e.distance),
      expected = shared ? finish : M.trackPoint(0, route.lane),
      error = gap(end, expected);
    maxFinishError = Math.max(maxFinishError, error);
    assert(
      error < 0.06,
      id + ' exact route ends on common finish within rounded construction tolerance'
    );
    checks++;
    for (const d of [0, 0.001, 20, 100, e.distance / 2, e.distance - 1, e.distance]) {
      const p = route.position(d);
      assert([p.x, p.y, p.tx, p.ty].every(Number.isFinite), id + ' finite flow and position');
      assert(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-8, id + ' measured route unit tangent');
      checks += 2;
    }
    if (id === '300' || id === '4x200') {
      assert.equal(route.breakD, Infinity, id + ' stays in its lane');
      checks++;
      // Recover travelled metres from the unwrapped track station, independently
      // of the screen path or a hard-coded stagger table.
      assert(
        Math.abs(route.startS + e.distance - M.circuit(route.lane) * Math.ceil(e.distance / 400)) <
          1e-9
      );
      checks++;
    }
    if (id === '4x800') {
      const standalone = M.normalRoute(
        events.find((e) => e.id === '800'),
        route.lane
      );
      assert(gap(route.start, standalone.start) < 1e-10);
      assert(Math.abs(route.breakD - standalone.breakD) < 1e-10);
      checks += 2;
      // Preserve the legal first-bend lane constraint in physical space. The
      // running clock is no longer the route's original nominal parameter.
      const legalEnd = route.measuredMotion.distanceAtParameter(route.breakD) + route.launchSetback;
      for (let d = 0; d < legalEnd; d += 0.5) {
        const p = point(route.index, d),
          r = Math.hypot(p.x - M.geometry.right, p.y - M.geometry.cy),
          inner = M.geometry.r + (route.lane - 1) * M.geometry.w,
          outer = inner + M.geometry.w;
        assert(
          r >= inner - 0.0001 && r <= outer + 0.0001,
          '4x800 holds original lane through opening bend'
        );
        checks++;
      }
    }
  }
  // Check actual displayed opening formation and handover approach for every
  // team, with no random clock or browser frame timing dependency.
  const times = new Set([
    ...Array.from({ length: 401 }, (_, i) => i * 0.5),
    e.distance - 80,
    e.distance,
    Q.raceEndDistance(),
  ]);
  if (relay)
    for (const h of [e.relayUnit, e.relayUnit * 2, e.relayUnit * 3])
      for (let d = h - 25; d <= h + 35; d += 0.25) times.add(d);
  for (const d of times) {
    const points = Q.state.routes.map((_, i) => point(i, d));
    for (let i = 0; i < points.length; i++) {
      assert(
        Number.isFinite(points[i].x) && Number.isFinite(points[i].y),
        id + ' finite visual sample'
      );
      checks++;
      for (let j = i + 1; j < points.length; j++) {
        const separation = gap(points[i], points[j]);
        minSeparation = Math.min(minSeparation, separation);
        assert(
          separation >= clearance,
          id + ' active competitors retain visible clearance at ' + d + 'm: ' + separation
        );
        checks++;
      }
    }
  }
  const crossings = Q.state.routes.map((route) => route.courseDistance + route.launchSetback),
    lastCrossing = Math.max(...crossings);
  assert(crossings.every(Number.isFinite), id + ' every competitor has a measured crossing');
  checks++;
  for (let i = 0; i < Q.state.routes.length; i++) {
    const actual = point(i, crossings[i]);
    assert(
      Math.abs(actual.x - M.geometry.right) < 0.0001,
      id + ' athlete ' + (i + 1) + ' reaches the painted finish at its actual crossing'
    );
    checks++;
  }
  if (shared) {
    assert(Math.abs(Q.raceEndDistance() - lastCrossing - ctx.RaceMotion.runOutDistance) < 1e-9);
    checks++;
    const firstIndex = crossings.indexOf(Math.min(...crossings)),
      commonFinish = point(firstIndex, crossings[firstIndex]);
    for (let i = 0; i < Q.state.routes.length; i++) {
      const actual = point(i, crossings[i]);
      assert(gap(commonFinish, actual) < 0.0001, id + ' no return to original lane at finish');
      checks++;
    }
  }
}
const mile = events.find((e) => e.id === 'mile'),
  mileRoute = M.normalRoute(mile, 1);
assert.equal(mile.distance, 1609.344);
assert(
  Math.abs(M.geometry.right - mileRoute.start.x - 9.344) < 1e-9,
  'mile begins 9.344 m before finish on inner measuring line'
);
checks += 2;
const long = events.find((e) => e.id === '4x1500'),
  longRoute = M.normalRoute(long, 1);
assert(gap(longRoute.start, finish) < 1e-9, '4x1500 starts at finish, not 1500 start');
checks++;
const stations = [1500, 3000, 4500].map((d) => longRoute.position(d));
for (let i = 0; i < 3; i++)
  for (let j = i + 1; j < 3; j++) {
    assert(gap(stations[i], stations[j]) > 50, '4x1500 handovers occupy distinct stations');
    checks++;
  }
console.log(JSON.stringify({ checks, events: added, maxFinishError, minSeparation }, null, 2));
