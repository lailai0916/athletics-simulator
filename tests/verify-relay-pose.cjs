'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  R = require('../src/relay-motion.js');
const ctx = { window: {}, document: { getElementById: () => ({}) }, console, Math };
vm.createContext(ctx);
const app = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.PoseQA={state,createRoutes,displayedPoint};\n'
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
const QA = ctx.window.PoseQA,
  bodyPaintRadius = 0.27 + 0.025 / 2,
  results = [];
let checks = 0,
  maxTransferTipStep = 0;
function batonFrame(b, p) {
  const dx = p.x - b.x,
    dy = p.y - b.y;
  return { along: dx * b.tx + dy * b.ty, side: -dx * b.ty + dy * b.tx };
}
function clearance(p, b) {
  const f = batonFrame(b, p),
    halfAxis = (R.batonLength - R.batonWidth) / 2;
  return (
    Math.hypot(Math.max(0, Math.abs(f.along) - halfAxis), f.side) -
    R.batonWidth / 2 -
    bodyPaintRadius
  );
}
function timeAt(m, d) {
  let lo = 0,
    hi = m.endDistance;
  for (let k = 0; k < 60; k++) {
    const t = (lo + hi) / 2;
    if (m.teamDistance(t) < d) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}
function tip(b, side) {
  return {
    x: b.x + ((side * R.batonLength) / 2) * b.tx,
    y: b.y + ((side * R.batonLength) / 2) * b.ty,
  };
}
for (const id of ['4x100', '4x400']) {
  QA.state.event = ctx.window.TrackApp.events.find((e) => e.id === id);
  QA.createRoutes();
  const models = QA.state.routes.map((route, teamIndex) =>
    R.create({
      kind: QA.state.event.kind,
      teamIndex,
      breakDistance: route.breakD,
      position: (d) => QA.displayedPoint(route, d),
    })
  );
  let closest = { clearance: Infinity };
  // Include every visible retiring/fading runner; an opacity threshold of .5
  // would miss obvious intersections in the latter half of a fade.
  for (let d = 0; d <= models[0].endDistance; d += 0.2) {
    const frames = models.map((m) => m.sample(d));
    for (let i = 0; i < frames.length; i++) {
      const b = frames[i].baton;
      for (let j = 0; j < frames.length; j++)
        for (const a of frames[j].athletes) {
          if (!a.visible) continue;
          const gap = clearance(a, b);
          if (gap < closest.clearance)
            closest = { clearance: gap, d, batonTeam: i + 1, athleteTeam: j + 1, leg: a.leg };
        }
      const holder = frames[i].athletes[b.owner - 1],
        grip = batonFrame(b, holder.hand);
      assert(
        Math.abs(grip.side) < 1e-8 && Math.abs(grip.along) <= (R.batonLength - R.batonWidth) / 2,
        'holding hand remains on the baton centre-line'
      );
      checks++;
      for (const a of frames[i].athletes)
        if (a.visible && a.armAlpha > 0.00001) {
          const reach = Math.hypot(a.hand.x - a.x, a.hand.y - a.y);
          assert(
            reach > 0.35 && reach < 0.7,
            'wrist clears torso while keeping a compact arm reach'
          );
          checks++;
        }
    }
  }
  assert(
    closest.clearance > 0.02,
    `${id}: every baton capsule clears every painted body by 2 cm: ${JSON.stringify(closest)}`
  );
  checks++;
  for (const m of models)
    for (const h of m.handovers) {
      const t = timeAt(m, h.distance),
        eps = 0.00001,
        a = m.sample(t - eps).baton,
        b = m.sample(t + eps).baton;
      // Compare physical endpoints rather than raw atan2 degrees: +180 and -180
      // are the same orientation and must not be mistaken for a visual spin.
      for (const side of [-1, 1]) {
        const x = tip(a, side),
          y = tip(b, side);
        assert(
          Math.hypot(y.x - x.x, y.y - x.y) < 0.00004,
          'both baton tips remain continuous through ownership'
        );
        checks++;
      }
      const frame = m.sample(t),
        sender = frame.athletes[h.distance / m.config.unit - 1],
        receiver = frame.athletes[h.distance / m.config.unit];
      for (const runner of [sender, receiver]) {
        const grip = batonFrame(frame.baton, runner.hand);
        assert(
          Math.abs(grip.side) < 1e-8 && Math.abs(Math.abs(grip.along) - R.gripSpacing / 2) < 1e-8,
          'both hands share the same physical baton axis at transfer'
        );
        checks++;
      }
      for (const rate of [1, 4]) {
        const step = (10 * rate) / 120;
        for (let f = -6; f < 6; f++) {
          const p = m.sample(t + f * step).baton,
            q = m.sample(t + (f + 1) * step).baton;
          for (const side of [-1, 1]) {
            const x = tip(p, side),
              y = tip(q, side),
              jump = Math.hypot(y.x - x.x, y.y - x.y);
            maxTransferTipStep = Math.max(maxTransferTipStep, jump);
            assert(jump < step * 1.5, '120 Hz playback has no baton-tip jump at 1× or 4×');
            checks++;
          }
        }
      }
    }
  for (const model of models) {
    const end = model.sample(model.endDistance);
    assert(
      end.complete && end.baton.visible && end.baton.alpha === 1 && end.athletes[3].visible,
      'finish keeps the final runner and baton visible'
    );
    assert(
      end.athletes.slice(0, 3).every((a) => !a.visible),
      'retired runners finish their smooth fade before race end'
    );
    checks += 2;
  }
  results.push({ event: id, ...closest });
}
console.log(
  `${checks} relay-pose checks passed; maximum per-frame baton tip travel ${maxTransferTipStep.toFixed(6)} m at 120 Hz / 4×.`
);
console.log(JSON.stringify(results, null, 2));
