// Input keeps a logical target immediately, but commits the SVG camera once per
// animation frame. Projection follows SVG's default xMidYMid meet transform.
function createTrackCameraController(svg, readBox, commit) {
  let rect = null,
    pending = null,
    frame = 0;
  function measure() {
    const r = svg.getBoundingClientRect();
    rect = {
      left: r.left,
      top: r.top,
      width: Math.max(1, r.width),
      height: Math.max(1, r.height),
      right: r.left + Math.max(1, r.width),
      bottom: r.top + Math.max(1, r.height),
    };
    return rect;
  }
  function viewport() {
    return rect || measure();
  }
  function box() {
    return pending || readBox();
  }
  function point(clientX, clientY) {
    const r = viewport(),
      [x, y, w, h] = box(),
      scale = Math.min(r.width / w, r.height / h);
    return {
      x: x + (clientX - r.left - (r.width - w * scale) / 2) / scale,
      y: y + (clientY - r.top - (r.height - h * scale) / 2) / scale,
    };
  }
  function queue(next) {
    pending = next;
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = pending;
        pending = null;
        if (next) commit(next);
      });
  }
  function cancel() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
  }
  return { measure, viewport, box, point, queue, cancel };
}
