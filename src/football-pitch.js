/* Orthographic football pitch, in metres.
 * FIFA recommends 105 x 68 m; IFAB Law 1 measures rectangular markings at
 * their outside edges. All selected paint is 0.12 m wide, matching the goals.
 * https://inside.fifa.com/innovation/stadium-guidelines/technical-guidelines/stadiums-guidelines/pitch-dimensions-and-surrounding-areas
 * https://www.theifab.com/laws/latest/the-field-of-play/
 * A 0.22 m spot diameter and 5.25 m mowing bands are illustration choices;
 * Law 1 does not prescribe their sizes. Removable corner flags are stowed
 * during athletics: the nearest pitch corner is within the 1 m safety strip.
 */
function createFootballPitch(G) {
  const P = {
    cx: (G.left + G.right) / 2,
    cy: G.cy,
    length: 105,
    width: 68,
    line: 0.12,
    goalWidth: 7.32,
    goalHeight: 2.44,
    goalDepth: 2,
    spotDiameter: 0.22,
    mowingBand: 5.25,
  };
  Object.assign(P, {
    left: P.cx - P.length / 2,
    right: P.cx + P.length / 2,
    top: P.cy - P.width / 2,
    bottom: P.cy + P.width / 2,
  });
  const h = P.line / 2,
    num = (n) => Number(n.toFixed(6));
  const boundary = { left: P.left + h, right: P.right - h, top: P.top + h, bottom: P.bottom - h };
  const boxes = [
    ['goal', 5.5],
    ['penalty', 16.5],
  ].flatMap(([name, depth]) =>
    ['left', 'right'].map((side) => {
      const sign = side === 'left' ? 1 : -1,
        back = side === 'left' ? boundary.left : boundary.right;
      const front = (side === 'left' ? P.left : P.right) + sign * depth,
        top = P.cy - P.goalWidth / 2 - depth,
        bottom = P.cy + P.goalWidth / 2 + depth;
      return {
        name,
        side,
        depth,
        back,
        front,
        top,
        bottom,
        paintFront: front - sign * h,
        paintTop: top + h,
        paintBottom: bottom - h,
      };
    })
  );
  const spots = [
    { name: 'centre', x: P.cx, y: P.cy },
    { name: 'left-penalty', x: P.left + 11, y: P.cy },
    { name: 'right-penalty', x: P.right - 11, y: P.cy },
  ];
  const circle = { cx: P.cx, cy: P.cy, r: 9.15 - h, outerRadius: 9.15 };
  const corners = [
    { name: 'top-left', x: P.left, y: P.top, sx: 1, sy: 1, sweep: 1 },
    { name: 'top-right', x: P.right, y: P.top, sx: -1, sy: 1, sweep: 0 },
    { name: 'bottom-left', x: P.left, y: P.bottom, sx: 1, sy: -1, sweep: 0 },
    { name: 'bottom-right', x: P.right, y: P.bottom, sx: -1, sy: -1, sweep: 1 },
  ].map((c) => ({ ...c, r: 1 - h, outerRadius: 1 }));
  const arcs = ['left', 'right'].map((side) => {
    const sign = side === 'left' ? 1 : -1,
      cx = side === 'left' ? P.left + 11 : P.right - 11;
    const area = boxes.find((b) => b.name === 'penalty' && b.side === side),
      joinX = area.paintFront;
    const dy = Math.sqrt(circle.r * circle.r - (joinX - cx) ** 2);
    const start = { x: joinX, y: P.cy - dy },
      end = { x: joinX, y: P.cy + dy };
    // Finish inside the existing 120 mm stripe, so its opaque paint joins the
    // arc without two separately antialiased edges meeting at the area edge.
    const path = `M${num(start.x)} ${num(start.y)}A${circle.r} ${circle.r} 0 0 ${sign === 1 ? 1 : 0} ${num(end.x)} ${num(end.y)}`;
    return {
      side,
      cx,
      cy: P.cy,
      r: circle.r,
      outerRadius: 9.15,
      start,
      end,
      joinX,
      path,
      clip:
        side === 'left'
          ? { x: P.left + 16.5, y: P.top, width: P.length - 16.5, height: P.width }
          : { x: P.left, y: P.top, width: P.length - 16.5, height: P.width },
    };
  });
  const B = boundary;
  // One opaque path keeps the boundary/halfway/box intersections single-painted.
  let d = `M${num(B.left)} ${num(B.top)}H${num(B.right)}V${num(B.bottom)}H${num(B.left)}Z`;
  d += `M${num(P.cx)} ${num(B.top)}V${num(B.bottom)}`;
  for (const b of boxes)
    d += `M${num(b.back)} ${num(b.paintTop)}H${num(b.paintFront)}V${num(b.paintBottom)}H${num(b.back)}`;
  d += `M${num(P.cx + circle.r)} ${num(P.cy)}a${circle.r} ${circle.r} 0 1 0 ${-2 * circle.r} 0a${circle.r} ${circle.r} 0 1 0 ${2 * circle.r} 0Z`;
  for (const arc of arcs) d += arc.path;
  for (const c of corners)
    d += `M${num(c.x + c.sx * c.r)} ${num(c.y)}A${c.r} ${c.r} 0 0 ${c.sweep} ${num(c.x)} ${num(c.y + c.sy * c.r)}`;
  const geometry = { boundary, boxes, spots, circle, corners, arcs, markingPath: d };
  function paint(parent, element, elGroup, defs) {
    defs.querySelector?.('#football-defs')?.remove();
    const assets = elGroup(defs, { id: 'football-defs' });
    const inside = element(
      'clipPath',
      { id: 'football-grass-clip', clipPathUnits: 'userSpaceOnUse' },
      undefined,
      assets
    );
    element('rect', { x: P.left, y: P.top, width: P.length, height: P.width }, undefined, inside);
    const fibres = element(
      'pattern',
      { id: 'football-grass-fibres', patternUnits: 'userSpaceOnUse', width: 0.52, height: 0.52 },
      undefined,
      assets
    );
    // Individual blades remain physical rather than becoming a screen-space noise.
    element(
      'path',
      {
        d: 'M.04 .08l.012 -.036M.23 .14l-.01 -.028M.41 .39l.008 -.035M.15 .46l-.008 -.025',
        fill: 'none',
        stroke: '#d7e2bf',
        'stroke-width': 0.007,
        opacity: 0.15,
      },
      undefined,
      fibres
    );
    element(
      'path',
      {
        d: 'M.09 .29l-.006 .025M.34 .05l.009 .026M.29 .42l-.008 .022',
        fill: 'none',
        stroke: '#244e38',
        'stroke-width': 0.006,
        opacity: 0.12,
      },
      undefined,
      fibres
    );
    const root = elGroup(parent, {
      id: 'football-pitch',
      'data-length': P.length,
      'data-width': P.width,
      'data-paint-width': P.line,
      'aria-hidden': 'true',
      'pointer-events': 'none',
    });
    element(
      'rect',
      {
        class: 'football-grass-detail',
        x: P.left,
        y: P.top,
        width: P.length,
        height: P.width,
        fill: 'url(#football-grass-fibres)',
        'clip-path': 'url(#football-grass-clip)',
      },
      undefined,
      root
    );
    const paintAttrs = {
      fill: 'none',
      stroke: '#fbfaf1',
      'stroke-width': P.line,
      'stroke-linecap': 'butt',
      'stroke-linejoin': 'miter',
    };
    element(
      'path',
      { ...paintAttrs, 'data-football-mark': 'field', 'data-penalty-arcs': 2, d },
      undefined,
      root
    );
    for (const spot of spots)
      element(
        'circle',
        {
          'data-football-mark': 'spot',
          'data-spot': spot.name,
          cx: spot.x,
          cy: spot.y,
          r: P.spotDiameter / 2,
          fill: '#fbfaf1',
        },
        undefined,
        root
      );
    return root;
  }
  return { P, geometry, paint };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createFootballPitch };
