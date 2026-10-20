const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = { window: {}, document: { getElementById: () => ({}) }, Math, console };
vm.createContext(ctx);
let app = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.TraceTest={state,createRoutes,displayedPoint,createRouteTrace};\n'
);
assert(app.includes('/*__TRACE_SEGMENTS__*/'), 'route trace has its diagnostic seam');
app = app.replace('/*__TRACE_SEGMENTS__*/', 'window.traceSegments=segments;');
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
const T = ctx.window.TraceTest;
let checks = 0,
  maxRatio = 0;
for (const event of ctx.window.TrackApp.events) {
  T.state.event = event;
  T.state.grouped = false;
  T.createRoutes();
  for (const index of [0, T.state.routes.length - 1]) {
    const route = T.state.routes[index],
      sample = (d) => T.displayedPoint(route, d);
    const starts = [
      0,
      Math.max(0, (route.breakD < Infinity ? route.breakD : event.distance * 0.3) - 6),
      Math.max(0, event.distance - 100),
    ];
    for (const start of starts)
      for (const tolerance of [0.0001, 0.000005]) {
        const end = Math.min(event.distance, start + 65),
          d = T.createRouteTrace(sample, start, end, tolerance, event.distance),
          segments = ctx.window.traceSegments;
        assert(
          d.startsWith('M') && d.includes('C') && !d.includes('L'),
          'native cubic trace without polyline corners'
        );
        checks++;
        for (const s of segments)
          for (let i = 0; i <= 32; i++) {
            const t = i / 32,
              u = 1 - t,
              p = sample(s.start + (s.end - s.start) * t),
              x =
                u * u * u * s.a.x +
                3 * u * u * t * s.c1.x +
                3 * u * t * t * s.c2.x +
                t * t * t * s.b.x,
              y =
                u * u * u * s.a.y +
                3 * u * u * t * s.c1.y +
                3 * u * t * t * s.c2.y +
                t * t * t * s.b.y,
              error = Math.hypot(x - p.x, y - p.y);
            maxRatio = Math.max(maxRatio, error / tolerance);
            assert(
              error <= tolerance * 1.3,
              `${event.id} athlete ${index + 1} span [${s.start}, ${s.end}] t=${t}: trace error ${error} exceeds tolerance ${tolerance}`
            );
            checks++;
          }
        for (let i = 1; i < segments.length; i++) {
          const a = segments[i - 1],
            b = segments[i],
            av = {
              x: (3 * (a.b.x - a.c2.x)) / (a.end - a.start),
              y: (3 * (a.b.y - a.c2.y)) / (a.end - a.start),
            },
            bv = {
              x: (3 * (b.c1.x - b.a.x)) / (b.end - b.start),
              y: (3 * (b.c1.y - b.a.y)) / (b.end - b.start),
            };
          assert(Math.hypot(a.b.x - b.a.x, a.b.y - b.a.y) < 1e-10, 'exact shared endpoint');
          assert(Math.hypot(av.x - bv.x, av.y - bv.y) < 1e-8, 'exact shared velocity');
          checks += 2;
        }
      }
  }
}
console.log(
  `${checks} route-curve checks passed; maximum error ${(maxRatio * 100).toFixed(2)}% of allowed tolerance.`
);
