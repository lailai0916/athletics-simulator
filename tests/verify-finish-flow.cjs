'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const RaceMotion = require('../src/race-motion.js');
// Retain the actual product relay wrappers and rendering integration. Only the
// established camera harness's static scenery / glyph measurement are omitted.
const harness = require('./helpers/app-harness.cjs');
let checks = 0;
const results = [];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
for (const id of [
  '800',
  '1000',
  '1500',
  'mile',
  '2000',
  '3000',
  '5000',
  '10000',
  '3000sc',
  '4x400',
  '4x800',
  '4x1500',
])
  for (const grouped of ['5000', '10000'].includes(id) ? [false, true] : [false]) {
    const h = harness(),
      Q = h.api;
    Q.changeEvent(id);
    if (grouped) h.nodes.get('group-start').dispatch('click');
    const e = Q.state.event,
      relay = e.kind.startsWith('relay'),
      crossings = Q.state.routes.map((route) => route.courseDistance + route.launchSetback),
      firstFinish = Math.min(...crossings),
      firstIndex = crossings.indexOf(firstFinish),
      allFinish = Math.max(...crossings),
      end = allFinish + RaceMotion.runOutDistance;
    assert(crossings.every(Number.isFinite), 'every competitor has a finite measured crossing');
    checks++;
    const point = (i, d) =>
      relay
        ? Q.state.runners[i].model.sample(d).athletes[3]
        : Q.displayedPoint(Q.state.routes[i], d);
    // Competitors retain a common post-break corridor. Their offsets now come
    // from measured route lengths and launch profiles, not a forced index gap.
    for (let d = firstFinish - 80; d <= end + 0.00001; d += 0.25)
      for (let i = 0; i < Q.state.routes.length; i++) {
        const p = point(i, d),
          reference = point(firstIndex, d - crossings[i] + firstFinish);
        assert(
          dist(p, reference) < 0.0001,
          `${id}/${grouped}: athlete ${i + 1} stays in the common finishing corridor at ${d}m, separation ${dist(p, reference)}`
        );
        checks++;
        const h = 0.0001,
          a = point(i, d - h),
          b = point(i, d + h),
          speed = dist(a, b) / (2 * h);
        // The path is still parameterised by physical metres during run-out. The
        // clock applies the smooth deceleration without changing pack separation.
        if (d < end - 0.001) {
          assert(speed > 0.995 && speed < 1.005, `${id}: no final catch-up/slowdown (${speed})`);
          checks++;
        }
      }
    let minimum = Infinity;
    for (let d = firstFinish - 120; d <= end + 0.00001; d += 0.1) {
      const points = Q.state.routes.map((_, i) => point(i, d));
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++)
          minimum = Math.min(minimum, dist(points[i], points[j]));
    }
    const safe = id === '800' || relay ? 0.58 : 0.46;
    assert(minimum >= safe, `${id}: no bodies overlap through the finish tail (${minimum})`);
    checks++;
    const actualFinish = point(firstIndex, firstFinish);
    for (let i = 0; i < Q.state.routes.length; i++) {
      assert(
        dist(point(i, crossings[i]), actualFinish) < 0.0001,
        `${id}: athlete ${i + 1} crosses the common finish at its actual measured crossing clock`
      );
      checks++;
    }
    assert(
      Math.abs(Q.allFinishDistance() - allFinish) < 1e-9,
      'last finish is the latest individual measured crossing'
    );
    assert(
      Math.abs(Q.raceEndDistance() - end) < 1e-9,
      'playback includes twelve metres of gradual run-out'
    );
    checks += 2;
    Object.assign(Q.state, { distance: firstFinish, speed: 1, playing: true, lastTime: 1000 });
    Q.frame(1100);
    assert(
      Q.state.distance > firstFinish && Q.state.playing,
      'playback continues after the first finish'
    );
    checks++;
    Q.togglePlay();
    const paused = Q.state.distance;
    Q.togglePlay();
    assert.equal(Q.state.distance, paused, 'resume inside the tail does not restart');
    checks++;
    Object.assign(Q.state, { distance: allFinish, playing: true, lastTime: 1000 });
    Q.frame(1100);
    assert(
      Q.state.distance > allFinish && Q.state.distance < allFinish + 1,
      'runners ease down after the last finish'
    );
    assert.equal(Q.state.playing, true);
    checks += 2;
    Q.frame(1000 + RaceMotion.stopDuration * 1000);
    assert.equal(Q.state.distance, end);
    assert.equal(Q.state.playing, false);
    checks += 2;
    Q.togglePlay();
    assert.equal(Q.state.distance, 0, 'replay starts only after every athlete finished');
    checks++;
    Q.reset();
    assert.equal(Q.state.distance, 0);
    assert.equal(Q.state.playing, false);
    checks += 2;
    results.push({
      event: id,
      grouped,
      firstFinish,
      lastFinish: allFinish,
      finishSpreadMetres: allFinish - firstFinish,
      finishSpreadSecondsAt1x: (allFinish - firstFinish) / 10,
      minimumCentreDistance: minimum,
    });
  }
console.log(JSON.stringify({ checks, results }, null, 2));
