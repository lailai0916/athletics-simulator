const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = {
  window: {},
  document: { getElementById: () => ({}), createElementNS: (ns, tag) => new Node(tag) },
  Math,
  console,
};
class Node {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
  }
  append(child) {
    this.children.push(child);
  }
}
vm.createContext(ctx);
let app = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.Presentation={state,createRoutes,displayedPoint,centerLane,blocks,paintSprintHurdle,zone,raceEndDistance,courseParameter,packFormationSpan};\n'
);
assert(app.includes('/*__TRACE_SEGMENTS__*/'), 'route trace has its diagnostic seam');
app = app.replace('/*__TRACE_SEGMENTS__*/', 'window.traceSegments=segments;');
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
const {
    state,
    createRoutes,
    displayedPoint,
    centerLane,
    blocks,
    paintSprintHurdle,
    zone,
    raceEndDistance,
    courseParameter,
    packFormationSpan,
  } = ctx.window.Presentation,
  G = ctx.window.TrackMath.geometry;
let checks = 0,
  minForward = Infinity,
  maxSpeed = 0;
const packClearance = [],
  distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const smooth = (u) => {
  u = Math.max(0, Math.min(1, u));
  return 10 * u * u * u - 15 * u * u * u * u + 6 * u * u * u * u * u;
};
// displayedPoint consumes the shared physical clock. A runner's longer launch
// ramp can move less than one metre per clock metre before unit-speed cruising.
// Derive that ratio independently from the prescribed smooth velocity ramps,
// rather than comparing actual travel with the old nominal route parameter.
function expectedClockSlope(route, d) {
  const lag = route.launchSetback || 0;
  if (!lag || d >= 12 + 2 * lag) return 1;
  const t = ctx.RaceMotion.timeAtDistance(d, state.clockFinish),
    duration = 2.4 + lag / 5;
  return smooth(t / duration) / smooth(t / 2.4);
}
const walk = (node) => [node, ...node.children.flatMap(walk)];
for (const id of ['800', '1500', '5000', '10000', '3000sc'])
  for (const grouped of [false, ...(['5000', '10000'].includes(id) ? [true] : [])]) {
    state.event = ctx.window.TrackApp.events.find((e) => e.id === id);
    state.grouped = grouped;
    createRoutes();
    for (const route of state.routes) {
      const formationSpan = id === '800' ? 120 : packFormationSpan(route);
      const samples = [
        ...Array.from(
          { length: Math.ceil(Math.max(120, formationSpan) * 15) },
          (_, i) => 0.001 + i * 0.1
        ),
        ...Array.from({ length: 1200 }, (_, i) => state.event.distance - 120 + 0.001 + i * 0.1),
        ...(id === '800'
          ? Array.from({ length: 1600 }, (_, i) => route.breakD + 0.001 + i * 0.1)
          : []),
      ];
      for (const d of samples) {
        const epsilon = 0.00001,
          p = displayedPoint(route, d),
          before = displayedPoint(route, d - epsilon),
          after = displayedPoint(route, d + epsilon),
          vx = (after.x - before.x) / (2 * epsilon),
          vy = (after.y - before.y) / (2 * epsilon),
          speed = Math.hypot(vx, vy);
        assert(
          Number.isFinite(speed) && Number.isFinite(p.x) && Number.isFinite(p.y),
          `${id}: finite presentation`
        );
        checks++;
        if (Number.isFinite(p.tx) && Number.isFinite(p.ty)) {
          const expected = expectedClockSlope(route, d),
            forward = (vx * p.tx + vy * p.ty) / expected,
            relativeSpeed = speed / expected;
          minForward = Math.min(minForward, forward);
          maxSpeed = Math.max(maxSpeed, relativeSpeed);
          assert(
            forward > 0.999,
            `${id}, athlete ${route.index + 1}, ${d}m: forward motion agrees with its smooth launch (${forward})`
          );
          assert(
            Math.abs(relativeSpeed - 1) < 0.0002,
            `${id}: no catch-up sprint or stall relative to its prescribed physical speed (${relativeSpeed})`
          );
          checks += 2;
        }
      }
      const initial = displayedPoint(route, 0),
        expected = id === '800' ? centerLane(route.start, route.lane) : route.start;
      assert(distance(initial, expected) < 1e-9, `${id}: retain exact original starting array`);
      checks++;
      if (id === '800')
        for (let d = 0; courseParameter(route, d) < route.breakD; d += 0.125) {
          const p = displayedPoint(route, d),
            x = Math.max(G.left, Math.min(G.right, p.x)),
            r = Math.hypot(p.x - x, p.y - G.cy),
            inner = G.r + (route.lane - 1) * G.w,
            outer = G.r + route.lane * G.w - 0.05;
          assert(
            r - 0.27 >= inner - 1e-8 && r + 0.27 <= outer + 1e-8,
            '800 m runners and their physical token footprint retain their own lane until the measured legal break'
          );
          checks++;
        }
      if (route.outer)
        for (let d = 0; courseParameter(route, d) < route.breakD; d += 0.125) {
          const p = displayedPoint(route, d),
            x = Math.max(G.left, Math.min(G.right, p.x));
          assert(
            Math.hypot(p.x - x, p.y - G.cy) >= G.r + 4 * G.w - 1e-8,
            'outer group cannot enter the inner four lanes before its break'
          );
          checks++;
        }
      const joins =
        id === '800'
          ? [
              route.breakD,
              route.breakD + 35,
              route.breakD + 40,
              route.breakD + 120,
              route.breakD + 160,
            ]
          : [
              formationSpan / 2,
              formationSpan,
              formationSpan * 1.5,
              state.event.distance - formationSpan,
              state.event.distance - (grouped ? 120 : 100),
            ];
      joins.push(...route.coursePatches.flatMap((p) => [p.start, p.end]));
      for (const parameter of joins) {
        const d = route.measuredMotion.distanceAtParameter(parameter) + (route.launchSetback || 0);
        const h = 0.0001,
          p = displayedPoint(route, d),
          a = displayedPoint(route, d - h),
          b = displayedPoint(route, d + h),
          jump = distance(a, b),
          dv = Math.hypot((b.x - 2 * p.x + a.x) / h, (b.y - 2 * p.y + a.y) / h);
        assert(jump < 0.0004, `${id}: continuous position at visual formation boundary`);
        // Retain the original tighter join limits, now at their measured clock
        // positions. The local C2 patches must also remain within those limits.
        assert(
          dv < (id === '800' && parameter === route.breakD ? 0.01 : 0.001),
          `${id}: continuous velocity at measured visual formation boundary (${dv})`
        );
        checks += 2;
      }
      const fd = route.finishDistance,
        p = displayedPoint(route, fd),
        before = displayedPoint(route, fd - 0.01),
        after = displayedPoint(route, fd + 0.01);
      assert(
        distance(p, { x: G.right, y: G.cy + ctx.window.TrackMath.rho(1) }) < 0.0001,
        `${id}: measured finish reaches the painted common finish line exactly`
      );
      assert(
        before.x < G.right && after.x > G.right,
        `${id}: finish is a forward crossing, not a touch or nominal-clock stop`
      );
      checks += 2;
    }
    // Scan every pair through the whole race, including both start groups,
    // post-break convergence, water-jump laps and the complete natural finish tail.
    let closest = { distance: Infinity };
    for (const d of [
      ...Array.from({ length: Math.ceil(raceEndDistance() * 4) }, (_, i) => i * 0.25),
      state.event.distance,
      raceEndDistance(),
    ]) {
      const points = state.routes.map((route) => displayedPoint(route, d));
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const separation = distance(points[i], points[j]);
          if (separation < closest.distance)
            closest = { distance: separation, at: d, pair: [i + 1, j + 1] };
        }
    }
    const radius = id === '800' ? 0.27 : 0.21,
      stroke = 0.025,
      safe = 2 * radius + stroke + 0.015;
    assert(
      closest.distance >= safe,
      `${id}${grouped ? ' two groups' : ''}: athlete bodies/paint need 15 mm of visible clearance; closest ${JSON.stringify(closest)}`
    );
    checks++;
    packClearance.push({ event: id, grouped, ...closest });
  }
// Equipment has a real footprint and a rear-facing base, rather than a floating stripe.
state.event = ctx.window.TrackApp.events.find((e) => e.id === '110h');
state.grouped = false;
createRoutes();
for (let lane = 1; lane <= 8; lane++) {
  const parent = new Node('g');
  paintSprintHurdle(parent, state.routes[lane - 1].position(13.72), lane);
  const all = walk(parent),
    bar = all.find((n) => n.attrs['data-hurdle-part'] === 'top-bar'),
    bases = all.find((n) => n.attrs['data-hurdle-part'] === 'bases');
  assert.equal(Number(bar.attrs.x), 0, 'bar near face on official hurdle mark');
  assert.equal(Number(bar.attrs.height), 1.18, 'bar spans permitted width');
  assert.equal(Number(bar.attrs.width), 0.025, 'physical top-view bar thickness');
  const stripes = all.filter((n) => n.attrs['data-hurdle-part'] === 'black-stripe');
  assert.equal(stripes.length, 2);
  assert(
    Math.abs(
      Number(stripes[0].attrs.y) + Number(stripes[1].attrs.y) + Number(stripes[0].attrs.height)
    ) < 1e-12,
    'symmetric black stripes'
  );
  assert(
    Number(stripes[0].attrs.y) - Number(bar.attrs.y) >= 0.225,
    'light end stripe at least 0.225m'
  );
  checks += 3;
  const feet = bases.children.filter((n) => Number(n.attrs.width) > 0.5);
  assert.equal(feet.length, 2, 'two separate feet');
  for (const foot of feet) {
    assert(Number(foot.attrs.x) < -0.5, 'feet extend toward approaching athlete');
    assert(Number(foot.attrs.width) <= 0.7, 'base length within 0.70m');
    checks += 2;
  }
  checks += 4;
  const start = new Node('g');
  blocks({ x: 0, y: 0, tx: 1, ty: 0 }, start);
  const hardware = walk(start),
    carriages = hardware.filter((n) => n.attrs['data-block-part'] === 'carriage'),
    frames = hardware.filter((n) => n.attrs['data-block-part'] === 'pedal-frame');
  assert.equal(carriages.length, 2, 'each footplate has its own physical rail carriage');
  checks++;
  for (let i = 0; i < 2; i++) {
    const c = carriages[i].attrs,
      f = frames[i].attrs,
      cx = +c.x,
      cw = +c.width,
      cy = +c.y,
      ch = +c.height,
      fx = +f.x,
      fw = +f.width,
      fy = +f.y,
      fh = +f.height;
    assert(cy <= 0 && cy + ch >= 0, 'carriage overlaps the rail centreline');
    assert(cx >= fx && cx + cw <= fx + fw, 'carriage meets the actual pedal frame footprint');
    assert(
      Math.min(Math.abs(cy - (fy + fh)), Math.abs(cy + ch - fy)) < 1e-12,
      'carriage physically touches the footplate'
    );
    checks += 3;
  }
  for (const piece of walk(start).filter((n) => n.tag === 'rect' && n.attrs.width)) {
    // Rail origin is 0.85 m behind the start; even the forwardmost footplate is behind it.
    assert(
      Number(piece.attrs.x) + Number(piece.attrs.width) - 0.85 < 0,
      'starting-block hardware behind start edge'
    );
    checks++;
  }
}
// The exchange overlay must stay a true offset curve even at deep zoom;
// the common 4x400 zone deliberately crosses the negative/positive seam.
for (const id of ['4x100', '4x400']) {
  state.event = ctx.window.TrackApp.events.find((e) => e.id === id);
  createRoutes();
  for (let lane = 1; lane <= 8; lane++)
    for (const interval of id === '4x100'
      ? [
          [80, 110],
          [180, 210],
          [280, 310],
        ]
      : [
          [390, 410],
          [-10, 10],
        ]) {
      const [a, b] = interval,
        route =
          a < 0
            ? { position: (d) => ctx.window.TrackMath.trackPoint(d, lane) }
            : state.routes[lane - 1],
        parent = new Node('g');
      zone(parent, lane, route, a, b, '#fff');
      const d = parent.children[0].children[0].attrs.d;
      assert(d.includes('C') && !d.includes('L'), 'exchange overlay has no polyline facets');
      checks++;
      for (const s of ctx.window.traceSegments)
        for (let i = 0; i <= 32; i++) {
          const t = i / 32,
            u = 1 - t,
            p = centerLane(route.position(a + s.start + (s.end - s.start) * t), lane),
            x =
              u * u * u * s.a.x +
              3 * u * u * t * s.c1.x +
              3 * u * t * t * s.c2.x +
              t * t * t * s.b.x,
            y =
              u * u * u * s.a.y +
              3 * u * u * t * s.c1.y +
              3 * u * t * t * s.c2.y +
              t * t * t * s.b.y;
          assert(
            Math.hypot(x - p.x, y - p.y) < 0.00000065,
            'exchange ribbon within submicrometre geometric fit'
          );
          checks++;
        }
    }
}
console.log(
  `${checks} presentation checks passed; min forward ratio ${minForward.toFixed(4)}, max local speed ratio ${maxSpeed.toFixed(4)} of prescribed speed.`
);
console.log(JSON.stringify(packClearance, null, 2));
