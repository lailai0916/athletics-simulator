const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
let checks = 0,
  measurements = 0;
const glyphs = {
  1: { left: 0.04, right: 0.34, ascent: 0.7, descent: 0 },
  8: { left: 0.02, right: 0.58, ascent: 0.74, descent: 0.02 },
  9: { left: 0.02, right: 0.58, ascent: 0.73, descent: 0.02 },
  10: { left: 0.03, right: 1.18, ascent: 0.73, descent: 0.02 },
  16: { left: 0.03, right: 1.18, ascent: 0.74, descent: 0.02 },
};
const context2d = {
  font: '',
  measureText(text) {
    measurements++;
    const size = Number(this.font.match(/([\d.]+)px/)[1]),
      m = glyphs[text] || glyphs['8'];
    return {
      width: (m.left + m.right) * size,
      actualBoundingBoxLeft: m.left * size,
      actualBoundingBoxRight: m.right * size,
      actualBoundingBoxAscent: m.ascent * size,
      actualBoundingBoxDescent: m.descent * size,
    };
  },
};
const nodes = [];
const ctx = {
  console,
  Math,
  document: {
    createElement: () => ({ getContext: () => context2d }),
    querySelectorAll: () => nodes,
  },
  getComputedStyle: (n) => ({
    fontSize: n.style.fontSize || n.baseSize + 'px',
    fontFamily: 'Test Sans',
    fontStyle: 'normal',
    fontWeight: '600',
    fontStretch: 'normal',
    fontKerning: 'none',
    direction: 'ltr',
  }),
};
vm.createContext(ctx);
vm.runInContext(require('./helpers/source.cjs').readSource('label-layout.js'), ctx);
function node(text, packed = false, lane = false) {
  const n = {
    textContent: text,
    baseSize: packed ? 0.26 : 0.3,
    dataset: {},
    style: {},
    attrs: { x: '3.5', y: '7.25' },
    classList: { contains: (c) => c === (lane ? 'lane-label' : 'point-label') },
    getAttribute: (k) => n.attrs[k] ?? null,
    setAttribute(k, v) {
      n.attrs[k] = String(v);
    },
  };
  nodes.push(n);
  return n;
}
const near = (a, b, message, eps = 1e-12) => {
  assert(Number.isFinite(a) && Math.abs(a - b) < eps, `${message}: ${a} vs ${b}`);
  checks++;
};
// The actual rendered ink, including a two-digit bib, must fit the token's
// declared safe box; font advance width or CSS line-box centring is insufficient.
{
  const n = node('10', true);
  Object.assign(n.dataset, { maxInkWidth: '.30', maxInkHeight: '.23' });
  ctx.centerLabel(n);
  assert(Number(n.dataset.inkWidth) <= 0.3 + 1e-12, 'two-digit ink width fits packed token');
  checks++;
  assert(Number(n.dataset.inkHeight) <= 0.23 + 1e-12, 'two-digit ink height fits packed token');
  checks++;
  const size = parseFloat(n.style.fontSize),
    m = glyphs['10'];
  near(Number(n.attrs.x) + ((m.right - m.left) * size) / 2, 3.5, 'actual ink horizontal centre');
  near(Number(n.attrs.y) - ((m.ascent - m.descent) * size) / 2, 7.25, 'actual ink vertical centre');
}
// The whole numeral range stays inside the physical safe rectangle/circle.
for (const packed of [false, true])
  for (let i = 1; i <= 16; i++) {
    const n = node(String(i), packed),
      limit = packed
        ? { width: 0.3, height: 0.23, r: 0.21 }
        : { width: 0.36, height: 0.31, r: 0.27 };
    Object.assign(n.dataset, {
      labelCenterX: '0',
      labelCenterY: '0',
      maxInkWidth: limit.width,
      maxInkHeight: limit.height,
    });
    ctx.centerLabel(n);
    const width = Number(n.dataset.inkWidth),
      height = Number(n.dataset.inkHeight);
    assert(
      width <= limit.width + 1e-12 && height <= limit.height + 1e-12,
      'bib ink stays in its declared safe box'
    );
    assert(
      Math.hypot(width / 2, height / 2) < limit.r,
      'entire ink rectangle fits inside the round marker'
    );
    checks += 2;
    near(Number(n.dataset.inkCenterX), 0, 'ink centre x metadata');
    near(Number(n.dataset.inkCenterY), 0, 'ink centre y metadata');
  }
// Changing between one and two digits recovers the authored font size; repeated
// measurement, cache invalidation and reorientation do not gradually shrink it.
{
  const n = node('9', true);
  Object.assign(n.dataset, { maxInkWidth: '.30', maxInkHeight: '.23' });
  ctx.centerLabel(n);
  const first = { size: n.style.fontSize, x: n.attrs.x, y: n.attrs.y },
    count = measurements;
  for (let i = 0; i < 100; i++) ctx.centerLabel(n);
  assert.equal(measurements, count, 'normalised per-font metrics reused without size drift');
  assert.equal(n.style.fontSize, first.size);
  assert.equal(n.attrs.x, first.x);
  assert.equal(n.attrs.y, first.y);
  checks += 4;
  ctx.setLabel(n, '10');
  assert(
    parseFloat(n.style.fontSize) < parseFloat(first.size),
    'two digits fit by proportional scaling'
  );
  checks++;
  ctx.setLabel(n, '9');
  assert.equal(n.style.fontSize, first.size, 'one digit regains its authored size');
  checks++;
  vm.runInContext('labelMetricsCache.clear()', ctx);
  ctx.centerLabel(n);
  assert.equal(n.style.fontSize, first.size, 'font metric cache refresh preserves size');
  checks++;
}
// Lane numerals have a real 0.60m ink height and share the exact clear-lane
// centre, regardless of each digit's ascent/descent or CSS line-box metrics.
for (const text of ['1', '8']) {
  const n = node(text, false, true);
  n.dataset.glyphHeight = '.60';
  ctx.centerLabel(n);
  near(Number(n.dataset.inkHeight), 0.6, 'lane number actual painted glyph height');
  near(Number(n.dataset.inkCenterX), 3.5, 'lane number clear-width x centre');
  near(Number(n.dataset.inkCenterY), 7.25, 'lane number clear-width y centre');
}
// A batch snapshots all style reads before mutating any text geometry.
{
  const ns = [node('1'), node('8')];
  ctx.document.querySelectorAll = () => ns;
  const order = [],
    original = ctx.getComputedStyle;
  ctx.getComputedStyle = (n) => {
    order.push('read');
    return original(n);
  };
  for (const n of ns) {
    const set = n.setAttribute;
    n.setAttribute = function (k, v) {
      order.push('write');
      return set.call(this, k, v);
    };
  }
  ctx.centerAllLabels();
  assert(order.indexOf('write') >= 2, 'all glyph style reads precede positional writes');
  checks++;
}
console.log(`${checks} label-layout checks passed.`);
