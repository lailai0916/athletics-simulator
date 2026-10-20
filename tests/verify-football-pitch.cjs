/* Independent IFAB Law 1 / FIFA recommended-size geometry and SVG checks.
 * Paint-edge dimensions are checked against standard numbers, not against
 * duplicated expressions from the implementation. Illustration-only values
 * (spot diameter, mowing bands, net depth) are labelled separately below.
 */
const assert = require('node:assert/strict');
const { createFootballPitch } = require('../src/football-pitch.js');
const G = { left: 55, right: 139.39, cy: 66, r: 36.5, w: 1.22, straight: 84.39 };
const F = createFootballPitch(G),
  { P, geometry: K } = F;
let checks = 0;
const near = (actual, expected, message, tolerance = 1e-9) => {
  assert(Number.isFinite(actual), message + ' finite');
  assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} expected ${expected}`);
  checks++;
};
const check = (condition, message) => {
  assert(condition, message);
  checks++;
};
near(P.cx, 97.195, 'pitch longitudinal centre');
near(P.cy, 66, 'pitch lateral centre');
near(P.length, 105, 'FIFA chosen recommended length');
near(P.width, 68, 'FIFA chosen recommended width');
check(
  P.length >= 100 && P.length <= 110 && P.width >= 64 && P.width <= 75,
  'international legal dimension ranges'
);
check(P.length > P.width, 'touchline longer than goal line');
check(P.line > 0 && P.line <= 0.12, 'all selected marking widths within 12cm');
near(P.goalWidth, 7.32, 'clear width between inside faces of posts');
near(P.goalHeight, 2.44, 'height below crossbar');
for (const [name, expected] of Object.entries({
  left: 44.695,
  right: 149.695,
  top: 32,
  bottom: 100,
}))
  near(P[name], expected, 'outside field ' + name);
near(K.boundary.left - P.line / 2, P.left, 'left white outer edge');
near(K.boundary.right + P.line / 2, P.right, 'right white outer edge');
near(K.boundary.top - P.line / 2, P.top, 'top white outer edge');
near(K.boundary.bottom + P.line / 2, P.bottom, 'bottom white outer edge');
near(K.boundary.right - K.boundary.left + P.line, 105, 'actual painted longitudinal envelope');
near(K.boundary.bottom - K.boundary.top + P.line, 68, 'actual painted lateral envelope');

// Rectangular areas are measured to the outside edges, from the inner goalpost
// faces. Four measured-front coordinates catch a half-line-width displacement.
const expectedBoxes = {
  'goal:left': { front: 50.195, top: 56.84, bottom: 75.16, depth: 5.5, clearWidth: 18.32 },
  'goal:right': { front: 144.195, top: 56.84, bottom: 75.16, depth: 5.5, clearWidth: 18.32 },
  'penalty:left': { front: 61.195, top: 45.84, bottom: 86.16, depth: 16.5, clearWidth: 40.32 },
  'penalty:right': { front: 133.195, top: 45.84, bottom: 86.16, depth: 16.5, clearWidth: 40.32 },
};
check(K.boxes.length === 4, 'two goal areas and two penalty areas');
for (const box of K.boxes) {
  const expected = expectedBoxes[box.name + ':' + box.side],
    sign = box.side === 'left' ? 1 : -1;
  check(!!expected, 'known rectangular area');
  for (const name of ['front', 'top', 'bottom', 'depth'])
    near(box[name], expected[name], box.name + ' ' + box.side + ' ' + name);
  near(box.paintFront + (sign * P.line) / 2, expected.front, 'paint front outside edge');
  near(box.paintTop - P.line / 2, expected.top, 'paint top outside edge');
  near(box.paintBottom + P.line / 2, expected.bottom, 'paint bottom outside edge');
  near(
    box.paintBottom - box.paintTop + P.line,
    expected.clearWidth,
    'area complete external width'
  );
  near(
    Math.abs(box.front - (box.side === 'left' ? P.left : P.right)),
    expected.depth,
    'depth from goal-line back edge'
  );
  near(
    P.cy - expected.top - P.goalWidth / 2,
    expected.depth,
    'side spacing measured from inside upper post'
  );
  near(
    expected.bottom - P.cy - P.goalWidth / 2,
    expected.depth,
    'side spacing measured from inside lower post'
  );
  near(
    box.back,
    box.side === 'left' ? K.boundary.left : K.boundary.right,
    'U endpoints join existing goal stripe'
  );
}

check(K.spots.length === 3, 'one centre and two penalty marks');
for (const [name, x] of [
  ['centre', 97.195],
  ['left-penalty', 55.695],
  ['right-penalty', 138.695],
]) {
  const spot = K.spots.find((p) => p.name === name);
  check(!!spot, 'spot exists ' + name);
  near(spot.x, x, 'spot x ' + name);
  near(spot.y, 66, 'spot lateral centre ' + name);
}
near(K.spots[1].x - P.left, 11, 'left penalty mark from goal-line back edge');
near(P.right - K.spots[2].x, 11, 'right penalty mark from goal-line back edge');
near(K.circle.cx, 97.195, 'centre-circle x');
near(K.circle.cy, 66, 'centre-circle y');
near(K.circle.r + P.line / 2, 9.15, 'centre-circle outer paint radius');
near(K.circle.r - P.line / 2, 9.03, 'centre-circle inner paint radius at chosen width');

check(K.corners.length === 4, 'four corner arcs');
for (const corner of K.corners) {
  check(
    [P.left, P.right].includes(corner.x) && [P.top, P.bottom].includes(corner.y),
    'corner arc centre at an outside corner'
  );
  near(corner.r + P.line / 2, 1, 'corner-arc external radius');
  check(
    (corner.x === P.left ? 1 : -1) === corner.sx && (corner.y === P.top ? 1 : -1) === corner.sy,
    'corner quadrant faces into field'
  );
  check(
    corner.sweep === (corner.sx === corner.sy ? 1 : 0),
    'corner arc uses inward quarter, not opposite quarter'
  );
}

check(K.arcs.length === 2, 'two penalty arcs');
for (const arc of K.arcs) {
  near(arc.r + P.line / 2, 9.15, 'penalty-arc outer paint radius');
  near(arc.cy, 66, 'penalty arc centre line');
  near(arc.cx, arc.side === 'left' ? 55.695 : 138.695, 'penalty arc centred on penalty mark');
  const clip = arc.clip;
  near(clip.y, P.top, 'penalty clip top');
  near(clip.height, 68, 'penalty clip height');
  near(
    arc.side === 'left' ? clip.x : clip.x + clip.width,
    arc.side === 'left' ? 61.195 : 133.195,
    'clip begins at penalty-area OUTER edge'
  );
  near(
    arc.side === 'left' ? clip.x + clip.width : clip.x,
    arc.side === 'left' ? P.right : P.left,
    'clip spans remaining playing field'
  );
  const area = K.boxes.find((b) => b.name === 'penalty' && b.side === arc.side),
    sign = arc.side === 'left' ? 1 : -1;
  near(
    arc.joinX,
    area.paintFront,
    'penalty arc endpoint embedded in centre of shared front stripe'
  );
  near(arc.start.x, area.paintFront, 'upper endpoint x');
  near(arc.end.x, area.paintFront, 'lower endpoint x');
  near(arc.start.y + arc.end.y, 132, 'arc endpoints symmetric about pitch axis');
  near(
    Math.hypot(arc.start.x - arc.cx, arc.start.y - arc.cy),
    9.09,
    'upper endpoint stays on real circle'
  );
  near(
    Math.hypot(arc.end.x - arc.cx, arc.end.y - arc.cy),
    9.09,
    'lower endpoint stays on real circle'
  );
  const dy = arc.cy - arc.start.y,
    dx = sign * (arc.joinX - arc.cx);
  const startT = { x: (sign * dy) / arc.r, y: dx / arc.r },
    endT = { x: (-sign * dy) / arc.r, y: dx / arc.r };
  // The new butt ends sit inside the existing stripe. Independently sample all
  // radial layers of the former legal clipped annulus: every externally visible
  // point must lie between the two butt planes, with no lost outside paint.
  for (const radius of [9.03, 9.06, 9.09, 9.12, 9.15])
    for (let j = 0; j <= 1440; j++) {
      const theta = (j * Math.PI) / 720,
        x = arc.cx + radius * Math.cos(theta),
        y = 66 + radius * Math.sin(theta);
      if (sign * (x - area.front) < -1e-10) continue;
      check(
        (x - arc.start.x) * startT.x + (y - arc.start.y) * startT.y >= -1e-10,
        'upper butt plane preserves every externally visible annulus sample'
      );
      check(
        (x - arc.end.x) * endT.x + (y - arc.end.y) * endT.y <= 1e-10,
        'lower butt plane preserves every externally visible annulus sample'
      );
    }
  // Radial paint added by extending the arc through the front stripe must stay
  // within that stripe until it emerges into the legal external arc.
  const halfAngle = Math.acos(dx / arc.r);
  for (let j = 0; j <= 720; j++)
    for (const radius of [9.03, 9.15]) {
      const theta = -halfAngle + (j * 2 * halfAngle) / 720,
        x = arc.cx + sign * radius * Math.cos(theta);
      check(
        sign * (x - (area.front - sign * 0.12)) >= -1e-10,
        'joined annulus never adds paint behind the inner edge of the penalty-area stripe'
      );
    }
  const endpointY = Math.sqrt(9.15 ** 2 - 5.5 ** 2);
  near(
    endpointY,
    7.312489316231512,
    'external arc meets penalty front at intended standard intersection'
  );
  // Sample only the actual annulus retained by the clip. Visible points must
  // remain at least 16.5m from their own goal-line back edge.
  for (let i = 0; i <= 720; i++) {
    const angle = (i * Math.PI) / 360,
      x = arc.cx + arc.r * Math.cos(angle),
      y = arc.cy + arc.r * Math.sin(angle);
    if (x < clip.x || x > clip.x + clip.width || y < clip.y || y > clip.y + clip.height) continue;
    check(
      arc.side === 'left' ? x >= 61.195 - 1e-10 : x <= 133.195 + 1e-10,
      'visible penalty arc remains outside rectangular area'
    );
  }
}

// Corner/side sampling verifies that the complete rectangular pitch fits the
// actual stadium infield, rather than a bounding box that ignores bend corners.
let minimumGrassClearance = Infinity;
for (let i = 0; i <= 400; i++)
  for (const edge of ['top', 'bottom', 'left', 'right']) {
    const t = i / 400,
      x = edge === 'left' ? P.left : edge === 'right' ? P.right : P.left + t * 105,
      y = edge === 'top' ? P.top : edge === 'bottom' ? P.bottom : P.top + t * 68;
    const outsideStraight = x < G.left ? G.left - x : x > G.right ? x - G.right : 0;
    const clearance = G.r - Math.hypot(outsideStraight, y - G.cy);
    check(clearance > 0, 'all field outside edges stay on infield grass');
    minimumGrassClearance = Math.min(minimumGrassClearance, clearance);
  }
near(minimumGrassClearance, 0.9726439908624768, 'minimum infield corner clearance');

// Inspect the actual emitted SVG independently of the metadata. A lightweight
// tree is sufficient; no browser-dependent visual assertion is substituted.
function node(tag, attrs = {}, text, parent) {
  const n = {
    tag,
    attrs: { ...attrs },
    text,
    children: [],
    parent,
    querySelector(selector) {
      const wanted = selector.slice(1);
      return flatten(this).find((child) => child.attrs.id === wanted);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    },
  };
  if (parent) parent.children.push(n);
  return n;
}
const flatten = (n) => n.children.flatMap((child) => [child, ...flatten(child)]),
  group = (parent, attrs = {}) => node('g', attrs, undefined, parent);
const parent = node('g'),
  defs = node('defs'),
  painted = F.paint(parent, node, group, defs),
  elements = flatten(parent),
  assets = flatten(defs);
check(painted.attrs.id === 'football-pitch', 'dedicated pitch group');
check(painted.attrs['pointer-events'] === 'none', 'pitch does not block stadium drag');
check(
  elements.filter((n) => n.attrs['data-football-mark'] === 'field').length === 1,
  'all shared boundary intersections use one opaque path'
);
const field = elements.find((n) => n.attrs['data-football-mark'] === 'field');
near(Number(field.attrs['stroke-width']), 0.12, 'actual emitted paint stroke');
check(field.attrs['stroke-linecap'] === 'butt', 'no rounded cap projection changes measured edges');
check(!field.attrs.opacity, 'ground paint is opaque, avoiding overlap darkening');
check(
  (field.attrs.d.match(/[zZ]/g) || []).length === 2,
  'perimeter and centre circle close: boxes do not redraw goal lines'
);
check(
  (field.attrs.d.match(/M/g) || []).length === 13,
  'perimeter, halfway, four U boxes, centre circle, two penalty arcs and four corner arcs'
);
check(field.attrs.d === K.markingPath, 'emitted SVG uses reviewed geometric marking path');
check(
  field.attrs['data-penalty-arcs'] === 2,
  'both penalty arcs share the opaque field-paint path'
);
check(
  !elements.some((n) => n.attrs['data-football-mark'] === 'penalty-arc'),
  'no independently clipped arc edges at white-line junctions'
);
check(
  !assets.some((n) => /penalty/.test(n.attrs.id || '')),
  'no exact-edge penalty clips create antialias seams'
);
for (const arc of K.arcs)
  check(field.attrs.d.includes(arc.path), 'rendered field contains exact penalty-arc subpath');
check(
  elements.filter((n) => n.attrs['data-football-mark'] === 'spot').length === 3,
  'all three spots rendered'
);
for (const spot of elements.filter((n) => n.attrs['data-football-mark'] === 'spot')) {
  near(Number(spot.attrs.r) * 2, 0.22, 'selected illustration spot diameter');
  check(!spot.attrs.stroke, 'spot is a solid mark, not an inflated stroked disk');
}
for (const element of [...elements, ...assets]) {
  for (const [name, value] of Object.entries(element.attrs)) {
    check(!/NaN|Infinity|undefined/.test(String(value)), 'no invalid SVG attribute ' + name);
    if (typeof value === 'number') check(Number.isFinite(value), 'numeric SVG attribute finite');
    const url = String(value).match(/^url\(#([^)]*)\)$/);
    if (url)
      check(
        assets.some((n) => n.attrs.id === url[1]),
        'every SVG paint/clip reference resolves'
      );
  }
}
F.paint(parent, node, group, defs);
check(
  flatten(defs).filter((n) => n.attrs.id === 'football-defs').length === 1,
  'repaint does not duplicate SVG definition IDs'
);
console.log(
  `${checks} football-pitch checks passed; 105×68m outside edges, 120mm paint, IFAB areas/arcs/marks; minimum infield clearance ${minimumGrassClearance.toFixed(6)}m. Spot diameter22cm and absent corner flags are illustration/athletics choices, not universal IFAB requirements.`
);
