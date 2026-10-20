'use strict';
const fs = require('fs'),
  vm = require('vm'),
  assert = require('assert/strict');
const context = {};
vm.createContext(context);
vm.runInContext(require('./helpers/source.cjs').readSource('football-goals.js'), context);
const element = (tag, attrs, text, parent) => {
  const node = { tag, attrs, text, children: [] };
  if (parent) parent.children.push(node);
  return node;
};
const elGroup = (parent, attrs = {}) => element('g', attrs, undefined, parent);
const { createFootballPitch } = require('../src/football-pitch.js');
const { createSteeplePrecision } = require('../src/steeple-precision.js');
const G = { left: 55, right: 139.39, cy: 66, straight: 84.39 };
const root = element('g', {}),
  P = createFootballPitch(G).P,
  S = createSteeplePrecision(G);
const result = context.paintFootballGoals(root, element, elGroup, P);
let checks = 0;
const near = (actual, expected, tolerance = 1e-10) => {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
  checks++;
};
const walk = (node) => [node, ...node.children.flatMap(walk)];
assert.equal(result.goals.length, 2);
checks++;
for (const g of result.goals) {
  const left = g.side === 'left';
  near(g.front, left ? 44.755 : 149.635);
  near(g.back, left ? 42.695 : 151.695);
  near(g.postCentres[0].y, 62.28);
  near(g.postCentres[1].y, 69.72);
  near(g.postCentres[1].y - g.postCentres[0].y - 2 * g.postRadius, 7.32);
  near(2 * g.postRadius, 0.12);
  near(Math.abs(g.back - g.rearLine), 2);
  near(g.net.width, 2);
  near(g.net.height, 7.32);
  near(g.net.twine, 0.004);
  near(g.net.spacing, 0.12);
  const nodes = walk(g.group),
    posts = nodes.filter((n) => n.attrs['data-goal-part'] === 'post'),
    bar = nodes.find((n) => n.attrs['data-goal-part'] === 'crossbar');
  assert.equal(posts.length, 2);
  checks++;
  near(Number(bar.attrs['stroke-width']), 0.12);
  assert.equal(nodes.filter((n) => n.tag === 'text').length, 0);
  checks++;
  const mesh = nodes.find((n) => n.attrs.class === 'football-net-mesh');
  assert.equal(mesh.attrs.display, 'none');
  checks++;
  assert.equal(mesh.attrs['stroke-width'], 0.004);
  checks++;
  const vSegments = [...mesh.attrs.d.matchAll(/M([-\d.]+) ([-\d.]+)V([-\d.]+)/g)].map((m) => ({
    x: +m[1],
    y0: +m[2],
    y1: +m[3],
  }));
  const hSegments = [...mesh.attrs.d.matchAll(/M([-\d.]+) ([-\d.]+)H([-\d.]+)/g)].map((m) => ({
    x0: +m[1],
    y: +m[2],
    x1: +m[3],
  }));
  const verticals = vSegments.map((s) => s.x),
    horizontals = hSegments.map((s) => s.y);
  assert.equal(verticals.length, 17);
  assert.equal(horizontals.length, 60);
  checks += 2;
  for (let i = 1; i < verticals.length; i++) near(verticals[i] - verticals[i - 1], 0.12, 1e-9);
  for (let i = 1; i < horizontals.length; i++)
    near(horizontals[i] - horizontals[i - 1], 0.12, 1e-9);
  const shadow = nodes.find((n) => n.attrs.class === 'football-goal-shadow');
  assert.equal(shadow.attrs['stroke-linejoin'], 'round');
  checks++;
  const shift = shadow.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  near(+shift[1], 0.025);
  near(+shift[2], 0.035);
  near(+shift[1], S.contactShadow.x);
  near(+shift[2], S.contactShadow.y);
  near(g.net.sideProjection, 0.06);
  near(g.net.projectedHeight, 7.44);
  const anchorShadows = shadow.children.filter((n) => n.tag === 'circle');
  assert.equal(anchorShadows.length, 2);
  checks++;
  for (const anchor of anchorShadows) {
    near(anchor.attrs.cx, g.back);
    near(anchor.attrs.r, 0.025);
  }
  const support = nodes.find((n) => n.attrs.class === 'football-goal-supports');
  assert.equal(
    support.attrs['stroke-linejoin'],
    shadow.attrs['stroke-linejoin'],
    'shadow footprints use the same rounded tube corners as real support'
  );
  checks++;
  const frame = nodes.find((n) => n.attrs.class === 'football-goal-frame'),
    net = nodes.find((n) => n.attrs.class === 'football-goal-net');
  assert(
    g.group.children.indexOf(shadow) < g.group.children.indexOf(support),
    'shadow behind support'
  );
  assert(g.group.children.indexOf(support) < g.group.children.indexOf(net), 'net above support');
  assert(g.group.children.indexOf(net) < g.group.children.indexOf(frame), 'net below front frame');
  checks += 3;
  const highlight = nodes.find((n) => n.attrs['data-goal-part'] === 'crossbar-highlight'),
    hwidth = highlight.attrs['stroke-width'];
  assert(
    highlight.attrs.x1 - hwidth / 2 >= g.front - 0.06 &&
      highlight.attrs.x1 + hwidth / 2 <= g.front + 0.06,
    'highlight inside physical 120mm top beam'
  );
  checks++;
  near(highlight.attrs.y1, 62.28);
  near(highlight.attrs.y2, 69.72);
  assert.equal(highlight.attrs['stroke-linecap'], 'butt');
  checks++;
  // Mesh is a physical 4 mm plan grid with butt caps. Every strand footprint
  // stays in the clear net rectangle and terminates on its perimeter rope;
  // nothing projects into the playing area beyond the rear goal-line edge.
  // The additional 60mm at each side is the projection of the connecting side
  // panel; the roof rectangle and statutory goal opening both stay 7.32m.
  assert.equal(mesh.attrs['stroke-linecap'], 'butt');
  checks++;
  for (const v of vSegments) {
    assert(
      v.x - 0.002 >= g.net.x && v.x + 0.002 <= g.net.x + g.net.width,
      'vertical strand side edges stay within net'
    );
    checks++;
    near(v.y0, g.net.projectedY, 1e-6);
    near(v.y1, g.net.projectedY + g.net.projectedHeight, 1e-6);
    near(g.net.y - v.y0, 0.06, 1e-6);
    near(v.y1 - (g.net.y + g.net.height), 0.06, 1e-6);
  }
  for (const h of hSegments) {
    near(h.x0, g.net.x, 1e-6);
    near(h.x1, g.net.x + g.net.width, 1e-6);
    assert(
      h.y - 0.002 >= g.net.y && h.y + 0.002 <= g.net.y + g.net.height,
      'horizontal strand side edges stay within net'
    );
    checks++;
  }
  near(verticals[0] - g.net.x, g.net.x + g.net.width - verticals.at(-1), 1e-6);
  near(verticals[0] - g.net.x, 0.04, 1e-6);
  near(horizontals[0] - g.net.y, g.net.y + g.net.height - horizontals.at(-1), 1e-6);
  // Actual front frame covers the whole painted goal line in its span; two
  // posts plus the round-ended crossbar produce one clean 120mm footprint.
  near(Math.min(g.front - 0.06, g.front + 0.06), left ? P.left : P.right - 0.12);
  near(Math.max(g.front - 0.06, g.front + 0.06), left ? P.left + 0.12 : P.right);
  for (const post of posts) {
    near(post.attrs.cx, g.front);
    near(post.attrs.r, 0.06);
  }
  for (const node of nodes)
    for (const value of Object.values(node.attrs)) {
      assert(!/NaN|Infinity|undefined/.test(String(value)));
      checks++;
    }
}
console.log(
  `${checks} football goal geometry checks passed: clear opening 7.32 m, 0.12 m frame, selected 2 m net depth, 0.12 m square mesh / 4 mm twine.`
);
