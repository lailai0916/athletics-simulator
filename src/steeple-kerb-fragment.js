/* The removable kerb is computed from this facility's actual 0..3.8 m
 * diversion boundaries. The 3.8 m paving width is a site choice, not a WA
 * mandatory track width. Retain the middle of the left bend; remove only
 * the two portals where a kerb strip would intersect the diversion pavement.
 */
function steepleKerbLayout(SC, G, kerbWidth = 0.12, pavingWidth = 3.8) {
  const PI = Math.PI,
    R = G.r,
    centreRadius = R - kerbWidth / 2;
  const beta = SC.beta,
    D = Math.hypot(SC.cxOffset, SC.cyOffset);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function crossing(radius, offset) {
    const small = 16 + offset,
      ratio = (radius * radius + D * D - small * small) / (2 * radius * D);
    if (ratio <= 1 + 1e-12 && ratio >= -1 - 1e-12) {
      const angle = beta + Math.acos(clamp(ratio, -1, 1));
      const x = -radius * Math.sin(angle),
        y = -radius * Math.cos(angle);
      // A real intersection on the finite northern transition arc.
      if (x <= -SC.cxOffset + 1e-9 && y <= -SC.cyOffset + 1e-9) return angle;
    }
    // Otherwise the intersection lies on the central vertical tangent.
    const x = SC.cxOffset + small;
    if (x > radius) throw new Error('Diversion outer boundary does not cross oval kerb');
    const y = -Math.sqrt(Math.max(0, radius * radius - x * x));
    if (y < -SC.cyOffset - 1e-9 || y > SC.cyOffset + 1e-9)
      throw new Error('No intersection on finite diversion boundary');
    return Math.atan2(x, -y);
  }
  const centerStart = crossing(centreRadius, 0),
    centerEnd = crossing(centreRadius, pavingWidth);
  const centerGaps = [
    [centerStart, centerEnd],
    [PI - centerEnd, PI - centerStart],
  ];
  // Full-strip envelope: do not leave the outer half of a 120 mm kerb
  // projecting into either portal. At R=36.5 the inner boundary is tangent.
  const fullStart = crossing(R, 0),
    fullEnd = crossing(R - kerbWidth, pavingWidth);
  const gaps = [
    [fullStart, fullEnd],
    [PI - fullEnd, PI - fullStart],
  ];
  const point = (radius, angle) => ({
    x: G.left - radius * Math.sin(angle),
    y: G.cy - radius * Math.cos(angle),
  });
  const xy = (p) => `${p.x.toFixed(8)} ${p.y.toFixed(8)}`;
  const arc = (radius, a, b) =>
    `M${xy(point(radius, a))}A${radius} ${radius} 0 0 0 ${xy(point(radius, b))}`;
  const r = centreRadius;
  const normalD = `M${G.left} ${G.cy + r}H${G.right}A${r} ${r} 0 0 0 ${G.right} ${G.cy - r}H${G.left}A${r} ${r} 0 0 0 ${G.left} ${G.cy + r}Z`;
  // Right bend + top straight + first retained left arc.
  const steepleD =
    `M${G.right} ${G.cy + r}A${r} ${r} 0 0 0 ${G.right} ${G.cy - r}H${G.left}A${r} ${r} 0 0 0 ${xy(point(r, gaps[0][0]))}` +
    arc(r, gaps[0][1], gaps[1][0]) +
    arc(r, gaps[1][1], PI) +
    `H${G.right}`;
  return {
    centreRadius,
    centerGaps,
    gaps,
    normalD,
    steepleD,
    // Under the removable kerb, retain a continuous physical 50 mm line.
    flatRadius: R - 0.05 / 2,
    gapD: gaps.map(([a, b]) => arc(R - 0.05 / 2, a, b)).join(''),
    gapLengths: gaps.map(([a, b]) => (b - a) * R),
    retainedMiddleLength: (gaps[1][0] - gaps[0][1]) * R,
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { steepleKerbLayout };
