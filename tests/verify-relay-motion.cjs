'use strict';
const assert = require('node:assert/strict');
const R = require('../src/relay-motion.js');
let checks = 0,
  maxPositionJump = 0,
  maxDerivativeJump = 0,
  maxBatonPositionJump = 0,
  maxBatonDerivativeJump = 0;
const near = (actual, expected, tolerance, message) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} != ${expected} (±${tolerance})`
  );
  checks++;
};
const circle = (s) => {
  const a = s / 60;
  return { x: 60 * Math.sin(a), y: 60 * Math.cos(a), tx: Math.cos(a), ty: -Math.sin(a) };
};
const line = (s) => ({ x: s, y: 40, tx: 1, ty: 0 });
function timeAt(model, course) {
  let lo = 0,
    hi = model.endDistance;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (model.teamDistance(m) < course) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
function bodyOf(sample, index) {
  return sample.athletes[index];
}
function continuity(model, t, getter, label, baton = false) {
  const h = 1e-4,
    p0 = getter(model.sample(t)),
    pm = getter(model.sample(t - h)),
    pp = getter(model.sample(t + h));
  const jump = Math.hypot(pp.x - pm.x, pp.y - pm.y),
    vx1 = (p0.x - pm.x) / h,
    vy1 = (p0.y - pm.y) / h,
    vx2 = (pp.x - p0.x) / h,
    vy2 = (pp.y - p0.y) / h;
  const derivative = Math.hypot(vx2 - vx1, vy2 - vy1);
  assert.ok(jump < 0.001, `${label}: position jump ${jump}`);
  assert.ok(derivative < 0.002, `${label}: derivative jump ${derivative}`);
  checks += 2;
  maxPositionJump = Math.max(maxPositionJump, jump);
  maxDerivativeJump = Math.max(maxDerivativeJump, derivative);
  if (baton) {
    maxBatonPositionJump = Math.max(maxBatonPositionJump, jump);
    maxBatonDerivativeJump = Math.max(maxBatonDerivativeJump, derivative);
  }
}
for (const kind of ['relay100', 'relay400'])
  for (let teamIndex = 0; teamIndex < 8; teamIndex++)
    for (const position of [line, circle]) {
      const model = R.create({ kind, teamIndex, position, breakDistance: 520 });
      const c = model.config;
      assert.equal(model.sample(0).activeLeg, 1);
      checks++;
      assert.equal(model.sample(c.total).activeLeg, 4);
      checks++;
      near(
        model.teamDistance(model.finishDistance),
        c.total,
        1e-9,
        'every team reaches its own finish clock'
      );
      near(
        (model.teamDistance(model.finishDistance) -
          model.teamDistance(model.finishDistance - 0.0001)) /
          0.0001,
        1,
        0.00001,
        'fixed gap retains cruise speed through the finish'
      );
      assert(
        model.sample(model.finishDistance).complete,
        'team completes only when its own course reaches the finish'
      );
      checks++;
      if (kind === 'relay400' && teamIndex > 0) {
        assert(
          !model.sample(c.total).complete,
          'a trailing team is still racing when the leader finishes'
        );
        checks++;
      }
      near(model.teamDistance(0), 0, 1e-9, 'every team starts on start line');
      for (const h of model.handovers) {
        assert.ok(
          h.receiverStart > h.zoneStart && h.receiverStart < h.zoneEnd,
          'receiver starts inside legal zone'
        );
        checks++;
        assert.ok(
          h.distance + R.carryForward + R.batonLength / 2 < h.zoneEnd &&
            h.distance + R.carryForward - R.batonLength / 2 > h.zoneStart,
          'whole baton transfer inside legal zone'
        );
        checks++;
        const begin = model.sample(timeAt(model, h.accelerationStart)),
          mid = model.sample(timeAt(model, (h.accelerationStart + h.accelerationEnd) / 2)),
          end = model.sample(timeAt(model, h.accelerationEnd));
        const idx = h.distance / c.unit;
        near(begin.athletes[idx].courseSpeed, 0, 1e-9, 'receiver stationary before run-up');
        near(mid.athletes[idx].courseSpeed, 0.5, 1e-8, 'receiver progressively accelerates');
        near(end.athletes[idx].courseSpeed, 1, 1e-8, 'receiver matches incoming speed');
        near(
          begin.athletes[idx].progress,
          h.receiverStart,
          1e-8,
          'receiver begins from legal position'
        );
        const sender = end.athletes[idx - 1],
          receiver = end.athletes[idx];
        near(
          Math.hypot(sender.grip.x - receiver.grip.x, sender.grip.y - receiver.grip.y),
          0,
          1e-8,
          'baton-centre guides coincide during transfer'
        );
        near(
          Math.hypot(sender.hand.x - receiver.hand.x, sender.hand.y - receiver.hand.y),
          R.gripSpacing,
          1e-8,
          'separate hands grasp separate baton sections'
        );
        for (const a of [sender, receiver]) {
          near(
            Math.hypot(a.hand.x - end.baton.x, a.hand.y - end.baton.y),
            R.gripSpacing / 2,
            1e-8,
            'both grips remain inside baton'
          );
          assert.ok(a.armAlpha <= 1 && a.armAlpha >= 0, 'local arm alpha is bounded');
          checks++;
        }
        near(
          Math.hypot(sender.x - receiver.x, sender.y - receiver.y),
          0.62,
          1e-8,
          'athlete centres remain separated'
        );
        for (let dd = -c.acceleration; dd <= c.deceleration; dd += 0.1) {
          const state = model.sample(timeAt(model, h.distance + dd));
          const a = state.athletes[idx - 1],
            b = state.athletes[idx];
          assert.ok(
            Math.hypot(a.x - b.x, a.y - b.y) >= 0.54 - 1e-6,
            `handover bodies do not overlap ${kind} team${teamIndex} h${h.distance} dd${dd} separation${Math.hypot(a.x - b.x, a.y - b.y)}`
          );
          checks++;
          if (dd < 0) {
            assert.ok(
              b.progress >= h.zoneStart && b.progress <= h.zoneEnd,
              'receiver longitudinal movement stays in the legal zone'
            );
            checks++;
          }
        }
        const after = model.sample(timeAt(model, h.distance + c.deceleration));
        near(after.athletes[idx - 1].courseSpeed, 0, 1e-8, 'sender decelerates to rest');
        assert.ok(after.athletes[idx - 1].visible, 'sender remains present after stopping');
        checks++;
        const gone = model.sample(
          timeAt(model, h.distance + c.deceleration + c.rest + c.fade + 0.1)
        );
        assert.ok(!gone.athletes[idx - 1].visible, 'retired sender fades out');
        checks++;
        const points = [
          h.accelerationStart,
          h.distance - c.approach,
          h.distance - c.reach,
          h.distance,
          h.distance + c.reach,
          h.distance + c.settle,
          h.decelerationEnd,
          h.decelerationEnd + c.rest,
          h.decelerationEnd + c.rest + c.fade,
        ];
        if (kind === 'relay400' && h.distance >= 800)
          points.push(h.distance - 210, h.distance - 200);
        for (const d of points) {
          const t = timeAt(model, d);
          for (let j = 0; j < 4; j++) {
            continuity(
              model,
              t,
              (s) => bodyOf(s, j),
              `${kind} team${teamIndex} body${j + 1} @${d}`
            );
            continuity(
              model,
              t,
              (s) => bodyOf(s, j).hand,
              `${kind} team${teamIndex} hand${j + 1} @${d}`
            );
          }
          continuity(model, t, (s) => s.baton, `${kind} team${teamIndex} baton @${d}`, true);
        }
        const ht = timeAt(model, h.distance),
          orientationBefore = model.sample(ht - 1e-4).baton,
          orientationAfter = model.sample(ht + 1e-4).baton;
        assert.ok(
          Math.hypot(
            orientationAfter.tx - orientationBefore.tx,
            orientationAfter.ty - orientationBefore.ty
          ) < 1e-5,
          'baton orientation has no ownership snap'
        );
        checks++;
      }
      for (let t = 0; t <= model.endDistance; t += 0.5) {
        const s = model.sample(t),
          light = model.batonPosition(t);
        near(light.x, s.baton.x, 1e-10, 'lightweight baton x');
        near(light.y, s.baton.y, 1e-10, 'lightweight baton y');
        assert.ok(
          s.athletes.every((a) =>
            [a.x, a.y, a.tx, a.ty, a.alpha, a.speed, a.hand.x, a.hand.y].every(Number.isFinite)
          )
        );
        assert.ok([s.baton.x, s.baton.y, s.baton.tx, s.baton.ty].every(Number.isFinite));
        checks += 2;
      }
      for (let t = 0.001; t < model.endDistance - 0.001; t += 0.125) {
        const pace = (model.teamDistance(t + 0.0001) - model.teamDistance(t - 0.0001)) / 0.0002;
        assert.ok(
          pace >= 1 - model.gapPolicy.maxPaceChange - 1e-7 &&
            pace <= 1 + model.gapPolicy.maxPaceChange + 1e-7,
          `team gap pace is bounded: ${kind} team${teamIndex} @${t} pace${pace}`
        );
        checks++;
      }
      if (kind === 'relay400') {
        const common = model.sample(timeAt(model, 800 - 20));
        near(
          common.athletes[2].side,
          0.31 + teamIndex * 1.22,
          1e-8,
          'common-zone waiting order inside to out'
        );
        for (const d of [520, 520 + model.gapPolicy.window, c.total - model.gapPolicy.window])
          continuity(model, d, (s) => s.athletes[3], `gap derivative ${d}`);
      }
    }
console.log(`${checks} relay checks passed.`);
console.log(
  JSON.stringify(
    {
      maxPositionDifferenceOver0002m: maxPositionJump,
      maxOneSidedVelocityDifference: maxDerivativeJump,
      maxBatonPositionDifferenceOver0002m: maxBatonPositionJump,
      maxBatonOneSidedVelocityDifference: maxBatonDerivativeJump,
    },
    null,
    2
  )
);

/* Repeat the critical handover checks on the application's actual race geometry. */
const fs = require('node:fs'),
  vm = require('node:vm');
const context = {
  window: {},
  document: { getElementById: () => ({}) },
  console,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
};
vm.createContext(context);
const source = require('./helpers/load-app.cjs').withBootstrap(
  '\nwindow.RelayMotionQA={state,createRoutes,displayedPoint};\n'
);
vm.runInContext(
  require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source,
  context
);
const QA = context.window.RelayMotionQA,
  E = context.window.TrackApp.events;
let actualChecks = 0;
for (const kind of ['relay100', 'relay400']) {
  QA.state.event = E.find((e) => e.kind === kind);
  QA.createRoutes();
  for (let i = 0; i < 8; i++) {
    const route = QA.state.routes[i],
      position = (s) => QA.displayedPoint(route, s);
    const model = R.create({ kind, teamIndex: i, position, breakDistance: route.breakD });
    for (const handover of model.handovers) {
      const t = timeAt(model, handover.distance);
      for (let leg = 0; leg < 4; leg++)
        continuity(
          model,
          t,
          (s) => s.athletes[leg],
          `actual geometry ${kind} team ${i} leg ${leg}`
        );
      continuity(model, t, (s) => s.baton, `actual geometry ${kind} team ${i} baton`, true);
      const s = model.sample(t),
        idx = handover.distance / model.config.unit;
      near(
        Math.hypot(
          s.athletes[idx - 1].grip.x - s.athletes[idx].grip.x,
          s.athletes[idx - 1].grip.y - s.athletes[idx].grip.y
        ),
        0,
        1e-8,
        'actual geometry baton guides meet'
      );
      near(
        Math.hypot(
          s.athletes[idx - 1].hand.x - s.athletes[idx].hand.x,
          s.athletes[idx - 1].hand.y - s.athletes[idx].hand.y
        ),
        R.gripSpacing,
        1e-8,
        'actual geometry separate grips'
      );
      actualChecks += 12;
    }
  }
}
console.log(`${actualChecks} additional checks passed on real 400 m track route geometry.`);
