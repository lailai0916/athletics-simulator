'use strict';
// Audit the painted bodies produced by the renderer against independently read
// start paint. A stored bodyStart is intentionally not an expectation here.
const assert = require('node:assert/strict'),
  vm = require('node:vm'),
  { readSource } = require('./helpers/source.cjs'),
  { environment } = require('./helpers/render-harness.cjs');
const detailStyles = {},
  svg = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1297, height: 641 }),
    classList: { toggle() {} },
    style: { setProperty: (key, value) => (detailStyles[key] = String(value)) },
  },
  ctx = { window: {}, document: { getElementById: () => svg }, Math, console };
vm.createContext(ctx);
vm.runInContext(
  readSource('track-data.js') +
    '\n' +
    require('./helpers/load-app.cjs').withBootstrap(
      'window.StartPaintQA={startCurve,state,updateDetail};'
    ),
  ctx
);
const M = ctx.window.TrackMath,
  paint = ctx.window.StartPaintQA,
  harness = environment(),
  Q = harness.qa,
  css = readSource('track.css'),
  tolerance = 1e-7,
  paintHalfWidth = 0.025,
  failures = [],
  results = [];
let checks = 0,
  maximumTangencyError = 0;
const zoomStyles = [0.1, 0.5, 1, 3, 10, 20, 100, 10000].map((scale) => {
  paint.state.box = [0, 0, 1297 / scale, 641 / scale];
  paint.updateDetail();
  return { scale, variables: { ...detailStyles } };
});
function check(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}
function parseCurve(d) {
  const tokens = d.match(/[MC]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi),
    segments = [];
  let i = 0,
    p;
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') p = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
    else {
      assert.equal(command, 'C', 'painted curved starts use cubic SVG segments');
      const a = { x: Number(tokens[i++]), y: Number(tokens[i++]) },
        b = { x: Number(tokens[i++]), y: Number(tokens[i++]) },
        end = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
      segments.push({ p, a, b, end });
      p = end;
    }
  }
  return segments;
}
function cubic(segment, t) {
  const { p, a, b, end } = segment,
    u = 1 - t;
  return {
    x: u ** 3 * p.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * end.x,
    y: u ** 3 * p.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * end.y,
    dx: 3 * u * u * (a.x - p.x) + 6 * u * t * (b.x - a.x) + 3 * t * t * (end.x - b.x),
    dy: 3 * u * u * (a.y - p.y) + 6 * u * t * (b.y - a.y) + 3 * t * t * (end.y - b.y),
  };
}
// Each short segment's distance is unimodal near the start array. Search every
// segment, including both endpoints, instead of trusting the chosen route's
// start normal or the application's nearest-point implementation.
function closestPaint(point, segments) {
  let best = { squared: Infinity };
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (const segment of segments) {
    const squared = (t) => {
      const p = cubic(segment, t);
      return (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    };
    let lo = 0,
      hi = 1,
      a = hi - ratio * (hi - lo),
      b = lo + ratio * (hi - lo),
      fa = squared(a),
      fb = squared(b);
    for (let n = 0; n < 42; n++) {
      if (fa < fb) {
        hi = b;
        b = a;
        fb = fa;
        a = hi - ratio * (hi - lo);
        fa = squared(a);
      } else {
        lo = a;
        a = b;
        fa = fb;
        b = lo + ratio * (hi - lo);
        fb = squared(b);
      }
    }
    for (const t of [0, 1, (lo + hi) / 2]) {
      const value = squared(t);
      if (value < best.squared) best = { squared: value, ...cubic(segment, t) };
    }
  }
  return { ...best, distance: Math.sqrt(best.squared) };
}
function bodyPosition(node) {
  const values = node.getAttribute('transform')?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  assert(values?.length === 2, 'visible athlete body uses an explicit translation');
  return { x: Number(values[0]), y: Number(values[1]) };
}
// Resolve the actual matching stroke declarations rather than assuming a radius
// omits its outline. Relative widths would invalidate tangency after wheel zoom.
function strokeWidth(node, kind, variables) {
  let value = node.getAttribute('stroke-width'),
    winner = -1;
  const ancestors = [node, node.parent],
    classes = new Set(ancestors.flatMap((n) => [...n.classSet]));
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declaration = rule[2].match(/(?:^|;)\s*stroke-width\s*:\s*([^;]+)/);
    if (!declaration) continue;
    for (const selector of rule[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',')) {
      if (!selector.trim().endsWith('.' + kind)) continue;
      const required = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
      if (!required.every((name) => classes.has(name))) continue;
      const specificity = required.length + (selector.match(/\[/g) || []).length;
      if (specificity >= winner) {
        value = declaration[1].trim();
        winner = specificity;
      }
    }
  }
  const resolved = value?.replace(
      /var\((--[\w-]+),\s*([^)]+)\)/g,
      (_match, key, fallback) => variables[key] ?? fallback
    ),
    width = Number(resolved);
  check(Number.isFinite(width), `${kind}: painted stroke resolves to metres, got ${value}`);
  return Number.isFinite(width) ? width : 0.025;
}
const events = ctx.window.TrackApp.events;
assert.equal(events.length, 21, 'exercise every currently supported race');
for (const event of events)
  for (const grouped of ['5000', '10000'].includes(event.id) ? [false, true] : [false]) {
    Q.state.grouped = grouped;
    harness.setup(event.id);
    harness.frame(0);
    const curved = ['waterfall', 'steeple', 'relay1500'].includes(event.kind),
      curves = curved ? [parseCurve(paint.startCurve(event))] : [];
    if (grouped) curves.push(parseCurve(paint.startCurve(event, true)));
    let eventMaximumError = 0;
    for (const route of Q.state.routes) {
      const runner = Q.state.runners[route.index],
        token = runner.active || runner.athletes[0],
        body = token.querySelector('.token-body'),
        selection = token.querySelector('.selection-ring'),
        position = bodyPosition(token),
        radius =
          Number(body.getAttribute('r')) +
          strokeWidth(body, 'token-body', zoomStyles.at(-1).variables) / 2,
        name = `${event.id}/${grouped} athlete ${route.index + 1}`;
      let gap;
      if (curved) {
        const nearest = closestPaint(position, curves[route.outer ? 1 : 0]),
          length = Math.hypot(nearest.dx, nearest.dy),
          forward =
            ((position.x - nearest.x) * nearest.dy - (position.y - nearest.y) * nearest.dx) /
            length;
        gap = nearest.distance - paintHalfWidth - radius;
        check(forward < 0, `${name}: body lies behind the curved paint, not in front of it`);
      } else {
        const raw = M.normalRoute(event, route.lane).start,
          length = Math.hypot(raw.tx, raw.ty),
          sharedFinish = event.id === '4x200' && route.index === 0,
          normal = sharedFinish ? { x: 1, y: 0 } : { x: raw.tx / length, y: raw.ty / length },
          // The lane-1 start of the two-lap lane relay shares the common finish
          // stripe, rather than its 2.44 mm survey-rounded nominal coordinate.
          q = sharedFinish ? { ...raw, x: M.geometry.right } : raw;
        gap = (q.x - position.x) * normal.x + (q.y - position.y) * normal.y - radius;
        check(gap + radius > 0, `${name}: body lies behind its transverse start edge`);
      }
      const error = Math.abs(gap);
      maximumTangencyError = Math.max(maximumTangencyError, error);
      eventMaximumError = Math.max(eventMaximumError, error);
      check(error <= tolerance, `${name}: painted body/start-paint tangency error ${gap} m`);
      // A selected athlete must retain the same physical body position, and its
      // highlighting may not introduce another outer edge across the start line.
      harness.frame(0, route.index);
      const selectedPosition = bodyPosition(token);
      check(
        Math.hypot(selectedPosition.x - position.x, selectedPosition.y - position.y) < 1e-10,
        `${name}: selecting an athlete does not move its starting body`
      );
      for (const { scale, variables } of zoomStyles) {
        const bodyExtent =
            Number(body.getAttribute('r')) + strokeWidth(body, 'token-body', variables) / 2,
          selectedExtent =
            Number(selection.getAttribute('r')) +
            strokeWidth(selection, 'selection-ring', variables) / 2;
        check(
          Math.abs(bodyExtent - radius) < 1e-12,
          `${name}: wheel zoom at ${scale} px/m preserves the body's outer edge`
        );
        check(
          selectedExtent <= bodyExtent + tolerance,
          `${name}: selection ring stays inside body at ${scale} px/m`
        );
      }
    }
    results.push({ event: event.id, grouped, maximumTangencyError: eventMaximumError });
  }
assert.equal(
  failures.length,
  0,
  failures.slice(0, 12).join('\n') + `\n${failures.length} failures`
);
console.log(JSON.stringify({ checks, maximumTangencyError, results }, null, 2));
