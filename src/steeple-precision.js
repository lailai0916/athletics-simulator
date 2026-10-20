/* Geometry in metres. Source: WA Facilities Manual 2019, printed pp. 46–51,
 * Figs 2.2.4.1a/d; Competition and Technical Rules 2026, TR23, pp. 140–143.
 * This file adds no UI. The official facility coordinates are rounded in the
 * source; the render resolves those sub-millimetre discrepancies by constructing
 * tangent border arcs, rather than by stretching a sampled polyline.
 */
function createSteeplePrecision(G) {
  const PI = Math.PI,
    R = 36.8,
    kerbR = 36.5,
    smallR = 16,
    measuredSmallR = 16.2;
  const beta = (42.5525 * PI) / 180,
    alpha = PI / 2 - beta;
  const cxOffset = (kerbR - smallR) * Math.sin(beta);
  const cyOffset = (kerbR - smallR) * Math.cos(beta);
  const north = { x: G.left - cxOffset, y: G.cy - cyOffset };
  const south = { x: G.left - cxOffset, y: G.cy + cyOffset };
  const lap = 396.0849,
    pre = 3000 - 7 * lap;
  const waterStation = 259.648;
  const stations = [21.997, 101.214, 180.431, waterStation, 338.865];
  const lengths = [
    PI * R,
    G.straight,
    R * beta,
    measuredSmallR * alpha,
    30.202,
    measuredSmallR * alpha,
    R * beta,
    G.straight,
  ];
  const rawLength = lengths.reduce((a, b) => a + b, 0);
  lengths[7] += lap - rawLength;
  const starts = [0];
  for (const length of lengths) starts.push(starts.at(-1) + length);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smoother = (t) => {
    t = clamp(t, 0, 1);
    return t * t * t * (10 + t * (-15 + 6 * t));
  };
  const smootherDerivative = (t) => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (1 - t) * (1 - t));
  function result(x, y, dx, dy) {
    const speed = Math.hypot(dx, dy) || 1,
      tx = dx / speed,
      ty = dy / speed;
    return { x, y, tx, ty, nx: -ty, ny: tx };
  }
  function circle(cx, cy, r, angle, angleDerivative, radialDerivative = 0) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return result(
      cx + r * c,
      cy + r * s,
      radialDerivative * c - r * s * angleDerivative,
      radialDerivative * s + r * c * angleDerivative
    );
  }
  function point(distance) {
    const d = clamp(distance, 0, lap);
    if (d === lap) return result(G.right, G.cy + R, 1, 0);
    let i = 0;
    while (i < 7 && d >= starts[i + 1]) i++;
    const u = d - starts[i],
      n = lengths[i];
    if (i === 0) return circle(G.right, G.cy, R, PI / 2 - u / R, -1 / R);
    if (i === 1) return result(G.right - (G.straight * u) / n, G.cy - R, -1, 0);
    // 0.30 m kerb measurement changes to 0.20 m at a flush painted diversion.
    // Blend only the athlete's legal running trajectory through that 0.10 m
    // offset. Facility boundary arcs remain exact and unmodified below.
    if (i === 2) {
      const t = (u - (n - 2)) / 2,
        f = smoother(t),
        df = smootherDerivative(t) / 2;
      return circle(G.left, G.cy, R - 0.1 * f, -PI / 2 - u / R, -1 / R, -0.1 * df);
    }
    if (i === 3)
      return circle(
        north.x,
        north.y,
        measuredSmallR,
        -PI / 2 - beta - u / measuredSmallR,
        -1 / measuredSmallR
      );
    if (i === 4) return result(north.x - measuredSmallR, north.y + (2 * cyOffset * u) / n, 0, 1);
    if (i === 5)
      return circle(south.x, south.y, measuredSmallR, PI - u / measuredSmallR, -1 / measuredSmallR);
    if (i === 6) {
      const t = u / 2,
        f = smoother(t),
        df = smootherDerivative(t) / 2;
      return circle(G.left, G.cy, R - 0.1 * (1 - f), PI / 2 + beta - u / R, -1 / R, 0.1 * df);
    }
    return result(G.left + (G.straight * u) / n, G.cy + R, 1, 0);
  }
  const p = (cx, cy, r, a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const xy = (p) => `${p.x.toFixed(8)} ${p.y.toFixed(8)}`;
  const arc = (r, p, sweep = 0) => `A${r.toFixed(8)} ${r.toFixed(8)} 0 0 ${sweep} ${xy(p)}`;
  function border(offset = 0, onlyDiversion = false, reverse = false) {
    const big = kerbR + offset,
      small = smallR + offset;
    const pts = [
      p(G.left, G.cy, big, -PI / 2),
      p(G.left, G.cy, big, -PI / 2 - beta),
      p(north.x, north.y, small, -PI),
      p(south.x, south.y, small, PI),
      p(G.left, G.cy, big, PI / 2 + beta),
      p(G.left, G.cy, big, PI / 2),
    ];
    if (!reverse) {
      let d = `M${xy(pts[onlyDiversion ? 1 : 0])}`;
      if (!onlyDiversion) d += arc(big, pts[1]);
      d += arc(small, pts[2]) + `L${xy(pts[3])}` + arc(small, pts[4]);
      if (!onlyDiversion) d += arc(big, pts[5]);
      return d;
    }
    let d = `M${xy(pts[onlyDiversion ? 4 : 5])}`;
    if (!onlyDiversion) d += arc(big, pts[4], 1);
    d += arc(small, pts[3], 1) + `L${xy(pts[2])}` + arc(small, pts[1], 1);
    if (!onlyDiversion) d += arc(big, pts[0], 1);
    return d;
  }
  const innerX = north.x - smallR;
  const pit = {
    x: innerX - 3.66,
    y: G.cy + 3.8,
    width: 3.66,
    height: 3.66,
    beamDepth: 0.127,
    depth: 0.5,
    deepRun: 1.2,
  };
  // TR23 / Facilities Manual Fig 2.2.4.1c: 3.66 m includes the 127 mm bar;
  // the approximately 1.20 m flat bottom starts behind its downstream face.
  pit.waterY = pit.y + pit.beamDepth;
  pit.waterLength = pit.height - pit.beamDepth;
  pit.slopeRun = pit.waterLength - pit.deepRun;
  pit.slopeAngle = (Math.atan2(pit.depth, pit.slopeRun) * 180) / PI;
  pit.depthAt = (distance) =>
    distance <= pit.deepRun
      ? pit.depth
      : pit.depth * (1 - clamp((distance - pit.deepRun) / pit.slopeRun, 0, 1));
  const facilityPath = border(0) + border(3.8, false, true).replace(/^M/, 'L') + 'Z';
  const innerBorder = border(0, true);
  // As on the oval, the physical outside edge of a 50 mm boundary stripe
  // coincides with the surveyed border. Its centre lies 25 mm infield.
  const innerPaintBorder = border(-0.025, true);
  const contactShadow = { x: 0.025, y: 0.035 };
  const outerBorder = border(3.8, true);
  const barriers = stations.map((station, index) => ({
    index: index + 1,
    station,
    fixed: index === 3,
    water: index === 3,
    width: index === 0 ? 5 : index === 3 ? 3.66 : 3.94,
    p: index === 3 ? result(innerX - 0.2, pit.y, 0, 1) : point(station),
    // Ordinary hurdle projects 0.30 m inside the inner track edge.
    innerOffset: index === 3 ? -0.2 : -0.6,
    beamDepth: 0.127,
  }));
  function paintFacility(parent, element, elGroup) {
    const g = elGroup(parent, { id: 'water-jump-facility' });
    element('path', { d: facilityPath, fill: 'var(--red)' }, undefined, g);
    // A frame behind the exact-size clear pit does not reduce its 3.66 m size.
    element(
      'rect',
      {
        x: pit.x - 0.05,
        y: pit.y - 0.05,
        width: pit.width + 0.1,
        height: pit.height + 0.1,
        fill: '#fff4e3',
      },
      undefined,
      g
    );
    const defs = element('defs', {}, undefined, g);
    const depthGradient = element(
      'linearGradient',
      {
        id: 'steeple-water-depth',
        gradientUnits: 'userSpaceOnUse',
        x1: pit.x,
        y1: pit.waterY,
        x2: pit.x,
        y2: pit.y + pit.height,
      },
      undefined,
      defs
    );
    element('stop', { offset: 0, 'stop-color': '#82adba' }, undefined, depthGradient);
    element(
      'stop',
      { offset: pit.deepRun / pit.waterLength, 'stop-color': '#82adba' },
      undefined,
      depthGradient
    );
    element('stop', { offset: 1, 'stop-color': '#c7ddda' }, undefined, depthGradient);
    // Underpaint through the bar footprint so their shared rear edge cannot
    // expose an antialiased hairline. The opaque bar hides the upstream 127 mm.
    element(
      'rect',
      {
        'data-sc-water': 'surface',
        'data-water-start': pit.waterY,
        x: pit.x,
        y: pit.y,
        width: pit.width,
        height: pit.height,
        fill: 'url(#steeple-water-depth)',
      },
      undefined,
      g
    );
    element(
      'path',
      {
        'data-sc-boundary': 'inner',
        'data-physical-width': 0.05,
        d: innerPaintBorder,
        fill: 'none',
        stroke: '#fff4e3',
        'stroke-width': 0.05,
        'stroke-linecap': 'butt',
        'stroke-linejoin': 'round',
      },
      undefined,
      g
    );
    paintBarriers(g, element, elGroup, { fixedOnly: true, id: 'water-jump-fixed-barrier' });
    return g;
  }
  function paintBarriers(parent, element, elGroup, options = {}) {
    const group = elGroup(parent, { id: options.id || 'steeple-barriers' });
    for (const b of barriers.filter((b) =>
      options.fixedOnly ? b.fixed : options.movableOnly ? !b.fixed : true
    )) {
      const a = (Math.atan2(b.p.ty, b.p.tx) * 180) / PI;
      const g = elGroup(group, {
        'data-sc-obstacle': b.index,
        'data-sc-station': b.station,
        'data-sc-fixed': String(b.fixed),
        'data-sc-width': b.width,
        transform: `translate(${b.p.x} ${b.p.y}) rotate(${a})`,
      });
      const localShadow = {
        x: contactShadow.x * b.p.tx + contactShadow.y * b.p.ty,
        y: -contactShadow.x * b.p.ty + contactShadow.y * b.p.tx,
      };
      const shadow = elGroup(g, {
        class: 'steeple-hurdle-shadow',
        transform: `translate(${localShadow.x} ${localShadow.y})`,
        fill: '#294937',
        opacity: 0.13,
      });
      element(
        'rect',
        { x: 0, y: b.innerOffset, width: b.beamDepth, height: b.width },
        undefined,
        shadow
      );
      if (!b.water)
        for (const y of [b.innerOffset + 0.15, b.innerOffset + b.width - 0.23]) {
          element(
            'rect',
            { x: -0.6, y, width: 1.2, height: 0.08, rx: 0.02, opacity: 0.7 },
            undefined,
            shadow
          );
          element(
            'rect',
            {
              'data-sc-part': 'foot',
              x: -0.6,
              y,
              width: 1.2,
              height: 0.08,
              rx: 0.02,
              fill: '#31483a',
            },
            undefined,
            g
          );
          element(
            'rect',
            { x: -0.56, y: y + 0.017, width: 1.12, height: 0.046, rx: 0.012, fill: '#a5b09f' },
            undefined,
            g
          );
        }
      element(
        'rect',
        {
          'data-sc-part': 'beam',
          x: 0,
          y: b.innerOffset,
          width: b.beamDepth,
          height: b.width,
          fill: '#f8f4e8',
        },
        undefined,
        g
      );
      // White ends are 0.225 m and all inner white stripes are at least as
      // wide (TR23). An odd interior strip count keeps both ends symmetric.
      const whiteEnd = 0.225,
        interior = b.width - whiteEnd * 2;
      const blackCount = Math.max(1, Math.floor((interior / 0.225 + 1) / 2));
      const stripe = interior / (2 * blackCount - 1);
      for (let i = 0; i < blackCount; i++)
        element(
          'rect',
          {
            'data-sc-part': 'beam-stripe',
            x: 0,
            y: b.innerOffset + whiteEnd + 2 * i * stripe,
            width: b.beamDepth,
            height: stripe,
            fill: '#25372e',
          },
          undefined,
          g
        );
      element(
        'line',
        {
          'data-sc-part': 'beam-highlight',
          x1: 0.012,
          y1: b.innerOffset + 0.018,
          x2: 0.012,
          y2: b.innerOffset + b.width - 0.018,
          stroke: '#fffef5',
          'stroke-width': 0.008,
          opacity: 0.18,
          'stroke-linecap': 'butt',
        },
        undefined,
        g
      );
    }
    return group;
  }
  function paintFixedHurdleMarks(parent, element, elGroup) {
    const group = elGroup(parent, { 'data-marking': 'steeple-position' });
    for (const b of barriers.filter((b) => !b.water)) {
      const q = b.p;
      // The marking-plan symbols sit on the inside edge of lane 1 and the
      // outside edge of lane 3, within those lanes. Keep the full 125 mm square
      // on the red surface, clear of the 50 mm lane-3 boundary stripe.
      const half = 0.125 / 2,
        laneWidth = G.w || 1.22,
        outerClearR = kerbR + 3 * laneWidth - 0.05;
      const onBend = b.station < starts[1] || (b.station > starts[2] && b.station < starts[7]);
      // At a curved edge even a rotated square's two outer corners protrude
      // beyond its radial midpoint; solve that envelope rather than clipping it.
      const outerCentre = (onBend ? Math.sqrt(outerClearR ** 2 - half ** 2) : outerClearR) - half;
      for (const [side, radialOffset] of [
        ['inside-lane-1', kerbR + half - R],
        ['outside-lane-3', outerCentre - R],
      ]) {
        const x = q.x + q.nx * radialOffset,
          y = q.y + q.ny * radialOffset;
        element(
          'rect',
          {
            x: -half,
            y: -half,
            width: 0.125,
            height: 0.125,
            fill: '#a9cfe8',
            'data-sc-marking': b.index,
            'data-sc-marking-side': side,
            transform: `translate(${x} ${y}) rotate(${(Math.atan2(q.ty, q.tx) * 180) / PI})`,
          },
          undefined,
          group
        );
      }
    }
    return group;
  }
  function updateBarrierVisibility(group, distance) {
    if (!group) return;
    for (const node of group.querySelectorAll('[data-sc-obstacle]'))
      node.setAttribute(
        'visibility',
        node.getAttribute('data-sc-fixed') === 'true' || distance >= pre ? 'visible' : 'hidden'
      );
  }
  return {
    lap,
    pre,
    point,
    stations,
    starts,
    lengths,
    pit,
    barriers,
    facilityPath,
    innerBorder,
    outerBorder,
    cxOffset,
    cyOffset,
    beta,
    alpha,
    rawLength,
    innerPaintBorder,
    contactShadow,
    paintFacility,
    paintBarriers,
    paintFixedHurdleMarks,
    updateBarrierVisibility,
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createSteeplePrecision };
