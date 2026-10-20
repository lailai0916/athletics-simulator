'use strict';
// Independent painted-footprint checks for Facilities Manual 2.2.3.1 and
// Figure 2.2.1.6a: hurdle marks use their approaching edge; the common relay
// exit is parallel to the finish rather than a radial continuation.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const ids = new Map(),
  walk = (n) => [n, ...n.children.flatMap(walk)];
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
    append(...children) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    },
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
    },
    querySelector(s) {
      return (
        walk(this).find((n) =>
          s[0] === '#'
            ? n.attrs.id === s.slice(1)
            : s[0] === '.'
              ? String(n.attrs.class || '')
                  .split(/\s+/)
                  .includes(s.slice(1))
              : n.tag === s
        ) || null
      );
    },
  };
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const svg = node('svg', { id: 'stadium' }),
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
const context = {
  window: {},
  document: { getElementById: (id) => ids.get(id), createElementNS: (_ns, tag) => node(tag) },
  Math,
  console,
};
vm.createContext(context);
const seam =
  '\nwindow.EdgeAlignmentQA={EVENTS,G,R1,C1,rho,normalRoute,trackPoint,centerLane,drawBase,paintSprintHurdle,paintCommonRelayZone};\n';
const source = require('./helpers/load-app.cjs').withBootstrap(seam);
vm.runInContext(
  require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source,
  context
);
const A = context.window.EdgeAlignmentQA;
A.drawBase();
let checks = 0,
  maxFaceGap = 0;
const near = (a, b, message, tolerance = 1e-9) => {
  assert(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);
  checks++;
};
const fixed = walk(ids.get('fixed-markings-layer'));
for (const id of ['100h', '110h', '400h']) {
  const event = A.EVENTS.find((e) => e.id === id),
    group = fixed.find(
      (n) => n.attrs['data-marking'] === 'hurdle-position' && n.attrs['data-event'] === id
    );
  assert.equal(group.children.length, 160, 'ten flights in eight lanes with two physical ticks');
  checks++;
  for (let lane = 1; lane <= 8; lane++)
    for (let hurdle = 0; hurdle < 10; hurdle++) {
      const d = event.hurdles[0] + hurdle * event.hurdles[1],
        p = A.normalRoute(event, lane).position(d),
        n = { x: -p.ty, y: p.tx };
      const parent = node('g');
      A.paintSprintHurdle(parent, p, lane);
      const apparatus = walk(parent).find((n) => n.attrs['data-hurdle']),
        beam = walk(parent).find((n) => n.attrs['data-hurdle-part'] === 'top-bar');
      const transform = apparatus.attrs.transform.match(
          /translate\(([-\d.e]+) ([-\d.e]+)\) rotate\(([-\d.e]+)\)/
        ),
        origin = { x: +transform[1], y: +transform[2] };
      near(+beam.attrs.x, 0, 'approaching beam face remains on the measured station');
      near(
        (origin.x - p.x) * p.tx + (origin.y - p.y) * p.ty,
        0,
        'apparatus face has no along-track offset'
      );
      for (let side = 0; side < 2; side++) {
        const tick = group.children[(lane - 1) * 20 + hurdle * 2 + side],
          width = +tick.attrs['stroke-width'];
        near(width, 0.05, 'position tick remains fifty millimetres wide');
        const start = { x: +tick.attrs.x1, y: +tick.attrs.y1 },
          end = { x: +tick.attrs.x2, y: +tick.attrs.y2 };
        near(
          Math.hypot(end.x - start.x, end.y - start.y),
          0.1,
          'position tick remains ten centimetres long'
        );
        near(
          (end.x - start.x) * p.tx + (end.y - start.y) * p.ty,
          0,
          'tick is perpendicular to the true route tangent'
        );
        // Recover all four physical stroke corners, then project them in the
        // actual athlete direction. The closest edge must be at station zero.
        const along = [];
        for (const q of [start, end])
          for (const w of [-width / 2, width / 2])
            along.push((q.x + w * p.tx - p.x) * p.tx + (q.y + w * p.ty - p.y) * p.ty);
        const faceGap = Math.abs(Math.min(...along));
        maxFaceGap = Math.max(maxFaceGap, faceGap);
        near(
          Math.min(...along),
          0,
          'near edge of painted tick coincides with the actual approaching hurdle face'
        );
        near(Math.max(...along), 0.05, 'entire tick paint extends forward from the measured face');
        const across = (start.x - p.x) * n.x + (start.y - p.y) * n.y;
        near(
          across,
          36.5 + (lane - 1) * 1.22 - A.rho(lane) + (side === 0 ? 0 : 1.07),
          'tick stays at its legal clear-lane side'
        );
      }
    }
}
const common = fixed.find((n) => n.attrs['data-event'] === '4x400-common');
assert.equal(
  common.children.length,
  11,
  'official common markers are seven entry and four exit bars'
);
checks++;
for (const alias of ['4x400', '4x800']) {
  assert(
    common.attrs['data-shared-events'].split(' ').includes(alias),
    'both unlaned relays use this one physical family'
  );
  checks++;
}
for (let i = 0; i < common.children.length; i++) {
  const bar = common.children[i],
    entry = i < 7,
    lane = entry ? i + 2 : i - 7 + 2,
    x = A.G.right + (entry ? -10 : 10) + 0.025;
  near(+bar.attrs.x1, x, 'common boundary is exactly parallel to the finish');
  near(+bar.attrs.x2, x, 'both ends retain the same survey x');
  near(
    Math.abs(+bar.attrs.y2 - +bar.attrs.y1),
    0.8,
    'common blue bars are eight hundred millimetres long'
  );
  near(
    (+bar.attrs.y1 + +bar.attrs.y2) / 2,
    A.G.cy + 36.5 + (lane - 0.5) * 1.22 - 0.025,
    'bar is centred in the clear lane width'
  );
}
// The lane-1 hook is the shared first-exchange mark. Recover its real SVG
// vertices instead of accepting event aliases without a physical boundary.
const first = fixed.find(
  (n) => n.attrs['data-marking'] === 'relay-zone' && n.attrs['data-event'] === '4x400'
);
for (const [i, offset] of [
  [0, -10],
  [1, 10],
]) {
  const path = first.children[i].attrs.d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number),
    p = A.trackPoint(A.C1 + offset, 1),
    nx = -p.ty,
    ny = p.tx;
  near(
    path[0],
    p.x + nx * (36.5 - A.R1) + p.tx * 0.025,
    'shared lane-1 hook follows the actual finish station x',
    1e-8
  );
  near(
    path[1],
    p.y + ny * (36.5 - A.R1) + p.ty * 0.025,
    'shared lane-1 hook follows the actual finish station y',
    1e-8
  );
}
// Inspect the actual guide nodes and clipping rectangle. The outer guides
// overshoot the plane before clipping, eliminating oblique butt-cap notches.
const highlight = node('g');
A.paintCommonRelayZone(highlight, '#b4d2df');
const h = walk(highlight),
  clip = h.find((n) => n.tag === 'clipPath'),
  rect = clip.children[0],
  outer = h.find((n) => n.attrs['data-common-relay-boundaries']);
near(+rect.attrs.x, A.G.right - 10, 'common highlight begins at measured entry plane');
near(
  +rect.attrs.width,
  20,
  'common highlight spans exactly twenty metres between transverse planes'
);
assert.equal(outer.attrs['clip-path'], 'url(#' + clip.attrs.id + ')');
checks++;
assert.equal(
  h.filter((n) => n.attrs['data-zone-lane']).length,
  8,
  'all eight common exchange guides remain visible'
);
checks++;
for (const guide of outer.children) {
  near(+guide.attrs['data-zone-start'], -11, 'outer guide starts before clip');
  near(+guide.attrs['data-zone-end'], 12, 'outer guide ends beyond clip');
}
const inner = h.find((n) => n.attrs['data-zone-lane'] === '1');
near(+inner.attrs['data-zone-start'], -10, 'lane-1 guide begins on hooked entry');
near(+inner.attrs['data-zone-end'], 10, 'lane-1 guide ends on hooked arc mark');
console.log(
  `${checks} ground paint-edge checks passed; maximum hurdle face/position-mark rear-edge gap ${(maxFaceGap * 1000).toFixed(9)} mm; shared relay exit matches the official parallel finish boundary.`
);
