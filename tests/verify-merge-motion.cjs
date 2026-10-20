const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
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
let app = require('./helpers/load-app.cjs').withBootstrap('\n');
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
vm.runInContext(
  require('./helpers/source.cjs').readSource('merge-motion.js') +
    '\nwindow.MergeMotion={point:mergeDisplayPoint,plan:mergeDisplayPlan,value:mergePolynomial,velocity:mergePolynomialVelocity,acceleration:mergePolynomialAcceleration};',
  ctx
);
const M = ctx.window.TrackMath,
  E = ctx.window.TrackApp.events,
  Q = ctx.window.MergeMotion,
  g = M.geometry;
let checks = 0,
  maxSpeedDelta = 0,
  maxAddedLateral = 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const routes = [];
for (const id of ['800', '4x400'])
  for (let lane = 1; lane <= 8; lane++)
    routes.push({
      id,
      lane,
      route: M.normalRoute(
        E.find((e) => e.id === id),
        lane
      ),
      total: E.find((e) => e.id === id).distance,
    });
for (const id of ['5000', '10000'])
  for (let lane = 5; lane <= 8; lane++)
    routes.push({
      id,
      lane,
      route: M.outerGroupRoute(
        E.find((e) => e.id === id),
        lane
      ),
      total: E.find((e) => e.id === id).distance,
    });
for (const { id, lane, route, total } of routes) {
  const b = route.breakD,
    plan = Q.plan(route);
  for (const d of [0, b - 18, b - 1, b - 0.001, b + 18, b + 19, total]) {
    assert.deepEqual(
      Q.point(route, d),
      route.position(d),
      `${id} lane${lane}: exact original geometry outside merge`
    );
    checks++;
  }
  assert(distance(Q.point(route, b), route.position(b)) < 1e-12, 'exact break position');
  checks++;
  if (!plan) continue;
  const before = route.position(b - 1e-6),
    end = route.position(b + 18),
    bp = route.position(b);
  if (!Number.isFinite(before.tx)) {
    const dx = bp.x - before.x,
      dy = bp.y - before.y,
      len = Math.hypot(dx, dy);
    before.tx = dx / len;
    before.ty = dy / len;
  }
  for (const [t, point, tangent] of [
    [0, route.position(b), before],
    [1, end, end],
  ]) {
    const p = { x: Q.value(plan.x, t), y: Q.value(plan.y, t) },
      v = { x: Q.velocity(plan.x, t, 18), y: Q.velocity(plan.y, t, 18) },
      a = { x: Q.acceleration(plan.x, t, 18), y: Q.acceleration(plan.y, t, 18) };
    assert(distance(p, point) < 1e-10, 'C0 exact position join');
    assert(
      distance(v, { x: tangent.tx, y: tangent.ty }) < 1e-8,
      `${id} lane${lane} t${t}: C1 exact velocity join ${JSON.stringify(v)} vs ${JSON.stringify(tangent)}`
    );
    assert(Math.hypot(a.x, a.y) < 1e-10, 'C2 zero acceleration join');
    checks += 3;
  }
  const side = before.tx < 0 ? -1 : 1,
    p0 = route.position(b);
  for (let j = 1; j < 1800; j++) {
    const d = b + j / 100,
      p = Q.point(route, d),
      raw = route.position(d),
      t = (d - b) / 18;
    assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'finite point');
    assert(Math.abs(Math.hypot(p.tx, p.ty) - 1) < 1e-12, 'physical direction is unit length');
    assert(
      (p.x - p0.x) * side >= -1e-10,
      'post-break transition cannot move backwards before break'
    );
    // At the start of a top or bottom straight, inward is toward centre cy.
    assert(Math.abs(p.y - g.cy) <= Math.abs(p0.y - g.cy) + 1e-10, 'no outward excursion');
    assert(Math.abs(p.y - g.cy) >= g.r + 0.2 - 1e-8, 'stays outside inner kerb');
    const vx = Q.velocity(plan.x, t, 18),
      vy = Q.velocity(plan.y, t, 18);
    maxSpeedDelta = Math.max(maxSpeedDelta, Math.abs(Math.hypot(vx, vy) - 1));
    maxAddedLateral = Math.max(maxAddedLateral, distance(p, raw));
    checks += 5;
  }
  // Each returned tx/ty must match the derivative of the positions, not a stale
  // direction borrowed from the unsmoothed tangent line.
  for (const t of [0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999]) {
    const d = b + 18 * t,
      h = 1e-5,
      p = Q.point(route, d),
      a = Q.point(route, d - h),
      z = Q.point(route, d + h),
      dx = (z.x - a.x) / (2 * h),
      dy = (z.y - a.y) / (2 * h),
      len = Math.hypot(dx, dy);
    assert(
      Math.hypot(p.tx - dx / len, p.ty - dy / len) < 1e-7,
      'reported tangent follows actual curve'
    );
    checks++;
  }
}
console.log(
  `${checks} merge-motion checks passed across ${routes.length} routes; max local speed deviation ${(maxSpeedDelta * 100).toFixed(4)}%; max displacement from shortest tangent ${(maxAddedLateral * 100).toFixed(2)}cm.`
);
