const assert = require('node:assert/strict');
const { createSteeplePrecision } = require('../src/steeple-precision.js');
const { steepleKerbLayout } = require('../src/steeple-kerb-fragment.js');
const G = { left: 55, right: 139.39, cy: 66, r: 36.5, straight: 84.39 };
const S = createSteeplePrecision(G),
  K = steepleKerbLayout(S, G);
const PI = Math.PI,
  angle0 = -PI / 2 - S.beta;
const point = (r, u) => ({ x: -r * Math.sin(u), y: -r * Math.cos(u) });
let checks = 0;
function close(a, b, tolerance, label) {
  assert(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
  checks++;
}
function inDiversionInterior(x, y) {
  // Two finite transition annuli and their middle straight; all metres.
  for (const sign of [-1, 1]) {
    const yy = y * sign,
      cy = S.cyOffset,
      dx = x + S.cxOffset,
      dy = yy - cy;
    const a = Math.atan2(-dy, dx),
      r = Math.hypot(dx, dy);
    if (a >= -PI && a <= angle0 && r > 16 + 1e-8 && r < 19.8 - 1e-8) return true;
  }
  return (
    x > -S.cxOffset - 19.8 + 1e-8 && x < -S.cxOffset - 16 - 1e-8 && Math.abs(y) < S.cyOffset - 1e-8
  );
}
// Independently substitute both centreline roots into their source boundaries.
for (let side = 0; side < 2; side++) {
  const sign = side === 0 ? -1 : 1,
    angles = K.centerGaps[side];
  const start = point(36.44, angles[side === 0 ? 0 : 1]);
  const end = point(36.44, angles[side === 0 ? 1 : 0]);
  close(
    Math.hypot(start.x + S.cxOffset, start.y - sign * S.cyOffset),
    16,
    1e-10,
    'centreline crosses inner R16 transition'
  );
  close(end.x, -S.cxOffset - 19.8, 1e-10, 'centreline crosses outer straight');
  assert(Math.abs(end.y) < S.cyOffset);
  checks++;
}
// A kerb is a strip, not a zero-width curve. Its conservative cut starts when
// the R36.5 outer edge meets the diversion and ends when R36.38 clears it.
const first = point(36.5, K.gaps[0][0]),
  last = point(36.38, K.gaps[0][1]);
close(
  Math.hypot(first.x + S.cxOffset, first.y + S.cyOffset),
  16,
  1e-10,
  'full-strip first contact'
);
close(last.x, -S.cxOffset - 19.8, 1e-10, 'full-strip last contact');
close(K.gaps[1][0], PI - K.gaps[0][1], 1e-12, 'symmetric exit start');
close(K.gaps[1][1], PI - K.gaps[0][0], 1e-12, 'symmetric exit end');
// Sweep the entire left semicircle at <1.9 cm steps, across the full 120 mm
// kerb thickness at 10 mm intervals. No retained kerb may occupy the runway.
for (let u = 0; u <= PI; u += 0.0005)
  for (let r = 36.38; r <= 36.500001; r += 0.01) {
    const removed = K.gaps.some(([a, b]) => u >= a && u <= b),
      p = point(r, u);
    if (!removed)
      assert(!inDiversionInterior(p.x, p.y), `retained kerb intersects diversion at u=${u},r=${r}`);
    checks++;
  }
// Validate actual athlete trajectory crossings of each edge and the centre of
// the kerb. The route must cross wholly inside each removed portal.
const crossings = [];
for (const [side, from, to] of [
  [0, S.starts[3], S.starts[4]],
  [1, S.starts[5], S.starts[6]],
]) {
  const output = [];
  for (const target of [36.38, 36.44, 36.5]) {
    let a = from,
      b = to;
    for (let j = 0; j < 70; j++) {
      const d = (a + b) / 2,
        p = S.point(d),
        r = Math.hypot(p.x - G.left, p.y - G.cy);
      if ((side === 0 && r > target) || (side === 1 && r < target)) a = d;
      else b = d;
    }
    const d = (a + b) / 2,
      p = S.point(d),
      r = Math.hypot(p.x - G.left, p.y - G.cy),
      u = Math.atan2(G.left - p.x, G.cy - p.y);
    close(r, target, 1e-10, 'actual athlete trajectory intersects kerb radius');
    assert(u > K.gaps[side][0] && u < K.gaps[side][1], 'actual crossing inside portal');
    checks++;
    const clearance = Math.min(u - K.gaps[side][0], K.gaps[side][1] - u) * 36.44;
    assert(clearance > 0.5, 'at least 0.5 m longitudinal portal clearance at every route crossing');
    checks++;
    output.push({
      radius: target,
      distance: d,
      angleDegrees: (u * 180) / PI,
      portalClearanceMetres: clearance,
    });
  }
  crossings.push({ side: side === 0 ? 'entry' : 'exit', points: output });
}
assert(K.gaps.length === 2);
assert(K.retainedMiddleLength > 28);
assert(K.retainedMiddleLength < 29);
close(K.gapLengths[0], 16.031501643471, 0.000000001, 'entry kerb gap');
checks += 3;
console.log(
  JSON.stringify(
    {
      checks,
      gapLengthsMetres: K.gapLengths,
      retainedMiddleMetres: K.retainedMiddleLength,
      crossings,
    },
    null,
    2
  )
);
