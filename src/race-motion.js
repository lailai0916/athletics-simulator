/* Race-clock kinematics. Distances are metres; time is simulation seconds. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RaceMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const cruiseSpeed = 10,
    startDuration = 2.4,
    stopDuration = 2.4;
  const startDistance = (cruiseSpeed * startDuration) / 2,
    runOutDistance = (cruiseSpeed * stopDuration) / 2;
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const smooth = (u) => u * u * u * (10 + u * (-15 + 6 * u));
  const integral = (u) => u * u * u * u * (2.5 + u * (-3 + u));
  // Both ramps have zero acceleration and jerk at their boundaries. Integrate
  // their velocity exactly so coarse frames and speed changes cannot add drift.
  function inverseIntegral(value, slowing = false) {
    if (value <= 0) return 0;
    if (value >= 0.5) return 1;
    let low = 0,
      high = 1;
    for (let i = 0; i < 48; i++) {
      const u = (low + high) / 2,
        area = slowing ? u - integral(u) : integral(u);
      if (area < value) low = u;
      else high = u;
    }
    return (low + high) / 2;
  }
  const finishTime = (finishDistance) =>
    startDuration + (finishDistance - startDistance) / cruiseSpeed;
  const endDistance = (finishDistance) => finishDistance + runOutDistance;
  function distanceAtTime(time, finishDistance) {
    const t = Math.max(0, time),
      brakeAt = finishTime(finishDistance);
    if (t < startDuration) return cruiseSpeed * startDuration * integral(t / startDuration);
    if (t <= brakeAt) return startDistance + (t - startDuration) * cruiseSpeed;
    const u = clamp((t - brakeAt) / stopDuration);
    return finishDistance + cruiseSpeed * stopDuration * (u - integral(u));
  }
  function timeAtDistance(distance, finishDistance) {
    const d = Math.max(0, distance);
    if (d < startDistance)
      return startDuration * inverseIntegral(d / (cruiseSpeed * startDuration));
    if (d <= finishDistance) return startDuration + (d - startDistance) / cruiseSpeed;
    return (
      finishTime(finishDistance) +
      stopDuration * inverseIntegral((d - finishDistance) / (cruiseSpeed * stopDuration), true)
    );
  }
  function advance(distance, seconds, finishDistance) {
    if (seconds <= 0) return Math.max(0, Math.min(endDistance(finishDistance), distance));
    // Keep long, constant-speed sections on the direct metre clock. This also
    // avoids subtracting large elapsed times for each small rendered frame.
    if (distance >= startDistance && distance + seconds * cruiseSpeed <= finishDistance)
      return distance + seconds * cruiseSpeed;
    return distanceAtTime(timeAtDistance(distance, finishDistance) + seconds, finishDistance);
  }
  function speedAtDistance(distance, finishDistance) {
    if (distance <= 0 || distance >= endDistance(finishDistance)) return 0;
    if (distance < startDistance)
      return cruiseSpeed * smooth(timeAtDistance(distance, finishDistance) / startDuration);
    if (distance <= finishDistance) return cruiseSpeed;
    const u =
      (timeAtDistance(distance, finishDistance) - finishTime(finishDistance)) / stopDuration;
    return cruiseSpeed * (1 - smooth(clamp(u)));
  }
  return Object.freeze({
    cruiseSpeed,
    startDuration,
    stopDuration,
    startDistance,
    runOutDistance,
    distanceAtTime,
    timeAtDistance,
    advance,
    speedAtDistance,
    endDistance,
  });
});
