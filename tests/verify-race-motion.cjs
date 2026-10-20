'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const motion = require('../src/race-motion.js');
const scope = {};
vm.createContext(scope);
vm.runInContext(
  require('./helpers/source.cjs').readSource('track-data.js') + '\nglobalThis.catalog=EVENTS;',
  scope
);
let checks = 0;
const near = (actual, expected, tolerance, label) => {
  assert(Number.isFinite(actual), label + ' is finite');
  assert(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' versus ' + expected);
  checks += 2;
};
const V = 10,
  A = 2.4,
  B = 2.4,
  SA = 12,
  SB = 12;
const clamp = (value, a, b) => Math.max(a, Math.min(b, value));
// Independent analytical oracle. Both speed ramps are quintic smoothsteps;
// their integral has average speed one half of the shared cruise speed.
const q = (u) => u * u * u * (10 - 15 * u + 6 * u * u);
const integral = (u) => 2.5 * u ** 4 - 3 * u ** 5 + u ** 6;
const finishTime = (finish) => A + (finish - SA) / V;
const endTime = (finish) => finishTime(finish) + B;
function expectedDistance(time, finish) {
  if (time <= 0) return 0;
  if (time < A) return V * A * integral(time / A);
  const cross = finishTime(finish);
  if (time <= cross) return SA + V * (time - A);
  if (time >= cross + B) return finish + SB;
  const u = (time - cross) / B;
  return finish + V * B * (u - integral(u));
}
function expectedSpeed(time, finish) {
  if (time <= 0 || time >= endTime(finish)) return 0;
  if (time < A) return V * q(time / A);
  if (time <= finishTime(finish)) return V;
  return V * (1 - q((time - finishTime(finish)) / B));
}

for (const [property, value] of Object.entries({
  startDuration: A,
  stopDuration: B,
  cruiseSpeed: V,
  startDistance: SA,
  runOutDistance: SB,
}))
  near(motion[property], value, 1e-12, property);

const cases = [];
for (const event of scope.catalog) {
  const kinds = ['waterfall', 'steeple'],
    packed = kinds.includes(event.kind);
  for (const grouped of ['5000', '10000'].includes(event.id) ? [false, true] : [false]) {
    const count = packed ? (grouped ? 16 : 12) : 8;
    const gap = ['relay400', 'relay800', 'relay1500'].includes(event.kind)
      ? 2.4
      : ['break', 'waterfall', 'steeple'].includes(event.kind)
        ? 0.95
        : 0;
    cases.push({
      name: event.id + (grouped ? '/grouped' : ''),
      finish: event.distance + (count - 1) * gap,
      nominal: event.distance,
    });
  }
}

for (const { name, finish, nominal } of cases) {
  const cross = finishTime(finish),
    end = endTime(finish),
    terminal = finish + SB;
  near(motion.endDistance(finish), terminal, 1e-10, name + ' includes exactly 12 m of run-out');
  for (const [time, description] of [
    [-10, 'before start'],
    [0, 'start'],
    [A / 4, 'quarter start'],
    [A / 2, 'half start'],
    [A, 'cruise onset'],
    [A + 0.001, 'just after onset'],
    [cross - 1, 'before final finish'],
    [cross, 'final finish'],
    [cross + B / 4, 'quarter stop'],
    [cross + B / 2, 'half stop'],
    [cross + B, 'rest'],
    [cross + B + 10, 'after rest'],
  ]) {
    const distance = motion.distanceAtTime(time, finish);
    near(
      distance,
      expectedDistance(time, finish),
      2e-9,
      name + ' analytical distance at ' + description
    );
    near(
      motion.speedAtDistance(distance, finish),
      expectedSpeed(time, finish),
      3e-6,
      name + ' analytical speed at ' + description
    );
  }
  // The last runner reaches the finish at full cruise. Every earlier runner
  // crosses before this clock too, so none slows while still racing.
  near(motion.speedAtDistance(nominal, finish), V, 1e-9, name + ' leader crosses at cruise');
  near(motion.speedAtDistance(finish, finish), V, 1e-9, name + ' final runner crosses at cruise');
  near(motion.timeAtDistance(0, finish), 0, 1e-12, name + ' inverse start');
  near(motion.timeAtDistance(terminal, finish), end, 2e-9, name + ' inverse rest');
  near(motion.distanceAtTime(A / 2, finish), 1.875, 1e-12, name + ' real initial displacement');
  near(
    motion.distanceAtTime(cross + B / 2, finish),
    finish + 10.125,
    2e-9,
    name + ' real coast displacement'
  );

  // Inverse checks include the exact mile, long races, both ramp interiors,
  // and every transition. Avoid ill-conditioned near-rest inversion of a
  // long race where sub-nanometre distance differences round to the endpoint.
  const times = [
    0,
    A * 0.05,
    A * 0.1,
    A * 0.25,
    A * 0.5,
    A * 0.75,
    A * 0.9,
    A,
    A + 0.17,
    cross - 0.17,
    cross,
    cross + B * 0.1,
    cross + B * 0.25,
    cross + B * 0.5,
    cross + B * 0.75,
    cross + B * 0.9,
    end,
  ];
  for (const time of times) {
    const distance = motion.distanceAtTime(time, finish);
    near(
      motion.timeAtDistance(distance, finish),
      time,
      2e-6,
      name + ' time-distance round trip at ' + time
    );
  }
  for (let i = 0; i <= 200; i++) {
    const distance = (terminal * i) / 200;
    near(
      motion.distanceAtTime(motion.timeAtDistance(distance, finish), finish),
      distance,
      3e-9,
      name + ' distance-time round trip ' + i
    );
  }

  // Independent finite differences prove the visible trajectory has no
  // velocity jump at its joins and zero acceleration at both endpoints.
  const h = 0.002;
  for (const time of [0, A, cross, end]) {
    const before = motion.distanceAtTime(time - h, finish),
      at = motion.distanceAtTime(time, finish),
      after = motion.distanceAtTime(time + h, finish);
    const speed = (after - before) / (2 * h),
      acceleration = (after - 2 * at + before) / (h * h);
    near(speed, expectedSpeed(time, finish), 3e-6, name + ' trajectory velocity at ' + time);
    near(acceleration, 0, 2e-4, name + ' trajectory acceleration at ' + time);
  }

  let previousStartSpeed = -1,
    previousStopSpeed = V + 1;
  for (let i = 0; i <= 240; i++) {
    const u = i / 240,
      start = A * u,
      stop = cross + B * u;
    const startD = motion.distanceAtTime(start, finish),
      stopD = motion.distanceAtTime(stop, finish);
    const startSpeed = motion.speedAtDistance(startD, finish),
      stopSpeed = motion.speedAtDistance(stopD, finish);
    assert(startSpeed >= -1e-8 && startSpeed <= V + 1e-8, name + ' bounded acceleration speed');
    assert(stopSpeed >= -1e-8 && stopSpeed <= V + 1e-8, name + ' bounded deceleration speed');
    assert(startSpeed >= previousStartSpeed - 2e-6, name + ' monotone acceleration');
    assert(stopSpeed <= previousStopSpeed + 2e-6, name + ' monotone deceleration');
    near(startSpeed, expectedSpeed(start, finish), 3e-6, name + ' starting speed sample ' + i);
    near(stopSpeed, expectedSpeed(stop, finish), 3e-6, name + ' stopping speed sample ' + i);
    checks += 4;
    previousStartSpeed = startSpeed;
    previousStopSpeed = stopSpeed;
  }

  // advance is evaluated from distance, so seek/pause/resume and uneven RAF
  // spacing must not need a hidden elapsed-time accumulator to remain exact.
  for (const speed of [0.5, 1, 2, 4])
    for (const start of [0, A * 0.5, A + 0.2, cross - 0.2, cross + B * 0.3, end - 0.2]) {
      const distance = motion.distanceAtTime(start, finish);
      near(
        motion.advance(distance, 0, finish),
        distance,
        1e-10,
        name + ' pause identity at ' + start
      );
      const elapsed = 0.731 * speed,
        whole = motion.advance(distance, elapsed, finish);
      near(
        whole,
        expectedDistance(start + elapsed, finish),
        3e-8,
        name + ' ' + speed + 'x analytical advance'
      );
      let partitioned = distance;
      for (const fraction of [0.007, 0.023, 0.011, 0.093, 0.317, 0.019, 0.041, 0.489])
        partitioned = motion.advance(partitioned, elapsed * fraction, finish);
      near(partitioned, whole, 8e-8, name + ' ' + speed + 'x uneven partition invariance');
    }
  for (const speed of [0.5, 1, 2, 4]) {
    const start = A + 0.5,
      distance = motion.distanceAtTime(start, finish);
    near(
      motion.advance(distance, 0.25 * speed, finish) - distance,
      0.25 * speed * V,
      2e-9,
      name + ' shared ' + speed + 'x cruise speed'
    );
  }
  near(motion.advance(0, end + 100, finish), terminal, 2e-9, name + ' large frame clamps at rest');
  near(motion.advance(terminal, 1, finish), terminal, 2e-9, name + ' stays at rest');
}
console.log(
  checks +
    ' race-motion checks passed across ' +
    cases.length +
    ' event/group configurations: analytical ramps, zero endpoint velocity/acceleration, cruise, inverses, seeks, pause and partition invariance.'
);
