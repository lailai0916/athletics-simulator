/*__LOCALE__*/
/*__RACE_MOTION__*/
/*__MEASURED_MOTION__*/
/*__RELAY_MOTION__*/
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg',
    G = { left: 55, right: 139.39, cy: 66, r: 36.5, w: 1.22, straight: 84.39 },
    PI = Math.PI;
  const $ = (id) => document.getElementById(id),
    svg = $('stadium');
  /*__EVENT_PICKER__*/
  const mod = (v, m) => ((v % m) + m) % m,
    clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    mix = (a, b, t) => a + (b - a) * t,
    smooth = (t) => {
      t = clamp(t, 0, 1);
      return t * t * (3 - 2 * t);
    };
  const rho = (lane) =>
      lane >= 1 && lane < 2 ? 36.8 + (lane - 1) * 1.12 : G.r + (lane - 1) * G.w + 0.2,
    R1 = rho(1),
    C1 = 2 * G.straight + 2 * PI * R1;
  const circuit = (lane) => 2 * G.straight + 2 * PI * rho(lane);
  function element(tag, attrs = {}, text, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    if (parent) parent.append(el);
    return el;
  }
  /*__LABEL_LAYOUT__*/
  /*__FOOTBALL_PITCH__*/
  /*__FOOTBALL_GOALS__*/
  /*__STATIC_SURFACE__*/
  /*__MARKING_PRECISION__*/
  /*__MERGE_MOTION__*/
  /*__COURSE_MOTION__*/
  /*__CAMERA_CONTROLLER__*/
  /*__RELAY_RENDER__*/
  /*__ROUTE_TRACE__*/
  function path(points) {
    return points
      .map((p, i) => (i ? 'L' : 'M') + Number(p.x.toFixed(7)) + ' ' + Number(p.y.toFixed(7)))
      .join(' ');
  }
  function oval(r) {
    return `M${G.left} ${G.cy + r}H${G.right}A${r} ${r} 0 0 0 ${G.right} ${G.cy - r}H${G.left}A${r} ${r} 0 0 0 ${G.left} ${G.cy + r}Z`;
  }
  function trackPoint(s, lane = 1, extra = 0) {
    const r = rho(lane),
      rv = r + extra,
      per = 2 * G.straight + 2 * PI * r;
    s = mod(s, per);
    let x, y, tx, ty;
    if (s < PI * r) {
      let t = s / r;
      x = G.right + rv * Math.sin(t);
      y = G.cy + rv * Math.cos(t);
      tx = Math.cos(t);
      ty = -Math.sin(t);
    } else if (s < PI * r + G.straight) {
      x = G.right - (s - PI * r);
      y = G.cy - rv;
      tx = -1;
      ty = 0;
    } else if (s < 2 * PI * r + G.straight) {
      let t = (s - PI * r - G.straight) / r;
      x = G.left - rv * Math.sin(t);
      y = G.cy - rv * Math.cos(t);
      tx = -Math.cos(t);
      ty = Math.sin(t);
    } else {
      x = G.left + (s - 2 * PI * r - G.straight);
      y = G.cy + rv;
      tx = 1;
      ty = 0;
    }
    return { x, y, tx, ty, nx: -ty, ny: tx };
  }
  function tangentTo(p, side) {
    const cx = side === 'left' ? G.left : G.right,
      dx = p.x - cx,
      dy = p.y - G.cy,
      d = Math.hypot(dx, dy);
    if (d < R1 - 1e-7) return { point: p, length: 0, angle: 0, s: side === 'left' ? C1 / 2 : 0 };
    const beta = side === 'left' ? Math.atan2(-dx, -dy) : Math.atan2(dx, dy),
      a = beta + Math.acos(clamp(R1 / d, -1, 1));
    const t =
      side === 'left'
        ? { x: cx - R1 * Math.sin(a), y: G.cy - R1 * Math.cos(a) }
        : { x: cx + R1 * Math.sin(a), y: G.cy + R1 * Math.cos(a) };
    return {
      point: t,
      length: Math.hypot(p.x - t.x, p.y - t.y),
      angle: a,
      s: (side === 'left' ? C1 / 2 : 0) + R1 * a,
    };
  }
  function linePoint(a, b, t) {
    return {
      x: mix(a.x, b.x, t),
      y: mix(a.y, b.y, t),
      tx: (b.x - a.x) / Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y)),
      ty: (b.y - a.y) / Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  }
  function continueFrom(p, tan, d) {
    if (d < tan.length && tan.length > 0.0001) return linePoint(p, tan.point, d / tan.length);
    return trackPoint(tan.s + Math.max(0, d - tan.length));
  }
  function startStagger(event, lane) {
    const delta = rho(lane) - R1;
    if (event.laneDistance) return Math.ceil(event.laneDistance / 400) * 2 * PI * delta;
    if (event.stagger === 200) return PI * delta;
    if (event.stagger === 400) return 2 * PI * delta;
    if (event.stagger === 800) return PI * delta + breakReductionAtRadius(rho(lane));
    if (event.stagger === 'relay400') return 3 * PI * delta + breakReductionAtRadius(rho(lane));
    return 0;
  }
  function startS(event, lane) {
    if (event.laneDistance)
      return Math.ceil(event.laneDistance / 400) * circuit(lane) - event.laneDistance;
    if (event.stagger === 200) return PI * rho(lane) + G.straight + startStagger(event, lane);
    return startStagger(event, lane);
  }
  function normalRoute(event, lane) {
    if (event.kind === 'straight') {
      const p = { x: G.right - event.distance, y: G.cy + rho(lane), tx: 1, ty: 0, nx: 0, ny: 1 };
      return {
        start: p,
        position: (d) => ({ ...p, x: p.x + d }),
        lane,
        startS: 0,
        breakD: Infinity,
      };
    }
    if (['lanes', 'relay100', 'relay200'].includes(event.kind)) {
      const s = startS(event, lane);
      return {
        start: trackPoint(s, lane),
        position: (d) => trackPoint(s + d, lane),
        lane,
        startS: s,
        breakD: Infinity,
      };
    }
    if (['break', 'relay400', 'relay800'].includes(event.kind)) {
      const r = rho(lane),
        s = startS(event, lane),
        q = breakReductionAtRadius(r);
      const breakS = (event.kind === 'relay400' ? circuit(lane) : 0) + PI * r + q,
        breakD = breakS - s,
        p = { x: G.right - q, y: G.cy - r, tx: -1, ty: 0, nx: 0, ny: -1 },
        tan = tangentTo(p, 'left');
      return {
        start: trackPoint(s, lane),
        lane,
        startS: s,
        breakD,
        breakPoint: p,
        tangentD: breakD + tan.length,
        entryS: tan.s,
        position: (d) => (d < breakD ? trackPoint(s + d, lane) : continueFrom(p, tan, d - breakD)),
      };
    }
    return waterfallRoute(event, lane);
  }
  function waterfallBase(event) {
    return mod(event.base ?? event.distance, 400);
  }
  function waterfallRoute(event, lane, r = rho(lane)) {
    let p, tan;
    const base = waterfallBase(event);
    if (base === 300) {
      const target = 2 * PI * R1 + G.straight - 100;
      let low = 100 / R1,
        high = PI;
      for (let i = 0; i < 50; i++) {
        const a = (low + high) / 2,
          pp = { x: G.right + r * Math.sin(a), y: G.cy + r * Math.cos(a) },
          tr = tangentTo(pp, 'right'),
          tt = tr.angle <= PI ? tr : tangentTo(pp, 'left'),
          remain =
            tr.angle <= PI
              ? tt.length + (2 * PI * R1 + G.straight - tt.s)
              : tt.length + R1 * (PI - tt.angle);
        if (remain > target) low = a;
        else high = a;
      }
      const a = (low + high) / 2;
      p = { x: G.right + r * Math.sin(a), y: G.cy + r * Math.cos(a) };
      const tr = tangentTo(p, 'right');
      tan = tr.angle <= PI ? tr : tangentTo(p, 'left');
    } else if (event.kind === 'steeple') {
      const sx = G.right - (C1 - SC_PRE - PI * R1),
        D = sx - G.left;
      let low = 0,
        high = 10;
      for (let i = 0; i < 50; i++) {
        const q = (low + high) / 2,
          pp = { x: sx - q, y: G.cy - r },
          tt = tangentTo(pp, 'left');
        if (tt.length - R1 * tt.angle > D) low = q;
        else high = q;
      }
      p = { x: sx - (low + high) / 2, y: G.cy - r };
      tan = tangentTo(p, 'left');
    } else if (base > 0 && base < G.straight) {
      // A mile starts 9.344 m before the common finish. Construct the curved
      // unlaned line from equal tangent-plus-inner-arc distances, not a flat line.
      let low = 0,
        high = G.straight;
      for (let i = 0; i < 64; i++) {
        const back = (low + high) / 2,
          pp = { x: G.right - back, y: G.cy + r },
          tt = tangentTo(pp, 'right');
        if (tt.length - tt.s > base) high = back;
        else low = back;
      }
      p = { x: G.right - (low + high) / 2, y: G.cy + r };
      tan = tangentTo(p, 'right');
    } else {
      const side = base === 0 ? 'right' : 'left',
        angle = Math.sqrt(Math.max(0, r * r - R1 * R1)) / R1 - Math.acos(clamp(R1 / r, -1, 1));
      p =
        side === 'right'
          ? { x: G.right + r * Math.sin(angle), y: G.cy + r * Math.cos(angle) }
          : { x: G.left - r * Math.sin(angle), y: G.cy - r * Math.cos(angle) };
      tan = tangentTo(p, side);
    }
    const first = (d) => continueFrom(p, tan, d);
    const position =
      event.kind === 'steeple'
        ? (d) => (d < SC_PRE ? first(d) : scPoint(mod(d - SC_PRE, SC_LAP)))
        : first;
    return { start: p, lane, breakD: 0, position, tangentD: tan.length, entryS: tan.s };
  }
  function outerGroupRoute(event, lane, r = rho(lane)) {
    const ref = rho(5),
      side = event.id === '5000' ? 'left' : 'right',
      inv = Math.sqrt(Math.max(0, r * r - ref * ref)) / ref - Math.acos(clamp(ref / r, -1, 1)),
      a0 = (PI * (ref - R1) + breakReductionAtRadius(ref)) / ref + inv,
      aT = a0 + Math.acos(clamp(ref / r, -1, 1));
    const on = (rad, a) =>
      side === 'left'
        ? {
            x: G.left - rad * Math.sin(a),
            y: G.cy - rad * Math.cos(a),
            tx: -Math.cos(a),
            ty: Math.sin(a),
          }
        : {
            x: G.right + rad * Math.sin(a),
            y: G.cy + rad * Math.cos(a),
            tx: Math.cos(a),
            ty: -Math.sin(a),
          };
    const p = on(r, a0),
      t = on(ref, aT),
      lineLen = Math.hypot(p.x - t.x, p.y - t.y),
      q = breakReductionAtRadius(ref),
      arcLen = (PI - aT) * ref,
      breakD = lineLen + arcLen + q;
    const bp =
        side === 'left' ? { x: G.left + q, y: G.cy + ref } : { x: G.right - q, y: G.cy - ref },
      tan = tangentTo(bp, side === 'left' ? 'right' : 'left');
    return {
      start: p,
      lane,
      outer: true,
      breakD,
      breakPoint: bp,
      tangentD: breakD + tan.length,
      entryS: tan.s,
      lineLen,
      arcEndD: lineLen + arcLen,
      position(d) {
        if (d < lineLen) return linePoint(p, t, lineLen ? d / lineLen : 1);
        if (d < lineLen + arcLen) return on(ref, aT + (d - lineLen) / ref);
        if (d < breakD) {
          const z = d - lineLen - arcLen;
          return side === 'left'
            ? { x: G.left + z, y: G.cy + ref, tx: 1, ty: 0 }
            : { x: G.right - z, y: G.cy - ref, tx: -1, ty: 0 };
        }
        return continueFrom(bp, tan, d - breakD);
      },
    };
  }
  /*__STEEPLE_PRECISION__*/
  /*__STEEPLE_KERB__*/
  const SC = createSteeplePrecision(G),
    SC_LAP = SC.lap,
    SC_PRE = SC.pre;
  const SC_KERB = steepleKerbLayout(SC, G, TRACK_KERB_WIDTH);
  const FP = createFootballPitch(G);
  function scPoint(d) {
    return SC.point(d);
  }
  const state = {
    event: EVENTS.find((e) => e.id === '4x400'),
    gender: '男子',
    distance: 0,
    selected: -1,
    playing: false,
    phase: 'marks',
    phaseElapsed: 0,
    lastTime: 0,
    grouped: false,
    routes: [],
    runners: [],
    view: 'full',
    box: [3, 13, 190, 110],
    raf: 0,
    portrait: false,
    speed: 1,
  };
  const camera = createTrackCameraController(
    svg,
    () => state.box,
    (box) => setBox(box, true)
  );
  let drag = null,
    rubberViewport = null,
    footballGrassViewport = null;
  function elGroup(parent, attrs = {}) {
    return element('g', attrs, undefined, parent);
  }
  function drawWaterJump(parent) {
    SC.paintFacility(parent, element, elGroup);
  }
  function centerLane(p, lane, amount = 1) {
    const off = (clearLaneCenterRadius(lane) - rho(lane)) * amount,
      tx = p.tx ?? 1,
      ty = p.ty ?? 0;
    return { ...p, x: p.x - ty * off, y: p.y + tx * off };
  }
  function blocks(p, parent) {
    const tx = p.tx ?? 1,
      ty = p.ty ?? 0,
      cx = p.x - tx * 0.85,
      cy = p.y - ty * 0.85,
      g = elGroup(parent, {
        class: 'starting-block',
        transform: `translate(${cx} ${cy}) rotate(${(Math.atan2(ty, tx) * 180) / PI})`,
        'data-equipment': 'starting-block',
      });
    // Selected equipment footprint: 0.88 m rail, two independently set footplates.
    // All of the frame and both plates remain behind the measured start edge.
    const shadow = elGroup(g, {
      transform: `translate(${0.025 * tx + 0.035 * ty} ${-0.025 * ty + 0.035 * tx})`,
      fill: '#233c2c',
      opacity: 0.15,
      'pointer-events': 'none',
    });
    element(
      'rect',
      { x: -0.44, y: -0.035, width: 0.88, height: 0.07, rx: 0.012 },
      undefined,
      shadow
    );
    const pedals = [
      [-0.28, -0.24],
      [0.07, 0.08],
    ];
    for (const [x, y] of pedals) {
      const edge = y < 0 ? y + 0.174 : y - 0.014;
      element(
        'rect',
        { x: x + 0.055, y: Math.min(0, edge), width: 0.11, height: Math.abs(edge), rx: 0.006 },
        undefined,
        shadow
      );
      element(
        'rect',
        { x: x - 0.014, y: y - 0.014, width: 0.248, height: 0.188, rx: 0.021 },
        undefined,
        shadow
      );
    }
    // Each footplate locks into the centre rail through a solid sliding carriage.
    // Paint the two carriages first so both joints are underneath the real metal.
    for (const [x, y] of pedals) {
      const edge = y < 0 ? y + 0.174 : y - 0.014;
      element(
        'rect',
        {
          'data-block-part': 'carriage',
          x: x + 0.055,
          y: Math.min(0, edge),
          width: 0.11,
          height: Math.abs(edge),
          rx: 0.006,
          fill: '#9cafa1',
        },
        undefined,
        g
      );
      element(
        'rect',
        {
          x: x + 0.065,
          y: Math.min(0, edge) + 0.004,
          width: 0.09,
          height: Math.abs(edge) - 0.008,
          rx: 0.003,
          fill: '#c4cfc1',
        },
        undefined,
        g
      );
    }
    element(
      'rect',
      { x: -0.44, y: -0.035, width: 0.88, height: 0.07, rx: 0.012, fill: '#8c9c91' },
      undefined,
      g
    );
    element(
      'rect',
      { x: -0.425, y: -0.023, width: 0.85, height: 0.046, rx: 0.008, fill: '#d7dcd2' },
      undefined,
      g
    );
    const hardware = elGroup(g, { class: 'equipment-detail' });
    for (let x = -0.36; x <= 0.36 + 0.001; x += 0.08)
      element(
        'rect',
        { x: x - 0.008, y: -0.014, width: 0.016, height: 0.028, rx: 0.003, fill: '#8f9d91' },
        undefined,
        hardware
      );
    for (const [x, y] of pedals) {
      element(
        'rect',
        {
          'data-block-part': 'pedal-frame',
          x: x - 0.014,
          y: y - 0.014,
          width: 0.248,
          height: 0.188,
          rx: 0.021,
          fill: '#c4cfc1',
        },
        undefined,
        g
      );
      element(
        'rect',
        { x, y, width: 0.22, height: 0.16, rx: 0.012, fill: '#354c3d' },
        undefined,
        g
      );
      const ribs = elGroup(g, { class: 'equipment-detail' });
      for (let i = 1; i <= 4; i++)
        element(
          'line',
          {
            x1: x + 0.02 + i * 0.036,
            y1: y + 0.018,
            x2: x + 0.02 + i * 0.036,
            y2: y + 0.142,
            stroke: '#708771',
            'stroke-width': 0.007,
            'stroke-linecap': 'butt',
          },
          undefined,
          ribs
        );
      for (const yy of [y + 0.018, y + 0.142])
        element('circle', { cx: x - 0.006, cy: yy, r: 0.006, fill: '#7b8e7f' }, undefined, ribs);
      element(
        'circle',
        { 'data-block-part': 'lock', cx: x + 0.11, cy: 0, r: 0.012, fill: '#607767' },
        undefined,
        ribs
      );
      element(
        'line',
        {
          x1: x + 0.103,
          y1: -0.006,
          x2: x + 0.117,
          y2: 0.006,
          stroke: '#cbd6c7',
          'stroke-width': 0.004,
          'stroke-linecap': 'butt',
        },
        undefined,
        ribs
      );
    }
  }
  function paintSprintHurdle(parent, p, lane) {
    const q = centerLane(p, lane),
      g = elGroup(parent, {
        'data-hurdle': true,
        'data-equipment': 'sprint-hurdle',
        transform: `translate(${q.x} ${q.y}) rotate(${(Math.atan2(q.ty ?? 0, q.tx ?? 1) * 180) / PI})`,
      });
    // TR22: the near face of the bar is on the measured mark; both feet extend
    // toward the approaching athlete. This selected 0.625 m base is below 0.70 m.
    const tx = q.tx ?? 1,
      ty = q.ty ?? 0,
      shadow = elGroup(g, {
        transform: `translate(${0.025 * tx + 0.035 * ty} ${-0.025 * ty + 0.035 * tx})`,
        fill: '#233c2c',
        opacity: 0.14,
        'pointer-events': 'none',
      });
    for (const y of [-0.55, 0.55])
      element(
        'rect',
        { x: -0.6, y: y - 0.02, width: 0.625, height: 0.04, rx: 0.008 },
        undefined,
        shadow
      );
    element('rect', { x: 0, y: -0.59, width: 0.025, height: 1.18 }, undefined, shadow);
    const supports = elGroup(g, { 'data-hurdle-part': 'bases', fill: '#a3b3a8' });
    for (const y of [-0.55, 0.55]) {
      element(
        'rect',
        { x: -0.6, y: y - 0.02, width: 0.625, height: 0.04, rx: 0.008 },
        undefined,
        supports
      );
      element(
        'rect',
        { x: -0.59, y: y - 0.015, width: 0.035, height: 0.03, rx: 0.005, fill: '#4b6152' },
        undefined,
        supports
      );
      element(
        'rect',
        { x: -0.49, y: y - 0.018, width: 0.085, height: 0.036, rx: 0.005, fill: '#667f6d' },
        undefined,
        supports
      );
      element(
        'rect',
        { x: -0.021, y: y - 0.023, width: 0.046, height: 0.046, rx: 0.004, fill: '#c3cfc1' },
        undefined,
        supports
      );
    }
    element(
      'rect',
      {
        'data-hurdle-part': 'top-bar',
        x: 0,
        y: -0.59,
        width: 0.025,
        height: 1.18,
        fill: '#f9f5e9',
      },
      undefined,
      g
    );
    const stripe = 1.18 / 5;
    for (const i of [1, 3])
      element(
        'rect',
        {
          'data-hurdle-part': 'black-stripe',
          x: 0,
          y: -0.59 + i * stripe,
          width: 0.025,
          height: stripe,
          fill: '#2d4034',
        },
        undefined,
        g
      );
  }
  function labeled() {}
  function zone(parent, lane, route, start, end, color) {
    const g = elGroup(parent, {
        'data-zone-lane': lane,
        'data-zone-start': start,
        'data-zone-end': end,
      }),
      span = end - start;
    // Local nonnegative domain also supports exchange zones straddling the finish.
    // Sub-micrometre fit avoids the visible facets of the former 0.35 m polyline.
    const d = createRouteTrace(
      (t) => centerLane(route.position(start + t), lane),
      0,
      span,
      0.0000005,
      span
    );
    element(
      'path',
      {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': 1.04,
        'stroke-linecap': 'butt',
        'stroke-linejoin': 'round',
        opacity: 0.09,
      },
      undefined,
      g
    );
  }
  function createRoutes() {
    const e = state.event;
    state.routes = [];
    const packStart = ['waterfall', 'steeple', 'relay1500'].includes(e.kind),
      count = packStart && e.kind !== 'relay1500' ? (state.grouped ? 16 : 12) : 8;
    for (let i = 0; i < count; i++) {
      let lane = i + 1,
        route;
      if (packStart) {
        if (state.grouped && i >= 10) {
          lane = 5 + ((i - 10) * 2.7) / 5;
          route = outerGroupRoute(e, lane);
        } else {
          lane = 1 + i * (state.grouped ? 3.7 / 9 : 6.7 / (count - 1));
          route = waterfallRoute(e, lane);
        }
      } else route = normalRoute(e, lane);
      route.index = i;
      route.color = TEAMS[i % 8];
      state.routes.push(route);
    }
    prepareCourseMotion();
  }
  function drawEvent() {
    const e = state.event,
      layer = $('event-layer'),
      starts = $('start-layer'),
      labels = element('g');
    layer.replaceChildren();
    starts.replaceChildren();
    $('track-kerb').setAttribute('d', e.kind === 'steeple' ? SC_KERB.steepleD : SC_KERB.normalD);
    if (e.kind === 'steeple') {
      SC.paintBarriers(layer, element, elGroup, { movableOnly: true });
    }
    if (e.hurdles)
      for (let lane = 1; lane <= 8; lane++)
        for (let j = 0; j < 10; j++)
          paintSprintHurdle(
            layer,
            state.routes[lane - 1].position(e.hurdles[0] + j * e.hurdles[1]),
            lane
          );
    if (['break', 'relay400', 'relay800'].includes(e.kind)) {
      labeled(Locale.text('breakLine'), G.right + 2, G.cy - G.r - 12, labels);
      element(
        'line',
        {
          x1: G.right - 0.2,
          y1: G.cy - G.r - 10.5,
          x2: G.right - 0.1,
          y2: G.cy - G.r - 8.9,
          stroke: '#7d9275',
          'stroke-width': 0.12,
        },
        undefined,
        labels
      );
    }
    if (state.grouped) {
      const side = e.id === '5000' ? 'left' : 'right',
        rr = G.r + 4 * G.w;
      const pts = [];
      for (let a = 0; a <= PI + 0.001; a += 0.02)
        pts.push(
          side === 'left'
            ? { x: G.left - rr * Math.sin(a), y: G.cy - rr * Math.cos(a) }
            : { x: G.right + rr * Math.sin(a), y: G.cy + rr * Math.cos(a) }
        );
      for (let a = 0; a <= PI; a += 3.7 / rr) {
        const p =
          side === 'left'
            ? { x: G.left - rr * Math.sin(a), y: G.cy - rr * Math.cos(a) }
            : { x: G.right + rr * Math.sin(a), y: G.cy + rr * Math.cos(a) };
        element(
          'rect',
          { x: p.x - 0.025, y: p.y - 0.025, width: 0.05, height: 0.05, fill: '#f1d483' },
          undefined,
          layer
        );
      }
      const bp = state.routes[10].breakPoint;
      element(
        'rect',
        {
          x: bp.x - 0.025,
          y: bp.y - 0.025,
          width: 0.05,
          height: 0.05,
          fill: TRACK_MARK_COLORS.green,
        },
        undefined,
        layer
      );
      labeled(
        Locale.text('groupMerge'),
        bp.x + (side === 'left' ? 3 : -20),
        bp.y + (side === 'left' ? 11 : -8),
        labels
      );
    }
    if (e.kind === 'relay100' || e.kind === 'relay200') {
      const unit = RelayMotion.configFor(e.kind).unit;
      for (let lane = 1; lane <= 8; lane++)
        for (let leg = 1; leg <= 3; leg++)
          zone(layer, lane, state.routes[lane - 1], leg * unit - 20, leg * unit + 10, '#ffe08b');
      [
        [100, '1 → 2'],
        [200, '2 → 3'],
        [300, '3 → 4'],
      ].forEach(([d, t]) => {
        const p = state.routes[3].position(d);
        labeled(t, p.x + p.nx * 8, p.y + p.ny * 8, labels, { 'text-anchor': 'middle' });
      });
    }
    if (e.kind === 'relay400') {
      const first = elGroup(layer, { id: 'first-exchange-zone' });
      for (let lane = 1; lane <= 8; lane++)
        zone(
          first,
          lane,
          lane === 1 ? { position: (d) => trackPoint(C1 + d - 400, 1) } : state.routes[lane - 1],
          390,
          410,
          '#b4d2df'
        );
      const common = elGroup(layer, { id: 'common-exchange-zone' });
      paintCommonRelayZone(common, '#ead493');
    }
    if (e.kind === 'relay800') {
      const common = elGroup(layer, { 'data-common-relay-zones': e.id });
      paintCommonRelayZone(common, '#b4d2df');
    }
    if (e.kind === 'relay1500') {
      const common = elGroup(layer, { 'data-common-relay-zones': e.id }),
        unit = RelayMotion.configFor(e.kind).unit,
        reference = state.routes[0];
      // Equal-angle offsets keep the 20 m shared zone bounded by the same radial
      // edges in every lane, including the three distinct 4×1500 stations.
      const stations = [unit, unit * 2, unit * 3];
      for (const distance of stations)
        for (let lane = 1; lane <= 8; lane++) {
          const guide = {
            position: (d) => {
              const p = reference.position(d),
                off = rho(lane) - R1;
              return { ...p, x: p.x - p.ty * off, y: p.y + p.tx * off };
            },
          };
          zone(common, lane, guide, distance - 10, distance + 10, '#b4d2df');
        }
    }
    if (e.blocks)
      for (let lane = 1; lane <= 8; lane++)
        blocks(centerLane(state.routes[lane - 1].start, lane), starts);
    drawRoutes();
    createRunnerNodes();
  }
  function packDisplayedPoint(route, d, gapPerRunner = 0.95) {
    const reference = state.grouped && route.outer ? state.routes[10] : state.routes[0],
      span = 120,
      formation = mergeC2(d / span),
      alongFade = 1 - formation,
      sideFade = 1 - mergeC2((d - span / 2) / span),
      gap = route.index * gapPerRunner * formation,
      progress = Math.max(0, d - gap);
    let p = mergeDisplayPoint(reference, progress);
    if (!Number.isFinite(p.tx) || !Number.isFinite(p.ty)) {
      const a = reference.position(Math.max(0, progress - 0.0001)),
        b = reference.position(progress + 0.0001),
        length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p = { ...p, tx: (b.x - a.x) / length, ty: (b.y - a.y) / length };
    }
    if (sideFade > 0) {
      let frame = route.packStartFrame;
      if (!frame) {
        const a = mergeDisplayPoint(reference, 0),
          b = reference.position(0.0001),
          length = Math.hypot(b.x - a.x, b.y - a.y) || 1,
          tx = Number.isFinite(a.tx) ? a.tx : (b.x - a.x) / length,
          ty = Number.isFinite(a.ty) ? a.ty : (b.y - a.y) / length,
          dx = route.start.x - a.x,
          dy = route.start.y - a.y;
        frame = route.packStartFrame = { along: dx * tx + dy * ty, side: -dx * ty + dy * tx };
      }
      // Build longitudinal clearance before releasing lateral room. The two C2
      // windows overlap gradually, retaining the exact start array at d=0.
      p = {
        ...p,
        x: p.x + p.tx * frame.along * alongFade - p.ty * frame.side * sideFade,
        y: p.y + p.ty * frame.along * alongFade + p.tx * frame.side * sideFade,
      };
    }
    return p;
  }
  function routeDisplayPoint(route, d) {
    const e = state.event;
    let p;
    // Long, C2-continuous formation windows prevent the outer pack from walking
    // backwards at the start or sprinting abruptly to erase its display spacing.
    if (e.kind === 'break') {
      const reference = state.routes[0],
        b = route.breakD;
      if (d <= b) p = centerLane(mergeDisplayPoint(route, Math.max(0, d)), route.lane);
      else {
        const local = d - b,
          formation = mergeC2(local / 120),
          alongFade = 1 - formation,
          sideFade = 1 - mergeC2((local - 40) / 120),
          gap = route.index * 0.95 * formation;
        p = centerLane(
          mergeDisplayPoint(reference, Math.max(0, d - gap)),
          reference.lane,
          1 - mergeC2(local / 35)
        );
        if (sideFade > 0) {
          let frame = route.breakDisplayFrame;
          if (!frame) {
            const a = centerLane(mergeDisplayPoint(reference, b), reference.lane),
              z = centerLane(mergeDisplayPoint(route, b), route.lane),
              tx = a.tx ?? -1,
              ty = a.ty ?? 0,
              dx = z.x - a.x,
              dy = z.y - a.y;
            frame = route.breakDisplayFrame = {
              along: dx * tx + dy * ty,
              side: -dx * ty + dy * tx,
            };
          }
          p = {
            ...p,
            x: p.x + p.tx * frame.along * alongFade - p.ty * frame.side * sideFade,
            y: p.y + p.ty * frame.along * alongFade + p.tx * frame.side * sideFade,
          };
        }
      }
    } else {
      p =
        e.kind === 'relay1500'
          ? packDisplayedPoint(route, d, 0)
          : e.kind === 'waterfall' || e.kind === 'steeple'
            ? packDisplayedPoint(route, d)
            : mergeDisplayPoint(route, Math.max(0, d));
      if (['straight', 'lanes', 'relay100', 'relay200', 'relay400', 'relay800'].includes(e.kind))
        p = centerLane(
          p,
          route.lane,
          Number.isFinite(route.breakD) ? 1 - mergeC2((d - route.breakD) / 35) : 1
        );
    }
    return p;
  }
  // Preserve presentation gaps until everyone crosses, then slow the shared
  // race clock. Independent identical run-outs would pile the pack together.
  function displayedPoint(route, d) {
    return route.measuredMotion.pointAtDistance(courseTravelDistance(route, d));
  }
  function allFinishDistance() {
    return state.clockFinish;
  }
  function raceEndDistance() {
    return RaceMotion.endDistance(allFinishDistance());
  }
  function drawRoutes() {
    const layer = $('route-layer');
    layer.replaceChildren();
    state.routeNodes = [];
  }
  /* Cache only route-owned DOM nodes.
   * Neither the motion samples nor the SVG path/arrow geometry is changed. */
  const routeDOMCache = new WeakMap();
  function routeDOM(node) {
    let cache = routeDOMCache.get(node);
    if (!cache) {
      cache = { attributes: new Map(), styles: new Map() };
      routeDOMCache.set(node, cache);
    }
    return cache;
  }
  function routeAttribute(node, name, value) {
    const cache = routeDOM(node),
      text = String(value);
    if (cache.attributes.get(name) === text) return;
    node.setAttribute(name, text);
    cache.attributes.set(name, text);
  }
  function routeStyle(node, name, value) {
    const cache = routeDOM(node),
      text = String(value);
    if (cache.styles.get(name) === text) return;
    node.style[name] = text;
    cache.styles.set(name, text);
  }
  function updateRoutes() {
    if (!state.routeNodes?.length) return;
    const e = state.event,
      d = state.distance,
      endDistance = raceEndDistance(),
      tolerance = routeTracePrecision().tolerance;
    state.routeTraceTolerance = tolerance;
    state.routes.forEach((route, i) => {
      const nodes = state.routeNodes[i],
        chosen = state.selected === i,
        other = state.selected >= 0 && !chosen,
        merge =
          Number.isFinite(route.breakD) &&
          route.breakD > 0 &&
          d >= route.breakD - 25 &&
          d < route.breakD + 85;
      let ahead = chosen ? 65 : 14;
      if (merge) ahead = chosen ? 105 : Math.max(18, route.breakD + 95 - d);
      const end = Math.min(endDistance, d + ahead),
        start = Math.max(0, d - 6),
        sample = (t) => (route.motion ? route.motion.batonPosition(t) : displayedPoint(route, t));
      const cache = routeDOM(nodes.line),
        geometryKey = [start, end, tolerance, endDistance].join('/');
      // drawEvent paints paths before creating relay models. A newly attached
      // model must invalidate the body-route cache even at the same race distance.
      if (cache.geometryKey !== geometryKey || cache.sampleSource !== route.motion) {
        routeAttribute(
          nodes.line,
          'd',
          createRouteTrace(sample, start, end, tolerance, endDistance)
        );
        cache.geometryKey = geometryKey;
        cache.sampleSource = route.motion;
      }
      routeStyle(
        nodes.line,
        'strokeWidth',
        chosen ? 'var(--route-selected-width)' : 'var(--route-width)'
      );
      routeAttribute(nodes.line, 'opacity', other ? 0.12 : chosen ? 0.85 : 0.5);
      const ad = Math.min(end - 1, d + (merge ? 24 : 10));
      if (ad <= d || ad >= endDistance) {
        routeAttribute(nodes.arrow, 'display', 'none');
        return;
      }
      const a = sample(ad),
        before = sample(ad - 0.001),
        after = sample(ad + 0.001),
        angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / PI;
      routeAttribute(nodes.arrow, 'display', '');
      routeAttribute(nodes.arrow, 'transform', `translate(${a.x} ${a.y}) rotate(${angle})`);
      routeStyle(
        nodes.arrow,
        'strokeWidth',
        chosen ? 'var(--route-selected-width)' : 'var(--route-width)'
      );
      routeAttribute(nodes.arrow, 'opacity', other ? 0.1 : chosen ? 0.9 : 0.65);
    });
  }

  function isRelay() {
    return state.event.kind.startsWith('relay');
  }
  function teamName(index) {
    return isRelay()
      ? Locale.text('team', { letter: String.fromCharCode(65 + index) })
      : Locale.text('athlete', { number: index + 1 });
  }
  function bodyOffset(p, amount) {
    return { ...p, x: p.x - (p.ty ?? 0) * amount, y: p.y + (p.tx ?? 1) * amount };
  }
  const ICONS = {
    play: '<path d="M9 6l9 6-9 6Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 6v12M16 6v12" stroke-width="2.6"/>',
    group:
      '<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="7" r="2.5"/><path d="M2 19v-3a5 5 0 0 1 10 0v3m0 0v-3a5 5 0 0 1 10 0v3"/>',
  };
  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }
  function renderControls() {
    const e = state.event;
    syncEventPicker();
    $('timeline').max = e.distance;
    $('timeline').step = !Number.isInteger(e.distance) ? '.001' : e.distance >= 3000 ? '1' : '.1';
    $('group-start').hidden = !['5000', '10000'].includes(e.id);
    $('group-start').setAttribute('aria-pressed', String(state.grouped));
    $('speed').textContent = state.speed + '×';
    $('speed').setAttribute('aria-label', Locale.text('speed', { speed: state.speed }));
  }
  function freezeView() {
    if (state.view === 'follow') state.view = 'manual';
  }
  function clearSelection() {
    freezeView();
    state.selected = -1;
    drawRoutes();
    update();
  }
  function selectTeam(index) {
    if (state.selected === index) {
      clearSelection();
      return;
    }
    state.selected = index;
    drawRoutes();
    setView('follow');
    update();
  }
  function update() {
    const e = state.event,
      d = state.distance,
      progress = clamp(d, 0, e.distance),
      timeline = $('timeline');
    timeline.value = progress;
    timeline.style.setProperty('--progress', (progress / e.distance) * 100 + '%');
    // Spoken progress follows the slider's precision, including the exact mile.
    // Reuse the string between displayed steps instead of rewriting it at 60 Hz.
    const decimals = !Number.isInteger(e.distance) ? 3 : e.distance >= 3000 ? 0 : 1,
      spoken =
        Number(progress.toFixed(decimals)) + ' / ' + e.distance + ' ' + Locale.text('metres');
    if (timeline.getAttribute('aria-valuetext') !== spoken)
      timeline.setAttribute('aria-valuetext', spoken);
    const play = $('play'),
      mode = state.playing ? 'pause' : 'play';
    if (play.dataset.mode !== mode) {
      play.innerHTML = icon(mode);
      play.dataset.mode = mode;
      play.setAttribute('aria-label', Locale.text(state.playing ? 'pause' : 'play'));
      play.title = Locale.text(state.playing ? 'pause' : 'play');
    }
    svg.dataset.phase = state.phase;
    svg.dataset.distance = d.toFixed(2);
    updateRunners();
  }
  function project(p) {
    return state.portrait ? { x: -p.y, y: p.x } : p;
  }
  /* The original 0.035 px error
   * ceiling is retained. A bucket may only make world-space tolerance stricter. */
  function routeTracePrecision() {
    const viewport = camera.viewport(),
      box = camera.box(),
      scale = Math.min(viewport.width / box[2], viewport.height / box[3]);
    const requested = Math.min(0.0001, 0.035 / scale),
      bucket = 0.0001 * Math.pow(2, Math.floor(Math.log2(requested / 0.0001)));
    return { requested, tolerance: Math.min(requested, bucket) };
  }
  function cameraScale(w, h, requested = 1) {
    return clamp(requested, Math.max(0.1 / w, 0.05 / h), Math.min(1e5 / w, 1e6 / h));
  }
  function setBox(box, fromInput = false) {
    if (!fromInput) camera.cancel();
    let [x, y, w, h] = box;
    const scale = cameraScale(w, h);
    // Resize and wheel share one uniform limit. Clamping dimensions separately
    // would move the centre and stretch the view at extreme aspect ratios.
    x += (w - w * scale) / 2;
    y += (h - h * scale) / 2;
    w *= scale;
    h *= scale;
    const previous = state.box,
      viewport = camera.viewport(),
      sizeChanged =
        previous[2] !== w ||
        previous[3] !== h ||
        state.detailViewportWidth !== viewport.width ||
        state.detailViewportHeight !== viewport.height;
    state.box = [x, y, w, h];
    rubberViewport?.update(state.box, state.portrait, viewport);
    footballGrassViewport?.update(state.box, state.portrait, viewport);
    if (state.box.some((v, i) => v !== previous[i]))
      svg.setAttribute('viewBox', state.box.join(' '));
    svg.classList.toggle('zoomed', state.view !== 'full');
    if (sizeChanged) {
      updateDetail();
      // Playback already updates the routes every paint. Its fitter reads the
      // pending camera box, so either RAF callback order uses the newest precision.
      if (
        state.routeNodes &&
        !state.playing &&
        state.routeTraceTolerance > routeTracePrecision().requested
      )
        updateRoutes();
    }
  }

  function fitPoints(points, pad = 7) {
    const pp = points.map(project),
      xs = pp.map((p) => p.x),
      ys = pp.map((p) => p.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys),
      cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    let w = Math.max(16, maxX - minX + pad * 2),
      h = Math.max(16, maxY - minY + pad * 2);
    const viewport = camera.viewport(),
      aspect = viewport.width / viewport.height;
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    setBox([cx - w / 2, cy - h / 2, w, h]);
  }
  function fitField() {
    const points = [
        { x: 5, y: 17 },
        { x: 190, y: 116 },
      ].map(project),
      minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y)),
      maxY = Math.max(...points.map((p) => p.y)),
      rect = camera.viewport(),
      top = document.querySelector('.top-controls').getBoundingClientRect().bottom - rect.top + 10,
      bottom =
        rect.bottom - document.querySelector('.bottom-controls').getBoundingClientRect().top + 10,
      scale = Math.min(
        Math.max(1, rect.width - 28) / (maxX - minX),
        Math.max(1, rect.height - top - bottom) / (maxY - minY)
      ),
      w = rect.width / scale,
      h = rect.height / scale;
    setBox([
      (minX + maxX) / 2 - w / 2,
      (minY + maxY) / 2 - (top + (rect.height - top - bottom) / 2) / scale,
      w,
      h,
    ]);
  }
  function orient() {
    state.portrait = false;
    $('world').setAttribute('transform', state.portrait ? 'rotate(90)' : '');
    centerAllLabels();
    document.querySelectorAll('.point-label,.lane-label').forEach((t) => {
      const x = t.dataset.labelCenterX || 0,
        y = t.dataset.labelCenterY || 0;
      const angle = state.portrait ? -90 : 0;
      t.setAttribute('transform', angle ? `rotate(${angle} ${x} ${y})` : '');
    });
  }
  function setView(view) {
    state.view = view;
    if (view === 'follow') {
      const p = project(followPoint(state.selected < 0 ? 0 : state.selected)),
        [, , w, h] = camera.box();
      // Selection changes the centre, including any zoom awaiting its paint frame.
      setBox([p.x - w / 2, p.y - h / 2, w, h]);
    } else if (view === 'full') fitField();
  }
  function zoom(factor, anchor) {
    const [x, y, w, h] = camera.box(),
      scale = cameraScale(w, h, 1 / factor),
      nw = w * scale,
      nh = h * scale;
    // Following owns the centre; wheel input changes only the field of view.
    if (state.view === 'follow') camera.queue([x + (w - nw) / 2, y + (h - nh) / 2, nw, nh]);
    else {
      anchor = anchor || { x: x + w / 2, y: y + h / 2 };
      state.view = 'manual';
      camera.queue([anchor.x - (anchor.x - x) * scale, anchor.y - (anchor.y - y) * scale, nw, nh]);
    }
    if (drag) {
      const rect = camera.viewport();
      drag.scale = Math.max(nw / rect.width, nh / rect.height);
    }
  }
  function stop() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.lastTime = 0;
  }
  function togglePlay() {
    if (state.playing) {
      stop();
      update();
      return;
    }
    if (state.distance >= raceEndDistance()) state.distance = 0;
    state.phase = 'run';
    state.playing = true;
    state.lastTime = 0;
    update();
    state.raf = requestAnimationFrame(frame);
  }
  const CRUISE_SPEED = RaceMotion.cruiseSpeed; // Shared 10 m/s between the two ramps.
  function frame(now) {
    if (!state.playing) return;
    if (document.hidden) {
      state.lastTime = 0;
      state.raf = requestAnimationFrame(frame);
      return;
    }
    const dt = state.lastTime ? Math.max(0, (now - state.lastTime) / 1000) : 0;
    state.lastTime = now;
    const end = raceEndDistance();
    state.distance = RaceMotion.advance(state.distance, dt * state.speed, allFinishDistance());
    if (end - state.distance < 1e-9) {
      state.distance = end;
      stop();
    }
    update();
    if (state.playing) state.raf = requestAnimationFrame(frame);
  }
  function reset() {
    stop();
    freezeView();
    state.distance = 0;
    state.phase = 'marks';
    state.phaseElapsed = 0;
    update();
  }
  function refreshLocale() {
    document.documentElement.lang = Locale.language;
    document.querySelector('main').setAttribute('aria-label', Locale.text('app'));
    svg.setAttribute('aria-label', Locale.text('scene'));
    $('event-picker-list').setAttribute('aria-label', Locale.text('events'));
    $('group-start').setAttribute('aria-label', Locale.text('groups'));
    $('timeline').setAttribute('aria-label', Locale.text('progress'));
    $('speed').title = Locale.text('changeSpeed');
    $('language').textContent = Locale.language === 'en' ? '中' : 'EN';
    $('language').setAttribute('aria-label', Locale.text('changeLanguage'));
    $('language').title = Locale.text('changeLanguage');
    $('event-select')
      .querySelectorAll('option')
      .forEach((option, index) => {
        option.textContent = Locale.eventLabel(EVENTS[index]);
      });
    delete $('play').dataset.mode;
    renderControls();
    update();
    document.title = Locale.eventLabel(state.event) + ' · ' + Locale.text('app');
  }
  function changeEvent(id) {
    stop();
    freezeView();
    state.event = EVENTS.find((e) => e.id === id) || EVENTS[0];
    state.distance = 0;
    state.phase = 'marks';
    state.phaseElapsed = 0;
    state.grouped = false;
    state.selected = -1;
    createRoutes();
    drawEvent();
    orient();
    renderControls();
    update();
    document.title = Locale.eventLabel(state.event) + ' · ' + Locale.text('app');
  }
  function init() {
    const select = $('event-select');
    for (const e of EVENTS) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = Locale.eventLabel(e);
      select.append(o);
    }
    select.value = state.event.id;
    initEventPicker(select);
    $('group-start').innerHTML = icon('group');
    drawBase();
    createRoutes();
    drawEvent();
    orient();
    renderControls();
    setView('full');
    refreshLocale();
    update();
    $('language').addEventListener('click', () => {
      Locale.toggle();
      refreshLocale();
    });
    select.addEventListener('change', () => changeEvent(select.value));
    $('play').addEventListener('click', togglePlay);
    $('speed').addEventListener('click', () => {
      const values = [0.25, 0.5, 1, 2, 4, 8];
      state.speed = values[(values.indexOf(state.speed) + 1) % values.length];
      renderControls();
    });
    $('timeline').addEventListener('input', () => {
      stop();
      state.distance = Number($('timeline').value);
      state.phase = state.distance ? 'run' : 'marks';
      update();
    });
    $('group-start').addEventListener('click', () => {
      stop();
      freezeView();
      state.grouped = !state.grouped;
      state.distance = 0;
      state.phase = 'marks';
      state.selected = -1;
      createRoutes();
      drawEvent();
      orient();
      renderControls();
      update();
    });
    svg.addEventListener('keydown', (ev) => {
      // A relay leg can retain keyboard focus after handing over. Escape and
      // Space must still work when its token becomes a non-interactive image.
      const token = ev.target.closest?.('.athlete');
      if (!token || ev.defaultPrevented || ev.isComposing || ev.metaKey || ev.ctrlKey || ev.altKey)
        return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!ev.repeat) togglePlay();
        return;
      }
      if (ev.key === 'Enter' && token.getAttribute('role') === 'button') {
        ev.preventDefault();
        ev.stopPropagation();
        if (!ev.repeat) selectTeam(Number(token.dataset.runner));
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        clearSelection();
      }
    });
    svg.addEventListener('dblclick', (ev) => ev.preventDefault());
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || drag) return;
      const rect = camera.measure(),
        box = camera.box();
      drag = {
        pointerId: ev.pointerId,
        x: ev.clientX,
        y: ev.clientY,
        lastX: ev.clientX,
        lastY: ev.clientY,
        scale: Math.max(box[2] / rect.width, box[3] / rect.height),
        moved: false,
      };
      state.suppressClick = false;
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      if (ev.buttons === 0) {
        endDrag(ev);
        return;
      }
      const dx = ev.clientX - drag.x,
        dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      if (!drag.moved) {
        drag.moved = true;
        svg.setPointerCapture(ev.pointerId);
        // Manual movement takes over the latest follow position and clears its
        // visual selection together. Pointerdown alone is still just a click.
        if (state.view === 'follow' || state.selected >= 0) clearSelection();
        state.view = 'manual';
        svg.classList.add('dragging');
      }
      const box = camera.box(),
        moveX = ev.clientX - drag.lastX,
        moveY = ev.clientY - drag.lastY;
      drag.lastX = ev.clientX;
      drag.lastY = ev.clientY;
      camera.queue([box[0] - moveX * drag.scale, box[1] - moveY * drag.scale, box[2], box[3]]);
    });
    const endDrag = (ev) => {
      if (drag && ev.pointerId !== undefined && ev.pointerId !== drag.pointerId) return;
      if (drag) state.suppressClick = drag.moved;
      drag = null;
      svg.classList.remove('dragging');
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('lostpointercapture', endDrag);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    // A background tab must not return halfway around the track. Keep the play
    // state and camera, but resume the visible animation with a fresh clock.
    document.addEventListener('visibilitychange', () => {
      state.lastTime = 0;
      if (document.hidden) endDrag({});
    });
    svg.addEventListener(
      'click',
      (ev) => {
        if (state.suppressClick) {
          state.suppressClick = false;
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      },
      true
    );
    svg.addEventListener('click', (ev) => {
      if (ev.defaultPrevented || ev.detail > 1) return;
      const token = ev.target.closest?.('.athlete[role="button"]');
      if (token && token.getAttribute('display') !== 'none')
        selectTeam(Number(token.dataset.runner));
    });
    svg.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const anchor = camera.point(ev.clientX, ev.clientY),
          pixels =
            ev.deltaY *
            (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? camera.viewport().height : 1);
        zoom(Math.exp(-clamp(pixels, -600, 600) * 0.0018), anchor);
      },
      { passive: false }
    );
    document.addEventListener('keydown', (ev) => {
      const active = document.activeElement;
      if (
        ev.isComposing ||
        ev.defaultPrevented ||
        active?.closest('.event-picker') ||
        ev.metaKey ||
        ev.ctrlKey ||
        ev.altKey
      )
        return;
      if (ev.code === 'Space') {
        if (
          active?.isContentEditable ||
          ['SELECT', 'TEXTAREA'].includes(active?.tagName) ||
          (active?.tagName === 'INPUT' && active.type !== 'range')
        )
          return;
        ev.preventDefault();
        if (!ev.repeat) togglePlay();
        return;
      }
      if (['INPUT', 'SELECT', 'BUTTON'].includes(active?.tagName)) return;
      if (['ArrowRight', 'ArrowLeft'].includes(ev.key)) {
        ev.preventDefault();
        stop();
        const progress = clamp(state.distance, 0, state.event.distance),
          step = state.event.distance / 100;
        // The slider stops at the race distance while athletes finish their
        // run-out. Forward seeking at 100% must not rewind that remaining motion.
        if (ev.key === 'ArrowRight') {
          if (progress < state.event.distance)
            state.distance = Math.min(state.event.distance, progress + step);
        } else state.distance = Math.max(0, progress - step);
        state.phase = state.distance ? 'run' : 'marks';
        update();
      }
    });
    window.addEventListener('resize', () => {
      const previous = camera.viewport(),
        viewport = camera.measure();
      if (previous.width === viewport.width && previous.height === viewport.height) return;
      const oldPortrait = state.portrait,
        [x, y, w, h] = camera.box(),
        center = { x: x + w / 2, y: y + h / 2 },
        worldCenter = oldPortrait ? { x: center.y, y: -center.x } : center;
      orient();
      if (state.view === 'full') fitField();
      else {
        const c = project(worldCenter),
          aspect = viewport.width / viewport.height,
          nw = Math.sqrt(w * h * aspect),
          nh = nw / aspect;
        setBox([c.x - nw / 2, c.y - nh / 2, nw, nh]);
      }
      if (drag)
        drag.scale = Math.max(state.box[2] / viewport.width, state.box[3] / viewport.height);
    });
  }
  window.TrackMath = {
    geometry: G,
    rho,
    circuit,
    trackPoint,
    startS,
    normalRoute,
    waterfallRoute,
    waterfallBase,
    outerGroupRoute,
    scPoint,
    scLap: SC_LAP,
    scPre: SC_PRE,
    staggers: STAGGERS,
    breakReductionAtRadius,
    startStagger,
    clearLaneCenterRadius,
    steeple: SC,
  };
  window.TrackApp = {
    getState: () => ({
      event: state.event.id,
      distance: state.distance,
      playing: state.playing,
      speed: state.speed,
      phase: state.phase,
      selected: state.selected,
      grouped: state.grouped,
      view: state.view,
      runners: state.routes.map((r, i) =>
        isRelay()
          ? (state.runners[i].frame?.athletes[state.runners[i].frame.activeLeg - 1] ??
            displayedPoint(r, state.distance))
          : displayedPoint(r, state.distance)
      ),
      breaks: state.routes.map((r) => r.breakD),
    }),
    events: EVENTS,
  };
  window.render_game_to_text = () =>
    JSON.stringify({ coordinates: 'track metres, x right, y down', ...window.TrackApp.getState() });
  /*__BOOTSTRAP__*/
  init();
  if (document.fonts)
    document.fonts.ready.then(() => {
      labelMetricsCache.clear();
      centerAllLabels();
      orient();
    });
  /*__BOOTSTRAP_END__*/
})();
