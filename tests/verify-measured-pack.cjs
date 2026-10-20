'use strict';
// Exercise the real displayed trajectories. Expectations come from geometric
// differences and independently integrated chords, not the motion lookup table.
const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const ctx = {
  window: {},
  document: { getElementById: () => ({}) },
  Math,
  console,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};
vm.createContext(ctx);
const source = require('./helpers/load-app.cjs').withBootstrap(
  "\nwindow.MeasuredPackQA={state,createRoutes,displayedPoint,rawPoint:typeof routeDisplayPoint==='function'?routeDisplayPoint:null,allFinishDistance,raceEndDistance};\n"
);
vm.runInContext(require('./helpers/source.cjs').readSource('track-data.js') + '\n' + source, ctx);
const Q = ctx.window.MeasuredPackQA,
  M = ctx.window.TrackMath,
  G = M.geometry,
  events = ctx.window.TrackApp.events;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const radius = (p) => Math.hypot(p.x - Math.max(G.left, Math.min(G.right, p.x)), p.y - G.cy);
const smooth = (u) =>
  u <= 0 ? 0 : u >= 1 ? 1 : 10 * u * u * u - 15 * u * u * u * u + 6 * u * u * u * u * u;
const openingDistance = (t, T) =>
  t >= T ? 10 * (t - T / 2) : 10 * T * (2.5 * (t / T) ** 4 - 3 * (t / T) ** 5 + (t / T) ** 6);
const expectedCrossings = {
  100: 1,
  200: 1,
  300: 1,
  400: 1,
  800: 2,
  1000: 3,
  1500: 4,
  mile: 5,
  2000: 5,
  3000: 8,
  5000: 13,
  10000: 25,
  '100h': 1,
  '110h': 1,
  '400h': 1,
  '3000sc': 8,
};
let checks = 0;
const failures = [],
  results = [],
  relayResults = [];
const check = (ok, message) => {
  checks++;
  if (!ok) failures.push(message);
};
for (const id of Object.keys(expectedCrossings))
  for (const grouped of ['5000', '10000'].includes(id) ? [false, true] : [false]) {
    const event = events.find((e) => e.id === id);
    Object.assign(Q.state, { event, grouped });
    Q.createRoutes();
    const maxSetback = Math.max(
      0,
      ...Q.state.routes.map((route) => Number(route.launchSetback) || 0)
    );
    const result = {
      event: id,
      grouped,
      maximumSpeedError: 0,
      maximumOpeningLengthError: 0,
      maximumLaunchSpeedError: 0,
      minimumCentreSpacing: Infinity,
      maxSetback,
      firstFinish: Infinity,
      lastFinish: 0,
    };
    const pointsAt = (s) => Q.state.routes.map((route) => Q.displayedPoint(route, s));
    for (const route of Q.state.routes) {
      const setback = Number(route.launchSetback) || 0,
        duration = 2.4 + setback / 5;
      const step = 0.025,
        h = 0.0002,
        prefix =
          Math.floor(
            Math.min(Q.raceEndDistance(), Math.max(350, 12 + 2 * maxSetback + 150)) / step
          ) * step;
      let previous = Q.displayedPoint(route, 0),
        openingLength = 0,
        maxSpeedError = 0,
        minRadius = Infinity,
        maxRadius = -Infinity,
        minForward = Infinity,
        minOuterBeforeEnd = Infinity,
        minOuterBeforeMeasuredBreak = Infinity,
        passedFirstBend = false;
      const measuredBreakClock =
        route.outer && route.measuredMotion
          ? route.measuredMotion.distanceAtParameter(route.breakD) + setback
          : -Infinity;
      const expectedStart = Q.rawPoint ? Q.rawPoint(route, 0) : route.start;
      check(
        distance(previous, expectedStart) < 1e-8,
        `${id}/${grouped} runner ${route.index + 1}: preserves the exact starting position`
      );
      for (let n = 1; n <= Math.round(prefix / step); n++) {
        const s = n * step,
          p = Q.displayedPoint(route, s),
          r = radius(p);
        openingLength += distance(previous, p);
        previous = p;
        if (s <= (route.finishDistance ?? event.distance)) {
          minRadius = Math.min(minRadius, r);
          maxRadius = Math.max(maxRadius, r);
        }
        if (route.outer) {
          if (id === '5000' ? p.x >= G.left && p.y > G.cy : p.x <= G.right && p.y < G.cy)
            passedFirstBend = true;
          if (!passedFirstBend) minOuterBeforeEnd = Math.min(minOuterBeforeEnd, r);
        }
        if (route.outer && s <= measuredBreakClock)
          minOuterBeforeMeasuredBreak = Math.min(minOuterBeforeMeasuredBreak, r);
        // Shift derivative probes away from the chord grid and exact join points.
        if (n % 8 === 0 && s > 12 + 2 * maxSetback + 0.1) {
          const d = s + 0.00317,
            a = Q.displayedPoint(route, d - h),
            b = Q.displayedPoint(route, d + h),
            vx = (b.x - a.x) / (2 * h),
            vy = (b.y - a.y) / (2 * h),
            speed = Math.hypot(vx, vy);
          maxSpeedError = Math.max(maxSpeedError, Math.abs(speed - 1));
          if (Number.isFinite(p.tx) && Number.isFinite(p.ty))
            minForward = Math.min(minForward, vx * p.tx + vy * p.ty);
        }
      }
      // In particular exercise every repeated steeple lap, rather than trusting a
      // single opening lap or the table's periodic-tail metadata.
      for (let d = prefix + 0.371; d < Q.raceEndDistance() - 0.001; d += 4.123) {
        const a = Q.displayedPoint(route, d - h),
          b = Q.displayedPoint(route, d + h);
        maxSpeedError = Math.max(maxSpeedError, Math.abs(distance(a, b) / (2 * h) - 1));
      }
      const lengthError = Math.abs(openingLength - (prefix - setback));
      result.maximumSpeedError = Math.max(result.maximumSpeedError, maxSpeedError);
      result.maximumOpeningLengthError = Math.max(result.maximumOpeningLengthError, lengthError);
      check(
        maxSpeedError < 0.0002,
        `${id}/${grouped} runner ${route.index + 1}: unit cruise speed, maximum error ${maxSpeedError}`
      );
      check(
        lengthError < 0.001,
        `${id}/${grouped} runner ${route.index + 1}: shared clock minus its start-ramp setback equals travelled metres, error ${lengthError}`
      );
      // The 100/110 m start extension is rectangular outside the oval apron.
      check(
        event.kind === 'straight' ||
          ((id === '3000sc' || minRadius >= G.r - 1e-7) && maxRadius <= G.r + 8 * G.w + 1e-7),
        `${id}/${grouped} runner ${route.index + 1}: path stays on the track (${minRadius}–${maxRadius})`
      );
      check(
        minForward > 0.999,
        `${id}/${grouped} runner ${route.index + 1}: actual path tangent faces forward (${minForward})`
      );
      if (route.outer)
        check(
          minOuterBeforeEnd >= G.r + 4 * G.w - 1e-7,
          `${id}/${grouped} runner ${route.index + 1}: outer group stays outside lane 4 through its first bend (${minOuterBeforeEnd})`
        );
      if (route.outer)
        check(
          minOuterBeforeMeasuredBreak >= G.r + 4 * G.w - 1e-7,
          `${id}/${grouped} runner ${route.index + 1}: physical distance mapping does not permit merging before the original break station (${minOuterBeforeMeasuredBreak})`
        );
      const finishClock = Q.allFinishDistance(),
        atTime = (t) =>
          Q.displayedPoint(route, ctx.RaceMotion.distanceAtTime(Math.max(0, t), finishClock));
      let launchSpeedError = 0,
        launchLength = 0,
        lastLaunch = atTime(0);
      const launchStep = 0.002,
        launchSteps = Math.ceil((duration + 1) / launchStep),
        launchEnd = launchSteps * launchStep;
      for (let n = 1; n <= launchSteps; n++) {
        const t = n * launchStep,
          p = atTime(t);
        launchLength += distance(lastLaunch, p);
        lastLaunch = p;
        if (n % 23 === 0) {
          const a = atTime(t - 0.0001),
            b = atTime(t + 0.0001),
            v = distance(a, b) / 0.0002;
          launchSpeedError = Math.max(launchSpeedError, Math.abs(v - 10 * smooth(t / duration)));
        }
      }
      result.maximumLaunchSpeedError = Math.max(result.maximumLaunchSpeedError, launchSpeedError);
      check(
        launchSpeedError < 0.002,
        `${id}/${grouped} runner ${route.index + 1}: actual launch speed follows its smooth acceleration (${launchSpeedError} m/s error)`
      );
      check(
        Math.abs(launchLength - openingDistance(launchEnd, duration)) < 0.001,
        `${id}/${grouped} runner ${route.index + 1}: its launch path integrates the expected distance`
      );
      check(
        distance(atTime(0.1), expectedStart) > 1e-10,
        `${id}/${grouped} runner ${route.index + 1}: starts moving smoothly at the common gun, without a stationary delay`
      );
      const brakeAt = ctx.RaceMotion.timeAtDistance(finishClock, finishClock);
      let brakeError = 0;
      for (const u of [0, 0.001, 0.1, 0.2, 0.5, 0.8, 0.999, 1]) {
        const t = brakeAt + 2.4 * u,
          a = atTime(t - 0.0001),
          b = atTime(t + 0.0001);
        brakeError = Math.max(brakeError, Math.abs(distance(a, b) / 0.0002 - 10 * (1 - smooth(u))));
      }
      check(
        brakeError < 0.002,
        `${id}/${grouped} runner ${route.index + 1}: retains the smooth shared finish ramp (${brakeError} m/s error)`
      );
      const fd = Number.isFinite(route.finishDistance) ? route.finishDistance : NaN;
      check(
        Number.isFinite(fd),
        `${id}/${grouped} runner ${route.index + 1}: exposes its real measured finish distance`
      );
      if (Number.isFinite(fd)) {
        result.firstFinish = Math.min(result.firstFinish, fd);
        result.lastFinish = Math.max(result.lastFinish, fd);
        const finishY =
          G.cy +
          (['straight', 'lanes'].includes(event.kind)
            ? M.clearLaneCenterRadius(route.lane)
            : M.rho(1));
        const p = Q.displayedPoint(route, fd),
          before = Q.displayedPoint(route, fd - 0.01),
          after = Q.displayedPoint(route, fd + 0.01),
          finish = { x: G.right, y: finishY };
        check(
          distance(p, finish) < 0.0001,
          `${id}/${grouped} runner ${route.index + 1}: its own finish clock reaches the common line exactly (${distance(p, finish)})`
        );
        check(
          before.x < G.right && after.x > G.right,
          `${id}/${grouped} runner ${route.index + 1}: passes forwards through finish instead of merely touching it`
        );
        let crossings = 0,
          last = Q.displayedPoint(route, 0.00001);
        // The finish is tangent to the first bend. A sample after crossing has
        // already left the exact finish y coordinate; use the lower half-plane.
        for (let s = 2; s <= fd + 2; s += 2) {
          const d = Math.min(s, fd + 0.001),
            point = Q.displayedPoint(route, d);
          if (last.x < G.right && point.x >= G.right && point.y > G.cy) crossings++;
          last = point;
          if (d === fd + 0.001) break;
        }
        check(
          crossings === expectedCrossings[id],
          `${id}/${grouped} runner ${route.index + 1}: correct finish-line crossing count (${crossings})`
        );
        check(
          Number.isFinite(route.courseDistance) &&
            Math.abs(fd - route.courseDistance - setback) < 1e-7,
          `${id}/${grouped} runner ${route.index + 1}: finish clock reflects its real course and launch ramp`
        );
      }
    }
    // Centre clearance is reported independently. Equal physical speeds must not
    // be silently changed merely to preserve an artificially fixed pack gap.
    for (let s = 0; s <= Math.min(500, Q.raceEndDistance()); s += 0.25) {
      const points = pointsAt(s);
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++)
          result.minimumCentreSpacing = Math.min(
            result.minimumCentreSpacing,
            distance(points[i], points[j])
          );
    }
    const bodyDiameter = ['waterfall', 'steeple'].includes(event.kind) ? 0.42 : 0.54;
    check(
      result.minimumCentreSpacing >= bodyDiameter - 1e-5,
      `${id}/${grouped}: independently equal-speed bodies do not overlap (${result.minimumCentreSpacing})`
    );
    if (Number.isFinite(result.firstFinish)) {
      check(
        Math.abs(Q.allFinishDistance() - result.lastFinish) < 1e-8,
        `${id}/${grouped}: all-finish clock uses the slowest real path`
      );
      check(
        Math.abs(Q.raceEndDistance() - result.lastFinish - ctx.RaceMotion.runOutDistance) < 1e-8,
        `${id}/${grouped}: stop ramp starts only after every real finish`
      );
    }
    results.push(result);
  }
// Use the application's real wrapper / rendering integration. A copied relay
// wrapper would make the test agree with itself if production changed later.
const integratedHarness = require('./helpers/app-harness.cjs');
const coordinateJets = (at, x, h = 0.01) => {
  const z = at(x),
    l = at(x - h),
    ll = at(x - 2 * h),
    lll = at(x - 3 * h),
    r = at(x + h),
    rr = at(x + 2 * h),
    rrr = at(x + 3 * h);
  const leftV = {},
    rightV = {},
    leftA = {},
    rightA = {};
  for (const key of ['x', 'y']) {
    leftV[key] = (3 * z[key] - 4 * l[key] + ll[key]) / (2 * h);
    rightV[key] = (-3 * z[key] + 4 * r[key] - rr[key]) / (2 * h);
    leftA[key] = (2 * z[key] - 5 * l[key] + 4 * ll[key] - lll[key]) / (h * h);
    rightA[key] = (2 * z[key] - 5 * r[key] + 4 * rr[key] - rrr[key]) / (h * h);
  }
  return { velocityJump: distance(leftV, rightV), accelerationJump: distance(leftA, rightA) };
};
for (const id of ['4x100', '4x200', '4x400', '4x800', '4x1500']) {
  const h = integratedHarness(),
    A = h.api;
  A.changeEvent(id);
  const result = {
    event: id,
    maximumCourseSpeedError: 0,
    maximumCruiseBodySpeedError: 0,
    maximumHandoverPositionError: 0,
    maximumHandoverBodyVelocityJump: 0,
    maximumHandoverPoseVelocityJump: 0,
    maximumHandoverPoseAccelerationJump: 0,
    minimumCentreSpacing: Infinity,
  };
  const e = A.state.event;
  for (let i = 0; i < A.state.routes.length; i++) {
    const route = A.state.routes[i],
      model = A.state.runners[i].model,
      c = model.config;
    const start = model.sample(0).athletes[0],
      expectedStart = route.coursePoint(0);
    check(
      distance(start, expectedStart) < 1e-8,
      `${id} team ${i + 1}: true relay wrapper preserves its start`
    );
    // Cruise probes exclude only the real handover acceleration/settling poses.
    // The course centre retains exactly unit physical speed even in those zones.
    let courseError = 0,
      bodyError = 0;
    const cruiseBegin = 12 + 2 * Math.max(...A.state.routes.map((r) => r.launchSetback)) + 0.1,
      epsilon = 0.0002;
    for (let clock = cruiseBegin; clock < route.finishDistance; clock += 1.371) {
      const p = A.displayedPoint(route, clock - epsilon),
        q = A.displayedPoint(route, clock + epsilon);
      courseError = Math.max(courseError, Math.abs(distance(p, q) / (2 * epsilon) - 1));
      const frame = model.sample(clock),
        d = frame.distance;
      if (
        model.handovers.every(
          (exchange) =>
            d < exchange.distance - c.approach - 0.1 || d > exchange.distance + c.settle + 0.1
        )
      ) {
        const a = model.sample(clock - epsilon).athletes[frame.activeLeg - 1],
          b = model.sample(clock + epsilon).athletes[frame.activeLeg - 1];
        bodyError = Math.max(bodyError, Math.abs(distance(a, b) / (2 * epsilon) - 1));
      }
    }
    result.maximumCourseSpeedError = Math.max(result.maximumCourseSpeedError, courseError);
    result.maximumCruiseBodySpeedError = Math.max(result.maximumCruiseBodySpeedError, bodyError);
    check(
      courseError < 0.0002,
      `${id} team ${i + 1}: measured relay course has unit physical cruise speed (${courseError})`
    );
    check(
      bodyError < 0.0002,
      `${id} team ${i + 1}: holding runner cruises at the same physical speed outside the exchange pose (${bodyError})`
    );
    for (const exchange of model.handovers) {
      const clock =
          route.measuredMotion.distanceAtParameter(exchange.distance) + route.launchSetback,
        frame = model.sample(clock),
        positionError = Math.abs(frame.distance - exchange.distance);
      result.maximumHandoverPositionError = Math.max(
        result.maximumHandoverPositionError,
        positionError
      );
      check(
        positionError < 1e-7,
        `${id} team ${i + 1}: physical clock reaches the unchanged nominal exchange station (${positionError})`
      );
      check(
        frame.distance > exchange.zoneStart && frame.distance < exchange.zoneEnd,
        `${id} team ${i + 1}: exchange stays inside its official zone`
      );
      check(
        model.sample(clock - 0.001).activeLeg === exchange.distance / c.unit &&
          model.sample(clock + 0.001).activeLeg === exchange.distance / c.unit + 1,
        `${id} team ${i + 1}: ownership changes once at the measured exchange clock`
      );
      for (const leg of [exchange.distance / c.unit, exchange.distance / c.unit + 1]) {
        // The standard oval has curvature transitions within millimetres of some
        // exchange stations. Resolve the actual transfer with a submillimetre body
        // derivative, and inspect the pose's C2 progress/side in its own course
        // coordinate. Coarse Cartesian acceleration jets straddle those unrelated
        // geometry joins and amplify numerical-normal noise.
        const at = (d) => model.sample(d).athletes[leg - 1],
          bodyJets = coordinateJets(at, clock, 0.0001);
        const poseAt = (parameter) => {
          const clockAt = route.measuredMotion.distanceAtParameter(parameter) + route.launchSetback,
            a = at(clockAt);
          return { x: a.progress, y: a.side };
        };
        const poseJets = coordinateJets(poseAt, exchange.distance, 0.01);
        result.maximumHandoverBodyVelocityJump = Math.max(
          result.maximumHandoverBodyVelocityJump,
          bodyJets.velocityJump
        );
        result.maximumHandoverPoseVelocityJump = Math.max(
          result.maximumHandoverPoseVelocityJump,
          poseJets.velocityJump
        );
        result.maximumHandoverPoseAccelerationJump = Math.max(
          result.maximumHandoverPoseAccelerationJump,
          poseJets.accelerationJump
        );
        check(
          bodyJets.velocityJump < 0.00001,
          `${id} team ${i + 1} leg ${leg}: handover body velocity remains continuous at the actual clock (${bodyJets.velocityJump})`
        );
        check(
          poseJets.velocityJump < 0.00001 && poseJets.accelerationJump < 0.00001,
          `${id} team ${i + 1} leg ${leg}: exchange acceleration/settling pose remains C2 (${poseJets.velocityJump}, ${poseJets.accelerationJump})`
        );
      }
    }
    const before = model.sample(route.finishDistance - 0.01).athletes[3],
      finish = model.sample(route.finishDistance).athletes[3],
      after = model.sample(route.finishDistance + 0.01).athletes[3];
    check(
      Math.abs(finish.x - G.right) < 0.0001 && before.x < G.right && after.x > G.right,
      `${id} team ${i + 1}: fourth leg crosses the real finish at its individual measured clock`
    );
  }
  for (let clock = 0; clock <= 500; clock += 0.25) {
    const points = A.state.runners.map((r) => {
      const sample = r.model.sample(clock);
      return sample.athletes[sample.activeLeg - 1];
    });
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        result.minimumCentreSpacing = Math.min(
          result.minimumCentreSpacing,
          distance(points[i], points[j])
        );
  }
  check(
    result.minimumCentreSpacing >= 0.54 - 1e-5,
    `${id}: equal physical cruise preserves body clearance (${result.minimumCentreSpacing})`
  );
  relayResults.push(result);
}
const report = { checks, failed: failures.length, results, relayResults, failures };

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
