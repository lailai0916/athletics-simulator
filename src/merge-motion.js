/* Display-only post-break merge. Ground paint, race distance, start stagger,
 * route.breakD, and the original route.position are never changed.
 * Integrate inside the app IIFE before displayedPoint, then replace only:
 *   let p=route.position(Math.max(0,d-gap));
 * with:
 *   let p=mergeDisplayPoint(route,Math.max(0,d-gap));
 * The 18m transition is a presentation choice, not a prescribed race rule.
 */
const mergeDisplayPlans = new WeakMap();
function mergeDisplayPlan(route, span = 18) {
  const cached = mergeDisplayPlans.get(route);
  if (cached && cached.span === span) return cached;
  const b = route.breakD;
  if (!route.breakPoint || !Number.isFinite(b) || b <= 0) return null;
  const p = route.position(b),
    end = route.position(b + span),
    before = route.position(b - 1e-6);
  const incoming = Number.isFinite(before.tx)
    ? { x: before.tx, y: before.ty }
    : { x: p.x - before.x, y: p.y - before.y };
  const inLen = Math.hypot(incoming.x, incoming.y) || 1,
    outLen = Math.hypot(end.tx ?? 0, end.ty ?? 0) || 1;
  const u = { x: incoming.x / inLen, y: incoming.y / inLen },
    v = { x: (end.tx ?? 0) / outLen, y: (end.ty ?? 0) / outLen };
  // Lane 1 continues straight. Avoid adding a numerical curve to an already
  // identical direction, including the tiny roundoff at its bend tangent.
  if (Math.hypot(u.x - v.x, u.y - v.y) < 1e-7) return null;
  const coefficient = (start, finish, vin, vout) => {
    const D = finish - start,
      U = span * vin,
      V = span * vout;
    return [start, U, 0, 10 * D - 6 * U - 4 * V, -15 * D + 8 * U + 7 * V, 6 * D - 3 * U - 3 * V];
  };
  const plan = {
    span,
    start: b,
    end: b + span,
    x: coefficient(p.x, end.x, u.x, v.x),
    y: coefficient(p.y, end.y, u.y, v.y),
  };
  mergeDisplayPlans.set(route, plan);
  return plan;
}
function mergePolynomial(c, t) {
  return ((((c[5] * t + c[4]) * t + c[3]) * t + c[2]) * t + c[1]) * t + c[0];
}
function mergePolynomialVelocity(c, t, span) {
  return ((((5 * c[5] * t + 4 * c[4]) * t + 3 * c[3]) * t + 2 * c[2]) * t + c[1]) / span;
}
function mergePolynomialAcceleration(c, t, span) {
  return (((20 * c[5] * t + 12 * c[4]) * t + 6 * c[3]) * t + 2 * c[2]) / (span * span);
}
function mergeDisplayPoint(route, d, span = 18) {
  if (
    !Number.isFinite(route.breakD) ||
    d < route.breakD ||
    d >= route.breakD + span ||
    !route.breakPoint
  )
    return route.position(d);
  const plan = mergeDisplayPlan(route, span);
  if (!plan) return route.position(d);
  const t = (d - plan.start) / span,
    vx = mergePolynomialVelocity(plan.x, t, span),
    vy = mergePolynomialVelocity(plan.y, t, span),
    speed = Math.hypot(vx, vy) || 1,
    tx = vx / speed,
    ty = vy / speed;
  return { x: mergePolynomial(plan.x, t), y: mergePolynomial(plan.y, t), tx, ty, nx: -ty, ny: tx };
}

/* A quintic fade for the visual lane-centre release is optional but keeps that
 * separate offset C2 as well. Replace only its existing cubic smooth(...) call:
 *   1-mergeC2((d-route.breakD)/35)
 * Other race timing, speed controls and user-authored animation are unchanged.
 */
function mergeC2(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * t * (10 + t * (-15 + 6 * t));
}
