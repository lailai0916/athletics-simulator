/* Continuous relay motion in track metres, sampled by the shared race clock. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RelayMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = (x) => {
    x = clip(x);
    return x * x * x * (10 + x * (-15 + 6 * x));
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const integralSmooth = (t) => t * t * t * t * (2.5 + t * (-3 + t));
  const SEP = 0.31,
    FORWARD = 0.46,
    HAND_SIDE = -0.2,
    GRIP = 0.075;
  // TR24: 0.28–0.30 m length and 40 ± 2 mm outside diameter.
  const BATON_LENGTH = 0.29,
    BATON_WIDTH = 0.04,
    GAP_WINDOW = 160,
    TEAM_GAP = 2.4;
  // Race geometry and break-line placement are supplied by position()/breakDistance.
  // Motion policy records which exchanges share the track, independently of leg
  // length. 4×200 uses the selected all-lanes variant.
  const CONFIG = Object.freeze({
    relay100: Object.freeze({
      unit: 100,
      total: 400,
      zoneBefore: 20,
      zoneAfter: 10,
      acceleration: 24,
      startBack: 12,
      settle: 12,
      approach: 18,
      reach: 3,
      deceleration: 12,
      rest: 3,
      fade: 7,
      sharedTrack: false,
      teamGap: 0,
      commonFrom: Infinity,
      defaultBreakDistance: 0,
      outsideCarryFromLeg: Infinity,
      gapWindow: GAP_WINDOW,
      waitingLead: 210,
      deferLappedWaiting: false,
      firstZoneFadeStart: Infinity,
      commonZoneFadeStart: Infinity,
      zoneFade: 20,
    }),
    relay200: Object.freeze({
      unit: 200,
      total: 800,
      zoneBefore: 20,
      zoneAfter: 10,
      acceleration: 24,
      startBack: 12,
      settle: 12,
      approach: 18,
      reach: 3,
      deceleration: 12,
      rest: 3,
      fade: 7,
      sharedTrack: false,
      teamGap: 0,
      commonFrom: Infinity,
      defaultBreakDistance: 0,
      outsideCarryFromLeg: Infinity,
      gapWindow: GAP_WINDOW,
      waitingLead: 210,
      deferLappedWaiting: true,
      firstZoneFadeStart: Infinity,
      commonZoneFadeStart: Infinity,
      zoneFade: 20,
    }),
    relay400: Object.freeze({
      unit: 400,
      total: 1600,
      zoneBefore: 10,
      zoneAfter: 10,
      acceleration: 18,
      startBack: 9,
      settle: 20,
      approach: 14,
      reach: 4,
      deceleration: 18,
      rest: 4,
      fade: 9,
      sharedTrack: true,
      teamGap: TEAM_GAP,
      commonFrom: 800,
      defaultBreakDistance: 520,
      outsideCarryFromLeg: 2,
      gapWindow: GAP_WINDOW,
      waitingLead: 210,
      deferLappedWaiting: false,
      firstZoneFadeStart: 430,
      commonZoneFadeStart: 650,
      zoneFade: 20,
    }),
    relay800: Object.freeze({
      unit: 800,
      total: 3200,
      zoneBefore: 10,
      zoneAfter: 10,
      acceleration: 18,
      startBack: 9,
      settle: 20,
      approach: 14,
      reach: 4,
      deceleration: 18,
      rest: 4,
      fade: 9,
      sharedTrack: true,
      teamGap: TEAM_GAP,
      commonFrom: 800,
      defaultBreakDistance: 120,
      outsideCarryFromLeg: 1,
      gapWindow: GAP_WINDOW,
      waitingLead: 210,
      deferLappedWaiting: false,
      firstZoneFadeStart: -Infinity,
      commonZoneFadeStart: 650,
      zoneFade: 20,
    }),
    relay1500: Object.freeze({
      unit: 1500,
      total: 6000,
      zoneBefore: 10,
      zoneAfter: 10,
      acceleration: 18,
      startBack: 9,
      settle: 20,
      approach: 14,
      reach: 4,
      deceleration: 18,
      rest: 4,
      fade: 9,
      sharedTrack: true,
      teamGap: TEAM_GAP,
      commonFrom: 1500,
      defaultBreakDistance: 0,
      outsideCarryFromLeg: 1,
      gapWindow: GAP_WINDOW,
      waitingLead: 210,
      deferLappedWaiting: false,
      firstZoneFadeStart: -Infinity,
      commonZoneFadeStart: 1350,
      zoneFade: 20,
    }),
  });
  function frame(point) {
    const len = Math.hypot(point.tx || 0, point.ty || 0) || 1;
    const tx = point.tx === undefined ? 1 : point.tx / len,
      ty = (point.ty || 0) / len;
    return { ...point, tx, ty, nx: -ty, ny: tx };
  }
  function offset(point, side, along = 0) {
    const p = frame(point);
    return { ...p, x: p.x + p.nx * side + p.tx * along, y: p.y + p.ny * side + p.ty * along };
  }
  function create(options) {
    const c = CONFIG[options.kind];
    if (!c) throw new Error('RelayMotion requires a supported relay kind');
    if (typeof options.position !== 'function')
      throw new Error('RelayMotion requires a position(progress) callback');
    const position = options.position,
      teamIndex = Math.max(0, options.teamIndex || 0),
      laneWidth = options.laneWidth || 1.22;
    const breakDistance = Number.isFinite(options.breakDistance)
      ? options.breakDistance
      : c.defaultBreakDistance;
    const teamCount = Math.max(teamIndex + 1, Math.floor(options.teamCount || 8)),
      teamGap = c.sharedTrack
        ? options.teamGap === undefined
          ? c.teamGap
          : Math.max(0, options.teamGap)
        : 0;
    // Product playback can append a shared, eased run-out after the last team
    // finishes. Keep this sampler live throughout that additional path.
    const runOutDistance = Math.max(0, options.runOutDistance || 0);
    const endDistance = c.total + (teamCount - 1) * teamGap + runOutDistance;
    const common = (h) => c.sharedTrack && h >= c.commonFrom;
    const beforeSide = (h) => (common(h) ? 0 : -SEP);
    const afterSide = (h) => (common(h) ? 2 * SEP : SEP);
    const batonSide = (h) => (common(h) ? SEP : 0);
    /* Team separation is a presentation choice, introduced after the legal break.
       The C2 formation has zero velocity/acceleration at both ends; over eight teams
       their 160 m span bounds the local pace change below 20%. Formation never
       changes the shared clock. Once it settles, every team cruises at 1:1,
       retaining its gap through the finish and the app's eased common run-out. */
    function teamDistance(globalDistance) {
      const d = clip(globalDistance, 0, endDistance);
      const opening = smooth((d - breakDistance) / c.gapWindow);
      return d - teamIndex * teamGap * opening;
    }
    function rawAthlete(leg, d) {
      const previous = (leg - 1) * c.unit,
        next = leg * c.unit;
      const incoming = leg > 1,
        outgoing = leg < 4;
      let progress = d,
        side = 0,
        alpha = 1,
        phase = 'running',
        speed = 1;
      if (incoming && d < previous) {
        const t = clip((d - (previous - c.acceleration)) / c.acceleration);
        progress = previous - c.startBack + c.acceleration * integralSmooth(t);
        speed = smooth(t);
        phase = t === 0 ? 'waiting' : 'accelerating';
        /* Common-zone receivers begin in official inside-to-outside waiting order,
           then close toward the incoming runner without teleporting either runner. */
        const waitSide = common(previous) ? SEP + teamIndex * laneWidth : afterSide(previous);
        side = lerp(waitSide, afterSide(previous), smooth(t));
        // The inner lane of a two-lap relay reuses the leg 2/4 waiting area.
        // Reveal only the approaching receiver, so future lap occupants never
        // sit on top of the current receiver. Existing 4×100/400 timing is kept.
        if (common(previous) || c.deferLappedWaiting)
          alpha = smooth((d - (previous - c.waitingLead)) / 10);
      } else {
        if (incoming) side = afterSide(previous) * (1 - smooth((d - previous) / c.settle));
        if (outgoing && d > next - c.approach)
          side = lerp(side, beforeSide(next), smooth((d - next + c.approach) / c.approach));
      }
      if (outgoing && d >= next) {
        const t = clip((d - next) / c.deceleration);
        progress = next + c.deceleration * (t - integralSmooth(t));
        speed = 1 - smooth(t);
        side = beforeSide(next);
        // The demo's shared-course formation brings arriving teams 0.7m apart.
        // Retiring bodies need a wider C2 fan than the old 0.65m spacing;
        // keep this entirely after transfer so active runners are unchanged.
        if (common(next)) side -= (0.85 + Math.max(0, teamCount - 1 - teamIndex) * 0.8) * smooth(t);
        phase = t < 1 ? 'decelerating' : 'retired';
        alpha = 1 - smooth((d - next - c.deceleration - c.rest) / c.fade);
      }
      // In shared-track legs, settle the received baton into an
      // outside carry. This keeps it clear of the runner ahead while merging;
      // it is a pose choice, not a prescribed hand-switching race rule.
      const carrySide = leg >= c.outsideCarryFromLeg ? -HAND_SIDE : HAND_SIDE;
      let handSide = carrySide;
      if (incoming && d < previous + c.reach)
        handSide = lerp(
          batonSide(previous) - afterSide(previous),
          carrySide,
          smooth((d - previous) / c.reach)
        );
      if (outgoing && d > next - c.reach)
        handSide = lerp(
          handSide,
          batonSide(next) - beforeSide(next),
          smooth((d - next + c.reach) / c.reach)
        );
      const p = offset(position(progress), side),
        grip = offset(p, handSide, FORWARD);
      // The two hands use separate ends of the baton during a transfer. Their
      // grip changes smoothly without changing the baton-centre trajectory.
      let gripOffset = 0;
      if (incoming && d < previous + c.reach)
        gripOffset = GRIP * (1 - smooth((d - previous) / c.reach));
      if (outgoing && d > next - c.reach)
        gripOffset = lerp(gripOffset, -GRIP, smooth((d - next + c.reach) / c.reach));
      const hand = offset(grip, 0, gripOffset);
      let armAlpha = d >= previous || leg === 1 ? 1 : smooth((d - previous + c.reach) / c.reach);
      if (outgoing && d >= next) armAlpha *= 1 - smooth((d - next) / 2);
      const label = String(leg);
      return {
        leg,
        label,
        progress,
        side,
        phase,
        speed,
        alpha,
        visible: alpha > 0.00001,
        x: p.x,
        y: p.y,
        tx: p.tx,
        ty: p.ty,
        angle: (Math.atan2(p.ty, p.tx) * 180) / Math.PI,
        grip,
        gripOffset,
        hand,
        armAlpha,
      };
    }
    function rawBaton(d) {
      const owner = Math.max(1, Math.min(4, Math.floor(d / c.unit) + 1)),
        athlete = rawAthlete(owner, d);
      /* The incoming/outgoing baton-centre guides coincide through second
         derivative at transfer. The independent baton never changes DOM parents. */
      return {
        owner,
        alpha: 1,
        visible: true,
        x: athlete.grip.x,
        y: athlete.grip.y,
        tx: athlete.tx,
        ty: athlete.ty,
        angle: athlete.angle,
      };
    }
    function sample(globalDistance) {
      const d = teamDistance(globalDistance),
        epsilon = 0.0005,
        athletes = [];
      for (let leg = 1; leg <= 4; leg++) {
        const a = rawAthlete(leg, d),
          before = rawAthlete(leg, d - epsilon),
          after = rawAthlete(leg, d + epsilon);
        const vx = (after.x - before.x) / (2 * epsilon),
          vy = (after.y - before.y) / (2 * epsilon),
          speed = Math.hypot(vx, vy);
        if (speed > 1e-6) {
          a.tx = vx / speed;
          a.ty = vy / speed;
          a.angle = (Math.atan2(vy, vx) * 180) / Math.PI;
        }
        a.courseSpeed = a.speed;
        a.speed = speed;
        a.holding = d >= (leg - 1) * c.unit && (leg === 4 || d < leg * c.unit);
        a.reach = clip(a.armAlpha);
        athletes.push(a);
      }
      const baton = rawBaton(d);
      /* Report physical baton travel direction for optional traces, while retaining
         its grip-aligned angle for the actual 0.29 m SVG baton. */
      const bb = rawBaton(d - epsilon),
        ba = rawBaton(d + epsilon);
      baton.vx = (ba.x - bb.x) / (2 * epsilon);
      baton.vy = (ba.y - bb.y) / (2 * epsilon);
      return {
        distance: d,
        globalDistance: clip(globalDistance, 0, endDistance),
        athletes,
        baton,
        activeLeg: baton.owner,
        complete: d >= c.total,
      };
    }
    function batonPosition(globalDistance) {
      return rawBaton(teamDistance(globalDistance));
    }
    return Object.freeze({
      sample,
      batonPosition,
      teamDistance,
      config: c,
      teamIndex,
      kind: options.kind,
      endDistance,
      runOutDistance,
      finishDistance: c.total + teamIndex * teamGap,
      gapPolicy: Object.freeze({
        window: c.gapWindow,
        maxPaceChange: (teamIndex * teamGap * 1.875) / c.gapWindow,
      }),
      handovers: [1, 2, 3].map((k) => ({
        distance: k * c.unit,
        zoneStart: k * c.unit - c.zoneBefore,
        zoneEnd: k * c.unit + c.zoneAfter,
        receiverStart: k * c.unit - c.startBack,
        accelerationStart: k * c.unit - c.acceleration,
        accelerationEnd: k * c.unit,
        reachStart: k * c.unit - c.reach,
        releaseEnd: k * c.unit + 2,
        decelerationEnd: k * c.unit + c.deceleration,
      })),
    });
  }
  return Object.freeze({
    create,
    config: CONFIG,
    configFor: (kind) => CONFIG[kind] || null,
    separation: SEP,
    carryForward: FORWARD,
    batonLength: BATON_LENGTH,
    batonWidth: BATON_WIDTH,
    gripSpacing: 2 * GRIP,
    teamGap: TEAM_GAP,
  });
});
