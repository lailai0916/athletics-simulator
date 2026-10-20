/* Geometry stays in track metres. The shared clock is converted to each
 * athlete's travelled arc length; lane changes never multiply cruise speed. */
function courseTravelDistance(route, clock) {
  const d = Math.max(0, clock),
    lag = route.launchSetback || 0;
  if (!lag) return d;
  const T = RaceMotion.startDuration + (2 * lag) / RaceMotion.cruiseSpeed;
  // Every runner moves from the same gun. A slightly longer smooth launch
  // establishes clearance before all runners reach the same cruise speed.
  if (d >= RaceMotion.startDistance + 2 * lag) return d - lag;
  const t = RaceMotion.timeAtDistance(d, state.clockFinish),
    u = Math.min(1, t / T);
  return RaceMotion.cruiseSpeed * T * u * u * u * u * (2.5 + u * (-3 + u));
}
function courseParameter(route, clock) {
  return route.measuredMotion.parameterAtDistance(courseTravelDistance(route, clock));
}
function courseReferenceJoins(reference, end) {
  const joins = [
    reference.lineLen,
    reference.arcEndD,
    reference.breakD,
    Number.isFinite(reference.breakD) ? reference.breakD + 18 : NaN,
    reference.tangentD,
  ];
  if (Number.isFinite(reference.entryS) && Number.isFinite(reference.tangentD)) {
    for (let k = -2; k < 4; k++)
      for (const station of [0, PI * R1, PI * R1 + G.straight, 2 * PI * R1 + G.straight]) {
        const d = reference.tangentD + station + k * C1 - reference.entryS;
        if (d > reference.tangentD + 1e-6 && d < end) joins.push(d);
      }
  }
  return joins
    .filter((d) => Number.isFinite(d) && d > 1e-4 && d < end)
    .sort((a, b) => a - b)
    .filter((d, i, a) => !i || d - a[i - 1] > 1e-4);
}
function smoothCourseGeometry(route, end) {
  const e = state.event,
    packed = ['waterfall', 'steeple', 'relay1500'].includes(e.kind),
    reference = packed
      ? state.grouped && route.outer
        ? state.routes[10]
        : state.routes[0]
      : state.routes[0];
  const raw = (u) => routeDisplayPoint(route, Math.max(0, u)),
    patches = [];
  if (packed || e.kind === 'break') {
    const gap = e.kind === 'relay1500' ? 0 : route.index * 0.95,
      b = e.kind === 'break' ? route.breakD : 0,
      span = packed ? packFormationSpan(route) : 120;
    const progress = (u) => Math.max(0, u - gap * mergeC2((u - b) / span));
    const inverse = (s) => {
      let lo = 0,
        hi = end + 20;
      for (let i = 0; i < 52; i++) {
        const m = (lo + hi) / 2;
        if (progress(m) < s) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    };
    const joins = courseReferenceJoins(reference, end + 20)
      .map(inverse)
      .filter((u) => u > 1e-3 && u < Math.min(end, packed ? 185 : b + 165));
    for (let i = 0; i < joins.length; i++) {
      const at = joins[i],
        half = Math.min(
          1.25,
          at * 0.4,
          i ? (at - joins[i - 1]) * 0.4 : Infinity,
          i + 1 < joins.length ? (joins[i + 1] - at) * 0.4 : Infinity
        );
      if (half < 0.001) continue;
      const a = at - half,
        z = at + half,
        H = z - a,
        h = 0.001;
      const jet = (u) => {
        const p = raw(u),
          l = raw(u - h),
          r = raw(u + h);
        return {
          p,
          v: { x: (r.x - l.x) / (2 * h), y: (r.y - l.y) / (2 * h) },
          a: { x: (r.x - 2 * p.x + l.x) / (h * h), y: (r.y - 2 * p.y + l.y) / (h * h) },
        };
      };
      const left = jet(a),
        right = jet(z),
        coefficient = (key) => {
          const c0 = left.p[key],
            c1 = H * left.v[key],
            c2 = 0.5 * H * H * left.a[key],
            D = right.p[key] - c0 - c1 - c2,
            V = H * right.v[key] - c1 - 2 * c2,
            A = H * H * right.a[key] - 2 * c2;
          return [
            c0,
            c1,
            c2,
            10 * D - 4 * V + 0.5 * A,
            -15 * D + 7 * V - A,
            6 * D - 3 * V + 0.5 * A,
          ];
        };
      patches.push({ start: a, end: z, span: H, x: coefficient('x'), y: coefficient('y') });
    }
  }
  const point = (u) => {
    for (const patch of patches)
      if (u >= patch.start && u <= patch.end) {
        const t = (u - patch.start) / patch.span;
        return { x: mergePolynomial(patch.x, t), y: mergePolynomial(patch.y, t) };
      }
    return raw(u);
  };
  route.coursePatches = patches;
  route.coursePoint = (u) => {
    const p = point(u),
      h = 0.0001,
      a = point(Math.max(0, u - h)),
      b = point(u + h),
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy) || 1,
      tx = dx / length,
      ty = dy / length;
    return { ...p, tx, ty, nx: -ty, ny: tx };
  };
  return point;
}
function prepareCourseMotion() {
  const e = state.event,
    packed = ['waterfall', 'steeple', 'relay1500'].includes(e.kind);
  for (const route of state.routes) {
    const entire = ['lanes', 'relay100', 'relay200'].includes(e.kind),
      prefixEnd = entire
        ? e.distance + 96
        : e.kind === 'straight'
          ? 0
          : e.kind === 'steeple'
            ? SC_PRE + (state.routes.length - 1) * 0.95 + 2
            : packed
              ? 240
              : Math.max(0, route.breakD) + 210;
    const point = smoothCourseGeometry(route, prefixEnd);
    const splits = route.coursePatches.flatMap((p) => [p.start, p.end]);
    if (Number.isFinite(route.breakD))
      splits.push(
        route.breakD,
        route.breakD + 18,
        route.breakD + 35,
        route.breakD + 40,
        route.breakD + 120,
        route.breakD + 160
      );
    route.measuredMotion = createMeasuredMotion(point, {
      prefixEnd,
      periodicTail: e.kind === 'steeple' ? SC_LAP : 0,
      splits,
    });
    // Locate the final forward crossing in the geometry, including the standard
    // survey's rounded 400 m circumference. Do not stop at a nominal parameter.
    const nominal =
      e.distance + (['break', 'waterfall', 'steeple'].includes(e.kind) ? route.index * 0.95 : 0);
    let lo = nominal - 4,
      hi = nominal + 4;
    const crosses = (d) => {
      const p = point(d);
      return p.x >= G.right && p.y > G.cy;
    };
    while (crosses(lo)) lo -= 4;
    while (!crosses(hi)) hi += 4;
    for (let i = 0; i < 55; i++) {
      const m = (lo + hi) / 2;
      if (crosses(m)) hi = m;
      else lo = m;
    }
    route.finishParameter = (lo + hi) / 2;
    route.courseDistance = route.measuredMotion.distanceAtParameter(route.finishParameter);
    route.launchSetback = 0;
  }
  // Individual smooth starts retain room in the common corridor. After launch,
  // every athlete travels exactly one metre for each shared cruise-clock metre.
  const shared = packed || ['break', 'relay400', 'relay800'].includes(e.kind),
    // Individual pack tokens are 0.42 m across; 0.12 m of extra clearance
    // avoids imposing the wider relay formation on the smaller shared field.
    finishSpacing = ['waterfall', 'steeple'].includes(e.kind) ? 0.54 : 0.7;
  let previous = -Infinity;
  for (const route of state.routes) {
    if (shared) route.launchSetback = Math.max(0, previous + finishSpacing - route.courseDistance);
    route.finishDistance = route.courseDistance + route.launchSetback;
    previous = route.finishDistance;
  }
  state.clockFinish = Math.max(...state.routes.map((route) => route.finishDistance));
}
