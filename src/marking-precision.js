/* Integration fragment: replace the functions with identical names in track-app.js.
 * Also replace CSS rules listed at the end, remove duplicate painted starts from
 * drawEvent (start-layer retains starting blocks only), and remove drawBreak(layer)
 * from drawEvent (the permanent green line is already present).
 * Geometry unit is one metre. No ground paint uses a screen-pixel minimum.
 * Source: World Athletics Facilities Manual 2019, §§2.2.1.1 / 2.2.1.6,
 * pp. 26–27, 36–42; Figure 2.2.1.6a marking plan. 2026 TR 24 for relay lengths.
 */
const TRACK_PAINT_WIDTH = 0.05,
  TRACK_KERB_WIDTH = 0.12;
const TRACK_MARK_COLORS = {
  white: '#fff9ed',
  blue: '#65b6e5',
  yellow: '#f4d64a',
  green: '#83c47e',
};

// Figure 2.2.1.6a uses different crossing conventions for different marks:
// continuous white lane edges cover hurdle ticks/relay hooks, while the green
// breakline, physical cones and photo-finish alignment marks remain above them.
// Keep one copy of each physical stroke; never thicken an edge by repainting it.
function trackPaintLayer(id) {
  return $(id) || elGroup(svg, { id, 'aria-hidden': 'true', 'pointer-events': 'none' });
}

// Lane dimensions are measured to the OUTER edge of the white line. A 1.22m
// lane therefore has 1.17m clear red width and 0.05m of its outer white line.
function laneInnerRadius(lane) {
  return G.r + (lane - 1) * G.w;
}
function laneOuterRadius(lane) {
  return G.r + lane * G.w;
}
function clearLaneCenterRadius(lane) {
  return laneInnerRadius(lane) + (G.w - TRACK_PAINT_WIDTH) / 2;
}
function forwardPaintCenter(p) {
  return {
    ...p,
    x: p.x + ((p.tx ?? 1) * TRACK_PAINT_WIDTH) / 2,
    y: p.y + ((p.ty ?? 0) * TRACK_PAINT_WIDTH) / 2,
  };
}

// Use chord-length weighted tangents, including a quadratic endpoint estimate.
// A one-sided chord rotates the 25mm offset by half a sample interval, leaving
// tiny sideways shifts at each painted endpoint when magnified.
const paintCoordinate = (value) => Number(value.toFixed(8));
function markingCurveTangents(points) {
  const lengths = points
      .slice(1)
      .map((p, i) => Math.max(1e-12, Math.hypot(p.x - points[i].x, p.y - points[i].y))),
    secants = points.slice(1).map((p, i) => ({
      x: (p.x - points[i].x) / lengths[i],
      y: (p.y - points[i].y) / lengths[i],
    }));
  return points.map((p, i) => {
    if (p.markingTangent) return p.markingTangent;
    if (secants.length < 2) return secants[0] || { x: 0, y: 1 };
    if (i === 0) {
      const w = lengths[0] / (lengths[0] + lengths[1]);
      return {
        x: secants[0].x * (1 + w) - secants[1].x * w,
        y: secants[0].y * (1 + w) - secants[1].y * w,
      };
    }
    if (i === points.length - 1) {
      const j = secants.length - 1,
        w = lengths[j] / (lengths[j - 1] + lengths[j]);
      return {
        x: secants[j].x * (1 + w) - secants[j - 1].x * w,
        y: secants[j].y * (1 + w) - secants[j - 1].y * w,
      };
    }
    const before = lengths[i - 1],
      after = lengths[i],
      total = before + after;
    return {
      x: (secants[i - 1].x * after + secants[i].x * before) / total,
      y: (secants[i - 1].y * after + secants[i].y * before) / total,
    };
  });
}
function groundMarkingPath(points) {
  return points
    .map((p, i) => (i ? 'L' : 'M') + paintCoordinate(p.x) + ' ' + paintCoordinate(p.y))
    .join(' ');
}
function smoothMarkingPath(points) {
  if (points.length < 2) return groundMarkingPath(points);
  const segments = smoothMarkingSegments(points);
  return (
    'M' +
    segments[0].slice(0, 2).join(' ') +
    segments.map((segment) => 'C' + segment.slice(2).join(' ')).join('')
  );
}
// Share the rounded control points between paint and contact geometry. Contact
// with an analytical approximation can still overlap the final SVG by microns.
function smoothMarkingSegments(points) {
  const tangents = markingCurveTangents(points);
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      span = Math.hypot(b.x - a.x, b.y - a.y) / 3,
      u = tangents[i - 1],
      v = tangents[i];
    segments.push(
      [
        a.x,
        a.y,
        a.x + u.x * span,
        a.y + u.y * span,
        b.x - v.x * span,
        b.y - v.y * span,
        b.x,
        b.y,
      ].map(paintCoordinate)
    );
  }
  return segments;
}
// The measured rear edge is offset 25mm along its local forward normal. The
// centreline is emitted as tangent-continuous cubic segments, never a polygon.
function measurementEdgePath(points, width = TRACK_PAINT_WIDTH) {
  return smoothMarkingPath(measurementEdgePoints(points, width));
}
function measurementEdgePoints(points, width = TRACK_PAINT_WIDTH) {
  const tangents = markingCurveTangents(points);
  return points.map((p, i) => {
    const v = tangents[i],
      length = Math.hypot(v.x, v.y) || 1;
    return {
      x: p.x + ((v.y / length) * width) / 2,
      y: p.y - ((v.x / length) * width) / 2,
      ...(p.markingTangent ? { markingTangent: p.markingTangent } : {}),
    };
  });
}

// Wire-unwinding construction prescribed by the manual for the 800m breakline.
// The tangent length plus the remaining lane-1 arc must equal one straight.
// Table 2.2.1.6b 'reduction' is measured along the hypotenuse and is NOT the
// longitudinal running-line reduction. At rho(8)=45.24 the latter is .417111891m.
function breakReductionAtRadius(r) {
  if (r <= R1) return 0;
  let lo = 0,
    hi = 2;
  const residual = (q) => {
    const x = G.straight - q,
      dist = Math.hypot(x, r),
      a = Math.atan2(-x, r) + Math.acos(clamp(R1 / dist, -1, 1));
    return Math.sqrt(dist * dist - R1 * R1) - R1 * a - G.straight;
  };
  while (residual(hi) > 0) hi *= 2;
  for (let j = 0; j < 64; j++) {
    const q = (lo + hi) / 2;
    if (residual(q) > 0) lo = q;
    else hi = q;
  }
  return (lo + hi) / 2;
}

function chuteDashPattern(length) {
  const count = Math.max(2, Math.round((length + 0.5) / 1.5)),
    gap = length / (3 * count - 1);
  return 2 * gap + ' ' + gap;
}

function trackPaintClipPath() {
  const r = G.r + 8 * G.w,
    left = 22,
    right = 159,
    top = G.cy + G.r,
    bottom = G.cy + r;
  // Trace the true outside union once. The chute takes over at its exact circle
  // intersections; overlapping clip children can cancel in SVG rasterisation.
  const leftJoin = G.left - Math.sqrt(r * r - G.r * G.r),
    rightJoin = G.cy + Math.sqrt(r * r - (right - G.right) ** 2);
  return (
    `M${G.left} ${G.cy - r}H${G.right}A${r} ${r} 0 0 1 ${right} ${rightJoin}V${bottom}H${left}V${top}H${leftJoin}A${r} ${r} 0 0 1 ${G.left} ${G.cy - r}Z ` +
    oval(G.r)
  );
}

function drawBase() {
  const base = $('base-layer'),
    lines = trackPaintLayer('track-lines-layer');
  base.replaceChildren();
  lines.replaceChildren();
  trackPaintLayer('priority-markings-layer').replaceChildren();
  const chute = elGroup(base, { id: 'straight-chute' });
  element(
    'rect',
    { x: 22, y: G.cy + G.r, width: 137, height: 8 * G.w, fill: 'var(--red)' },
    undefined,
    chute
  );
  element('path', { d: oval(G.r + 8 * G.w), fill: 'var(--red)' }, undefined, base);
  const grain = element(
    'rect',
    {
      ...RUBBER_SOURCE_RECT,
      fill: 'url(#rubber-grain)',
      'clip-path': 'url(#track-band-clip)',
      class: 'surface-grain',
    },
    undefined,
    base
  );
  rubberViewport = createVisibleRubberViewport(grain);
  paintSolidGrassStripes(base, element, elGroup, G, FP.P);
  $('grass-clip-path').setAttribute('d', oval(G.r));
  $('track-band-path').setAttribute('d', trackPaintClipPath());
  const pitch = FP.paint(base, element, elGroup, svg.querySelector('defs'));
  const grassDetail = pitch.querySelector('.football-grass-detail');
  footballGrassViewport = grassDetail
    ? createVisibleRubberViewport(grassDetail, {
        x: FP.P.left,
        y: FP.P.top,
        width: FP.P.length,
        height: FP.P.width,
      })
    : null;
  paintFootballGoals(pitch, element, elGroup, FP.P);
  drawWaterJump(base);
  // 120mm kerb is within the official 50–250mm permitted width; its OUTSIDE
  // edge, rather than its centreline, is the 36.50m construction radius.
  element(
    'path',
    {
      'data-kerb-flat': true,
      'data-physical-width': TRACK_PAINT_WIDTH,
      d: SC_KERB.gapD,
      fill: 'none',
      stroke: TRACK_MARK_COLORS.white,
      'stroke-width': TRACK_PAINT_WIDTH,
    },
    undefined,
    lines
  );
  element(
    'path',
    {
      id: 'track-kerb',
      'data-lane-boundary': 0,
      'data-physical-width': TRACK_KERB_WIDTH,
      d: SC_KERB.normalD,
      fill: 'none',
      stroke: TRACK_MARK_COLORS.white,
      'stroke-width': TRACK_KERB_WIDTH,
    },
    undefined,
    lines
  );
  // The marking plan keeps both bends solid. On the start side it is the
  // horizontal sprint extension crossing the oval that becomes interrupted.
  for (let i = 1; i <= 8; i++) {
    const r = G.r + i * G.w - TRACK_PAINT_WIDTH / 2;
    element(
      'path',
      {
        'data-lane-boundary': i,
        'data-physical-width': TRACK_PAINT_WIDTH,
        d: oval(r),
        fill: 'none',
        stroke: TRACK_MARK_COLORS.white,
        'stroke-width': TRACK_PAINT_WIDTH,
      },
      undefined,
      lines
    );
  }
  const straight = elGroup(lines, { id: 'straight-lane-lines' }),
    outerRadius = G.r + 8 * G.w - TRACK_PAINT_WIDTH / 2,
    start110 = G.right - 110;
  for (let i = 0; i <= 8; i++) {
    const y = G.cy + G.r + i * G.w - TRACK_PAINT_WIDTH / 2;
    // Intersect the horizontal paint centreline with the outer oval paint
    // centreline. The common crossing is underneath that continuous white edge;
    // only the part inside the oval uses dashes. Outside it stays solid.
    const join = G.left - Math.sqrt(Math.max(0, outerRadius * outerRadius - (y - G.cy) ** 2));
    const attrs = {
      'data-physical-width': TRACK_PAINT_WIDTH,
      fill: 'none',
      stroke: TRACK_MARK_COLORS.white,
      'stroke-width': TRACK_PAINT_WIDTH,
      'stroke-linecap': 'butt',
    };
    // Match the uploaded colour marking plan: internal sprint lane lines start
    // at the 110m start and end at the finish. The apron/run-out retain their
    // surface and outside borders, without a second set of horizontal lanes.
    // The complete oval already paints the common straight and both bends.
    const from = i === 0 || i === 8 ? 22 : start110;
    const solid =
      i === 8
        ? `M22 ${y}H${G.left}M${G.right} ${y}H159`
        : join > from
          ? `M${from} ${y}H${join}`
          : '';
    if (solid)
      element('path', { ...attrs, 'data-straight-boundary': i, d: solid }, undefined, straight);
    if (i < 8) {
      const dashStart = Math.max(join, start110);
      element(
        'path',
        {
          ...attrs,
          'data-straight-overlap': i,
          d: `M${dashStart} ${y}H${G.left}`,
          'stroke-dasharray': chuteDashPattern(G.left - dashStart),
        },
        undefined,
        straight
      );
    }
  }
  for (let lane = 1; lane <= 8; lane++)
    element(
      'text',
      {
        x: G.right - 1.05,
        y: G.cy + clearLaneCenterRadius(lane),
        class: 'lane-label',
        'data-glyph-height': 0.6,
      },
      String(lane),
      base
    );
  drawFixedMarkings();
}

function markingWaterfallBase(event) {
  return typeof waterfallBase === 'function'
    ? waterfallBase(event)
    : mod(event.base ?? event.distance, 400);
}
function startCurvePoints(event, outer = false) {
  const route = outer ? outerGroupRoute : waterfallRoute,
    from = outer ? rho(5) : R1,
    to = G.r + 8 * G.w,
    inner = G.r + (outer ? 4 * G.w : 0);
  // An equal-distance start is perpendicular to the shortest permitted forward
  // route at every point. Use that exact direction, including the involute's
  // radial origin: a finite-difference secant cannot recover its cusp tangent.
  const sample = (r) => {
      const rt = route(event, 1, r),
        p = rt.start,
        flow = rt.position(0),
        length = Math.hypot(flow.tx, flow.ty),
        centre = markingWaterfallBase(event) === 200 ? G.left : G.right,
        u =
          Number.isFinite(length) && length > 0
            ? { x: -flow.ty / length, y: flow.tx / length }
            : { x: (p.x - centre) / r, y: (p.y - G.cy) / r };
      return { x: p.x, y: p.y, markingTangent: u };
    },
    a = sample(from),
    u = a.markingTangent;
  const pts = [{ x: a.x + u.x * (inner - from), y: a.y + u.y * (inner - from), markingTangent: u }];
  // Quadratic spacing resolves the rapidly turning inner cusp without adding
  // more SVG segments or changing the measured running line itself.
  for (let i = 0; i <= 256; i++) pts.push(sample(mix(from, to, (i / 256) ** 2)));
  return pts;
}
function startCurve(event, outer = false) {
  return measurementEdgePath(startCurvePoints(event, outer));
}

function radialMark(parent, p, lane, from, length, color, width = TRACK_PAINT_WIDTH) {
  const a = laneInnerRadius(lane) - rho(lane) + from,
    nx = p.nx ?? -(p.ty || 0),
    ny = p.ny ?? (p.tx || 1);
  return element(
    'line',
    {
      x1: p.x + nx * a,
      y1: p.y + ny * a,
      x2: p.x + nx * (a + length),
      y2: p.y + ny * (a + length),
      stroke: color,
      'stroke-width': width,
      'stroke-linecap': 'butt',
    },
    undefined,
    parent
  );
}

function relayMark(parent, p, lane, length, color, enter) {
  const a = laneInnerRadius(lane) - rho(lane),
    nx = p.nx ?? -p.ty,
    ny = p.ny ?? p.tx,
    hook = 0.15 / Math.SQRT2,
    point = (off, along = 0) => ({
      x: p.x + nx * off + p.tx * along,
      y: p.y + ny * off + p.ty * along,
    }),
    dir = enter ? 1 : -1;
  // TR24.3 measures BOTH boundaries at the edge nearest the race start in the
  // running direction. The painted bar therefore extends 50mm forward from
  // each measured boundary; identical +25mm centre offsets retain zone length.
  const lineCenter = TRACK_PAINT_WIDTH / 2;
  return element(
    'path',
    {
      d: groundMarkingPath([
        point(a, lineCenter),
        point(a + length, lineCenter),
        point(a + length - hook, lineCenter + dir * hook),
      ]),
      fill: 'none',
      stroke: color,
      'stroke-width': TRACK_PAINT_WIDTH,
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'miter',
    },
    undefined,
    parent
  );
}

// Figure 2.2.1.6a keeps the unlaned relay's outer-lane ZE bars parallel
// to the finish, 10 m beyond it. They are not radial extensions of the
// lane-1 10 m arc. Clip those guides at the actual transverse planes;
// lane 1 retains its measured hooked exchange boundaries on the bend.
function paintCommonRelayZone(parent, color = '#b4d2df') {
  const clipId = 'common-relay-zone-paint-clip',
    defs = element('defs', {}, undefined, parent),
    clip = element('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' }, undefined, defs);
  element(
    'rect',
    { x: G.right - 10, y: G.cy + G.r - 1, width: 20, height: 8 * G.w + 2 },
    undefined,
    clip
  );
  zone(parent, 1, { position: (d) => trackPoint(d, 1) }, -10, 10, color);
  const outer = elGroup(parent, {
    'clip-path': `url(#${clipId})`,
    'data-common-relay-boundaries': 'finish-minus-10 finish-plus-10',
  });
  // Continue beyond the clipping plane, so the oblique stroke's butt cap
  // cannot produce a triangular unpainted notch at the transverse ZE edge.
  for (let lane = 2; lane <= 8; lane++)
    zone(outer, lane, { position: (d) => trackPoint(d, lane) }, -11, 12, color);
  return parent;
}

function markLane(parent, p, lane, opts = {}) {
  const a = laneInnerRadius(lane) - rho(lane),
    b = laneOuterRadius(lane) - TRACK_PAINT_WIDTH - rho(lane),
    nx = p.nx ?? -(p.ty || 0),
    ny = p.ny ?? (p.tx || 1),
    q = opts.measurementEdge ? forwardPaintCenter(p) : p;
  const line = element(
    'line',
    {
      x1: q.x + nx * a,
      y1: q.y + ny * a,
      x2: q.x + nx * b,
      y2: q.y + ny * b,
      stroke: opts.color || TRACK_MARK_COLORS.white,
      'stroke-width': opts.width ?? TRACK_PAINT_WIDTH,
      'stroke-linecap': 'butt',
      ...(opts.dash ? { 'stroke-dasharray': '.15 .15' } : {}),
    },
    undefined,
    parent
  );
  if (opts.title) element('title', {}, opts.title, line);
  return line;
}

function drawBreak(parent, markers = true, side = 'right') {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const r = mix(G.r + G.w, G.r + 8 * G.w, i / 256),
      q = breakReductionAtRadius(r);
    pts.push(side === 'right' ? { x: G.right - q, y: G.cy - r } : { x: G.left + q, y: G.cy + r });
  }
  // The line's rear edge is the measured boundary: offset the centre by 25mm.
  element(
    'path',
    {
      'data-break-paint': true,
      d: measurementEdgePath(pts),
      fill: 'none',
      stroke: TRACK_MARK_COLORS.green,
      'stroke-width': TRACK_PAINT_WIDTH,
      'stroke-linecap': 'butt',
    },
    undefined,
    parent
  );
  if (markers)
    for (let lane = 2; lane <= 9; lane++) {
      const r = G.r + (lane - 1) * G.w - TRACK_PAINT_WIDTH / 2,
        q = breakReductionAtRadius(r),
        p =
          side === 'right'
            ? { x: G.right - q + 0.055, y: G.cy - r }
            : { x: G.left + q - 0.055, y: G.cy + r };
      // The rule specifies a 50×50mm footprint, <=150mm height. A top view should
      // therefore never draw the previous 640mm-wide triangular marker.
      element(
        'rect',
        {
          x: p.x - 0.025,
          y: p.y - 0.025,
          width: 0.05,
          height: 0.05,
          fill: '#f3d343',
          'data-break-cone': true,
        },
        undefined,
        parent
      );
    }
}

function drawFixedMarkings() {
  const layer = $('fixed-markings-layer');
  layer.replaceChildren();
  layer.setAttribute('clip-path', 'url(#track-band-clip)');
  const priority = trackPaintLayer('priority-markings-layer');
  priority.replaceChildren();
  priority.setAttribute('clip-path', 'url(#track-band-clip)');
  const { white, blue, yellow, green } = TRACK_MARK_COLORS,
    event = (id) => EVENTS.find((e) => e.id === id);
  const finish = elGroup(layer, { 'data-marking': 'finish' });
  element(
    'line',
    {
      x1: G.right + 0.025,
      y1: G.cy + G.r,
      x2: G.right + 0.025,
      y2: G.cy + G.r + 8 * G.w,
      stroke: white,
      'stroke-width': 0.05,
      'stroke-linecap': 'butt',
    },
    undefined,
    finish
  );
  // Photo-finish alignment marks: confined to the finish/lane intersections.
  const photo = elGroup(priority, { id: 'photo-finish-marks', 'data-marking': 'photo-finish' });
  for (let lane = 1; lane <= 8; lane++)
    element(
      'rect',
      {
        x: G.right,
        y: G.cy + laneOuterRadius(lane) - 0.05,
        width: 0.02,
        height: 0.05,
        fill: '#26352c',
        'data-photo-finish': lane,
      },
      undefined,
      photo
    );
  // Keep one physical start family for every equivalent event. In particular,
  //1000/3000 share5000,2000/4x1500 share10000, and4x800 shares800.
  // Prefer the established canonical IDs so existing marks retain their owner.
  const startKey = (e) =>
    ['waterfall', 'relay1500'].includes(e.kind)
      ? 'waterfall:' + markingWaterfallBase(e)
      : e.kind === 'steeple'
        ? 'steeple'
        : e.kind === 'straight'
          ? 'straight:' + e.distance
          : ['break', 'relay800'].includes(e.kind)
            ? 'break'
            : e.kind === 'relay400'
              ? 'relay400'
              : 'lanes:' + (e.laneDistance ?? (e.stagger === 200 ? 200 : 400));
  const preferred = [
      '100',
      '110h',
      '200',
      '300',
      '400',
      '800',
      '4x200',
      '4x400',
      '1500',
      'mile',
      '5000',
      '10000',
      '3000sc',
    ]
      .map(event)
      .filter(Boolean),
    families = new Map();
  for (const e of [...preferred, ...EVENTS])
    if (!families.has(startKey(e))) families.set(startKey(e), e);
  for (const [key, e] of families) {
    const id = e.id,
      g = elGroup(layer, {
        'data-marking': 'start',
        'data-event': id,
        'data-shared-events': EVENTS.filter((candidate) => startKey(candidate) === key)
          .map((candidate) => candidate.id)
          .join(' '),
      });
    if (['waterfall', 'relay1500', 'steeple'].includes(e.kind)) {
      // The radial300mm continuation already belongs to the200m lane1 stripe
      // (5000m) or the finish stripe (10000m). Keep the complete measured curve
      // in startCurve(), but render each shared area only once.
      const sharedContinuation = e.kind !== 'steeple' && [0, 200].includes(markingWaterfallBase(e)),
        d = sharedContinuation ? measurementEdgePath(startCurvePoints(e).slice(1)) : startCurve(e);
      element(
        'path',
        { d, fill: 'none', stroke: white, 'stroke-width': 0.05, 'stroke-linecap': 'butt' },
        undefined,
        g
      );
    } else
      for (let lane = 1; lane <= 8; lane++) {
        const p = normalRoute(e, lane).start;
        // The official84.39m construction straight rounds a lap by1.22mm. The
        // four-bend relay's lane1 start therefore shares the existing finish paint
        // rather than adding a second50mm stripe offset by2.44mm; route distances
        // retain their unrounded measured positions.
        const sharedFinish =
          lane === 1 &&
          (id === '4x200' ||
            (Math.hypot(p.x - G.right, p.y - G.cy - rho(1)) < 1e-8 &&
              Math.abs((p.tx ?? 1) - 1) < 1e-8 &&
              Math.abs(p.ty ?? 0) < 1e-8));
        if (sharedFinish) g.setAttribute('data-shared-finish', 'true');
        if (!sharedFinish) markLane(g, p, lane, { color: white, measurementEdge: true });
        // Lane 1 shares the white finish stripe; do not repaint that stripe with two
        // contradictory blue/green insets. Distinct staggered starts use the inset.
        if (lane > 1 && ['800', '4x400', '4x200'].includes(id))
          radialMark(
            g,
            forwardPaintCenter(p),
            lane,
            (G.w - 0.05 - 0.4) / 2,
            0.4,
            id === '800' ? green : blue
          );
      }
  }
  for (const id of ['5000', '10000'])
    element(
      'path',
      {
        'data-marking': 'group-start',
        'data-event': id,
        d: startCurve(event(id), true),
        fill: 'none',
        stroke: white,
        'stroke-width': 0.05,
        'stroke-linecap': 'butt',
      },
      undefined,
      layer
    );
  drawBreak(elGroup(priority, { 'data-marking': 'break-line' }), true);
  const relayPaths = [],
    paintRelay = (parent, p, lane, length, color, enter) => {
      const mark = relayMark(parent, p, lane, length, color, enter),
        coordinates = mark
          .getAttribute('d')
          .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
          .map(Number),
        owner = parent.getAttribute('data-event');
      // A lap from the rounded 84.39/36.80 m survey exceeds 400 m by 1.2193 mm.
      // Shared relay stations must not become two 51–52.5 mm painted stripes.
      // Compare matching physical mark types in the same lane only, bounded by
      // two laps' survey roundoff (including the outer radial end of the hook).
      const duplicate = relayPaths.find(
        (prior) =>
          prior.lane === lane &&
          prior.enter === enter &&
          prior.length === length &&
          prior.color === color &&
          coordinates.every(
            (value, i) =>
              i % 2 ||
              Math.hypot(
                value - prior.coordinates[i],
                coordinates[i + 1] - prior.coordinates[i + 1]
              ) <= 0.0026
          )
      );
      if (duplicate) {
        mark.remove();
        duplicate.owners.add(owner);
        duplicate.mark.setAttribute('data-shared-events', [...duplicate.owners].join(' '));
        return duplicate.mark;
      }
      mark.setAttribute('data-relay-lane', lane);
      mark.setAttribute('data-zone-edge', enter ? 'enter' : 'exit');
      mark.setAttribute('data-shared-events', owner);
      relayPaths.push({ mark, coordinates, lane, enter, length, color, owners: new Set([owner]) });
      return mark;
    };
  for (const [id, unit] of [
    ['4x100', 100],
    ['4x200', 200],
  ]) {
    const e = event(id);
    if (!e) continue;
    const group = elGroup(layer, { 'data-marking': 'relay-zone', 'data-event': id });
    for (let lane = 1; lane <= 8; lane++) {
      const rt = normalRoute(e, lane);
      for (let leg = 1; leg <= 3; leg++) {
        paintRelay(group, rt.position(leg * unit - 20), lane, 1.1, yellow, true);
        paintRelay(group, rt.position(leg * unit + 10), lane, 1.1, yellow, false);
        if (id === '4x100' && leg !== 2)
          radialMark(
            group,
            forwardPaintCenter(rt.position(leg * unit)),
            lane,
            (G.w - 0.05 - 0.4) / 2,
            0.4,
            white
          );
      }
    }
  }
  const relay400 = elGroup(layer, { 'data-marking': 'relay-zone', 'data-event': '4x400' });
  for (let lane = 1; lane <= 8; lane++) {
    const rt = normalRoute(event('4x400'), lane),
      at = (offset) => (lane === 1 ? trackPoint(C1 + offset, 1) : rt.position(400 + offset));
    // The finish is the lane-1 scratch line. Use its surveyed coordinate,
    // avoiding a second 1.22 mm construction-rounding offset after a lap.
    paintRelay(relay400, at(-10), lane, 0.8, blue, true);
    paintRelay(relay400, at(10), lane, 0.8, blue, false);
  }
  const common = elGroup(layer, {
    'data-marking': 'relay-zone',
    'data-event': '4x400-common',
    'data-shared-events': '4x400 4x800',
  });
  for (let lane = 2; lane <= 8; lane++)
    radialMark(
      common,
      { x: G.right - 10 + 0.025, y: G.cy + rho(lane), tx: 1, ty: 0 },
      lane,
      (G.w - 0.05 - 0.8) / 2,
      0.8,
      blue
    );
  for (let lane = 2; lane <= 5; lane++)
    radialMark(
      common,
      { x: G.right + 10 + 0.025, y: G.cy + rho(lane), tx: 1, ty: 0 },
      lane,
      (G.w - 0.05 - 0.8) / 2,
      0.8,
      blue
    );
  for (const [id, unit, legs] of [['4x1500', 1500, [1, 2, 3]]]) {
    const longRelay = event(id);
    if (!longRelay) continue;
    const group = elGroup(layer, { 'data-marking': 'relay-zone', 'data-event': id }),
      rt = normalRoute(longRelay, 1);
    // These demonstration stations use the official20m zone length and blue
    // common-zone bars. Each boundary is normal to the inner measured route;
    // a relay-zone boundary is not an equal-distance waterfall starting curve.
    for (const leg of legs)
      for (const [edge, offset] of [
        ['enter', -10],
        ['exit', 10],
      ]) {
        const distance = leg * unit + offset,
          p = rt.position(distance),
          nx = -(p.ty ?? 0),
          ny = p.tx ?? 1,
          boundary = elGroup(group, {
            'data-relay-leg': leg,
            'data-zone-edge': edge,
            'data-zone-distance': distance,
          });
        for (let lane = 1; lane <= 8; lane++) {
          const delta = rho(lane) - R1,
            q = { ...p, x: p.x + nx * delta, y: p.y + ny * delta };
          radialMark(boundary, forwardPaintCenter(q), lane, (G.w - 0.05 - 0.8) / 2, 0.8, blue);
        }
      }
  }
  for (const id of ['100h', '110h', '400h']) {
    const e = event(id),
      g = elGroup(layer, { 'data-marking': 'hurdle-position', 'data-event': id }),
      color = id === '100h' ? yellow : id === '110h' ? blue : green;
    for (let lane = 1; lane <= 8; lane++) {
      const rt = normalRoute(e, lane);
      for (let i = 0; i < 10; i++) {
        // Facilities Manual 2.2.3.1 measures to the edge nearest the athlete,
        // not the centre of the 50 mm tick. Keep that rear edge on the
        // official station and on the hurdle's approaching vertical face.
        const p = forwardPaintCenter(rt.position(e.hurdles[0] + i * e.hurdles[1]));
        radialMark(g, p, lane, 0, 0.1, color);
        radialMark(g, p, lane, G.w - 0.05 - 0.1, 0.1, color);
      }
    }
  }
  SC.paintFixedHurdleMarks(layer, element, elGroup);
}

// Replacement updateDetail: all ground paint remains fixed at its physical size.
// Body outlines retain their metre-based size so zoom cannot change start contact.
function updateDetail() {
  const viewport = camera.viewport(),
    scale = Math.min(viewport.width / state.box[2], viewport.height / state.box[3]);
  state.detailViewportWidth = viewport.width;
  state.detailViewportHeight = viewport.height;
  if (state.detailScale === scale) return;
  state.detailScale = scale;
  const levels = state.detailLevels || (state.detailLevels = {});
  for (const [name, enabled] of [
    ['marker-detail', scale > 10],
    ['detail-labels', scale > 20],
    ['fine-detail', scale > 28],
    ['rubber-detail', scale > 180],
  ])
    if (levels[name] !== enabled) {
      svg.classList.toggle(name, enabled);
      levels[name] = enabled;
    }
  const widths = {
      'route-width': Math.max(0.035, 0.55 / scale),
      'route-selected-width': Math.max(0.065, 0.9 / scale),
      'selection-width': Math.min(0.035, Math.max(0.025, 0.6 / scale)),
      'surface-detail-opacity': clamp((scale - 28) / 28, 0, 1),
      'label-opacity': clamp((scale - 20) / 12, 0, 1),
      'marker-detail-opacity': clamp((scale - 10) / 8, 0, 1),
      'rubber-detail-opacity': clamp((scale - 180) / 300, 0, 1),
    },
    previous = state.detailWidths || (state.detailWidths = {});
  for (const [name, value] of Object.entries(widths))
    if (previous[name] !== value) {
      svg.style.setProperty('--' + name, value);
      previous[name] = value;
    }
}

/* Required companion CSS changes:
[data-lane-boundary],[data-straight-boundary],[data-lane-return]{stroke-width:.05;stroke-linecap:butt;stroke-linejoin:miter}
[data-lane-boundary="0"]{stroke-width:.12}
#fixed-markings-layer path,#fixed-markings-layer line{stroke-width:.05;stroke-linejoin:miter;stroke-linecap:butt}
// REMOVE #start-layer>line,#start-layer>path rule. It contains equipment now.

Required normalRoute change:
  q=breakReductionAtRadius(r)  // replaces STAGGERS[800][lane-1]-STAGGERS[200][lane-1]
Required outerGroupRoute change:
  q=breakReductionAtRadius(ref) // same replacement for lane 5 reference radius
Required startStagger change (must match the same exact break geometry):
  const d=rho(lane)-R1;
  if(event.stagger===200)return PI*d;
  if(event.stagger===400)return 2*PI*d;
  if(event.stagger===800)return PI*d+breakReductionAtRadius(rho(lane));
  if(event.stagger==='relay400')return 3*PI*d+breakReductionAtRadius(rho(lane));
  return 0;
Required centerLane change:
  const off=(clearLaneCenterRadius(lane)-rho(lane))*amount;

Grouped drawEvent precision changes:
 - Existing permanent lane5 white boundary is the demarcation; remove the .17m
   dashed overlay. Temporary cones have .05×.05m footprint at <=4m intervals.
 - Group breakpoint is a .05×.05m green square centred on lane5 inner edge.
 - Remove the current markLane(...,lane5,{width:.32}) breakpoint exaggeration.

Markings reconciliation:
 - 50mm standard ground lines: manual p36 and marking plan table.
 - Kerb 50–250mm, chosen120mm; manual p26.
 - Lane width1.22m includes outside50mm paint; manual p27.
 - Clear start line1.17m; marking-plan white table.
 - Relay4×100 bar1.10m, 4×400 bar0.80m, 45° hook0.15m; marking-plan table.
 - 4×100 zones[-20,+10]m and4×400 zones[-10,+10]m; TR24.
 - Hurdle ticks50×100mm; SC squares125×125mm; marking-plan hurdle table.
 - Break cones50×50mm top footprint, height<=150mm; manual p39.
 - Numbers actual painted glyph height>=0.50m; manual p37. Root handles glyph BBox.
 - Photo-finish black marks project <=0.02m forward from leading finish edge,
   never before it: 2026 TR19.17 and manual p38. The physical width here is20mm.
 */
