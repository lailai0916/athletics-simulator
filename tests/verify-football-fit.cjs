// Independent fit audit for a centred 105 x 68 m football pitch. No UI/file
// modifications. Dimensions measured at outside edges of the boundary paint.
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  vm = require('node:vm');
const { createSteeplePrecision } = require('../src/steeple-precision.js');
const G = { left: 55, right: 139.39, cy: 66, r: 36.5, straight: 84.39, w: 1.22 };
// Read the actual implementation; accept either its CommonJS export or its
// plain function declaration used by the single-file HTML build.
const footballContext = { module: { exports: {} }, console, Math };
vm.createContext(footballContext);
vm.runInContext(require('./helpers/source.cjs').readSource('football-pitch.js'), footballContext, {
  filename: 'football-pitch.js',
});
const createFootballPitch =
  footballContext.module.exports.createFootballPitch || footballContext.createFootballPitch;
assert.equal(typeof createFootballPitch, 'function', 'actual football geometry factory exported');
const football = createFootballPitch(G),
  P = football.P;
assert(P, 'actual football factory returns P');
const SC = createSteeplePrecision(G),
  centre = { x: P.cx, y: P.cy };
const pitch = { left: P.left, right: P.right, top: P.top, bottom: P.bottom };
const netDepth = P.goalDepth,
  postDiameter = P.goalPostWidth || P.line,
  goalWidth = P.goalWidth;
let checks = 0;
const rect = (r) => [
  { x: r.left, y: r.top },
  { x: r.right, y: r.top },
  { x: r.right, y: r.bottom },
  { x: r.left, y: r.bottom },
];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const project = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { x: a.x + t * dx, y: a.y + t * dy };
};
const pointSegment = (p, a, b) => distance(p, project(p, a, b));
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a, b, c, d) {
  return (
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0 &&
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
  );
}
function contains(poly, p) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
}
function polygonDistance(a, b) {
  if (contains(a, b[0]) || contains(b, a[0])) return 0;
  let min = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      const a1 = a[i],
        a2 = a[(i + 1) % a.length],
        b1 = b[j],
        b2 = b[(j + 1) % b.length];
      if (intersects(a1, a2, b1, b2)) return 0;
      min = Math.min(
        min,
        pointSegment(a1, b1, b2),
        pointSegment(a2, b1, b2),
        pointSegment(b1, a1, a2),
        pointSegment(b2, a1, a2)
      );
    }
  return min;
}
function trackClearance(points, innerRadius = 36.38) {
  // The inner field is a capsule. Distance to the capsule's inside boundary
  // is R minus distance to its central straight segment; maximum over a
  // convex polygon occurs at a vertex, so this corner check is exact.
  return Math.min(
    ...points.map(
      (p) => innerRadius - Math.hypot(p.x - Math.max(G.left, Math.min(G.right, p.x)), p.y - G.cy)
    )
  );
}
const halfLine = P.line / 2;
const pitchPoly = rect(pitch),
  expanded = rect({
    left: pitch.left - halfLine,
    right: pitch.right + halfLine,
    top: pitch.top - halfLine,
    bottom: pitch.bottom + halfLine,
  });
assert.equal(P.line, 0.12);
assert.equal(P.goalDepth, 2);
assert.equal(P.length, 105);
assert.equal(P.width, 68);
assert.equal(pitch.right - pitch.left, P.length);
assert.equal(pitch.bottom - pitch.top, P.width);
for (const [value, expected] of [
  [P.left, 44.695],
  [P.right, 149.695],
  [P.top, 32],
  [P.bottom, 100],
])
  assert(Math.abs(value - expected) < 1e-10);
checks += 10;
// Inspect the real centreline geometry, not only its dimension metadata.
const B = football.geometry.boundary;
for (const [value, expected] of [
  [B.left, P.left + halfLine],
  [B.right, P.right - halfLine],
  [B.top, P.top + halfLine],
  [B.bottom, P.bottom - halfLine],
]) {
  assert(
    Math.abs(value - expected) < 1e-10,
    'rendered 120 mm boundary remains inside legal outer edge'
  );
  checks++;
}
assert.equal(football.geometry.circle.outerRadius, 9.15);
checks++;
const pitchKerbClearance = trackClearance(pitchPoly),
  expandedKerbClearance = trackClearance(expanded);
assert(pitchKerbClearance > 0.85 && expandedKerbClearance > 0.77);
checks += 2;
const nets = [
  {
    left: pitch.left - netDepth - postDiameter / 2,
    right: pitch.left + postDiameter / 2,
    top: centre.y - goalWidth / 2 - postDiameter,
    bottom: centre.y + goalWidth / 2 + postDiameter,
  },
  {
    left: pitch.right - postDiameter / 2,
    right: pitch.right + netDepth + postDiameter / 2,
    top: centre.y - goalWidth / 2 - postDiameter,
    bottom: centre.y + goalWidth / 2 + postDiameter,
  },
];
for (const net of nets) {
  assert(trackClearance(rect(net)) > 23);
  checks++;
}
const pitFrame = rect({
  left: SC.pit.x - 0.05,
  right: SC.pit.x + SC.pit.width + 0.05,
  top: SC.pit.y - 0.05,
  bottom: SC.pit.y + SC.pit.height + 0.05,
});
const netWaterClearance = polygonDistance(rect(nets[0]), pitFrame);
assert(netWaterClearance > 17.44);
checks++;
// The nearest actual shortcut boundary point is its northern/southern
// tangent junction. All later points lie further west and have y in pitch.
const branchJunctionX = G.left - G.r * Math.sin(SC.beta);
const pitchShortcutClearance = pitch.left - branchJunctionX;
assert(pitchShortcutClearance > 14.37);
checks++;
// The surveyed line is the outside edge, so the complete 50 mm stripe lies
// infield. At the tangent portal its infield edge is R36.45, not a centreline
// plus a symmetric 25 mm projection around the surveyed boundary.
const pitchShortcutPaintClearance = pitch.left - (G.left - (G.r - 0.05) * Math.sin(SC.beta));
assert(pitchShortcutPaintClearance > 14.34);
checks++;
const barrierClearances = [];
for (const b of SC.barriers) {
  const p = b.p,
    n = { x: -p.ty, y: p.tx },
    corner = (along, off) => ({
      x: p.x + p.tx * along + n.x * off,
      y: p.y + p.ty * along + n.y * off,
    });
  const beam = [
    corner(0, b.innerOffset),
    corner(0.127, b.innerOffset),
    corner(0.127, b.innerOffset + b.width),
    corner(0, b.innerOffset + b.width),
  ];
  let min = polygonDistance(pitchPoly, beam);
  if (!b.water)
    for (const y of [b.innerOffset + 0.15, b.innerOffset + b.width - 0.23]) {
      const base = [corner(-0.6, y), corner(0.6, y), corner(0.6, y + 0.08), corner(-0.6, y + 0.08)];
      min = Math.min(min, polygonDistance(pitchPoly, base));
    }
  assert(min >= 2.1999999);
  checks++;
  barrierClearances.push({ hurdle: b.index, water: b.water, pitchClearanceMetres: min });
}
// Warning is about removable upright objects, not flat football paint.
// A corner flag at the outside pitch corner would have <1 m to the track
// and must not be left in place for this athletics simulation.
const cornerFlagCentreToTrack = trackClearance(pitchPoly, 36.5);
assert(cornerFlagCentreToTrack < 1);
checks++;
console.log(
  JSON.stringify(
    {
      checks,
      legalPitchOutsideEdges: pitch,
      boundaryPaintMetres: P.line,
      requiredPaintCentreLines: B,
      pitchPaintToKerbInnerEdgeMetres: pitchKerbClearance,
      ifGivenCoordinatesUsedAsPaintCentrelinesThenClearanceMetres: expandedKerbClearance,
      pitchPaintToConstructionInnerEdgeMetres: trackClearance(pitchPoly, 36.5),
      pitchToDiversionTangentJunctionMetres: pitchShortcutClearance,
      pitchToComplete50mmDiversionPaintMetres: pitchShortcutPaintClearance,
      leftNetToWaterPitFrameMetres: netWaterClearance,
      goalNetToKerbClearanceMetres: nets.map((net) => trackClearance(rect(net))),
      barrierClearances,
      cornerFlagCentreToTrackMetres: cornerFlagCentreToTrack,
      cornerFlagsRecommended: false,
    },
    null,
    2
  )
);
