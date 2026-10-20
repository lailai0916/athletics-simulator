/* Static surface: identical physical mowing stripes without an SVG pattern. */
function solidGrassStripeGeometry(G, P) {
  const band = 5.25,
    period = 2 * band,
    phase = P.left;
  const bounds = {
    x: G.left - G.r,
    y: G.cy - G.r,
    width: G.right - G.left + 2 * G.r,
    height: 2 * G.r,
  };
  // Extend the painted rectangles beyond the oval, so their own outer edges
  // never multiply the antialiasing of the single grass clip boundary.
  const padding = 1,
    paintBounds = {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + 2 * padding,
      height: bounds.height + 2 * padding,
    },
    stripes = [];
  const right = bounds.x + bounds.width;
  for (let n = Math.floor((bounds.x - phase) / period); phase + n * period < right; n++) {
    const x = phase + n * period;
    if (x + band <= bounds.x) continue;
    stripes.push({ x, y: paintBounds.y, width: band, height: paintBounds.height });
  }
  return {
    band,
    period,
    phase,
    bounds,
    paintBounds,
    stripes,
    background: '#648570',
    stripe: '#698974',
  };
}
function paintSolidGrassStripes(parent, element, elGroup, G, P) {
  const geometry = solidGrassStripeGeometry(G, P),
    group = elGroup(parent, {
      id: 'grass-mowing-stripes',
      'clip-path': 'url(#grass-clip)',
      'pointer-events': 'none',
    });
  element('rect', { ...geometry.paintBounds, fill: geometry.background }, undefined, group);
  for (const stripe of geometry.stripes)
    element('rect', { ...stripe, fill: geometry.stripe }, undefined, group);
  return { group, geometry };
}

/* Static surface: crop the existing rubber draw rectangle, never its pattern. */
const RUBBER_SOURCE_RECT = Object.freeze({ x: 7, y: 17, width: 181, height: 100 });
function visibleRubberRect(box, portrait, viewport, source = RUBBER_SOURCE_RECT) {
  const [x, y, w, h] = box;
  if (
    ![x, y, w, h, viewport.width, viewport.height].every(Number.isFinite) ||
    w <= 0 ||
    h <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    throw new Error('Invalid camera projection');
  // xMidYMid meet can expose world content in the letterboxed portions outside
  // the nominal viewBox. Match the camera's cached CSS viewport exactly.
  // Two CSS pixels of overscan keep the new rect edge outside the viewport AA.
  const unitsPerPixel = Math.max(w / viewport.width, h / viewport.height),
    padding = 2 * unitsPerPixel,
    rootWidth = viewport.width * unitsPerPixel + 2 * padding,
    rootHeight = viewport.height * unitsPerPixel + 2 * padding,
    rootX = x + (w - rootWidth) / 2,
    rootY = y + (h - rootHeight) / 2;
  // world rotate(90): rootX=-worldY, rootY=worldX.
  const world = portrait
    ? { x: rootY, y: -rootX - rootWidth, width: rootHeight, height: rootWidth }
    : { x: rootX, y: rootY, width: rootWidth, height: rootHeight };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    left = clamp(world.x, source.x, source.x + source.width),
    top = clamp(world.y, source.y, source.y + source.height),
    right = clamp(world.x + world.width, source.x, source.x + source.width),
    bottom = clamp(world.y + world.height, source.y, source.y + source.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
function createVisibleRubberViewport(node, source = RUBBER_SOURCE_RECT) {
  let previous = { ...source },
    lastInput = null;
  function update(box, portrait, viewport) {
    const input = [...box, !!portrait, viewport.width, viewport.height];
    if (lastInput && input.every((v, i) => v === lastInput[i])) return previous;
    const next = visibleRubberRect(box, portrait, viewport, source);
    lastInput = input;
    for (const key of ['x', 'y', 'width', 'height'])
      if (previous[key] !== next[key]) node.setAttribute(key, next[key]);
    previous = next;
    return next;
  }
  return { update };
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = {
    solidGrassStripeGeometry,
    paintSolidGrassStripes,
    RUBBER_SOURCE_RECT,
    visibleRubberRect,
    createVisibleRubberViewport,
  };
