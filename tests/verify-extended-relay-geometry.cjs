'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  R = require('../src/relay-motion.js');
const ctx = { window: {}, document: { getElementById: () => ({}) }, Math, console };
vm.createContext(ctx);
const source = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.GeometryRelayQA={state,createRoutes,displayedPoint};\n'
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source, ctx);
const q = ctx.window.GeometryRelayQA,
  results = [];
let checks = 0;
function batonClearance(a, b) {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    along = dx * b.tx + dy * b.ty,
    side = -dx * b.ty + dy * b.tx,
    half = (R.batonLength - R.batonWidth) / 2;
  return (
    Math.hypot(Math.max(0, Math.abs(along) - half), side) - R.batonWidth / 2 - (0.27 + 0.025 / 2)
  );
}
for (const kind of ['relay200', 'relay800', 'relay1500']) {
  q.state.event = ctx.window.TrackApp.events.find((e) => e.kind === kind);
  assert(q.state.event);
  q.state.grouped = false;
  q.createRoutes();
  const models = q.state.routes.map((route, teamIndex) =>
    R.create({
      kind,
      teamIndex,
      teamCount: q.state.routes.length,
      breakDistance: route.breakD,
      position: (d) => q.displayedPoint(route, d),
    })
  );
  let pair = { distance: Infinity },
    capsule = { distance: Infinity };
  const distances = new Set([0, models[0].config.total, models[0].endDistance]);
  for (const { distance: h } of models[0].handovers)
    for (let d = h - 40; d <= h + 65; d += 0.25) distances.add(d);
  for (const d of distances) {
    const frames = models.map((m) => m.sample(d)),
      visible = frames.flatMap((s, team) =>
        s.athletes.filter((a) => a.visible).map((a) => ({ ...a, team }))
      );
    for (let i = 0; i < visible.length; i++)
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i],
          b = visible[j],
          distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < pair.distance)
          pair = { distance, d, teams: [a.team, b.team], legs: [a.leg, b.leg] };
        assert(
          distance >= 0.57,
          'visible bodies clear at actual geometry ' +
            kind +
            ': ' +
            JSON.stringify({ distance, d, a: [a.team, a.leg], b: [b.team, b.leg] })
        );
        checks++;
      }
    for (let team = 0; team < frames.length; team++)
      for (const a of visible) {
        const distance = batonClearance(a, frames[team].baton);
        if (distance < capsule.distance)
          capsule = { distance, d, baton: team, body: [a.team, a.leg] };
        assert(
          distance > 0.02,
          'baton clears painted bodies by 2 cm ' +
            kind +
            ': ' +
            JSON.stringify({ distance, d, team, a: [a.team, a.leg] })
        );
        checks++;
      }
  }
  results.push({ kind, pair, capsule });
}
console.log(JSON.stringify({ checks, results }, null, 2));
