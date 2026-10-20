const labelMetricsCache = new Map(),
  labelLayoutState = new WeakMap();
let labelMeasureContext = null;
function canvasFontStretch(value) {
  // Computed SVG styles serialize these CSS keywords as percentages, while
  // CanvasFontStretch only accepts the corresponding keyword enum.
  const names = {
    '50%': 'ultra-condensed',
    '62.5%': 'extra-condensed',
    '75%': 'condensed',
    '87.5%': 'semi-condensed',
    '100%': 'normal',
    '112.5%': 'semi-expanded',
    '125%': 'expanded',
    '150%': 'extra-expanded',
    '200%': 'ultra-expanded',
  };
  return names[value] || (Object.values(names).includes(value) ? value : 'normal');
}
function labelLayout(node) {
  if (!node) return null;
  const cx = Number(node.dataset.labelCenterX ?? node.getAttribute('x') ?? 0),
    cy = Number(node.dataset.labelCenterY ?? node.getAttribute('y') ?? 0),
    style = getComputedStyle(node),
    computedSize = parseFloat(style.fontSize),
    fontStretch = canvasFontStretch(style.fontStretch);
  let previous = labelLayoutState.get(node);
  // Keep the authored size separate from our fitted size. A two-digit bib may
  // shrink and later grow back to one digit without accumulating font scaling.
  if (!previous || node.style.fontSize !== previous.appliedSize)
    previous = { baseSize: computedSize, appliedSize: node.style.fontSize };
  const units = 1024,
    key = [
      style.fontFamily,
      style.fontWeight,
      style.fontStyle,
      fontStretch,
      style.fontKerning,
      style.direction,
      node.textContent,
    ].join('|');
  let metric = labelMetricsCache.get(key);
  if (!metric) {
    if (!labelMeasureContext)
      labelMeasureContext = document.createElement('canvas').getContext('2d');
    labelMeasureContext.font = `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${units}px ${style.fontFamily}`;
    if ('fontStretch' in labelMeasureContext) labelMeasureContext.fontStretch = fontStretch;
    if ('fontKerning' in labelMeasureContext)
      labelMeasureContext.fontKerning = style.fontKerning || 'auto';
    if ('direction' in labelMeasureContext)
      labelMeasureContext.direction = style.direction || 'ltr';
    const m = labelMeasureContext.measureText(node.textContent),
      left = m.actualBoundingBoxLeft ?? 0,
      right = m.actualBoundingBoxRight ?? m.width,
      ascent = m.actualBoundingBoxAscent ?? m.fontBoundingBoxAscent ?? units * 0.75,
      descent = m.actualBoundingBoxDescent ?? m.fontBoundingBoxDescent ?? units * 0.25;
    metric = {
      dx: (left - right) / (2 * units),
      dy: (ascent - descent) / (2 * units),
      width: (left + right) / units,
      height: (ascent + descent) / units,
    };
    labelMetricsCache.set(key, metric);
  }
  const target = Number(
      node.dataset.glyphHeight ?? (node.classList.contains('lane-label') ? 0.6 : 0)
    ),
    maxWidth = Number(node.dataset.maxInkWidth),
    maxHeight = Number(node.dataset.maxInkHeight);
  let size = target > 0 && metric.height > 0 ? target / metric.height : previous.baseSize;
  if (maxWidth > 0 && metric.width > 0) size = Math.min(size, maxWidth / metric.width);
  if (maxHeight > 0 && metric.height > 0) size = Math.min(size, maxHeight / metric.height);
  return {
    node,
    previous,
    cx,
    cy,
    size,
    x: cx + metric.dx * size,
    y: cy + metric.dy * size,
    width: metric.width * size,
    height: metric.height * size,
  };
}
function applyLabelLayout(layout) {
  if (!layout) return;
  const { node, previous, cx, cy, size, x, y, width, height } = layout,
    fontSize = size + 'px';
  if (node.style.fontSize !== fontSize) node.style.fontSize = fontSize;
  if (node.style.textAnchor !== 'start') node.style.textAnchor = 'start';
  if (node.style.dominantBaseline !== 'alphabetic') node.style.dominantBaseline = 'alphabetic';
  if (Number(node.getAttribute('x')) !== x) node.setAttribute('x', x);
  if (Number(node.getAttribute('y')) !== y) node.setAttribute('y', y);
  Object.assign(node.dataset, {
    labelCenterX: cx,
    labelCenterY: cy,
    inkWidth: width,
    inkHeight: height,
    inkCenterX: cx,
    inkCenterY: cy,
  });
  previous.appliedSize = fontSize;
  labelLayoutState.set(node, previous);
  return layout;
}
function centerLabel(node) {
  return applyLabelLayout(labelLayout(node));
}
function setLabel(node, value) {
  const text = String(value);
  if (node.textContent === text && node.dataset.labelCenterX !== undefined) return;
  node.textContent = text;
  return centerLabel(node);
}
function centerAllLabels() {
  // Read all font styles before writing positions/sizes, avoiding one synchronous
  // style flush per label when the whole scene is rebuilt or reoriented.
  const layouts = Array.from(document.querySelectorAll('.point-label,.lane-label'), labelLayout);
  layouts.forEach(applyLabelLayout);
}
