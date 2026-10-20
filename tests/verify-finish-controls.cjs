'use strict';
// Real input handlers, clock, controls, dynamic runners, routes and camera.
// Static scenery / glyph measurement are the only harness substitutions.
const assert = require('node:assert/strict'),
  createHarness = require('./helpers/app-harness.cjs');
const RaceMotion = require('../src/race-motion.js'),
  RelayMotion = require('../src/relay-motion.js');
let checks = 0;
for (const id of createHarness().api.events.map((e) => e.id))
  for (const grouped of ['5000', '10000'].includes(id) ? [false, true] : [false]) {
    const h = createHarness(),
      q = h.api,
      s = q.state,
      nominal = q.events.find((e) => e.id === id).distance;
    q.changeEvent(id);
    if (grouped) h.nodes.get('group-start').dispatch('click');
    const relay = RelayMotion.configFor(s.event.kind),
      crossings = s.routes.map((route) => route.courseDistance + route.launchSetback),
      allFinish = Math.max(...crossings),
      end = allFinish + RaceMotion.runOutDistance;
    assert(crossings.every(Number.isFinite), 'every competitor exposes a measured crossing clock');
    checks++;
    s.view = 'manual';
    q.setBox([150, 90, 10, 5.625]);
    const box = h.box();
    s.distance = nominal + (end - nominal) / 2;
    q.update();
    const timeline = h.nodes.get('timeline');
    assert.equal(Number(timeline.value), nominal, 'timeline caps the nominal distance');
    assert.equal(timeline._style['--progress'], '100%');
    assert.equal(timeline.getAttribute('aria-valuetext'), nominal + ' / ' + nominal + ' 米');
    assert.equal(
      Number(h.svg.dataset.distance),
      Number(s.distance.toFixed(2)),
      'actual race clock continues in dataset'
    );
    checks += 4;
    const paused = s.distance;
    h.nodes.get('play').dispatch('click');
    assert.equal(s.distance, paused, 'resume inside tail does not restart');
    h.flush(1000);
    h.flush(1100);
    assert(
      Math.abs(s.distance - RaceMotion.advance(paused, 0.1, allFinish)) < 1e-8,
      'tail follows the continuous race clock'
    );
    checks += 2;
    h.nodes.get('play').dispatch('click');
    const frozen = s.distance;
    h.flush(1500);
    assert.equal(s.distance, frozen, 'pause freezes the tail');
    checks++;
    timeline.value = nominal;
    timeline.dispatch('input');
    assert.equal(s.distance, nominal);
    assert.equal(s.playing, false);
    h.nodes.get('play').dispatch('click');
    assert.equal(s.distance, nominal, 'seeking to nominal finish permits the remaining tail');
    checks += 3;
    q.frame(2000);
    q.frame(2100);
    assert(Math.abs(s.distance - RaceMotion.advance(nominal, 0.1, allFinish)) < 1e-8);
    checks++;
    s.lastTime = 3000;
    const remaining =
      RaceMotion.timeAtDistance(end, allFinish) - RaceMotion.timeAtDistance(s.distance, allFinish);
    q.frame(3000 + remaining * 1000);
    assert.equal(s.distance, end, 'all athletes complete the smooth run-out');
    assert.equal(s.playing, false);
    assert.deepEqual(h.box(), box, 'playback/seek do not move a manual camera');
    checks += 3;
    if (relay)
      for (const [i, runner] of s.runners.entries()) {
        assert(runner.frame.complete, 'every team has completed by playback stop');
        assert.equal(runner.model.endDistance, end, 'relay sampling covers the entire run-out');
        const route = s.routes[i],
          actualArc = route.courseDistance + end - crossings[i],
          expectedParameter = route.measuredMotion.parameterAtDistance(actualArc);
        assert(
          Math.abs(runner.frame.athletes[3].progress - expectedParameter) < 1e-8,
          'final-leg athlete continues along its measured route throughout the eased run-out'
        );
        checks += 3;
      }
    h.clear();
    q.updateRoutes();
    assert.equal(
      h.stats.routeAttrWrites + h.stats.routeStyleWrites,
      0,
      'repeating final tail render retains DOM cache'
    );
    checks += 2;
    for (const { line } of s.routeNodes) {
      assert(line.getAttribute('d').includes('C'), 'tail still uses a forward native cubic');
      assert(!/NaN|Infinity/.test(line.getAttribute('d')));
      checks += 2;
    }
    q.reset();
    assert.equal(s.distance, 0);
    assert.equal(s.playing, false);
    assert.deepEqual(h.box(), box, 'reset after finish retains camera');
    checks += 3;
    s.distance = end;
    s.playing = true;
    h.nodes.get('event-select').value = '100';
    h.nodes.get('event-select').dispatch('change');
    assert.equal(s.event.id, '100');
    assert.equal(s.distance, 0);
    assert.equal(s.playing, false);
    assert.deepEqual(h.box(), box, 'event change after tail retains camera');
    checks += 4;
  }
console.log(checks + ' finish control/input/cache checks passed.');
