'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  { performance } = require('node:perf_hooks');
const { createMeasuredMotion } = require('../src/measured-motion.js');
let checks = 0;
function near(a, b, eps, message) {
  assert(Math.abs(a - b) <= eps, `${message}: ${a} vs ${b}`);
  checks++;
}
function unitSpeed(plan, limit, step = 0.017) {
  let maximum = 0,
    at = 0;
  for (let s = 0.0007; s < limit; s += step) {
    const h = 1e-4,
      a = plan.pointAtDistance(Math.max(0, s - h)),
      b = plan.pointAtDistance(s + h),
      speed = Math.hypot(b.x - a.x, b.y - a.y) / (s < h ? s + h : 2 * h);
    if (Math.abs(speed - 1) > maximum) {
      maximum = Math.abs(speed - 1);
      at = s;
    }
  }
  near(maximum, 0, 1e-4, 'actual distance parameter has unit speed at ' + at);
  return maximum;
}
{
  const curve = (u) => ({ x: 120 + u + 0.4 * Math.sin(u), y: 63, tx: 0, ty: 1 }),
    plan = createMeasuredMotion(curve, { prefixEnd: 2 * Math.PI, splits: [Math.PI] });
  near(plan.prefixDistance, 2 * Math.PI, 1e-9, 'nonlinear straight integrates exact distance');
  for (let u = 0; u < 2 * Math.PI; u += 0.031) {
    near(plan.distanceAtParameter(u), u + 0.4 * Math.sin(u), 2e-8, 'nonlinear straight arc map');
    near(
      plan.parameterAtDistance(plan.distanceAtParameter(u)),
      u,
      2e-9,
      'forward/inverse map round trip'
    );
  }
  unitSpeed(plan, plan.prefixDistance);
  const p = plan.pointAtDistance(2);
  near(p.tx, 1, 1e-10, 'tangent comes from actual geometry');
  near(p.ty, 0, 1e-10, 'ignores incorrect supplied tangent');
}
{
  const r = 36.8,
    curve = (u) => ({ x: 55 + r * Math.cos(u / r), y: 66 + r * Math.sin(u / r) }),
    plan = createMeasuredMotion(curve, { prefixEnd: 180 });
  near(plan.prefixDistance, 180, 1e-8, 'circular arc length');
  unitSpeed(plan, 180, 0.031);
  for (let s = 180; s < 220; s += 0.37)
    near(plan.parameterAtDistance(s), s, 1e-8, 'unit-speed tail is an exact affine extension');
}
for (const split of [false, true]) {
  const seam = 9.386487123,
    curve = (u) => ({ x: u <= seam ? u : seam + 1.22 * (u - seam), y: 2 });
  const plan = createMeasuredMotion(curve, {
    prefixEnd: 17,
    maxDepth: 32,
    splits: split ? [seam] : [],
  });
  near(plan.prefixDistance, seam + 1.22 * (17 - seam), 2e-7, 'speed discontinuity arc length');
  unitSpeed(plan, plan.prefixDistance, 0.00391);
  for (const u of [seam - 0.001, seam - 0.0001, seam + 0.0001, seam + 0.001]) {
    const s = plan.distanceAtParameter(u);
    near(
      plan.pointAtDistance(s).x,
      s,
      2e-7,
      'speed discontinuity does not change metre progression'
    );
  }
}
{
  const plan = createMeasuredMotion((u) => ({ x: u, y: 0 }), { prefixEnd: 0 });
  near(plan.parameterAtDistance(120), 120, 0, 'empty prefix');
  near(plan.distanceAtParameter(120), 120, 0, 'empty prefix inverse');
  assert.throws(
    () => createMeasuredMotion(() => ({ x: NaN, y: 0 }), { prefixEnd: 10 }),
    /Non-finite/
  );
  checks++;
}
{
  const radius = 2,
    period = 2 * Math.PI,
    angle = (u) => u + 0.2 * Math.sin(u),
    curve = (u) => ({ x: radius * Math.cos(angle(u)), y: radius * Math.sin(angle(u)) });
  const plan = createMeasuredMotion(curve, { prefixEnd: 1.17, periodicTail: period });
  near(
    plan.periodDistance,
    radius * period,
    2e-8,
    'periodic tail records its measured circumference'
  );
  for (let u = 0; u < 100; u += 0.041) {
    near(plan.distanceAtParameter(u), radius * angle(u), 2e-7, 'periodic arc map over many cycles');
    near(
      plan.parameterAtDistance(plan.distanceAtParameter(u)),
      u,
      2e-8,
      'periodic inverse over many cycles'
    );
  }
  unitSpeed(plan, 100, 0.0219);
  assert.throws(
    () => createMeasuredMotion(() => ({ x: 0, y: 0 }), { prefixEnd: 0, periodicTail: 2 }),
    /zero length/
  );
  checks++;
}
// Exercise the real problematic prefix, independently of future app integration.
const context = {
  window: {},
  document: { getElementById: () => ({}) },
  Math,
  console,
  performance,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};
vm.createContext(context);
const app = require('./helpers/load-app.cjs').withBootstrap(
  "\nwindow.MeasuredTest={state,createRoutes,rawDisplayedPoint:typeof routeDisplayPoint==='function'?routeDisplayPoint:typeof rawDisplayedPoint==='function'?rawDisplayedPoint:displayedPoint};\n"
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, context);
const Q = context.window.MeasuredTest,
  results = [];
for (const id of ['mile', '2000', '10000'])
  for (const grouped of id === '10000' ? [false, true] : [false]) {
    Object.assign(Q.state, {
      event: context.window.TrackApp.events.find((e) => e.id === id),
      grouped,
    });
    Q.createRoutes();
    const started = performance.now();
    let maxError = 0,
      tableSize = 0,
      buildMilliseconds = 0;
    for (const route of Q.state.routes) {
      const plan = createMeasuredMotion(
        (d) => (route.coursePoint ? route.coursePoint(d) : Q.rawDisplayedPoint(route, d)),
        {
          prefixEnd: 200,
          maxDepth: 32,
          splits: route.coursePatches?.flatMap((p) => [p.start, p.end]),
        }
      );
      buildMilliseconds += plan.buildMilliseconds;
      try {
        maxError = Math.max(maxError, unitSpeed(plan, 200, 0.01317));
      } catch (error) {
        console.error({
          id,
          grouped,
          index: route.index,
          tableSize: plan.tableSize,
          prefixDistance: plan.prefixDistance,
        });
        throw error;
      }
      tableSize += plan.tableSize;
      near(
        plan.distanceAtParameter(plan.parameterAtDistance(199.376)),
        199.376,
        2e-9,
        'real prefix inverse'
      );
    }
    results.push({
      id,
      grouped,
      milliseconds: performance.now() - started,
      buildMilliseconds,
      productBuildMilliseconds: Q.state.routes.reduce(
        (s, r) => s + r.measuredMotion.buildMilliseconds,
        0
      ),
      maxSpeedError: maxError,
      tableSize,
    });
  }
{
  Object.assign(Q.state, {
    event: context.window.TrackApp.events.find((e) => e.id === '3000sc'),
    grouped: false,
  });
  Q.createRoutes();
  let maxError = 0,
    tableSize = 0,
    buildMilliseconds = 0,
    fullDifference = 0;
  for (const route of Q.state.routes) {
    const point = (d) => route.coursePoint(d),
      prefixEnd = context.window.TrackMath.scPre + (Q.state.routes.length - 1) * 0.95 + 2,
      periodicTail = context.window.TrackMath.scLap;
    const plan = createMeasuredMotion(point, {
      prefixEnd,
      periodicTail,
      splits: route.coursePatches.flatMap((p) => [p.start, p.end]),
    });
    maxError = Math.max(maxError, unitSpeed(plan, 3080, 0.197371));
    tableSize += plan.tableSize;
    buildMilliseconds += plan.buildMilliseconds;
    if (route.index === 0 || route.index === Q.state.routes.length - 1) {
      const full = createMeasuredMotion(point, {
        prefixEnd: 3080,
        splits: route.coursePatches.flatMap((p) => [p.start, p.end]),
      });
      for (let u = 0; u < 3080; u += 0.79173) {
        const delta = Math.abs(full.distanceAtParameter(u) - plan.distanceAtParameter(u));
        fullDifference = Math.max(fullDifference, delta);
        near(delta, 0, 2e-5, 'steeple periodic map agrees with full curve');
      }
    }
  }
  results.push({
    id: '3000sc',
    buildMilliseconds,
    productBuildMilliseconds: Q.state.routes.reduce(
      (s, r) => s + r.measuredMotion.buildMilliseconds,
      0
    ),
    maxSpeedError: maxError,
    tableSize,
    fullDifference,
  });
}
{
  // Compare independent one-sided finite differences on each side of the new
  // quintic joins. The assertion uses positions rather than their supplied frame.
  const jet = (point, u, side, h) => {
    const p = Array.from({ length: 4 }, (_, i) => point(u + side * h * i));
    const first = (key) =>
      (side * (-11 * p[0][key] + 18 * p[1][key] - 9 * p[2][key] + 2 * p[3][key])) / (6 * h);
    const second = (key) => (2 * p[0][key] - 5 * p[1][key] + 4 * p[2][key] - p[3][key]) / (h * h);
    return { v: { x: first('x'), y: first('y') }, a: { x: second('x'), y: second('y') } };
  };
  let maximumFirst = 0,
    maximumSecond = 0,
    seams = 0;
  for (const id of ['mile', '1500']) {
    Object.assign(Q.state, {
      event: context.window.TrackApp.events.find((e) => e.id === id),
      grouped: false,
    });
    Q.createRoutes();
    for (const route of Q.state.routes)
      for (const patch of route.coursePatches)
        for (const at of [patch.start, patch.end]) {
          const point = (u) => route.coursePoint(u),
            left = jet(point, at, -1, 0.002),
            right = jet(point, at, 1, 0.002);
          maximumFirst = Math.max(
            maximumFirst,
            Math.hypot(left.v.x - right.v.x, left.v.y - right.v.y)
          );
          maximumSecond = Math.max(
            maximumSecond,
            Math.hypot(left.a.x - right.a.x, left.a.y - right.a.y)
          );
          seams++;
        }
  }
  assert(seams > 0, 'C2 tests must exercise actual patch seams');
  checks++;
  near(maximumFirst, 0, 1e-7, 'C2 patch first derivative matches');
  near(maximumSecond, 0, 2e-5, 'C2 patch second derivative matches');
  results.push({ id: 'course-C2', seams, maximumFirst, maximumSecond });
}
console.log(JSON.stringify({ checks, results }, null, 2));
