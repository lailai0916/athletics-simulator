'use strict';
const assert = require('node:assert/strict'),
  R = require('../src/relay-motion.js');
const line = (d) => ({ x: d, y: 0, tx: 1, ty: 0 }),
  circle = (d) => {
    const r = 400 / (2 * Math.PI),
      a = d / r;
    return { x: r * Math.sin(a), y: r * Math.cos(a), tx: Math.cos(a), ty: -Math.sin(a) };
  };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  tip = (b, s) => ({
    x: b.x + ((s * R.batonLength) / 2) * b.tx,
    y: b.y + ((s * R.batonLength) / 2) * b.ty,
  });
let checks = 0,
  maxVelocitySeam = 0,
  maxAccelerationSeam = 0,
  minOwnBody = Infinity;
function near(a, b, tol, label) {
  assert(Math.abs(a - b) <= tol, label + ': ' + a + ' vs ' + b);
  checks++;
}
function timeAt(m, d) {
  let lo = 0,
    hi = m.endDistance;
  for (let n = 0; n < 55; n++) {
    const mid = (lo + hi) / 2;
    if (m.teamDistance(mid) < d) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
for (const [kind, unit, total, zone, shared] of [
  ['relay200', 200, 800, 30, false],
  ['relay800', 800, 3200, 20, true],
  ['relay1500', 1500, 6000, 20, true],
]) {
  const c = R.configFor(kind);
  assert(Object.isFrozen(c));
  assert.equal(c.unit, unit);
  assert.equal(c.total, total);
  assert.equal(c.zoneBefore + c.zoneAfter, zone);
  assert.equal(c.sharedTrack, shared);
  checks += 5;
  for (let teamIndex = 0; teamIndex < 8; teamIndex++)
    for (const position of [line, circle]) {
      const m = R.create({
        kind,
        teamIndex,
        position,
        breakDistance: kind === 'relay800' ? 115.610609652 : 0,
        teamCount: 8,
      });
      near(m.teamDistance(0), 0, 0, 'exact own start');
      near(m.teamDistance(m.finishDistance), total, 1e-9, 'own finish');
      near(m.endDistance, total + (shared ? 7 * 2.4 : 0), 1e-9, 'all finish clock');
      assert.equal(m.sample(m.endDistance).complete, true);
      assert(
        m
          .sample(m.endDistance)
          .athletes.slice(0, 3)
          .every((a) => !a.visible)
      );
      checks += 2;
      for (const h of m.handovers) {
        assert(h.receiverStart > h.zoneStart && h.receiverStart < h.zoneEnd);
        assert(h.distance + R.carryForward + R.batonLength / 2 < h.zoneEnd);
        checks += 2;
        const global = timeAt(m, h.distance),
          s = m.sample(global),
          sender = s.athletes[h.distance / unit - 1],
          receiver = s.athletes[h.distance / unit];
        near(distance(sender.grip, receiver.grip), 0, 1e-8, 'baton-centre guides meet');
        near(distance(sender.hand, receiver.hand), R.gripSpacing, 1e-8, 'separate hand grips');
        near(distance(sender, receiver), 2 * R.separation, 1e-8, 'bodies remain separate');
        for (const actor of [sender, receiver])
          near(distance(actor.hand, s.baton), R.gripSpacing / 2, 1e-8, 'hand touches baton');
        for (let d = h.accelerationStart; d <= h.distance; d += 0.25) {
          const f = m.sample(timeAt(m, d)),
            a = f.athletes[h.distance / unit];
          assert(
            a.progress >= h.zoneStart && a.progress <= h.zoneEnd,
            'receiver stays longitudinally in legal zone'
          );
          assert(
            a.courseSpeed >= -1e-12 && a.courseSpeed <= 1 + 1e-12,
            'bounded physical acceleration ' + a.courseSpeed
          );
          checks += 2;
        }
        const seams = [
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
        if (shared || c.deferLappedWaiting)
          seams.push(h.distance - c.waitingLead, h.distance - c.waitingLead + 10);
        for (const d of seams) {
          if (d <= 0 || d >= total) continue;
          const t = timeAt(m, d),
            eps = 0.001,
            frames = [-2, -1, 0, 1, 2].map((k) => m.sample(t + k * eps));
          for (const get of [
            (s) => s.baton,
            ...Array.from({ length: 4 }, (_, i) => (s) => s.athletes[i]),
            ...Array.from({ length: 4 }, (_, i) => (s) => s.athletes[i].hand),
          ]) {
            const p = frames.map(get),
              left = { x: (p[2].x - p[1].x) / eps, y: (p[2].y - p[1].y) / eps },
              right = { x: (p[3].x - p[2].x) / eps, y: (p[3].y - p[2].y) / eps },
              v = distance(left, right),
              al = {
                x: (p[2].x - 2 * p[1].x + p[0].x) / (eps * eps),
                y: (p[2].y - 2 * p[1].y + p[0].y) / (eps * eps),
              },
              ar = {
                x: (p[4].x - 2 * p[3].x + p[2].x) / (eps * eps),
                y: (p[4].y - 2 * p[3].y + p[2].y) / (eps * eps),
              },
              acc = distance(al, ar);
            assert(distance(p[1], p[3]) < 0.0025, 'position has no seam');
            assert(v < 0.002, kind + ' team ' + teamIndex + ' @' + d + ' velocity seam ' + v);
            assert(
              acc < 0.01,
              kind + ' team ' + teamIndex + ' @' + d + ' acceleration seam ' + acc
            );
            checks += 3;
            maxVelocitySeam = Math.max(maxVelocitySeam, v);
            maxAccelerationSeam = Math.max(maxAccelerationSeam, acc);
          }
        }
        for (const k of [-1, 1])
          assert(
            distance(
              tip(m.sample(global - 0.00001).baton, k),
              tip(m.sample(global + 0.00001).baton, k)
            ) < 0.00004,
            'baton tips do not jump'
          );
        checks += 2;
      }
      // Include visible fading/decelerating people, rather than hiding collisions
      // by only checking the current baton holder.
      for (let d = 0; d <= m.endDistance; d += 0.5) {
        const s = m.sample(d),
          p = m.batonPosition(d);
        near(p.x, s.baton.x, 0, 'light/full baton x');
        near(p.y, s.baton.y, 0, 'light/full baton y');
        const visible = s.athletes.filter((a) => a.visible);
        for (let i = 0; i < visible.length; i++)
          for (let j = i + 1; j < visible.length; j++) {
            const gap = distance(visible[i], visible[j]);
            minOwnBody = Math.min(minOwnBody, gap);
            assert(gap >= 0.57, 'same-team bodies never overlap: ' + kind + ' ' + d + ' ' + gap);
            checks++;
          }
        for (const a of s.athletes) {
          assert(
            [a.x, a.y, a.hand.x, a.hand.y, a.alpha, a.speed].every(Number.isFinite),
            'all model states finite'
          );
          checks++;
        }
      }
      // Gap formation is C2 and begins after the supplied legal break. Established
      // gaps remain constant until every competitor crosses, with no final catch-up.
      const b = kind === 'relay800' ? 115.610609652 : 0;
      if (shared) {
        near(m.teamDistance(b), b, 1e-9, 'no team gap before legal break');
        for (const d of [b + c.gapWindow + 10, total - 1, m.finishDistance - 0.001])
          near(
            (m.teamDistance(d + 0.0001) - m.teamDistance(d - 0.0001)) / 0.0002,
            1,
            0.00001,
            'cruise unchanged after gap formation'
          );
        if (teamIndex)
          assert(!m.sample(total).complete, 'trailing team still racing at leader finish');
        checks++;
      }
    }
}
assert.equal(
  R.create({ kind: 'relay800', position: line, teamCount: 4, teamIndex: 3 }).endDistance,
  3200 + 3 * 2.4
);
checks++;
assert.equal(R.configFor('unknown'), null);
checks++;
// Reuse the real renderer's DOM seam without running its legacy assertions.
// Use real route preparation and its physical-distance wrapper, rather than a
// synthetic route lacking coursePoint/measuredMotion metadata.
const { environment } = require('./helpers/render-harness.cjs');
for (const kind of ['relay200', 'relay800', 'relay1500']) {
  const env = environment(),
    c = R.config[kind],
    state = env.qa.state;
  env.setup({ relay200: '4x200', relay800: '4x800', relay1500: '4x1500' }[kind]);
  state.view = 'manual';
  state.selected = -1;
  const clocks = new Set([0, c.total, state.clockFinish, state.clockFinish + 12]);
  for (const route of state.routes)
    for (const exchange of [c.unit, 2 * c.unit, 3 * c.unit])
      for (const delta of [-0.0001, 0, 0.0001])
        clocks.add(
          route.measuredMotion.distanceAtParameter(exchange + delta) + route.launchSetback
        );
  for (const d of clocks) {
    env.frame(d, 3);
    for (const runner of state.runners) {
      assert.equal(runner.baton, undefined, 'relay has no baton decoration');
      assert.equal(
        runner.athletes.filter((actor) => actor.getAttribute('data-holding') === 'true').length,
        1,
        'one athlete remains active through each exchange'
      );
      checks += 2;
      for (const node of runner.athletes) {
        assert.equal(node.getAttribute('data-selected'), String(Number(node.dataset.runner) === 3));
        assert.equal(
          node.getAttribute('aria-hidden'),
          String(node.getAttribute('display') === 'none')
        );
        checks += 2;
      }
    }
    env.resetCounts();
    env.frame(d, 3);
    assert.equal(
      env.counts().writes,
      0,
      'unchanged extended relay frames retain the zero-write cache'
    );
    checks++;
  }
  const common = env.document.getElementById('common-exchange-zone'),
    first = env.document.getElementById('first-exchange-zone');
  if (c.sharedTrack)
    for (const [delta, alpha] of [
      [0, 0],
      [10, 0.5],
      [20, 1],
    ]) {
      env.frame(c.commonZoneFadeStart + delta);
      near(Number(common.getAttribute('opacity')), alpha, 1e-12, 'parameterized common zone fade');
      near(Number(first.getAttribute('opacity')), 0, 0, 'no separate-lane exchange zone');
    }
  else {
    env.frame(600);
    near(Number(common.getAttribute('opacity')), 0, 0, 'all-lane relay has no common zone');
    near(Number(first.getAttribute('opacity')), 1, 0, 'all-lane zone remains visible');
  }
}
let actualGeometryChecks = 0;
const jets = (at, x, h = 0.01) => {
  const z = at(x),
    l = at(x - h),
    ll = at(x - 2 * h),
    lll = at(x - 3 * h),
    r = at(x + h),
    rr = at(x + 2 * h),
    rrr = at(x + 3 * h);
  let v = 0,
    a = 0;
  for (const k of ['x', 'y']) {
    const lv = (3 * z[k] - 4 * l[k] + ll[k]) / (2 * h),
      rv = (-3 * z[k] + 4 * r[k] - rr[k]) / (2 * h),
      la = (2 * z[k] - 5 * l[k] + 4 * ll[k] - lll[k]) / (h * h),
      ra = (2 * z[k] - 5 * r[k] + 4 * rr[k] - rrr[k]) / (h * h);
    v += (lv - rv) ** 2;
    a += (la - ra) ** 2;
  }
  return { v: Math.sqrt(v), a: Math.sqrt(a) };
};
for (const kind of ['relay100', 'relay200', 'relay400', 'relay800', 'relay1500']) {
  const env = environment(),
    actual = env.qa;
  env.setup(
    {
      relay100: '4x100',
      relay200: '4x200',
      relay400: '4x400',
      relay800: '4x800',
      relay1500: '4x1500',
    }[kind]
  );
  assert(actual.state.event, 'new event is connected to the product catalog');
  for (const route of actual.state.routes) {
    const m = actual.state.runners[route.index].model,
      clockAt = (parameter) =>
        route.measuredMotion.distanceAtParameter(parameter) + route.launchSetback;
    for (const h of m.handovers) {
      const t = timeAt(m, h.distance),
        eps = 0.0001,
        states = [m.sample(t - eps), m.sample(t), m.sample(t + eps)],
        n = h.distance / m.config.unit;
      for (const get of [
        (s) => s.baton,
        ...Array.from({ length: 4 }, (_, i) => (s) => s.athletes[i]),
        ...Array.from({ length: 4 }, (_, i) => (s) => s.athletes[i].hand),
      ]) {
        const [a, b, c] = states.map(get);
        assert(distance(a, c) < 0.0003, 'actual route handover has no jump: ' + kind);
        assert(
          distance(
            { x: (b.x - a.x) / eps, y: (b.y - a.y) / eps },
            { x: (c.x - b.x) / eps, y: (c.y - b.y) / eps }
          ) < 0.002,
          'actual route handover velocity continuous: ' + kind
        );
        actualGeometryChecks += 2;
      }
      near(
        distance(states[1].athletes[n - 1].grip, states[1].athletes[n].grip),
        0,
        1e-8,
        'actual handover guides meet'
      );
      near(
        distance(states[1].athletes[n - 1].hand, states[1].athletes[n].hand),
        R.gripSpacing,
        1e-8,
        'actual hands use two baton grips'
      );
      assert(
        states[1].athletes[n].progress >= h.zoneStart && states[1].athletes[n].progress <= h.zoneEnd
      );
      actualGeometryChecks += 3;
      for (const station of [h.distance, h.decelerationEnd]) {
        const jet = jets((parameter) => {
          const a = m.sample(clockAt(parameter)).athletes[n - 1];
          return { x: a.progress, y: a.side };
        }, station);
        assert(jet.v < 0.002, 'real retirement pose velocity remains continuous');
        assert(jet.a < 0.01, 'real retirement pose acceleration remains continuous');
        actualGeometryChecks += 2;
      }
    }
  }
}
// Cover every visible retired/receiving runner, not just the current holder.

console.log(
  JSON.stringify(
    { checks, actualGeometryChecks, maxVelocitySeam, maxAccelerationSeam, minOwnBody },
    null,
    2
  )
);
