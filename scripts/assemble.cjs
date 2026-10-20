'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sourceRoot = path.join(__dirname, '..', 'src');
const modules = Object.freeze({
  LOCALE: 'locale.js',
  RACE_MOTION: 'race-motion.js',
  MEASURED_MOTION: 'measured-motion.js',
  RELAY_MOTION: 'relay-motion.js',
  COURSE_MOTION: 'course-motion.js',
  CAMERA_CONTROLLER: 'camera-controller.js',
  EVENT_PICKER: 'event-picker.js',
  LABEL_LAYOUT: 'label-layout.js',
  FOOTBALL_PITCH: 'football-pitch.js',
  FOOTBALL_GOALS: 'football-goals.js',
  STEEPLE_PRECISION: 'steeple-precision.js',
  STEEPLE_KERB: 'steeple-kerb-fragment.js',
  MARKING_PRECISION: 'marking-precision.js',
  STATIC_SURFACE: 'static-surface.js',
  MERGE_MOTION: 'merge-motion.js',
  RELAY_RENDER: 'relay-render.js',
  ROUTE_TRACE: 'route-trace.js',
  EVENT_PICKER_CSS: 'event-picker.css',
});

function read(name) {
  return fs.readFileSync(path.join(sourceRoot, name), 'utf8');
}
function expand(source, manifest) {
  return source.replace(/\/\*__(\w+)__\*\//g, (token, name) => {
    if (['BOOTSTRAP', 'BOOTSTRAP_END', 'TRACE_SEGMENTS'].includes(name)) return token;
    if (!manifest[name]) throw new Error(`Unknown source fragment: ${name}`);
    return expand(read(manifest[name]), manifest);
  });
}
function assembleApp() {
  return expand(read('track-app.js'), modules);
}
function assemblePage() {
  const html = expand(read('index.html'), {
    ...modules,
    CSS: 'track.css',
    DATA: 'track-data.js',
    APP: 'track-app.js',
  });
  const unresolved = html.match(/\/\*__(?!BOOTSTRAP|TRACE_SEGMENTS)\w+__\*\//);
  if (unresolved) throw new Error(`Unresolved source fragment: ${unresolved[0]}`);
  // Keep the code license with the independently distributable HTML artifact.
  const license = fs.readFileSync(path.join(sourceRoot, '..', 'LICENSE'), 'utf8').trim();
  return html.replace('<!doctype html>', '<!doctype html>\n<!--\n' + license + '\n-->');
}
module.exports = { sourceRoot, modules, assembleApp, assemblePage };
