'use strict';
// Independently sample every visible relay body through real product wrappers.
// No copied movement model or nominal/physical clock substitution.
const harness = require('./helpers/app-harness.cjs');
const results = [],
  focused = process.argv.includes('--focus'),
  exchanges = process.argv.includes('--exchanges');
for (const id of focused ? ['4x400', '4x800'] : ['4x100', '4x200', '4x400', '4x800', '4x1500']) {
  const h = harness(),
    Q = h.api;
  Q.changeEvent(id);
  let minimum = { distance: Infinity },
    minimumSolid = { distance: Infinity },
    frames = 0;
  const start = focused ? (id === '4x400' ? 760 : 2350) : 0,
    end = focused ? (id === '4x400' ? 850 : 2450) : Q.state.clockFinish + 12;
  const clocks = [];
  if (exchanges) {
    const first = Q.state.runners[0].model;
    for (const h of first.handovers) {
      const stations = Q.state.routes.map(
        (route) => route.measuredMotion.distanceAtParameter(h.distance) + route.launchSetback
      );
      for (
        let clock = Math.max(0, Math.min(...stations) - 25);
        clock <= Math.max(...stations) + 35;
        clock += 0.05
      )
        clocks.push(clock);
    }
  } else for (let clock = start; clock <= end; clock += focused ? 0.05 : 0.5) clocks.push(clock);
  for (const clock of clocks) {
    const bodies = Q.state.runners.flatMap((r, i) =>
      r.model
        .sample(clock)
        .athletes.filter((a) => a.visible)
        .map((a) => ({ ...a, team: i + 1 }))
    );
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i],
          b = bodies[j],
          distance = Math.hypot(a.x - b.x, a.y - b.y);
        const detail = {
          distance,
          clock,
          a: { team: a.team, leg: a.leg, phase: a.phase, alpha: a.alpha },
          b: { team: b.team, leg: b.leg, phase: b.phase, alpha: b.alpha },
        };
        if (distance < minimum.distance) minimum = detail;
        if (a.alpha > 0.5 && b.alpha > 0.5 && distance < minimumSolid.distance)
          minimumSolid = detail;
      }
    frames++;
  }
  results.push({ id, frames, minimum, minimumSolid });
}
console.log(JSON.stringify(results, null, 2));
require('node:assert/strict')(
  results.every((r) => r.minimum.distance >= 0.57),
  'every visible relay body retains .54m diameter + .025m stroke + .005m clearance'
);
