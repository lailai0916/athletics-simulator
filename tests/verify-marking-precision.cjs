const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
let checks = 0,
  maxCircleError = 0,
  maxRearEdgeError = 0;
const nodes = new Map();
function node(tag, attrs = {}) {
  const n = {
    tag,
    attrs: {},
    children: [],
    dataset: {},
    style: {},
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') nodes.set(String(v), this);
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    append(...children) {
      for (const c of children) {
        this.children.push(c);
        c.parent = this;
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    },
    querySelector(selector) {
      return (
        flatten(this).find((c) =>
          selector[0] === '#' ? c.attrs.id === selector.slice(1) : c.tag === selector
        ) || null
      );
    },
  };
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const flatten = (n) => n.children.flatMap((c) => [c, ...flatten(c)]),
  svg = node('svg', { id: 'stadium' }),
  defs = node('defs');
svg.append(defs);
for (const id of ['grass-clip-path', 'track-band-path', 'grass-stripes'])
  defs.append(node('path', { id }));
for (const id of [
  'base-layer',
  'fixed-markings-layer',
  'track-lines-layer',
  'priority-markings-layer',
])
  svg.append(node('g', { id }));
const ctx = {
  window: {},
  document: { getElementById: (id) => nodes.get(id), createElementNS: (_ns, tag) => node(tag) },
  Math,
  console,
};
vm.createContext(ctx);
const seam =
  '\nwindow.MarkingAudit={EVENTS,G,R1,rho,normalRoute,waterfallRoute,outerGroupRoute,measurementEdgePath,startCurvePoints,startCurve,drawBase,drawFixedMarkings,drawBreak,relayMark};\n';
const source = require('./helpers/load-app.cjs').withBootstrap(seam);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source, ctx);
const A = ctx.window.MarkingAudit;
const near = (a, b, message, eps = 1e-8) => {
  assert(Number.isFinite(a) && Math.abs(a - b) <= eps, `${message}: ${a} vs ${b}`);
  checks++;
};
function parseCurve(d) {
  const tokens = d.match(/[MC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi),
    segments = [];
  let i = 0,
    p;
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') {
      p = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
    } else {
      assert.equal(c, 'C', 'curved marking uses cubic SVG segments, not polygon corners');
      const a = { x: Number(tokens[i++]), y: Number(tokens[i++]) },
        b = { x: Number(tokens[i++]), y: Number(tokens[i++]) },
        end = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
      segments.push({ p, a, b, end });
      p = end;
    }
  }
  return segments;
}
// A known circular measuring edge exposes the old endpoint secant-normal error.
// The outside painted edge stays at radius10.05 and the centreline at10.025.
{
  const points = Array.from({ length: 257 }, (_, i) => ({
      x: 10 * Math.cos((i * Math.PI) / 512),
      y: 10 * Math.sin((i * Math.PI) / 512),
    })),
    d = A.measurementEdgePath(points);
  const first = d.match(/^M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/);
  near(Number(first[1]), 10.025, 'first endpoint is displaced in its true normal direction', 1e-7);
  near(Number(first[2]), 0, 'first endpoint has no secant-induced tangent shift', 1e-7);
  const segments = parseCurve(d);
  assert.equal(segments.length, 256);
  checks++;
  for (let i = 0; i < segments.length; i++) {
    const { p, a, b, end } = segments[i];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8,
        u = 1 - t,
        x = u * u * u * p.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * end.x,
        y = u * u * u * p.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * end.y,
        error = Math.abs(Math.hypot(x, y) - 10.025);
      maxCircleError = Math.max(maxCircleError, error);
      assert(error < 1e-7, 'smooth centreline retains 25mm physical offset');
      checks++;
    }
    if (i) {
      const previous = segments[i - 1],
        ux = previous.end.x - previous.b.x,
        uy = previous.end.y - previous.b.y,
        vx = a.x - p.x,
        vy = a.y - p.y;
      near(
        (ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)),
        0,
        'no angular kink between adjacent curve segments',
        1e-5
      );
    }
  }
}
// Actual waterfall starts have an involute cusp at their running-line origin.
// A finite secant extrapolation there shifted the inner endpoint by 4.66mm,
// despite the preceding equal-interval circle proxy passing to nanometres.
for (const id of ['10000', '5000', '1500', '3000sc'])
  for (const outer of [false, true]) {
    if (outer && !['10000', '5000'].includes(id)) continue;
    const event = A.EVENTS.find((e) => e.id === id),
      route = outer ? A.outerGroupRoute : A.waterfallRoute,
      from = outer ? A.rho(5) : A.R1,
      inner = A.G.r + (outer ? 4 * A.G.w : 0),
      rt = route(event, 1, from),
      start = rt.start,
      flow = rt.position(0),
      u = outer
        ? {
            x: (start.x - (id === '5000' ? A.G.left : A.G.right)) / from,
            y: (start.y - A.G.cy) / from,
          }
        : { x: -flow.ty, y: flow.tx },
      first = A.startCurvePoints(event, outer)[0],
      expected = { x: start.x + u.x * (inner - from), y: start.y + u.y * (inner - from) };
    near(first.x, expected.x, id + ' inner endpoint follows exact radial continuation', 1e-8);
    near(first.y, expected.y, id + ' inner endpoint follows exact radial continuation', 1e-8);
    const segments = parseCurve(A.startCurve(event, outer)),
      initial = segments[0],
      v = { x: initial.a.x - initial.p.x, y: initial.a.y - initial.p.y };
    near(
      (v.x * u.y - v.y * u.x) / Math.hypot(v.x, v.y),
      0,
      id + ' first painted segment stays tangent to its radial continuation',
      1e-6
    );
    near(
      initial.p.x,
      expected.x + u.y * 0.025,
      id + ' inner paint endpoint has exact normal offset',
      1e-8
    );
    near(
      initial.p.y,
      expected.y - u.x * 0.025,
      id + ' inner paint endpoint has exact normal offset',
      1e-8
    );
    // Recover the rear edge from the *rendered cubic's* own normal, then compare
    // against the actual shortest-distance start construction at that radius.
    // This audits all six full start curves, including1500m's tangent-side switch,
    // rather than only checking spline vertices or an ideal circular proxy.
    for (const segment of segments) {
      let segmentError = 0;
      const { p, a, b, end } = segment;
      for (let j = 0; j <= 16; j++) {
        const t = j / 16,
          v = 1 - t,
          x = v ** 3 * p.x + 3 * v * v * t * a.x + 3 * v * t * t * b.x + t ** 3 * end.x,
          y = v ** 3 * p.y + 3 * v * v * t * a.y + 3 * v * t * t * b.y + t ** 3 * end.y,
          dx = 3 * v * v * (a.x - p.x) + 6 * v * t * (b.x - a.x) + 3 * t * t * (end.x - b.x),
          dy = 3 * v * v * (a.y - p.y) + 6 * v * t * (b.y - a.y) + 3 * t * t * (end.y - b.y),
          length = Math.hypot(dx, dy),
          rear = { x: x - (dy / length) * 0.025, y: y + (dx / length) * 0.025 },
          r =
            id === '3000sc'
              ? A.G.cy - rear.y
              : Math.hypot(rear.x - (id === '5000' ? A.G.left : A.G.right), rear.y - A.G.cy),
          exact =
            r < from
              ? { x: start.x + u.x * (r - from), y: start.y + u.y * (r - from) }
              : route(event, 1, r).start;
        segmentError = Math.max(segmentError, Math.hypot(rear.x - exact.x, rear.y - exact.y));
      }
      maxRearEdgeError = Math.max(maxRearEdgeError, segmentError);
      assert(
        segmentError < 5e-6,
        id + ' full painted rear edge stays within5 micrometres of its measured start'
      );
      checks++;
    }
  }
A.drawBase();
const base = nodes.get('base-layer'),
  fixed = nodes.get('fixed-markings-layer'),
  lines = nodes.get('track-lines-layer'),
  priority = nodes.get('priority-markings-layer'),
  all = flatten(fixed);
const template = require('./helpers/source.cjs').readSource('index.html'),
  clipMarkup = template.match(/<clipPath id="track-band-clip"[^>]*>([\s\S]*?)<\/clipPath>/)[1];
assert.equal(
  (clipMarkup.match(/<path\b/g) || []).length,
  1,
  'track paint clip is one compound path'
);
assert.equal(
  (clipMarkup.match(/<(?:rect|circle|ellipse|polygon)\b/g) || []).length,
  0,
  'clip has no independently overlapping chute shape'
);
checks += 2;
assert.equal(
  flatten(base).filter((n) => n.attrs.fill === '#bf604d').length,
  0,
  'oval and sprint chute share a continuous red surface without intersecting lane colour wedges'
);
checks++;
assert.equal(
  fixed.attrs['clip-path'],
  'url(#track-band-clip)',
  'permanent paint is clipped at actual track/chute boundary'
);
checks++;
// Parse the actual compound clip, preserving exact circular arcs. A node/width
// assertion cannot catch a geometrically cancelled or missing straight area.
function clipGeometry(d) {
  const ts = d.match(/[MAHVZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi),
    segments = [];
  let i = 0,
    p,
    start,
    contours = 0;
  const number = () => Number(ts[i++]),
    line = (end) => {
      segments.push({ kind: 'line', p, end });
      p = end;
    };
  while (i < ts.length) {
    const c = ts[i++];
    if (c === 'M') {
      p = { x: number(), y: number() };
      start = p;
      contours++;
    } else if (c === 'H') line({ x: number(), y: p.y });
    else if (c === 'V') line({ x: p.x, y: number() });
    else if (c === 'Z') line(start);
    else {
      assert.equal(c, 'A');
      const r = number(),
        ry = number(),
        rotation = number(),
        large = number(),
        sweep = number(),
        end = { x: number(), y: number() };
      assert.equal(r, ry);
      assert.equal(rotation, 0);
      const dx = (p.x - end.x) / 2,
        dy = (p.y - end.y) / 2,
        q = dx * dx + dy * dy,
        k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (r * r - q) / q)),
        cx = (p.x + end.x) / 2 + k * dy,
        cy = (p.y + end.y) / 2 - k * dx,
        a = Math.atan2(p.y - cy, p.x - cx);
      let delta = Math.atan2(end.y - cy, end.x - cx) - a;
      if (sweep && delta < 0) delta += 2 * Math.PI;
      if (!sweep && delta > 0) delta -= 2 * Math.PI;
      segments.push({ kind: 'arc', p, end, r, cx, cy, a, delta, sweep });
      p = end;
    }
  }
  return { segments, contours };
}
const clip = clipGeometry(nodes.get('track-band-path').attrs.d);
assert.equal(clip.contours, 2, 'one union outside contour and one grass hole');
checks++;
function clipCovers(p) {
  let crossings = 0;
  const y = p.y + 1e-10;
  for (const s of clip.segments)
    if (s.kind === 'line') {
      if (s.p.y > y !== s.end.y > y) {
        const x = s.p.x + ((y - s.p.y) * (s.end.x - s.p.x)) / (s.end.y - s.p.y);
        if (x > p.x) crossings++;
      }
    } else {
      const dy = y - s.cy;
      if (Math.abs(dy) >= s.r) continue;
      const dx = Math.sqrt(s.r * s.r - dy * dy);
      for (const x of [s.cx - dx, s.cx + dx])
        if (x > p.x) {
          let angle = Math.atan2(dy, x - s.cx) - s.a;
          if (s.sweep && angle < 0) angle += 2 * Math.PI;
          if (!s.sweep && angle > 0) angle -= 2 * Math.PI;
          if (s.sweep ? angle >= 0 && angle < s.delta : angle <= 0 && angle > s.delta) crossings++;
        }
    }
  return crossings % 2 === 1;
}
function insideOval(p, r) {
  const cx = Math.max(A.G.left, Math.min(A.G.right, p.x));
  return (p.x - cx) ** 2 + (p.y - A.G.cy) ** 2 < r * r;
}
for (let x = 7.137; x < 188; x += 1.381)
  for (let y = 17.119; y < 115; y += 0.923) {
    const p = { x, y },
      rect = x > 22 && x < 159 && y > 102.5 && y < 112.26,
      expected = (insideOval(p, 46.26) || rect) && !insideOval(p, 36.5);
    assert.equal(
      clipCovers(p),
      expected,
      'actual clip equals (outer oval union chute) minus grass across complete field'
    );
    checks++;
  }
// Explicit overlap probes detect the formerly missing whole straight, including
// points where both old child shapes were filled and points only in the chute.
for (let x = 22.001; x < 159; x += 0.731)
  for (let y = 102.501; y < 112.26; y += 0.317) {
    assert(clipCovers({ x, y }), 'straight and chute overlap has no cancellation hole');
    checks++;
  }
// Test the actual50mm footprint of every DOM line/hooked relay piece that lies
// on the home straight. Both event families must contribute nonvacuous probes.
function auditStraightPiece(p, end, kind) {
  const dx = end.x - p.x,
    dy = end.y - p.y,
    length = Math.hypot(dx, dy);
  if ([p, end].some((q) => q.x < 22 || q.x > 159 || q.y < 102.5 - 1e-8 || q.y > 112.26 + 1e-8))
    return false;
  for (const t of [0.0001, 0.1, 0.5, 0.9, 0.9999])
    for (const across of [-0.024999, 0, 0.024999]) {
      const q = {
        x: p.x + t * dx - (dy / length) * across,
        y: p.y + t * dy + (dx / length) * across,
      };
      assert(clipCovers(q), 'actual straight ' + kind + ' DOM paint survives clipping');
      checks++;
    }
  return true;
}
let straightLines = 0,
  relayPieces = 0;
for (const n of all.filter((n) => n.tag === 'line'))
  if (
    auditStraightPiece(
      { x: Number(n.attrs.x1), y: Number(n.attrs.y1) },
      { x: Number(n.attrs.x2), y: Number(n.attrs.y2) },
      'start/hurdle/finish'
    )
  )
    straightLines++;
for (const g of all.filter((n) => n.attrs['data-marking'] === 'relay-zone'))
  for (const n of flatten(g).filter((n) => n.tag === 'path')) {
    const coords = n.attrs.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
    for (let i = 2; i < coords.length; i += 2)
      if (
        auditStraightPiece(
          { x: coords[i - 2], y: coords[i - 1] },
          { x: coords[i], y: coords[i + 1] },
          'relay-zone'
        )
      )
        relayPieces++;
  }
assert(straightLines > 20 && relayPieces > 10, 'real straight and relay DOM geometry is covered');
checks++;
for (const e of A.EVENTS)
  for (let lane = 1; lane <= 8; lane++)
    for (const fraction of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      assert(
        clipCovers({ x: 139.415, y: 102.5 + (lane - 1 + fraction) * 1.22 }),
        e.id + ' retains complete finish stripe in all eight lanes'
      );
      checks++;
    }
// World Athletics 2019 plan, Figure2.2.1.6a / manual Figure2.2.2.1:
// the left bend remains solid; the horizontal sprint extensions are dashed
// only while crossing the oval. A shape-count-only test previously accepted
// the exactly reversed assignment, so audit actual path semantics and spans.
const basePaint = flatten(base),
  linePaint = flatten(lines),
  priorityPaint = flatten(priority),
  ovalBorders = linePaint.filter((n) => Number(n.attrs['data-lane-boundary']) > 0);
assert.equal(ovalBorders.length, 8, 'all eight oval borders are retained');
checks++;
assert.equal(
  linePaint.filter((n) => n.attrs['data-lane-return']).length,
  0,
  'no bend segment is replaced by a dashed return'
);
checks++;
for (const c of ovalBorders) {
  const lane = Number(c.attrs['data-lane-boundary']),
    r = 36.5 + lane * 1.22 - 0.025,
    geometry = clipGeometry(c.attrs.d),
    arcs = geometry.segments.filter((s) => s.kind === 'arc');
  assert.equal(c.attrs['stroke-dasharray'], undefined, 'both bends are continuous solid paint');
  assert(c.attrs.d.endsWith('Z'), 'one complete closed oval avoids split AA edges');
  assert.equal(arcs.length, 2);
  checks += 3;
  near(Number(c.attrs['stroke-width']), 0.05, 'oval line physical width');
  for (const arc of arcs) {
    near(arc.r, r, 'oval paint centreline radius');
    near(arc.cy, 66, 'oval circle centre');
    near(Math.hypot(arc.p.x - arc.cx, arc.p.y - arc.cy), r, 'bend start lies on circle');
    near(Math.hypot(arc.end.x - arc.cx, arc.end.y - arc.cy), r, 'bend end lies on circle');
    near(Math.abs(arc.delta), Math.PI, 'complete solid semicircle', 1e-7);
  }
}
const overlapPaint = linePaint.filter((n) => n.attrs['data-straight-overlap'] !== undefined);
assert.equal(
  overlapPaint.length,
  8,
  'only the eight inner horizontal boundaries have an overlap interval'
);
checks++;
function horizontalSpans(d) {
  const spans = [...d.matchAll(/M(-?[\d.e+]+) (-?[\d.e+]+)H(-?[\d.e+]+)/gi)].map((m) => ({
    from: Number(m[1]),
    y: Number(m[2]),
    to: Number(m[3]),
  }));
  assert(spans.length > 0, 'horizontal paths contain real straight intervals');
  checks++;
  return spans;
}
for (let boundary = 0; boundary <= 8; boundary++) {
  const y = 66 + 36.5 + boundary * 1.22 - 0.025,
    outerRadius = 36.5 + 8 * 1.22 - 0.025,
    intersection = 55 - Math.sqrt(Math.max(0, outerRadius ** 2 - (y - 66) ** 2)),
    start110 = 139.39 - 110,
    finish = 139.39,
    solid = linePaint.find((n) => n.attrs['data-straight-boundary'] === String(boundary)),
    dashed = overlapPaint.find((n) => n.attrs['data-straight-overlap'] === String(boundary));
  // The uploaded marking plan's white horizontal grid begins at the110m
  // start, unlike the larger red physical surface. Do not turn a minimum3m
  // start area or17m run-out requirement into extra internal lane dividers.
  const expectedSolid =
    boundary === 8
      ? [
          [22, 55],
          [finish, 159],
        ]
      : boundary === 0
        ? [[22, intersection]]
        : intersection > start110
          ? [[start110, intersection]]
          : [];
  if (!expectedSolid.length) {
    assert(
      !solid || !solid.attrs.d,
      'no empty exterior interval creates paint before the110m start'
    );
    checks++;
  } else {
    assert(solid, 'physical outside boundaries and valid race-side solid intervals remain');
    assert.equal(solid.attrs['stroke-dasharray'], undefined);
    checks += 2;
    near(Number(solid.attrs['stroke-width']), 0.05, 'straight extension physical width');
    const spans = horizontalSpans(solid.attrs.d);
    assert.equal(
      spans.length,
      expectedSolid.length,
      'only the prescribed physical exterior/race intervals are drawn'
    );
    checks++;
    for (let j = 0; j < spans.length; j++) {
      near(spans[j].from, expectedSolid[j][0], 'solid span source endpoint');
      near(spans[j].to, expectedSolid[j][1], 'solid span end endpoint');
      near(spans[j].y, y, 'solid span retains lane alignment');
    }
  }
  if (boundary === 8) {
    assert.equal(dashed, undefined, 'outermost horizontal buffer border stays solid');
    checks++;
    continue;
  }
  assert(dashed, 'each actual race-side horizontal overlap is dashed');
  checks++;
  const overlap = horizontalSpans(dashed.attrs.d),
    dashStart = Math.max(intersection, start110);
  assert.equal(overlap.length, 1);
  checks++;
  near(
    overlap[0].from,
    dashStart,
    'dash starts at analytic crossing or110m start, whichever is later'
  );
  near(overlap[0].to, 55, 'dash ends at common straight tangent');
  near(overlap[0].y, y, 'dash centreline remains horizontal');
  near(
    Math.hypot(intersection - 55, y - 66),
    outerRadius,
    'analytic join lies on outer oval paint centreline'
  );
  assert(
    Math.hypot(intersection - 55 - 0.00001, y - 66) > outerRadius,
    'outside side of analytic join lies outside oval'
  );
  assert(
    Math.hypot(intersection - 55 + 0.00001, y - 66) < outerRadius,
    'inside side of analytic join lies inside oval'
  );
  checks += 2;
  near(Number(dashed.attrs['stroke-width']), 0.05, 'dashed horizontal physical width');
  assert.equal(
    dashed.attrs['stroke-linecap'],
    'butt',
    'physical dash ends are not rounded or inflated'
  );
  checks++;
  const [dash, gap] = dashed.attrs['stroke-dasharray'].split(/\s+/).map(Number),
    length = 55 - dashStart,
    count = Math.round((length + gap) / (dash + gap));
  near(
    count * dash + (count - 1) * gap,
    length,
    'complete dash meets each retained solid junction',
    1e-7
  );
  assert(
    dash > 0.9 && dash < 1.1 && gap > 0.45 && gap < 0.55,
    'visual dash cadence retains2:1 ratio near1m/0.5m'
  );
  checks++;
  // Reject actual rendered intervals outside the legal internal span, not
  // merely a changed helper or a new marker attribute. The shared oval's
  // existing complete home straight supplies55..139.39 without a second paint.
  if (boundary >= 1 && boundary <= 7) {
    const internal = [...(solid?.attrs.d ? horizontalSpans(solid.attrs.d) : []), ...overlap];
    for (const span of internal) {
      assert(
        span.from >= start110 - 1e-9 && span.to <= finish + 1e-9,
        'internal horizontal paint never extends before110m start or after finish'
      );
      assert(span.to <= 55 + 1e-9, 'shared home straight is not repainted');
      checks += 2;
    }
  }
}
// Keep the buffer surface and fixed event lines independently of the removed
// horizontal dividers. Both minimum clearances exceed their official minima.
const chute = basePaint.find((n) => n.attrs.id === 'straight-chute'),
  surface = chute.children.find((n) => n.tag === 'rect');
near(Number(surface.attrs.x), 22, 'physical start-area ground stays atx22');
near(Number(surface.attrs.width), 137, 'physical ground still extends tox159');
near(139.39 - 110 - 22, 7.39, 'existing prestart ground clearance retained');
near(159 - 139.39, 19.61, 'existing finish run-out ground retained');
const finishPaint = all
  .find((n) => n.attrs['data-marking'] === 'finish')
  .children.find((n) => n.tag === 'line');
near(Number(finishPaint.attrs.x1), 139.415, 'fixed50mm finish stripe centre remains unchanged');
near(Number(finishPaint.attrs['stroke-width']), 0.05, 'finish stripe retains50mm width');
for (const p of all.filter(
  (n) =>
    n.attrs['data-marking'] === 'start' &&
    ['1500', '5000', '10000', '3000sc'].includes(n.attrs['data-event'])
))
  (assert(p.children[0].attrs.d.includes('C'), 'every curved start has smooth joined segments'),
    checks++);
// The first300mm of these starts is already painted by a complete existing
// white stripe. Audit the actual emitted DOM, retaining the original full
// measuring geometry while removing only that coincident rendered segment.
for (const [id, ownerEvent] of [
  ['5000', '200'],
  ['10000', 'finish'],
]) {
  const group = all.find(
      (n) => n.attrs['data-marking'] === 'start' && n.attrs['data-event'] === id
    ),
    curve = group.children.find((n) => n.tag === 'path'),
    event = A.EVENTS.find((e) => e.id === id),
    full = parseCurve(A.startCurve(event)),
    painted = parseCurve(curve.attrs.d),
    owner =
      ownerEvent === 'finish'
        ? all.find((n) => n.attrs['data-marking'] === 'finish').children[0]
        : all.find(
            (n) => n.attrs['data-marking'] === 'start' && n.attrs['data-event'] === ownerEvent
          ).children[0];
  assert.equal(full.length, 257, 'full measured curve retains its inner continuation');
  assert.equal(painted.length, 256, 'rendered curve omits exactly one previously shared segment');
  checks += 2;
  assert.deepEqual(
    painted,
    full.slice(1),
    'every remaining cubic and the join endpoint are unchanged'
  );
  checks++;
  assert.equal(owner.tag, 'line');
  assert.equal(owner.attrs.stroke, curve.attrs.stroke);
  near(Number(owner.attrs['stroke-width']), 0.05, 'existing shared stripe retains physical width');
  checks += 2;
  const ox = Number(owner.attrs.x1),
    oy = Number(owner.attrs.y1),
    vx = Number(owner.attrs.x2) - ox,
    vy = Number(owner.attrs.y2) - oy,
    length = Math.hypot(vx, vy),
    { p, a, b, end } = full[0];
  near(Math.hypot(end.x - p.x, end.y - p.y), 0.3, id + ' shared continuation is300mm long', 1e-8);
  for (let j = 0; j <= 16; j++)
    for (const lateral of [-0.025, 0, 0.025]) {
      const t = j / 16,
        u = 1 - t,
        x =
          u ** 3 * p.x +
          3 * u * u * t * a.x +
          3 * u * t * t * b.x +
          t ** 3 * end.x -
          (vy / length) * lateral,
        y =
          u ** 3 * p.y +
          3 * u * u * t * a.y +
          3 * u * t * t * b.y +
          t ** 3 * end.y +
          (vx / length) * lateral,
        along = ((x - ox) * vx + (y - oy) * vy) / length,
        across = Math.abs((x - ox) * vy - (y - oy) * vx) / length;
      assert(
        along >= -1e-8 && along <= length + 1e-8 && across <= 0.025 + 1e-8,
        'the whole removed50mm paint footprint remains covered by the existing DOM stripe'
      );
      checks++;
    }
}
assert.equal(priorityPaint.filter((n) => n.attrs['data-photo-finish']).length, 8);
checks++;
for (const p of priorityPaint.filter((n) => n.attrs['data-photo-finish'])) {
  near(Number(p.attrs.width), 0.02, 'photo-finish stripe projects at most20mm');
  near(Number(p.attrs.height), 0.05, 'photo-finish intersection spans lane paint width');
}
for (const [i, p] of priorityPaint.filter((n) => n.attrs['data-break-cone']).entries())
  near(
    66 - (Number(p.attrs.y) + 0.025),
    36.5 + (i + 1) * 1.22 - 0.025,
    'break cone footprint is centred on the actual white lane line'
  );
for (const p of [...all, ...priorityPaint].filter((n) => n.attrs.stroke && n.tag !== 'rect'))
  near(Number(p.attrs['stroke-width']), 0.05, 'all permanent ground stroke widths remain50mm');
assert.equal(
  all.filter((n) => n.attrs['data-marking'] === 'start').length,
  10 + ['300', '4x200', 'mile'].filter((id) => A.EVENTS.some((e) => e.id === id)).length,
  'all permanent start groups retained, with one physical family per added start'
);
checks++;
console.log(
  `${checks} marking precision checks passed; maximum analytic circle centreline error ${(maxCircleError * 1e6).toFixed(4)} micrometres; actual full start rear-edge error ${(maxRearEdgeError * 1e6).toFixed(4)} micrometres.`
);
