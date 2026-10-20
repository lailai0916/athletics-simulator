'use strict';
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const scheduled = new Map();
let nextFrame = 1,
  checks = 0;
const ctx = {
  window: {},
  document: { hidden: false, getElementById: () => ({}) },
  Math,
  console,
  requestAnimationFrame: (callback) => {
    const id = nextFrame++;
    scheduled.set(id, callback);
    return id;
  },
  cancelAnimationFrame: (id) => scheduled.delete(id),
};
vm.createContext(ctx);
// Run the real application frame/toggle/stop functions and their RAF wiring.
// Static paint is irrelevant to race-clock integration, so update is isolated.
const app = require('./helpers/load-app.cjs').withBootstrap(
  '\nupdate=()=>{};window.playback={state,createRoutes,togglePlay,frame,stop,allFinishDistance,raceEndDistance};\n'
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + app, ctx);
const { state, createRoutes, togglePlay, frame, stop, allFinishDistance, raceEndDistance } =
  ctx.window.playback;
const near = (actual, expected, label, tolerance = 5e-8) => {
  assert(Number.isFinite(actual), label + ' is finite');
  assert(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' versus ' + expected);
  checks += 2;
};
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  checks++;
};
const ok = (value, label) => {
  assert(value, label);
  checks++;
};
const V = 10,
  A = 2.4,
  B = 2.4,
  START = 12,
  RUN_OUT = 12,
  rates = [0.25, 0.5, 1, 2, 4, 8],
  ORIGIN = 1000;
// Independent closed-form displacement oracle. Do not call RaceMotion here:
// an incorrect frame scale, all-finish clock or ramp must fail integration QA.
const area = (u) => 2.5 * u ** 4 - 3 * u ** 5 + u ** 6;
const finishTime = (finish) => A + (finish - START) / V;
const endTime = (finish) => finishTime(finish) + B;
function distanceAt(time, finish) {
  if (time <= 0) return 0;
  if (time < A) return V * A * area(time / A);
  const crossing = finishTime(finish);
  if (time <= crossing) return START + (time - A) * V;
  if (time >= crossing + B) return finish + RUN_OUT;
  const u = (time - crossing) / B;
  return finish + V * B * (u - area(u));
}
function tick(now, label) {
  equal(scheduled.size, 1, label + ' owns exactly one pending RAF');
  const callback = scheduled.get(state.raf);
  equal(typeof callback, 'function', label + ' consumes the registered frame');
  scheduled.delete(state.raf);
  callback(now);
}
function begin(test, startClock = 0, speed = 1) {
  stop();
  equal(scheduled.size, 0, test.name + ' clears the previous frame');
  ctx.document.hidden = false;
  const start = distanceAt(startClock, test.finish);
  Object.assign(state, {
    event: test.event,
    grouped: test.grouped,
    routes: test.routes,
    clockFinish: test.clockFinish,
    distance: start,
    speed,
    view: 'manual',
    phase: start ? 'run' : 'marks',
  });
  near(
    allFinishDistance(),
    test.finish,
    test.name + ' all-finish clock is the latest independently measured crossing'
  );
  near(raceEndDistance(), test.finish + RUN_OUT, test.name + ' stop clock includes a 12 m run-out');
  togglePlay();
  equal(state.playing, true, test.name + ' starts playing');
  equal(state.phase, 'run', test.name + ' uses the run phase');
  tick(ORIGIN, test.name + ' initial frame');
  near(state.distance, start, test.name + ' initial frame anchors without moving');
}
const cases = [];
for (const event of ctx.window.TrackApp.events) {
  for (const grouped of ['5000', '10000'].includes(event.id) ? [false, true] : [false]) {
    Object.assign(state, { event, grouped });
    createRoutes();
    const routes = state.routes;
    const crossings = routes.map((route) => {
      ok(
        Number.isFinite(route.courseDistance) && Number.isFinite(route.launchSetback),
        event.id + ' has measured route and launch metadata'
      );
      return route.courseDistance + route.launchSetback;
    });
    cases.push({
      event,
      grouped,
      routes,
      clockFinish: state.clockFinish,
      name: event.id + (grouped ? '/grouped' : ''),
      firstFinish: Math.min(...crossings),
      finish: Math.max(...crossings),
    });
  }
}
equal(new Set(cases.map((test) => test.event.id)).size, 21, 'all 21 catalog events are exercised');
const cruiseDistances = [];
for (const test of cases)
  for (const speed of rates) {
    const label = test.name + '/' + speed + 'x',
      cross = finishTime(test.finish),
      rest = endTime(test.finish);
    // Every event starts from rest and reaches the same cruise at 2.4 s. Uneven
    // RAF intervals exercise the integrated ramp rather than a per-frame delta.
    begin(test, 0, speed);
    let previousAverage = -1,
      previousTime = 0,
      previousDistance = 0;
    for (const time of [0.12, 0.37, 0.81, 1.2, 1.93, A]) {
      tick(ORIGIN + (time / speed) * 1000, label + ' start ' + time);
      near(state.distance, distanceAt(time, test.finish), label + ' analytical start displacement');
      const average = (state.distance - previousDistance) / (time - previousTime);
      ok(
        average > previousAverage && average < V,
        label + ' initial speed rises smoothly below cruise'
      );
      previousAverage = average;
      previousTime = time;
      previousDistance = state.distance;
      equal(state.playing, true, label + ' remains active during acceleration');
    }
    near(state.distance, START, label + ' reaches 12 m at the cruise boundary');
    // Starting precisely at cruise must cover ten metres per simulation second,
    // including every playback multiple and a nonuniform one-second frame train.
    begin(test, A + 0.5, speed);
    const cruiseStart = state.distance;
    for (const wallTime of [0.016, 0.035, 0.1, 0.28, 0.5, 0.75, 1]) {
      tick(ORIGIN + wallTime * 1000, label + ' cruise');
      near(state.distance, cruiseStart + wallTime * speed * V, label + ' shared cruise pace');
    }
    cruiseDistances.push((state.distance - cruiseStart) / speed);
    // The leader and every delayed competitor cross at full cruise. Braking
    // begins only at the all-finish clock, then speed falls continuously to rest.
    const leaderCross = A + (test.firstFinish - START) / V;
    begin(test, leaderCross - 0.1, speed);
    tick(ORIGIN + (0.1 / speed) * 1000, label + ' first finish');
    near(
      state.distance,
      test.firstFinish,
      label + ' first athlete reaches its actual route finish'
    );
    equal(state.playing, true, label + ' keeps playing beyond the first finish');
    tick(ORIGIN + ((cross - leaderCross + 0.1) / speed) * 1000, label + ' final finish');
    near(state.distance, test.finish, label + ' final competitor crosses before braking');
    equal(state.playing, true, label + ' final finish begins a run-out');
    previousAverage = V;
    previousTime = 0;
    previousDistance = state.distance;
    for (const elapsed of [0.24, 0.72, 1.2, 1.68, 2.16, 2.35, B]) {
      tick(
        ORIGIN + ((cross - leaderCross + 0.1 + elapsed) / speed) * 1000,
        label + ' deceleration ' + elapsed
      );
      near(
        state.distance,
        distanceAt(cross + elapsed, test.finish),
        label + ' analytical run-out displacement'
      );
      const average = (state.distance - previousDistance) / (elapsed - previousTime);
      ok(
        average >= 0 && average < previousAverage,
        label + ' run-out speed declines without reversing'
      );
      previousAverage = average;
      previousTime = elapsed;
      previousDistance = state.distance;
      if (elapsed < B) equal(state.playing, true, label + ' plays until the run-out finishes');
    }
    equal(state.distance, test.finish + RUN_OUT, label + ' stops exactly 12 m after all finish');
    equal(state.playing, false, label + ' stops automatically at rest');
    equal(scheduled.size, 0, label + ' leaves no pending RAF at rest');
    // A coarse callback may cross both joins. It must agree with the complete
    // analytical duration, finish without overshoot, and replay from rest.
    begin(test, 0, speed);
    tick(ORIGIN + ((rest - 0.05) / speed) * 1000, label + ' nearly complete');
    near(state.distance, distanceAt(rest - 0.05, test.finish), label + ' coarse full-race advance');
    equal(state.playing, true, label + ' still playing just before rest');
    tick(ORIGIN + (rest / speed) * 1000, label + ' complete');
    equal(state.distance, test.finish + RUN_OUT, label + ' duration includes both ramps');
    equal(state.playing, false, label + ' full race reaches rest');
    togglePlay();
    equal(state.distance, 0, label + ' replay returns to the start');
    equal(state.playing, true, label + ' replay resumes playback');
    tick(ORIGIN + (rest / speed) * 1000 + 500, label + ' replay anchor');
    equal(state.distance, 0, label + ' replay does not reuse the old clock');
    tick(
      ORIGIN + (rest / speed) * 1000 + 500 + (1.2 / speed) * 1000,
      label + ' replay acceleration'
    );
    near(state.distance, 1.875, label + ' replay accelerates from rest again');
  }
near(Math.min(...cruiseDistances), V, 'slowest normalized event cruise');
near(Math.max(...cruiseDistances), V, 'fastest normalized event cruise');

// Seeking into either ramp or across a join must recover its physical clock
// from distance, rather than restarting the ramp or using stale elapsed time.
for (const test of cases)
  for (const speed of rates) {
    const cross = finishTime(test.finish);
    for (const startClock of [
      A * 0.25,
      A - 0.01,
      A + 0.01,
      cross - 0.01,
      cross + B * 0.25,
      cross + B * 0.9,
    ]) {
      begin(test, startClock, speed);
      const elapsed = 0.137;
      tick(ORIGIN + elapsed * 1000, test.name + ' seek/resume');
      near(
        state.distance,
        distanceAt(startClock + elapsed * speed, test.finish),
        test.name + ' ' + speed + 'x seek preserves the ramp phase'
      );
    }
  }

// Changing speed mid-ramp is equivalent to summing simulation time. Exercise
// both ramps with irregular callbacks, including repeated timestamps.
for (const test of cases)
  for (const startClock of [0.3, finishTime(test.finish) - 0.8]) {
    begin(test, startClock, 1);
    let wall = 0,
      sim = startClock;
    for (const [seconds, speed] of [
      [0.032, 0.25],
      [0.004, 0.5],
      [0.016, 4],
      [0.013, 8],
      [0, 2],
      [0.17, 1],
      [0.333, 2],
      [0.025, 0.5],
      [0.8, 1],
      [0.41, 4],
    ]) {
      if (!state.playing) break;
      state.speed = speed;
      wall += seconds;
      sim += seconds * speed;
      tick(ORIGIN + wall * 1000, test.name + ' irregular changed speed');
      near(
        state.distance,
        distanceAt(sim, test.finish),
        test.name + ' variable speeds preserve elapsed simulation time'
      );
    }
  }

// Pause and hidden-tab gaps must not accumulate time, even inside either ramp.
const relay = cases.find((test) => test.event.id === '4x400');
for (const speed of rates)
  for (const startClock of [A / 2, A + 3, finishTime(relay.finish) + 0.6]) {
    begin(relay, startClock, speed);
    tick(ORIGIN + 100, relay.name + ' before pause');
    const physicalTime = startClock + 0.1 * speed,
      paused = state.distance;
    stop();
    equal(scheduled.size, 0, 'pause cancels its outstanding RAF');
    frame(ORIGIN + 60000);
    equal(state.distance, paused, 'paused callbacks cannot move the athletes');
    equal(scheduled.size, 0, 'paused callbacks cannot schedule another RAF');
    togglePlay();
    equal(state.distance, paused, 'resume retains the exact position');
    tick(ORIGIN + 61000, 'resume reanchor');
    equal(state.distance, paused, 'first resumed frame excludes the paused wall time');
    tick(ORIGIN + 61050, 'resume movement');
    near(
      state.distance,
      distanceAt(physicalTime + 0.05 * speed, relay.finish),
      'resumed ramp keeps its previous phase'
    );
    begin(relay, startClock, speed);
    const beforeHidden = state.distance;
    ctx.document.hidden = true;
    tick(ORIGIN + 1000, 'hidden first callback');
    tick(ORIGIN + 61000, 'hidden throttled callback');
    equal(state.distance, beforeHidden, 'hidden callbacks exclude background wall time');
    equal(state.lastTime, 0, 'background callbacks discard the old time anchor');
    equal(state.playing, true, 'hidden tab preserves play intent');
    ctx.document.hidden = false;
    tick(ORIGIN + 62000, 'visible reanchor');
    equal(state.distance, beforeHidden, 'first visible frame only reanchors');
    tick(ORIGIN + 62100, 'visible movement');
    near(
      state.distance,
      distanceAt(startClock + 0.1 * speed, relay.finish),
      'visible frame resumes at the same ramp phase'
    );
  }
stop();
equal(scheduled.size, 0, 'test exits without a pending animation');
console.log(
  checks +
    ' playback checks passed across ' +
    cases.length +
    ' event/group configurations: actual RAF integration, smooth start/run-out, shared 10 m/s cruise, 0.25/0.5/1/2/4/8x, coarse/irregular frames, speed changes, seek, pause, hidden time and replay.'
);
