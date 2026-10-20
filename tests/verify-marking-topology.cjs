'use strict';
// Read the real painter output. This audit separates geometric intersections
// from a rendering-priority policy, which must be chosen from the marking plan.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const template = require('./helpers/source.cjs').readSource('index.html');
const ids = new Map(),
  walk = (n) => (n ? [n, ...n.children.flatMap(walk)] : []);
function node(tag, attrs = {}) {
  const n = {
    tag,
    attrs: {},
    children: [],
    style: {},
    dataset: {},
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') ids.set(String(v), this);
    },
    getAttribute(k) {
      return this.attrs[k] ?? null;
    },
    removeAttribute(k) {
      delete this.attrs[k];
    },
    append(...children) {
      for (const c of children) {
        c.parent = this;
        this.children.push(c);
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    },
    querySelector(s) {
      return this.querySelectorAll(s)[0] || null;
    },
    querySelectorAll(s) {
      return walk(this)
        .slice(1)
        .filter((n) =>
          s[0] === '#'
            ? n.attrs.id === s.slice(1)
            : s[0] === '.'
              ? String(n.attrs.class || '')
                  .split(/\s+/)
                  .includes(s.slice(1))
              : s[0] === '['
                ? (() => {
                    const m = s.match(/^\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]$/);
                    return (
                      m &&
                      (m[2] === undefined ? n.attrs[m[1]] !== undefined : n.attrs[m[1]] === m[2])
                    );
                  })()
                : n.tag === s
        );
    },
  };
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const svg = node('svg', { id: 'stadium' }),
  defs = node('defs');
svg.append(defs);
for (const id of ['grass-clip-path', 'track-band-path', 'grass-stripes'])
  defs.append(node('path', { id }));
const world = node('g', { id: 'world' });
svg.append(world);
const layerMarkup = template.match(/<g\b[^>]*id="world"[^>]*>([\s\S]*?)<\/svg>/);
assert(layerMarkup, 'actual template has its world layer');
for (const match of layerMarkup[1].matchAll(/<g\b[^>]*id="([^"]+)"[^>]*>\s*<\/g>/g))
  world.append(node('g', { id: match[1] }));
const ctx = {
  window: {},
  document: { getElementById: (id) => ids.get(id), createElementNS: (_ns, tag) => node(tag) },
  Math,
  console,
};
vm.createContext(ctx);
const seam = '\nwindow.TopologyQA={drawBase,G,rho,EVENTS,normalRoute,TRACK_MARK_COLORS};\n';
const source =
  require('./helpers/source.cjs').readSource('track-data.js') +
  '\n' +
  require('./helpers/load-app.cjs').withBootstrap(seam);
vm.runInContext(source, ctx);
const A = ctx.window.TopologyQA;
A.drawBase();
const all = walk(svg),
  base = walk(ids.get('base-layer')),
  fixed = walk(ids.get('fixed-markings-layer')),
  order = new Map(all.map((n, i) => [n, i]));
const family = (n) => {
  for (let p = n; p; p = p.parent)
    if (p.attrs['data-marking'])
      return { type: p.attrs['data-marking'], event: p.attrs['data-event'] || null };
  return {};
};
function lineCircle(n, cx, cy, r) {
  const a = { x: +n.attrs.x1, y: +n.attrs.y1 },
    v = { x: +n.attrs.x2 - a.x, y: +n.attrs.y2 - a.y },
    dx = a.x - cx,
    dy = a.y - cy,
    c = v.x * v.x + v.y * v.y,
    b = 2 * (dx * v.x + dy * v.y),
    q = dx * dx + dy * dy - r * r,
    disc = b * b - 4 * c * q;
  if (disc < 0 || !c) return [];
  return [...new Set([(-b - Math.sqrt(disc)) / (2 * c), (-b + Math.sqrt(disc)) / (2 * c)])]
    .filter((t) => t > 1e-7 && t < 1 - 1e-7)
    .map((t) => ({ t, x: a.x + v.x * t, y: a.y + v.y * t }));
}
const coloredLines = all.filter(
  (n) =>
    family(n).type &&
    n.tag === 'line' &&
    n.attrs.stroke &&
    n.attrs.stroke !== A.TRACK_MARK_COLORS.white
);
const crossings = [];
for (const n of coloredLines)
  for (let boundary = 1; boundary <= 8; boundary++) {
    const r = A.G.r + boundary * A.G.w - 0.025;
    for (const [side, cx] of [
      ['left', A.G.left],
      ['right', A.G.right],
    ])
      for (const p of lineCircle(n, cx, A.G.cy, r)) {
        if (side === 'left' ? p.x >= cx : p.x <= cx) continue;
        crossings.push({
          ...family(n),
          color: n.attrs.stroke,
          boundary,
          side,
          x: p.x,
          y: p.y,
          t: p.t,
          line: { x1: +n.attrs.x1, y1: +n.attrs.y1, x2: +n.attrs.x2, y2: +n.attrs.y2 },
          node: n,
        });
      }
  }
// Protect the exact screenshot seam independently of arbitrary screen scale.
const sampleCrossings = crossings.filter(
  (c) => ['100h', '110h'].includes(c.event) && c.side === 'left' && c.x > 52 && c.x < 53
);
const imagePair = sampleCrossings.filter((c) => c.boundary === 8);
// Check raw geometry facts that should remain true after any paint-layer fix.
let checks = 0;
const failures = [];
const check = (ok, message) => {
  checks++;
  if (!ok) failures.push(message);
};
check(
  coloredLines.length > 450,
  'real drawFixedMarkings produces a non-vacuous colored-line audit'
);
check(
  crossings.length > 0,
  'the audit finds real circle/tick intersections, not invented proxy paths'
);
check(
  sampleCrossings.some((c) => c.event === '100h') &&
    sampleCrossings.some((c) => c.event === '110h'),
  'the screenshot blue/yellow seam is exercised'
);
const photo = all.filter((n) => n.attrs['data-photo-finish']);
check(photo.length === 8, 'photo-finish has one explicit exception per lane');
for (const n of photo) {
  check(
    +n.attrs.width === 0.02 && +n.attrs.height === 0.05,
    'photo-finish exceptions retain their 20x50mm footprint'
  );
  check(+n.attrs.x === A.G.right, 'black paint stays forward of the measured finish edge');
}
const insets = [];
for (const n of coloredLines) {
  const f = family(n);
  if (f.type === 'start')
    insets.push({
      event: f.event,
      color: n.attrs.stroke,
      length: Math.hypot(+n.attrs.x2 - +n.attrs.x1, +n.attrs.y2 - +n.attrs.y1),
      node: n,
    });
}
check(insets.length === 21, 'three staggered starts keep seven deliberate colored insets each');
for (const n of insets)
  check(
    Math.abs(n.length - 0.4) < 1e-10,
    'start inset is its prescribed 400mm exception, not a full repaint'
  );
// Parse real coloured path geometry as well: the continuous green break line
// crosses upper-straight dividers; radial relay hooks must share the same rule.
function pathPieces(d) {
  const ts = d.match(/[MLCHVZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [],
    out = [];
  let i = 0,
    p,
    start;
  const num = () => +ts[i++],
    line = (q) => {
      out.push([p, q]);
      p = q;
    };
  while (i < ts.length) {
    const command = ts[i++];
    if (command === 'M') {
      p = { x: num(), y: num() };
      start = p;
    } else if (command === 'L') line({ x: num(), y: num() });
    else if (command === 'H') line({ x: num(), y: p.y });
    else if (command === 'V') line({ x: p.x, y: num() });
    else if (command === 'Z') line(start);
    else if (command === 'C') {
      const a = { x: num(), y: num() },
        b = { x: num(), y: num() },
        end = { x: num(), y: num() },
        first = p;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8,
          u = 1 - t;
        line({
          x: u * u * u * first.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * end.x,
          y: u * u * u * first.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * end.y,
        });
      }
    } else throw new Error('Unsupported coloured marking command ' + command);
  }
  return out;
}
const coloredStrokes = all.filter(
  (n) =>
    family(n).type &&
    ['line', 'path'].includes(n.tag) &&
    n.attrs.stroke &&
    n.attrs.stroke !== A.TRACK_MARK_COLORS.white
);
const geometricCrossings = [];
const whiteBoundaries = all.filter((n) => n.attrs['data-lane-boundary'] !== undefined),
  byBoundary = new Map(whiteBoundaries.map((n) => [+n.attrs['data-lane-boundary'], n]));
for (const n of coloredStrokes) {
  const pieces =
      n.tag === 'line'
        ? [
            [
              { x: +n.attrs.x1, y: +n.attrs.y1 },
              { x: +n.attrs.x2, y: +n.attrs.y2 },
            ],
          ]
        : pathPieces(n.attrs.d),
    seen = new Set();
  for (const [a, b] of pieces)
    for (let boundary = 1; boundary <= 8; boundary++) {
      const radius = A.G.r + boundary * A.G.w - 0.025,
        add = (p) => {
          const key = boundary + '/' + p.x.toFixed(6) + '/' + p.y.toFixed(6);
          if (seen.has(key)) return;
          seen.add(key);
          geometricCrossings.push({
            ...family(n),
            color: n.attrs.stroke,
            boundary,
            x: p.x,
            y: p.y,
            kind: n.tag,
            node: n,
          });
        };
      const pseudo = { attrs: { x1: a.x, y1: a.y, x2: b.x, y2: b.y } };
      for (const [side, cx] of [
        ['left', A.G.left],
        ['right', A.G.right],
      ])
        for (const p of lineCircle(pseudo, cx, A.G.cy, radius))
          if (side === 'left' ? p.x < cx : p.x > cx) add(p);
      if (Math.abs(a.y - b.y) > 1e-14)
        for (const sign of [-1, 1]) {
          const y = A.G.cy + sign * radius,
            t = (y - a.y) / (b.y - a.y),
            x = a.x + t * (b.x - a.x);
          if (t >= 0 && t <= 1 && x >= A.G.left && x <= A.G.right) add({ x, y });
        }
    }
}
check(
  geometricCrossings.some((c) => c.type === 'break-line'),
  'the path audit independently finds the green break-line crossings'
);
check(
  coloredStrokes.filter((n) => family(n).type === 'relay-zone' && n.tag === 'path').length >= 80,
  'real hooked relay paths participate in the same policy audit'
);
for (const crossing of geometricCrossings) {
  const boundary = byBoundary.get(crossing.boundary),
    green = crossing.type === 'break-line';
  check(
    boundary &&
      (green
        ? order.get(crossing.node) > order.get(boundary)
        : order.get(boundary) > order.get(crossing.node)),
    (green
      ? 'continuous green break remains above white divider'
      : 'continuous white divider remains above ' + crossing.type + '/' + crossing.event) +
      ' at ' +
      crossing.x.toFixed(6) +
      ',' +
      crossing.y.toFixed(6)
  );
}
// Check the semantic layer, not just the sixteen screenshot point fixtures.
for (const n of coloredStrokes)
  for (const boundary of whiteBoundaries) {
    const green = family(n).type === 'break-line';
    check(
      green ? order.get(n) > order.get(boundary) : order.get(boundary) > order.get(n),
      green
        ? 'green break is an explicit over-divider exception'
        : 'every lane-boundary stroke paints after colored hurdle/relay/start ground strokes'
    );
  }
const trackLines = ids.get('track-lines-layer');
check(
  whiteBoundaries.length === 9,
  'exactly one physical kerb and eight oval dividers are retained'
);
check(
  walk(trackLines).filter((n) => n.attrs['data-lane-boundary'] !== undefined).length === 9,
  'lane borders have one owner, without duplicate white repaint'
);
for (const p of photo) {
  const lane = +p.attrs['data-photo-finish'],
    boundary = byBoundary.get(lane);
  check(
    order.get(p) > order.get(boundary),
    'photo-finish black exception remains above its divider'
  );
  const finish = all.find(
    (n) =>
      n.tag === 'line' &&
      +n.attrs.x1 === A.G.right + 0.025 &&
      +n.attrs.x2 === A.G.right + 0.025 &&
      n.attrs.stroke === A.TRACK_MARK_COLORS.white
  );
  check(
    finish && order.get(p) > order.get(finish),
    'photo-finish black exception remains above finish paint'
  );
}
const cones = all.filter((n) => n.attrs['data-break-cone']);
check(cones.length === 8, 'all eight small physical break cones remain present');
for (const cone of cones) {
  check(
    +cone.attrs.width === 0.05 && +cone.attrs.height === 0.05,
    'physical cone retains its true 50mm square footprint'
  );
  check(
    whiteBoundaries.every((boundary) => order.get(cone) > order.get(boundary)),
    'physical cone stays above painted white dividers'
  );
}
for (const inset of insets) {
  const g = inset.node.parent,
    white = g.children.find(
      (n) => n.tag === 'line' && n.attrs.stroke === A.TRACK_MARK_COLORS.white
    );
  check(
    white && order.get(inset.node) > order.get(white),
    'intentional start color inset remains above its own white start stripe'
  );
}
const hooks = coloredStrokes.filter((n) => n.tag === 'path' && family(n).type === 'relay-zone'),
  vertices = (n) => {
    const ns = n.attrs.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
    return Array.from({ length: ns.length / 2 }, (_, i) => ({ x: ns[i * 2], y: ns[i * 2 + 1] }));
  },
  distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  maximumVertexDistance = (a, b) => Math.max(...a.map((p, i) => distance(p, b[i])));
let originalRelayStations = 0,
  maxSharedStationShift = 0,
  residualDuplicates = 0;
for (const id of ['4x100', '4x200']) {
  const event = A.EVENTS.find((e) => e.id === id),
    unit = id === '4x100' ? 100 : 200;
  for (let lane = 1; lane <= 8; lane++)
    for (let leg = 1; leg <= 3; leg++)
      for (const enter of [true, false]) {
        const p = A.normalRoute(event, lane).position(leg * unit + (enter ? -20 : 10)),
          a = A.G.r + (lane - 1) * A.G.w - A.rho(lane),
          nx = -p.ty,
          ny = p.tx,
          h = 0.15 / Math.SQRT2,
          point = (offset, along) => ({
            x: p.x + nx * offset + p.tx * along,
            y: p.y + ny * offset + p.ty * along,
          }),
          expected = [
            point(a, 0.025),
            point(a + 1.1, 0.025),
            point(a + 1.1 - h, 0.025 + (enter ? 1 : -1) * h),
          ];
        const candidates = hooks
            .filter(
              (n) =>
                n.attrs.stroke === A.TRACK_MARK_COLORS.yellow &&
                (!n.attrs['data-relay-lane'] || +n.attrs['data-relay-lane'] === lane) &&
                (!n.attrs['data-zone-edge'] ||
                  n.attrs['data-zone-edge'] === (enter ? 'enter' : 'exit'))
            )
            .map((n) => ({ node: n, error: maximumVertexDistance(expected, vertices(n)) }))
            .sort((a, b) => a.error - b.error),
          nearest = candidates[0];
        check(
          nearest && nearest.error <= 0.0026 + 1e-8,
          'each original relay station retains one matching physical hook within survey roundoff'
        );
        if (nearest) {
          maxSharedStationShift = Math.max(maxSharedStationShift, nearest.error);
          check(
            (nearest.node.attrs['data-shared-events'] || '').split(' ').includes(id),
            'shared physical relay hook records every event using it'
          );
        }
        originalRelayStations++;
      }
}
for (let i = 0; i < hooks.length; i++)
  for (let j = i + 1; j < hooks.length; j++) {
    const a = hooks[i],
      b = hooks[j];
    if (a.attrs.stroke !== b.attrs.stroke) continue;
    const av = vertices(a),
      bv = vertices(b);
    if (Math.abs(distance(av[0], av[1]) - distance(bv[0], bv[1])) > 1e-7) continue;
    if (
      a.attrs['data-relay-lane'] &&
      b.attrs['data-relay-lane'] &&
      a.attrs['data-relay-lane'] !== b.attrs['data-relay-lane']
    )
      continue;
    if (
      a.attrs['data-zone-edge'] &&
      b.attrs['data-zone-edge'] &&
      a.attrs['data-zone-edge'] !== b.attrs['data-zone-edge']
    )
      continue;
    if (maximumVertexDistance(av, bv) <= 0.0026 + 1e-8) residualDuplicates++;
  }
check(
  residualDuplicates === 0,
  'survey-rounded shared relay hooks are painted once instead of creating fat doubled bars'
);
const sharedHooks = hooks.filter(
  (n) =>
    (n.attrs['data-shared-events'] || '').includes('4x100') &&
    (n.attrs['data-shared-events'] || '').includes('4x200')
);
check(
  sharedHooks.length === 16,
  'the sixteen shared sprint-relay zone edges have one canonical physical hook'
);
for (const n of sharedHooks)
  check(
    family(n).event === '4x100',
    'shared sprint-relay hook keeps the established 4x100 coordinates'
  );
const safe = (c) => {
  const { node, ...value } = c;
  return value;
};
const report = {
  checks,
  failed: failures.length,
  policy:
    'white longitudinal dividers above hurdle/relay/start color; continuous green break, physical cones and photo-finish black details above dividers; start insets remain over their own start stripe',
  circleColoredLineCrossings: crossings.length,
  sprintHurdleCircleCrossings: crossings.filter((c) => ['100h', '110h'].includes(c.event)).length,
  coloredStrokeCount: coloredStrokes.length,
  pathAndLineDividerCrossings: geometricCrossings.length,
  screenshotSeam: sampleCrossings.map(safe),
  allDividerCrossings: geometricCrossings.map(safe),
  photoFinishExceptions: photo.length,
  coneExceptions: cones.length,
  originalRelayStations,
  maxSharedStationShift,
  residualDuplicates,
  sharedSprintRelayHooks: sharedHooks.length,
  startInsetExceptions: insets.map(({ node, ...value }) => value),
  failures,
};
console.log(
  JSON.stringify(
    {
      checks,
      failed: failures.length,
      coloredStrokeCount: coloredStrokes.length,
      pathAndLineDividerCrossings: geometricCrossings.length,
      maximumSharedRelayShiftMetres: maxSharedStationShift,
      residualDuplicates,
      failures: failures.slice(0, 20),
    },
    null,
    2
  )
);
if (failures.length) process.exitCode = 1;
