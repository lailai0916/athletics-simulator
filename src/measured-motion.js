/* Reparameterise a route by its actual planar arc length. After prefixEnd the
 * route must advance one metre per unit, or repeat with options.periodicTail.
 * Build once per route; playback uses only a binary search and a cubic inverse.
 */
function createMeasuredMotion(point, options = {}) {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prefixEnd = Math.max(0, Number(options.prefixEnd) || 0),
    maxStep = options.maxStep ?? 1;
  const periodicTail = Math.max(0, Number(options.periodicTail) || 0),
    tableEnd = prefixEnd + periodicTail;
  const tolerance = options.tolerance ?? 1e-8,
    speedTolerance = options.speedTolerance ?? 1e-7;
  const minStep = options.minStep ?? 1e-7,
    maxDepth = options.maxDepth ?? 32;
  if (
    !Number.isFinite(prefixEnd) ||
    !Number.isFinite(periodicTail) ||
    !(maxStep > 0) ||
    !(tolerance > 0) ||
    !(speedTolerance > 0)
  )
    throw new RangeError('Invalid measured route precision');
  const segments = [];
  const sample = (u) => {
    const p = point(u);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw new RangeError('Non-finite measured route point');
    return p;
  };
  const chord = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  // The fourth-order position stencil supplies actual speed. A route's own
  // tx/ty may describe its reference lane rather than its offset display path.
  const stencils = [
    [-25 / 3, 16, -12, 16 / 3, -1],
    [-1, -10 / 3, 6, -2, 1 / 3],
    [1 / 3, -8 / 3, 0, 8 / 3, -1 / 3],
    [-1 / 3, 2, -6, 10 / 3, 1],
    [1, -16 / 3, 12, -16, 25 / 3],
  ];
  function speedAt(points, t, span) {
    let dx = 0,
      dy = 0;
    const weights = stencils[Math.round(t * 4)],
      origin = points[0];
    for (let k = 1; k < 5; k++) {
      dx += (points[k].x - origin.x) * weights[k];
      dy += (points[k].y - origin.y) * weights[k];
    }
    return Math.hypot(dx, dy) / span;
  }
  function cubic(length, m0, m1, t) {
    return ((m0 + m1 - 2 * length) * t + (3 * length - 2 * m0 - m1)) * t * t + m0 * t;
  }
  function cubicSpeed(length, m0, m1, t) {
    return (3 * (m0 + m1 - 2 * length) * t + 2 * (3 * length - 2 * m0 - m1)) * t + m0;
  }
  function fit(a, b, points, depth) {
    const span = b - a,
      m = (a + b) / 2;
    const left = [
        points[0],
        sample(a + span / 8),
        points[1],
        sample(a + (3 * span) / 8),
        points[2],
      ],
      right = [
        points[2],
        sample(a + (5 * span) / 8),
        points[3],
        sample(a + (7 * span) / 8),
        points[4],
      ];
    if (span > maxStep) {
      fit(a, m, left, depth + 1);
      fit(m, b, right, depth + 1);
      return;
    }
    const coarse = chord(points[0], points[2]) + chord(points[2], points[4]);
    let fine = 0,
      finer = 0;
    for (let i = 0; i < 4; i++) {
      fine += chord(points[i], points[i + 1]);
      finer += chord(left[i], left[i + 1]) + chord(right[i], right[i + 1]);
    }
    // Two Richardson levels estimate the remaining integration error. This lets
    // a straight or circular metre use one interval without sacrificing speed.
    const fourth = (4 * fine - coarse) / 3,
      eighth = (4 * finer - fine) / 3;
    const length = Math.max(finer, (16 * eighth - fourth) / 15),
      v0 = speedAt(left, 0, span / 2),
      v1 = speedAt(right, 1, span / 2);
    const speeds = [
      speedAt(left, 0.5, span / 2),
      (speedAt(left, 1, span / 2) + speedAt(right, 0, span / 2)) / 2,
      speedAt(right, 0.5, span / 2),
    ];
    let error = 0;
    for (let i = 0; i < 3; i++)
      error = Math.max(
        error,
        Math.abs(cubicSpeed(length, span * v0, span * v1, (i + 1) / 4) / span - speeds[i])
      );
    if (
      (error > speedTolerance || Math.abs(eighth - fourth) / 15 > tolerance * Math.max(1, span)) &&
      span > minStep &&
      depth < maxDepth
    ) {
      fit(a, m, left, depth + 1);
      fit(m, b, right, depth + 1);
      return;
    }
    // Preserve monotonicity even at a cusp or a discontinuous one-sided speed.
    let m0 = span * v0,
      m1 = span * v1;
    if (length === 0) m0 = m1 = 0;
    else {
      const ratio = Math.hypot(m0 / length, m1 / length);
      if (ratio > 3) {
        const scale = 3 / ratio;
        m0 *= scale;
        m1 *= scale;
      }
    }
    segments.push({ a, b, length, m0, m1, start: 0, end: 0 });
  }
  const splits = [
    0,
    ...(options.splits || []).filter((u) => u > 0 && u < tableEnd),
    prefixEnd,
    tableEnd,
  ].sort((a, b) => a - b);
  for (let i = 1; i < splits.length; i++) {
    const a = splits[i - 1],
      b = splits[i];
    if (b <= a) continue;
    fit(
      a,
      b,
      [
        sample(a),
        sample(a + (b - a) / 4),
        sample((a + b) / 2),
        sample(a + (3 * (b - a)) / 4),
        sample(b),
      ],
      0
    );
  }
  let tableDistance = 0;
  for (const segment of segments) {
    segment.start = tableDistance;
    tableDistance += segment.length;
    segment.end = tableDistance;
  }
  function find(value, byDistance) {
    let lo = 0,
      hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (value > (byDistance ? segments[mid].end : segments[mid].b)) lo = mid + 1;
      else hi = mid;
    }
    return segments[lo];
  }
  function tableDistanceAtParameter(u) {
    if (!(u > 0)) return 0;
    if (u >= tableEnd || !segments.length) return tableDistance + u - tableEnd;
    const segment = find(u, false),
      t = (u - segment.a) / (segment.b - segment.a);
    return segment.start + cubic(segment.length, segment.m0, segment.m1, t);
  }
  const prefixDistance = tableDistanceAtParameter(prefixEnd),
    periodDistance = tableDistance - prefixDistance,
    lengthExcess = prefixDistance - prefixEnd;
  if (periodicTail && !(periodDistance > 0))
    throw new RangeError('Periodic measured route has zero length');
  function tableParameterAtDistance(distance) {
    if (!(distance > 0)) return 0;
    if (distance >= tableDistance || !segments.length) return tableEnd + distance - tableDistance;
    const segment = find(distance, true),
      target = distance - segment.start;
    if (!(segment.length > 0)) return segment.a;
    let lo = 0,
      hi = 1,
      t = target / segment.length;
    for (let i = 0; i < 12; i++) {
      const error = cubic(segment.length, segment.m0, segment.m1, t) - target;
      if (Math.abs(error) < 1e-11) break;
      if (error > 0) hi = t;
      else lo = t;
      const derivative = cubicSpeed(segment.length, segment.m0, segment.m1, t),
        next = derivative > 1e-12 ? t - error / derivative : NaN;
      t = next > lo && next < hi ? next : (lo + hi) / 2;
    }
    return segment.a + (segment.b - segment.a) * t;
  }
  function distanceAtParameter(u) {
    if (!periodicTail || u < prefixEnd) return tableDistanceAtParameter(u);
    const offset = u - prefixEnd,
      cycles = Math.floor(offset / periodicTail),
      remainder = offset - cycles * periodicTail;
    return cycles * periodDistance + tableDistanceAtParameter(prefixEnd + remainder);
  }
  function parameterAtDistance(distance) {
    if (!periodicTail || distance < prefixDistance) return tableParameterAtDistance(distance);
    const offset = distance - prefixDistance,
      cycles = Math.floor(offset / periodDistance),
      remainder = offset - cycles * periodDistance;
    return cycles * periodicTail + tableParameterAtDistance(prefixDistance + remainder);
  }
  function pointAtDistance(distance) {
    const u = parameterAtDistance(distance),
      p = sample(u),
      epsilon = 1e-4;
    const a = sample(Math.max(0, u - epsilon)),
      b = sample(u + epsilon),
      vx = b.x - a.x,
      vy = b.y - a.y,
      length = Math.hypot(vx, vy);
    const tx = length > 1e-12 ? vx / length : (p.tx ?? 1),
      ty = length > 1e-12 ? vy / length : (p.ty ?? 0);
    return { ...p, tx, ty, nx: -ty, ny: tx };
  }
  const buildMilliseconds =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
  return Object.freeze({
    parameterAtDistance,
    distanceAtParameter,
    pointAtDistance,
    prefixEnd,
    prefixDistance,
    lengthExcess,
    periodicTail,
    periodDistance,
    tableSize: segments.length,
    buildMilliseconds,
  });
}
if (typeof module === 'object' && module.exports) module.exports = { createMeasuredMotion };
