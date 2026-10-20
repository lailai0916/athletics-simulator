const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
let checks = 0,
  maxMileRearEdgeError = 0;
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
          selector[0] === '#'
            ? c.attrs.id === selector.slice(1)
            : selector[0] === '.'
              ? String(c.attrs.class || '')
                  .split(/\s+/)
                  .includes(selector.slice(1))
              : c.tag === selector
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
for (const id of ['grass-clip-path', 'track-band-path']) defs.append(node('path', { id }));
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
const extensions = [
  { id: '300', distance: 300, kind: 'lanes', laneDistance: 300, blocks: true },
  { id: '1000', distance: 1000, kind: 'waterfall', base: 200 },
  { id: '2000', distance: 2000, kind: 'waterfall', base: 0 },
  { id: '3000', distance: 3000, kind: 'waterfall', base: 200 },
  { id: 'mile', distance: 1609.344, kind: 'waterfall', base: 9.344 },
  { id: '4x200', distance: 800, kind: 'relay200', laneDistance: 800, relayUnit: 200, blocks: true },
  { id: '4x800', distance: 3200, kind: 'relay800', stagger: 800, base: 0, relayUnit: 800 },
  { id: '4x1500', distance: 6000, kind: 'relay1500', base: 0, relayUnit: 1500 },
];
const inject = `\nfor(const event of ${JSON.stringify(extensions)})if(!EVENTS.some(e=>e.id===event.id))EVENTS.push(event);\n`;
const seam =
  '\nwindow.ExtendedMarkingAudit={EVENTS,G,R1,rho,normalRoute,waterfallRoute,startCurve,startCurvePoints,drawBase,drawFixedMarkings};\n';
const source = require('./helpers/load-app.cjs').withBootstrap(seam);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + inject + source, ctx);
const A = ctx.window.ExtendedMarkingAudit,
  near = (a, b, message, eps = 1e-8) => {
    assert(Number.isFinite(a) && Math.abs(a - b) <= eps, `${message}: ${a} vs ${b}`);
    checks++;
  };
A.drawBase();
const fixed = nodes.get('fixed-markings-layer'),
  all = flatten(fixed),
  starts = all.filter((n) => n.attrs['data-marking'] === 'start');
for (const id of [
  '100',
  '110h',
  '200',
  '300',
  '400',
  '800',
  '4x200',
  '4x400',
  '1500',
  'mile',
  '5000',
  '10000',
  '3000sc',
]) {
  assert(
    starts.some((n) => n.attrs['data-event'] === id),
    id + ' has a permanent canonical painted start'
  );
  checks++;
}
assert.equal(starts.length, 13, 'eight new events add only three physical start families');
checks++;
for (const paint of all) {
  assert.equal(
    paint.attrs['data-extended-event'],
    undefined,
    'physical ground paint is permanent across event changes'
  );
  checks++;
  assert.notEqual(paint.attrs.display, 'none', 'permanent paint is not hidden');
  checks++;
}
for (const [alias, canonical] of [
  ['100h', '100'],
  ['400h', '400'],
  ['4x100', '400'],
  ['1000', '5000'],
  ['3000', '5000'],
  ['2000', '10000'],
  ['4x800', '800'],
  ['4x1500', '10000'],
]) {
  const owner = starts.find((n) => n.attrs['data-event'] === canonical);
  assert(
    (owner.attrs['data-shared-events'] || '').split(' ').includes(alias),
    alias + ' reuses the existing physical start family ' + canonical
  );
  checks++;
  assert(
    !starts.some((n) => n.attrs['data-event'] === alias),
    alias + ' does not repaint its shared white start'
  );
  checks++;
}
for (const id of ['300', '4x200']) {
  const event = A.EVENTS.find((e) => e.id === id),
    group = starts.find((n) => n.attrs['data-event'] === id),
    lines = group.children.filter((n) => n.tag === 'line' && n.attrs.stroke === '#fff9ed');
  assert.equal(
    lines.length,
    id === '4x200' ? 7 : 8,
    id + ' has one clear-width stripe per distinct lane start'
  );
  checks++;
  if (id === '4x200') {
    assert.equal(
      group.attrs['data-shared-finish'],
      'true',
      'four-bend relay shares the existing finish instead of widening it for construction rounding'
    );
    checks++;
  }
  for (const [index, line] of lines.entries()) {
    const lane = index + (id === '4x200' ? 2 : 1),
      p = A.normalRoute(event, lane).start,
      nx = -(p.ty || 0),
      ny = p.tx || 1,
      offset = 36.5 + (lane - 1) * 1.22 - A.rho(lane);
    near(
      Number(line.attrs.x1),
      p.x + (p.tx ?? 1) * 0.025 + nx * offset,
      id + ' start x is on measured forward edge'
    );
    near(
      Number(line.attrs.y1),
      p.y + (p.ty ?? 0) * 0.025 + ny * offset,
      id + ' start y is on measured forward edge'
    );
    near(
      Math.hypot(
        Number(line.attrs.x2) - Number(line.attrs.x1),
        Number(line.attrs.y2) - Number(line.attrs.y1)
      ),
      1.17,
      id + ' stripe spans the clear lane width'
    );
  }
}
const mile = starts
    .find((n) => n.attrs['data-event'] === 'mile')
    .children.find((n) => n.tag === 'path'),
  mileEvent = A.EVENTS.find((e) => e.id === 'mile');
assert.equal(
  mile.attrs.d,
  A.startCurve(mileEvent),
  'mile has its independent exact equal-distance start curve'
);
checks++;
assert.notEqual(
  mile.attrs.d,
  starts.find((n) => n.attrs['data-event'] === '10000').children[0].attrs.d,
  'mile is not aliased to the nearby finish waterfall start'
);
checks++;
for (const event of A.EVENTS.filter((e) => ['waterfall', 'relay1500'].includes(e.kind)))
  for (const point of A.startCurvePoints(event)) {
    assert(
      Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.markingTangent.x) &&
        Number.isFinite(point.markingTangent.y),
      event.id + ' has finite analytic curve normals'
    );
    checks++;
  }
// Recover the measured rear edge from the actual rendered cubic's own normal.
// The mile curve is defined by horizontal height, unlike the circular5000m
// involute; testing only finite vertices would miss offset/curvature errors.
{
  const numbers = mile.attrs.d.match(/[MC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  let i = 0,
    p;
  while (i < numbers.length) {
    const command = numbers[i++];
    if (command === 'M') {
      p = { x: Number(numbers[i++]), y: Number(numbers[i++]) };
      continue;
    }
    assert.equal(command, 'C', 'mile start uses smooth cubic segments');
    checks++;
    const a = { x: Number(numbers[i++]), y: Number(numbers[i++]) },
      b = { x: Number(numbers[i++]), y: Number(numbers[i++]) },
      end = { x: Number(numbers[i++]), y: Number(numbers[i++]) };
    for (let j = 0; j <= 16; j++) {
      const t = j / 16,
        u = 1 - t,
        x = u ** 3 * p.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x,
        y = u ** 3 * p.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * end.y,
        dx = 3 * u * u * (a.x - p.x) + 6 * u * t * (b.x - a.x) + 3 * t * t * (end.x - b.x),
        dy = 3 * u * u * (a.y - p.y) + 6 * u * t * (b.y - a.y) + 3 * t * t * (end.y - b.y),
        length = Math.hypot(dx, dy),
        rear = { x: x - (dy / length) * 0.025, y: y + (dx / length) * 0.025 },
        r = rear.y - A.G.cy,
        exact =
          r < A.R1
            ? { x: A.waterfallRoute(mileEvent, 1, A.R1).start.x, y: rear.y }
            : A.waterfallRoute(mileEvent, 1, r).start,
        error = Math.hypot(rear.x - exact.x, rear.y - exact.y);
      maxMileRearEdgeError = Math.max(maxMileRearEdgeError, error);
      assert(
        error < 5e-6,
        'entire painted mile start remains within5 micrometres of its equal-distance rear edge'
      );
      checks++;
    }
    p = end;
  }
}
for (const id of ['4x100', '4x200']) {
  const group = all.find(
    (n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === id
  );
  assert(
    group && group.children.some((n) => n.tag === 'path'),
    id + ' retains its distinct thirty-metre exchange-zone boundaries'
  );
  checks++;
}
{
  const group = all.find(
      (n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === '4x200'
    ),
    event = A.EVENTS.find((e) => e.id === '4x200'),
    paths = group.children.filter((n) => n.tag === 'path');
  assert.equal(
    paths.length,
    30,
    'four-bend relay adds30 distinct yellow bars;18 logical boundaries share canonical existing paint'
  );
  checks++;
  const yellow = all.filter((n) => n.tag === 'path' && n.attrs.stroke === '#f4d64a');
  assert.equal(
    yellow.length,
    78,
    'forty-eight4x100 andthirty distinct4x200 yellow bars coverall96 logical zone boundaries without survey-rounding overpaint'
  );
  checks++;
  for (let lane = 1; lane <= 8; lane++)
    for (let leg = 1; leg <= 3; leg++)
      for (const [edge, offset] of [
        ['enter', -20],
        ['exit', 10],
      ]) {
        const shared = leg === 3 || (lane === 1 && leg === 1),
          physicalEvent = shared ? A.EVENTS.find((e) => e.id === '4x100') : event,
          station = shared ? 200 + offset : leg * 200 + offset;
        // Reused stations retain the exact canonical survey edge. The rounded
        //84.39m/36.50m construction must not widen these shared50mm bars by1–2mm.
        const p = A.normalRoute(physicalEvent, lane).position(station),
          nx = p.nx ?? -p.ty,
          ny = p.ny ?? p.tx,
          across = 36.5 + (lane - 1) * 1.22 - A.rho(lane),
          expected = { x: p.x + nx * across + p.tx * 0.025, y: p.y + ny * across + p.ty * 0.025 };
        const matching = (shared ? yellow : paths).find((n) => {
          const v = n.attrs.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
          return Math.hypot(v[0] - expected.x, v[1] - expected.y) < 1e-7;
        });
        assert(
          matching,
          `4x200 lane${lane} exchange${leg} ${edge} retains its exact physical30m-zone edge`
        );
        checks++;
        if (shared) {
          assert(
            (matching.attrs['data-shared-events'] || '').split(' ').includes('4x200'),
            'reused4x200 boundary has explicit shared ownership'
          );
          checks++;
        }
        const v = matching.attrs.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
        near(Math.hypot(v[2] - v[0], v[3] - v[1]), 1.1, 'selected yellow crossbar is1.10m', 2e-8);
        near(Math.hypot(v[4] - v[2], v[5] - v[3]), 0.15, 'selected yellow hook is150mm', 2e-8);
      }
}
const common = all.find(
  (n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === '4x400-common'
);
assert(
  (common.attrs['data-shared-events'] || '').split(' ').includes('4x800'),
  '4x800 reuses the official unlaned exchange markers, whose exit is parallel to the finish'
);
checks++;
assert(
  !all.some((n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === '4x800'),
  '4x800 has no second conflicting radial exchange boundary'
);
checks++;
for (const [id, unit, legs] of [['4x1500', 1500, [1, 2, 3]]]) {
  const long = all.find(
    (n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === id
  );
  assert(long, id + ' has painted exchange boundaries on its true measured route');
  checks++;
  for (const leg of legs) {
    const boundaries = long.children.filter((n) => Number(n.attrs['data-relay-leg']) === leg);
    assert.equal(
      boundaries.length,
      2,
      id + ' leg ' + leg + ' has both twenty-metre zone boundaries'
    );
    checks++;
    for (const boundary of boundaries) {
      assert.equal(
        boundary.children.length,
        8,
        'each unlaned exchange boundary remains visible across all eight lanes'
      );
      checks++;
      const d = leg * unit + (boundary.attrs['data-zone-edge'] === 'enter' ? -10 : 10);
      near(
        Number(boundary.attrs['data-zone-distance']),
        d,
        'long relay uses its actual global exchange station'
      );
      const p = A.normalRoute(
          A.EVENTS.find((e) => e.id === id),
          1
        ).position(d),
        nx = -p.ty,
        ny = p.tx;
      for (const [index, bar] of boundary.children.entries()) {
        const lane = index + 1,
          across = 36.5 + (lane - 1) * 1.22 - A.R1 + (1.17 - 0.8) / 2;
        near(
          Number(bar.attrs.x1),
          p.x + nx * across + p.tx * 0.025,
          'long relay boundary follows the true local normal x'
        );
        near(
          Number(bar.attrs.y1),
          p.y + ny * across + p.ty * 0.025,
          'long relay boundary follows the true local normal y'
        );
        near(
          Math.hypot(
            Number(bar.attrs.x2) - Number(bar.attrs.x1),
            Number(bar.attrs.y2) - Number(bar.attrs.y1)
          ),
          0.8,
          'long relay uses consistent800mm blue bars'
        );
      }
    }
  }
}
const pathKeys = new Set();
for (const paint of all.filter((n) => n.tag === 'path' && n.attrs.stroke && n.attrs.d)) {
  const key = paint.attrs.stroke + '|' + paint.attrs['stroke-width'] + '|' + paint.attrs.d;
  assert(!pathKeys.has(key), 'identical physical path is painted only once');
  pathKeys.add(key);
  checks++;
}
for (const paint of all.filter((n) => n.attrs.stroke && n.tag !== 'rect'))
  near(
    Number(paint.attrs['stroke-width']),
    0.05,
    'all extended permanent paint keeps its true fifty-millimetre width'
  );
const finish = all
  .find((n) => n.attrs['data-marking'] === 'finish')
  .children.find((n) => n.tag === 'line');
near(Number(finish.attrs.x1), 139.415, 'extended events preserve finish stripe');
assert.equal(
  fixed.attrs['clip-path'],
  'url(#track-band-clip)',
  'extended fixed paint retains the corrected track clip'
);
checks++;
const canonical = (n) => ({ tag: n.tag, attrs: n.attrs, children: n.children.map(canonical) }),
  before = JSON.stringify(canonical(fixed));
A.drawFixedMarkings();
assert.equal(
  JSON.stringify(canonical(fixed)),
  before,
  'rebuilding permanent marks is deterministic and does not accumulate repeated paint'
);
checks++;
console.log(
  `${checks} extended marking checks passed; full mile rear-edge error ${(maxMileRearEdgeError * 1e6).toFixed(4)} micrometres.`
);
