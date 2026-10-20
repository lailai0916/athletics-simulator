/* Smooth analytic route traces. Error is limited in world metres, so zooming
 * reveals the same curve rather than the corners of a fixed polyline. */
function createRouteTrace(sample, start, end, tolerance = 0.00005, domainEnd = Infinity) {
  // Parent/child fits probe the same distance; share its immutable sample only
  // for this trace. Fitting order, tolerance and path serialization stay intact.
  const sourceSample = sample,
    sampleCache = new Map();
  sample = (d) => {
    if (sampleCache.has(d)) return sampleCache.get(d);
    const p = sourceSample(d);
    sampleCache.set(d, p);
    return p;
  };
  const clean = (n) => Number(n.toFixed(7)),
    point = (p) => `${clean(p.x)} ${clean(p.y)}`;
  if (end <= start) return `M${point(sample(start))}`;
  const nodes = new Map(),
    segments = [];
  function node(d) {
    if (nodes.has(d)) return nodes.get(d);
    const p = sample(d),
      h = 0.00001,
      lo = Math.max(0, d - h),
      hi = Math.min(domainEnd, d + h),
      a = lo === d ? p : sample(lo),
      b = hi === d ? p : sample(hi),
      span = hi - lo || 1;
    const n = { d, p, v: { x: (b.x - a.x) / span, y: (b.y - a.y) / span } };
    nodes.set(d, n);
    return n;
  }
  function fit(a, b, depth = 0) {
    const span = b.d - a.d,
      c1 = { x: a.p.x + (a.v.x * span) / 3, y: a.p.y + (a.v.y * span) / 3 },
      c2 = { x: b.p.x - (b.v.x * span) / 3, y: b.p.y - (b.v.y * span) / 3 };
    let error = 0;
    for (const t of [0.125, 0.25, 0.5, 0.75, 0.875]) {
      const u = 1 - t,
        p = sample(a.d + span * t),
        x = u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x,
        y = u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y;
      error = Math.max(error, Math.hypot(x - p.x, y - p.y));
    }
    if (error > tolerance * 0.5 && depth < 16 && span > 0.00001) {
      const middle = node((a.d + b.d) / 2);
      fit(a, middle, depth + 1);
      fit(middle, b, depth + 1);
      return;
    }
    segments.push({ a: a.p, b: b.p, c1, c2, start: a.d, end: b.d });
  }
  const count = Math.max(1, Math.ceil((end - start) / 8));
  for (let i = 0; i < count; i++)
    fit(node(start + ((end - start) * i) / count), node(start + ((end - start) * (i + 1)) / count));
  /*__TRACE_SEGMENTS__*/
  return (
    `M${point(segments[0].a)}` +
    segments.map((s) => `C${point(s.c1)} ${point(s.c2)} ${point(s.b)}`).join('')
  );
}
