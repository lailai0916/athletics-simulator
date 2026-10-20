const { createSteeplePrecision } = require('../src/steeple-precision.js');
const assert = require('node:assert/strict');
const G = { left: 55, right: 139.39, cy: 66, straight: 84.39 };
const S = createSteeplePrecision(G);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let checks = 0;
function close(a, b, tol, label) {
  assert(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);
  checks++;
}
// Independent published survey stations, WA Facilities Manual pp.46/49–51.
close(S.lap, 396.0849, 1e-9, 'inside-water lap');
close(S.pre, 227.4064, 0.001, 'rounding of the published no-jump lead-in');
close(S.pre + 7 * S.lap, 3000, 1e-9, 'full race distance');
close(S.starts[1], 115.6106, 0.0001, 'normal semicircle');
close(S.starts[2], 200.0006, 0.0001, 'opposite tangent');
close(S.starts[3] - S.starts[2], 27.3307, 0.0001, 'outer part of water bend');
close(S.starts[4] - S.starts[3], 13.41545, 0.0001, 'transition arc');
close(S.lengths[4], 30.202, 1e-9, 'central tangent');
close(S.cxOffset, 13.863, 0.001, 'published X survey offset');
close(S.cyOffset, 15.101, 0.001, 'published Y survey offset');
close(S.pit.y, 69.8, 1e-9, 'water hurdle offset 3.8 m beyond bend axis');
close(S.pit.width, 3.66, 1e-9, 'pit width');
close(S.pit.height, 3.66, 1e-9, 'pit length including barrier');
const water = S.point(259.648);
close(water.x, S.pit.x + 3.66 - 0.2, 0.00001, '0.20 m running line offset from pit inside edge');
close(water.y, S.pit.y, 0.001, 'water barrier survey station');
close(dist(S.point(0), S.point(S.lap)), 0, 1e-10, 'closed course');
let maxSeam = 0,
  minTangent = 1;
for (const station of S.starts.slice(1, -1)) {
  const a = S.point(station - 1e-7),
    b = S.point(station + 1e-7);
  maxSeam = Math.max(maxSeam, dist(a, b));
  minTangent = Math.min(minTangent, a.tx * b.tx + a.ty * b.ty);
  assert(dist(a, b) < 0.000001, 'position continuous at segment boundary');
  assert(a.tx * b.tx + a.ty * b.ty > 0.999999, 'tangent continuous at segment boundary');
  checks += 2;
}
for (let d = 0; d <= S.lap; d += 0.025) {
  const p = S.point(d);
  assert(Number.isFinite(p.x + p.y + p.tx + p.ty));
  checks++;
}
for (const b of S.barriers) {
  close(b.beamDepth, 0.127, 1e-9, 'beam square top dimension');
  if (!b.water) close(b.innerOffset + 0.3, -0.3, 1e-9, 'bar projects 0.30 m inside edge');
}
assert(S.barriers[0].width >= 5, 'recommended first hurdle width');
checks++;
assert.equal(S.barriers.filter((b) => b.fixed).length, 1);
checks++;
const jumps = [];
for (let lap = 0; lap < 7; lap++)
  for (const b of S.barriers)
    jumps.push({ distance: S.pre + lap * S.lap + b.station, water: b.water });
assert.equal(jumps.length, 35);
assert.equal(jumps.filter((x) => x.water).length, 7);
checks += 2;
assert(jumps.every((x) => x.distance > S.pre && x.distance < 3000));
checks++;
console.log(
  JSON.stringify(
    {
      checks,
      maxJoinGapMetres: maxSeam,
      minJoinTangentDot: minTangent,
      lap: S.lap,
      pre: S.pre,
      manualPublishedLeadInDeltaMetres: S.pre - 227.4064,
      waterStationPositionErrorMetres: Math.abs(water.y - S.pit.y),
      barriers: 35,
      waterJumps: 7,
    },
    null,
    2
  )
);

// Verify the actual SVG, including physical paint edges and rotated apparatus.
// These checks use published widths and independently reconstruct world-space
// footprints; they do not substitute illustration metadata for emitted shapes.
const { steepleKerbLayout } = require('../src/steeple-kerb-fragment.js');
const kerb = steepleKerbLayout(S, { ...G, r: 36.5 });
const node = (tag, attrs = {}, text, parent) => {
  const n = { tag, attrs: { ...attrs }, text, children: [], parent };
  if (parent) parent.children.push(n);
  return n;
};
const group = (parent, attrs = {}) => node('g', attrs, undefined, parent);
const walk = (n) => [n, ...n.children.flatMap(walk)];
const facilityParent = node('g'),
  facility = S.paintFacility(facilityParent, node, group),
  facilityNodes = walk(facility);
const border = facilityNodes.find((n) => n.attrs['data-sc-boundary'] === 'inner');
assert(border);
checks++;
close(border.attrs['stroke-width'], 0.05, 1e-12, 'emitted diversion paint is 50 mm');
assert.equal(border.attrs['stroke-linecap'], 'butt');
checks++;
assert.equal(border.attrs.d, S.innerPaintBorder);
checks++;
// Parse the two true circular arcs rather than a sampled silhouette.
const arcMatches = [...border.attrs.d.matchAll(/A([\d.]+) ([\d.]+) 0 0 0 ([-\d.]+) ([-\d.]+)/g)];
assert.equal(arcMatches.length, 2);
checks++;
for (const a of arcMatches) {
  close(+a[1], 15.975, 1e-9, 'infield-offset painted transition radius');
  close(+a[2], 15.975, 1e-9, 'circular transition has identical axes');
}
const origin = border.attrs.d.match(/^M([-\d.]+) ([-\d.]+)/);
const paintedEntry = { x: +origin[1], y: +origin[2] };
close(
  Math.hypot(paintedEntry.x - G.left, paintedEntry.y - G.cy),
  kerb.flatRadius,
  1e-8,
  'branch paint starts on the same circle as permanent oval paint'
);
const exit = arcMatches.at(-1);
close(
  Math.hypot(+exit[3] - G.left, +exit[4] - G.cy),
  kerb.flatRadius,
  1e-8,
  'branch paint rejoins permanent oval paint exactly'
);
// Throughout both transitions, the outside painted edge follows the true R16
// surveyed boundary. The selected 25 mm inset never steals running-surface width.
for (const sign of [-1, 1])
  for (let i = 0; i <= 180; i++) {
    const angle = -Math.PI + ((Math.PI / 2 - S.beta) * i) / 180,
      centre = { x: G.left - S.cxOffset, y: G.cy + sign * S.cyOffset };
    const rad = 15.975 + 0.025;
    close(
      Math.hypot(rad * Math.cos(angle), rad * Math.sin(angle)),
      16,
      1e-12,
      'physical outside paint edge retains 16 m construction radius'
    );
    const physical = {
      x: centre.x + 16 * Math.cos(angle),
      y: centre.y + sign * 16 * Math.sin(angle),
    };
    const painted = {
      x: centre.x + 15.975 * Math.cos(angle),
      y: centre.y + sign * 15.975 * Math.sin(angle),
    };
    close(dist(physical, painted), 0.025, 1e-12, '50 mm boundary centre remains 25 mm infield');
  }
const straight = S.innerPaintBorder.match(/L([-\d.]+) ([-\d.]+)/);
close(
  +straight[1] - 0.025,
  S.pit.x + S.pit.width,
  1e-8,
  'boundary outside paint edge coincides with right water-pit edge'
);
const fixed = facilityNodes.filter((n) => n.attrs['data-sc-obstacle']);
assert.equal(fixed.length, 1);
assert.equal(fixed[0].attrs['data-sc-fixed'], 'true');
checks += 2;
const movingParent = node('g'),
  moving = S.paintBarriers(movingParent, node, group, { movableOnly: true });
const movingNodes = walk(moving),
  apparatus = [...fixed, ...movingNodes.filter((n) => n.attrs['data-sc-obstacle'])];
assert.equal(apparatus.length, 5);
checks++;
let minWhiteStripe = Infinity,
  maxShadowError = 0;
for (const apparatusNode of apparatus) {
  const id = +apparatusNode.attrs['data-sc-obstacle'],
    b = S.barriers.find((b) => b.index === id),
    nodes = walk(apparatusNode);
  const beam = nodes.find((n) => n.attrs['data-sc-part'] === 'beam');
  close(beam.attrs.width, 0.127, 1e-12, 'beam remains exactly 127 mm in running direction');
  close(beam.attrs.height, b.width, 1e-12, 'beam span unchanged by highlights/shadows');
  close(beam.attrs.x, 0, 1e-12, 'approach face stays at official hurdle station');
  const stripes = nodes
    .filter((n) => n.attrs['data-sc-part'] === 'beam-stripe')
    .sort((a, b) => a.attrs.y - b.attrs.y);
  assert(stripes.length > 0);
  checks++;
  let edge = b.innerOffset;
  for (let i = 0; i < stripes.length; i++) {
    const stripe = stripes[i],
      white = stripe.attrs.y - edge;
    assert(white >= 0.225 - 1e-10, 'every lighter stripe is at least 225 mm');
    checks++;
    minWhiteStripe = Math.min(minWhiteStripe, white);
    close(stripe.attrs.width, 0.127, 1e-12, 'dark stripe fits across top beam');
    close(
      stripe.attrs.y + stripes.at(-1 - i).attrs.y + stripe.attrs.height,
      2 * b.innerOffset + b.width,
      1e-10,
      'dark stripes mirrored around beam centre'
    );
    edge = stripe.attrs.y + stripe.attrs.height;
  }
  close(stripes[0].attrs.y - b.innerOffset, 0.225, 1e-10, 'first light end 225 mm');
  close(b.innerOffset + b.width - edge, 0.225, 1e-10, 'last light end 225 mm');
  const feet = nodes.filter((n) => n.attrs['data-sc-part'] === 'foot');
  assert.equal(feet.length, b.water ? 0 : 2);
  checks++;
  for (const foot of feet) {
    close(foot.attrs.width, 1.2, 1e-12, 'selected 1.2 m base unchanged');
    close(foot.attrs.height, 0.08, 1e-12, 'selected 80 mm base unchanged');
  }
  const highlight = nodes.find((n) => n.attrs['data-sc-part'] === 'beam-highlight'),
    hw = highlight.attrs['stroke-width'] / 2;
  assert(
    highlight.attrs.x1 - hw >= 0 && highlight.attrs.x1 + hw <= 0.127,
    'beam highlight stays within measured top footprint'
  );
  checks++;
  assert(
    highlight.attrs.y1 >= b.innerOffset && highlight.attrs.y2 <= b.innerOffset + b.width,
    'beam highlight has no end projection'
  );
  checks++;
  const shadow = nodes.find((n) => n.attrs.class === 'steeple-hurdle-shadow'),
    shift = shadow.attrs.transform.match(/translate\(([-\d.e]+) ([-\d.e]+)\)/);
  const lx = +shift[1],
    ly = +shift[2],
    dx = lx * b.p.tx - ly * b.p.ty,
    dy = lx * b.p.ty + ly * b.p.tx;
  close(dx, 0.025, 1e-12, 'all apparatus cast the same world-space shadow x');
  close(dy, 0.035, 1e-12, 'all apparatus cast the same world-space shadow y');
  maxShadowError = Math.max(maxShadowError, Math.hypot(dx - 0.025, dy - 0.035));
  assert(
    apparatusNode.children.indexOf(shadow) < apparatusNode.children.indexOf(beam),
    'contact shadow below exact beam footprint'
  );
  checks++;
  for (const n of nodes)
    for (const [key, value] of Object.entries(n.attrs)) {
      assert(!/NaN|Infinity|undefined/.test(String(value)), `valid emitted apparatus ${key}`);
      checks++;
    }
}
assert.equal(facilityNodes.filter((n) => n.tag === 'text').length, 0);
checks++;
console.log(
  JSON.stringify(
    {
      renderChecks: checks,
      minWhiteStripeMetres: minWhiteStripe,
      maximumWorldShadowTranslationErrorMetres: maxShadowError,
      diversionPaintInsetMetres: 0.025,
      boundaryPaintMetres: 0.05,
      beamDepthMetres: 0.127,
    },
    null,
    2
  )
);

// TR23 PDF pp.145–146 / printed p.142 and Facilities Manual Fig2.2.4.1c:
// the total 3.66m includes the 127mm bar, then about 1.20m of flat bottom.
close(S.pit.depth, 0.5, 1e-12, 'selected legal water depth');
close(S.pit.waterLength, 3.533, 1e-12, 'clear water length excludes bar');
close(S.pit.waterY - S.pit.y, 0.127, 1e-12, 'water begins at rear bar face');
close(S.pit.deepRun, 1.2, 1e-12, 'flat bottom behind bar is 1.20m');
close(S.pit.slopeRun, 2.333, 1e-12, 'remaining ramp reaches flush far edge');
assert(
  S.pit.slopeAngle >= 11.4 && S.pit.slopeAngle <= 13.4,
  'selected profile within 12.4 degree ±1 degree'
);
checks++;
for (let i = 0; i <= 120; i++)
  close(S.pit.depthAt(i / 100), 0.5, 1e-12, 'no early shallowing within equal-depth section');
for (let i = 0; i <= 200; i++)
  close(
    S.pit.depthAt(1.2 + (S.pit.slopeRun * i) / 200),
    0.5 * (1 - i / 200),
    1e-12,
    'water bottom has a uniform ramp'
  );
const depthGradient = facilityNodes.find(
  (n) => n.tag === 'linearGradient' && n.attrs.id === 'steeple-water-depth'
);
assert(depthGradient);
checks++;
assert.equal(depthGradient.attrs.gradientUnits, 'userSpaceOnUse');
checks++;
close(depthGradient.attrs.y1, S.pit.waterY, 1e-12, 'depth gradient uses physical rear bar face');
close(depthGradient.attrs.y2, S.pit.y + 3.66, 1e-12, 'depth gradient reaches physical far end');
assert.equal(depthGradient.children.length, 3);
checks++;
const stops = depthGradient.children;
close(
  stops[1].attrs.offset * (depthGradient.attrs.y2 - depthGradient.attrs.y1),
  1.2,
  1e-12,
  'rendered water plateau measures 1.20m'
);
assert.equal(
  stops[0].attrs['stop-color'],
  stops[1].attrs['stop-color'],
  'same water shade throughout equal-depth section'
);
checks++;
const surface = facilityNodes.find((n) => n.attrs['data-sc-water'] === 'surface');
assert.equal(surface.attrs.fill, 'url(#steeple-water-depth)');
checks++;
assert(
  !facilityNodes.some((n) => n.attrs.fill === 'url(#water-depth)'),
  'facility no longer depends on old unprofiled template gradient'
);
checks++;
close(
  surface.attrs.y,
  S.pit.y,
  1e-12,
  'water paint underlaps opaque bar to avoid an antialias seam'
);
close(surface.attrs.height, 3.66, 1e-12, 'underpainting does not change total facility length');
assert(
  facility.children.indexOf(surface) < facility.children.indexOf(fixed[0].parent),
  'opaque bar occludes upstream water underpaint'
);
checks++;

// Primary marking-plan PDF: the lane-1 square is next to the inner side,
// not next to lane 2. The lane-3 square is next to that lane's outer stripe,
// not inside lane 4. Reference bottom-straight vector coordinates (PDF units):
// inside border 900.780, lane1 outer 910.655, lane3 outer 930.401;
// symbols 901.278..905.325 and 925.944..929.991 (symbols are enlarged in plan).
const marksParent = node('g'),
  marks = S.paintFixedHurdleMarks(marksParent, node, group),
  markNodes = walk(marks).filter((n) => n.attrs['data-sc-marking']);
assert.equal(markNodes.length, 8);
checks++;
let minLane1Radius = Infinity,
  maxLane1Radius = -Infinity,
  minLane3Radius = Infinity,
  maxLane3Radius = -Infinity;
for (const n of markNodes) {
  close(n.attrs.width, 0.125, 1e-12, 'actual marker length 125mm');
  close(n.attrs.height, 0.125, 1e-12, 'actual marker width 125mm');
  const b = S.barriers.find((b) => b.index === n.attrs['data-sc-marking']),
    q = b.p,
    t = n.attrs.transform.match(/translate\(([-\d.e]+) ([-\d.e]+)\) rotate\(([-\d.e]+)\)/);
  const centre = { x: +t[1], y: +t[2] },
    a = (+t[3] * Math.PI) / 180;
  const onBend = b.station < S.starts[1] || (b.station > S.starts[2] && b.station < S.starts[7]);
  const radius = (p) => (onBend ? Math.hypot(p.x - G.right, p.y - G.cy) : Math.abs(p.y - G.cy));
  const corners = [];
  for (const x of [-0.0625, 0.0625])
    for (const y of [-0.0625, 0.0625])
      corners.push({
        x: centre.x + x * Math.cos(a) - y * Math.sin(a),
        y: centre.y + x * Math.sin(a) + y * Math.cos(a),
      });
  if (n.attrs['data-sc-marking-side'] === 'inside-lane-1') {
    close(radius(centre), 36.5625, 1e-10, 'lane-1 mark centre next to physical inner border');
    for (const corner of corners) {
      const r = radius(corner);
      assert(
        r >= 36.5 - 1e-10 && r <= 37.67 + 1e-10,
        'whole inside-lane-1 square stays on lane-1 clear red surface'
      );
      checks++;
      minLane1Radius = Math.min(minLane1Radius, r);
      maxLane1Radius = Math.max(maxLane1Radius, r);
    }
  } else {
    assert.equal(n.attrs['data-sc-marking-side'], 'outside-lane-3');
    checks++;
    for (const corner of corners) {
      const r = radius(corner);
      assert(
        r >= 38.94 - 1e-10 && r <= 40.11 + 1e-10,
        'whole outside-lane-3 square stays on lane-3 clear red surface, including curved corners'
      );
      checks++;
      minLane3Radius = Math.min(minLane3Radius, r);
      maxLane3Radius = Math.max(maxLane3Radius, r);
    }
  }
}
console.log(
  JSON.stringify(
    {
      totalSteepleChecks: checks,
      waterDepthMetres: S.pit.depth,
      waterEqualDepthRunMetres: S.pit.deepRun,
      waterRampAngleDegrees: S.pit.slopeAngle,
      waterRampMetres: S.pit.slopeRun,
      lane1MarkerPreviousCentreRadiusMetres: 37.6575,
      lane1MarkerCorrectCentreRadiusMetres: 36.5625,
      lane1MarkerRadialEnvelopeMetres: [minLane1Radius, maxLane1Radius],
      lane3MarkerRadialEnvelopeMetres: [minLane3Radius, maxLane3Radius],
    },
    null,
    2
  )
);
