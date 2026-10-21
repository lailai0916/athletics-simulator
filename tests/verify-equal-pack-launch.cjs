'use strict';
// Read actual displayed trajectories: inspecting the common clock alone missed
// the old number-dependent acceleration ramps on ordinary curved starts.
const vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = {
  window: {},
  document: { getElementById: () => ({}) },
  Math,
  console,
};
vm.createContext(ctx);
vm.runInContext(
  require('./helpers/source.cjs').readSource('track-data.js') +
    '\n' +
    require('./helpers/load-app.cjs').withBootstrap(
      'window.LaunchQA={state,createRoutes,displayedPoint};'
    ),
  ctx
);
const Q = ctx.window.LaunchQA,
  results = [];
let checks = 0;
for (const id of ['3000sc', '1500', 'mile', '1000', '2000', '3000', '5000', '10000']) {
  Q.state.event = ctx.window.TrackApp.events.find((event) => event.id === id);
  Q.state.grouped = false;
  Q.createRoutes();
  let maximumTravelError = 0;
  for (const route of Q.state.routes) {
    let travel = 0,
      previous = Q.displayedPoint(route, 0);
    assert(Math.hypot(previous.x - route.bodyStart.x, previous.y - route.bodyStart.y) < 1e-9);
    checks++;
    // The common clock integrates the common launch ramp. Independently sum
    // visible planar travel throughout that ramp, rather than trusting a route
    // parameter, a stored delay, or its own arc-length table as the oracle.
    for (let n = 1; n <= 1200; n++) {
      const d = n / 100,
        point = Q.displayedPoint(route, d);
      travel += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
      if ([25, 100, 300, 600, 1200].includes(n)) {
        maximumTravelError = Math.max(maximumTravelError, Math.abs(travel - d));
        assert(
          Math.abs(travel - d) < 0.00001,
          `${id} athlete ${route.index + 1}: same launch, ${travel} m travelled at ${d} m clock`
        );
        checks++;
      }
    }
  }
  if (id === '3000sc') {
    const inner = Q.state.routes[0],
      outer = Q.state.routes[11],
      initialGap = Q.displayedPoint(inner, 0).x - Q.displayedPoint(outer, 0).x;
    assert(initialGap > 1, 'the outer steeplechase start is initially farther along the straight');
    for (const d of [0.25, 1, 3, 5, 10]) {
      const a = Q.displayedPoint(inner, d),
        b = Q.displayedPoint(outer, d);
      assert(
        // The sub-millimetre change comes from joining body/paint normals to
        // the shared straight, not from imposing different launch speeds.
        Math.abs(a.x - b.x - initialGap) < 0.001 && a.x > b.x,
        `no artificial first-metres pass before the bend or lateral merge at ${d} m`
      );
      checks++;
    }
  }
  results.push({ event: id, maximumTravelError });
}
console.log(JSON.stringify({ checks, results }, null, 2));
