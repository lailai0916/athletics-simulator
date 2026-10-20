/* Football goals in orthographic plan; all coordinates and widths are metres.
 * IFAB Law 1.10: 7.32 m between the inside faces of the posts; white posts and
 * crossbar with equal width/depth, each no more than 0.12 m. Source:
 * https://www.theifab.com/laws/latest/the-field-of-play/
 * The selected 2.00 m net depth, 0.12 m square mesh, 0.004 m twine and small
 * rear support tubes are equipment choices, not dimensions mandated by Law 1.
 * Goal depth is measured from the rear outside edge of the painted goal line.
 * Height (2.44 m under the crossbar) has no foreshortened footprint in this plan.
 */
function paintFootballGoals(parent, element, elGroup, P) {
  const line = P.line,
    half = P.goalWidth / 2,
    postRadius = line / 2,
    depth = P.goalDepth;
  if (
    ![P.left, P.right, P.cy, line, P.goalWidth, depth].every(Number.isFinite) ||
    line <= 0 ||
    line > 0.12 + 1e-10 ||
    depth <= 0
  )
    throw new Error('Invalid football goal dimensions');
  const root = elGroup(parent, {
      class: 'football-goals',
      'aria-hidden': 'true',
      'pointer-events': 'none',
    }),
    goals = [];
  const clean = (n) => Number(n.toFixed(6));
  const path = (points) =>
    points.map((p, i) => (i ? 'L' : 'M') + clean(p[0]) + ' ' + clean(p[1])).join(' ');
  const white = '#fbfaf1',
    rope = '#edf0e4',
    support = '#dce4d7';
  for (const side of ['left', 'right']) {
    const direction = side === 'left' ? -1 : 1,
      rearLine = side === 'left' ? P.left : P.right;
    const front = rearLine - direction * postRadius,
      back = rearLine + direction * depth;
    const top = P.cy - half,
      bottom = P.cy + half,
      postTop = top - postRadius,
      postBottom = bottom + postRadius;
    const x0 = Math.min(back, rearLine),
      x1 = Math.max(back, rearLine),
      g = elGroup(root, {
        'data-goal': side,
        'data-goal-clear-width': P.goalWidth,
        'data-goal-depth': depth,
      });
    /* Shadows are short translations of actual plan footprints, with no perspective. */
    const shadow = elGroup(g, {
      class: 'football-goal-shadow',
      transform: 'translate(.025 .035)',
      fill: 'none',
      stroke: '#294937',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    element(
      'path',
      {
        d: path([
          [front, postTop],
          [front, postBottom],
        ]),
        'stroke-width': line,
        opacity: 0.13,
      },
      undefined,
      shadow
    );
    element(
      'path',
      {
        d: path([
          [front, postTop],
          [back, postTop],
          [back, postBottom],
          [front, postBottom],
        ]),
        'stroke-width': 0.035,
        opacity: 0.09,
      },
      undefined,
      shadow
    );
    for (const y of [postTop, postBottom])
      element(
        'circle',
        { cx: back, cy: y, r: 0.025, fill: '#294937', stroke: 'none', opacity: 0.09 },
        undefined,
        shadow
      );
    /* The rear ground frame lies behind the line, underneath the net. */
    const supports = elGroup(g, {
      class: 'football-goal-supports',
      fill: 'none',
      stroke: support,
      'stroke-width': 0.035,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    element(
      'path',
      {
        d: path([
          [front, postTop],
          [back, postTop],
          [back, postBottom],
          [front, postBottom],
        ]),
      },
      undefined,
      supports
    );
    for (const y of [postTop, postBottom])
      element(
        'circle',
        { cx: back, cy: y, r: 0.025, fill: support, stroke: 'none' },
        undefined,
        supports
      );
    const net = elGroup(g, { class: 'football-goal-net' });
    element(
      'rect',
      { x: x0, y: top, width: depth, height: P.goalWidth, fill: '#f2f2e7', opacity: 0.035 },
      undefined,
      net
    );
    /* A flat top-net grid: 61 complete 0.12 m cells across the 7.32 m opening.
     The 2 m depth trims the terminal cells symmetrically instead of distorting them. */
    const segments = [],
      spacing = 0.12,
      mid = (x0 + x1) / 2;
    for (let k = Math.ceil((x0 - mid) / spacing); mid + k * spacing < x1 - 1e-8; k++) {
      const x = mid + k * spacing;
      if (x > x0 + 1e-8) segments.push(`M${clean(x)} ${clean(postTop)}V${clean(postBottom)}`);
    }
    for (let k = 1; top + k * spacing < bottom - 1e-8; k++) {
      const y = top + k * spacing;
      segments.push(`M${clean(x0)} ${clean(y)}H${clean(x1)}`);
    }
    // Extend each depthwise strand across the 60 mm orthographic side-panel
    // projection to the ground tubes. The roof edge alone floated 38 mm clear
    // of those tubes after the rope and tube radii were included.
    element(
      'path',
      {
        class: 'football-net-mesh',
        'data-net-surfaces': 'roof-and-sides',
        display: 'none',
        d: segments.join(' '),
        fill: 'none',
        stroke: rope,
        'stroke-width': 0.004,
        opacity: 0.72,
        'stroke-linecap': 'butt',
      },
      undefined,
      net
    );
    /* The perimeter rope is a separate layer, so intersections stay clean. */
    element(
      'path',
      {
        class: 'football-net-rope',
        d: path([
          [rearLine, top],
          [back, top],
          [back, bottom],
          [rearLine, bottom],
        ]),
        fill: 'none',
        stroke: rope,
        'stroke-width': 0.009,
        'stroke-linejoin': 'round',
        opacity: 0.8,
      },
      undefined,
      net
    );
    const frame = elGroup(g, { class: 'football-goal-frame', fill: white });
    element(
      'line',
      {
        'data-goal-part': 'crossbar',
        x1: front,
        y1: postTop,
        x2: front,
        y2: postBottom,
        stroke: white,
        'stroke-width': line,
        'stroke-linecap': 'round',
      },
      undefined,
      frame
    );
    element(
      'line',
      {
        'data-goal-part': 'crossbar-highlight',
        x1: front - line * 0.17,
        y1: postTop,
        x2: front - line * 0.17,
        y2: postBottom,
        stroke: '#fffef7',
        'stroke-width': line * 0.16,
        'stroke-linecap': 'butt',
      },
      undefined,
      frame
    );
    for (const y of [postTop, postBottom])
      element(
        'circle',
        { 'data-goal-part': 'post', cx: front, cy: y, r: postRadius },
        undefined,
        frame
      );
    goals.push({
      side,
      group: g,
      front,
      rearLine,
      back,
      postCentres: [
        { x: front, y: postTop },
        { x: front, y: postBottom },
      ],
      postRadius,
      clearWidth: P.goalWidth,
      net: {
        x: x0,
        y: top,
        width: depth,
        height: P.goalWidth,
        spacing,
        twine: 0.004,
        sideProjection: postRadius,
        projectedY: postTop,
        projectedHeight: postBottom - postTop,
      },
    });
  }
  return { group: root, goals };
}
