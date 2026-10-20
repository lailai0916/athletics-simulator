# Development Guide

[简体中文](development.zh-Hans.md) · [Model](model.md) · [References](references.md)

## Commands

Use Node.js 22 or later. Install the pinned development dependencies with `npm ci`.

| Command                | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`          | Serve an in-memory build at `http://127.0.0.1:5173`; reload after editing source. |
| `npm run build`        | Assemble the application into `dist/index.html`.                                  |
| `npm run preview`      | Serve existing build output at `http://127.0.0.1:4173`.                           |
| `npm test`             | Run the portable Node regression suite.                                           |
| `npm run format`       | Apply the configured Prettier formatting.                                         |
| `npm run format:check` | Check formatting without changing files.                                          |
| `npm run check`        | Run formatting checks, regressions, and the build.                                |

To choose another local port, use `npm run dev -- --port 5174` or `npm run preview -- --port 4174`. The servers bind to `127.0.0.1` by default. The built HTML has no network dependency and also works as a local file.

The runtime uses browser-native HTML, CSS, SVG, and JavaScript. Prettier is a development dependency; the application does not need npm to run after building.

## Source And Build Architecture

The source uses integration fragments assembled into a single page, rather than a runtime module loader. `scripts/assemble.cjs` owns the fragment manifest and exposes `assembleApp()` and `assemblePage()` for both the build and tests. Add a fragment there once; do not introduce another manifest in a test or server.

`src/index.html` owns the HTML shell, control elements, SVG definitions, and layer order. Its source tokens are replaced by the assembler. `src/track-app.js` supplies application state and integrates the geometry, camera, renderer, and controls. Source fragments are plain JavaScript and share their containing scope; they are not all independent ES modules. Function order and initialization dependencies matter.

| Source                                                        | Responsibility                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `track-data.js`                                               | Event metadata, dimensions, colours, and source references.                    |
| `marking-precision.js`                                        | Physical paint geometry, lane edges, starts, breaklines, and relay markings.   |
| `steeple-precision.js`, `steeple-kerb-fragment.js`            | Water-jump course and the corresponding kerb opening.                          |
| `measured-motion.js`, `course-motion.js`                      | Route arc-length measurement, course joins, and conversion from race progress. |
| `race-motion.js`                                              | Shared race clock with integrated start and finish ramps.                      |
| `merge-motion.js`                                             | Smooth lane-break and pack-route transitions.                                  |
| `relay-motion.js`, `relay-render.js`                          | Relay leg state, continuous exchange motion, and athlete presentation.         |
| `camera-controller.js`                                        | Queued pan/zoom state and screen-to-field projection.                          |
| `event-picker.js`, `event-picker.css`                         | Keyboard-accessible event selection.                                           |
| `label-layout.js`                                             | Text metrics and geometric centring.                                           |
| `football-pitch.js`, `football-goals.js`, `static-surface.js` | Inner field, goals, and view-dependent surface detail.                         |
| `route-trace.js`                                              | Error-bounded route sampling used by the renderer.                             |

The public distribution is `dist/index.html`. Edit `src/`, rebuild, and review the result; do not hand-edit the distributable. Tests and the build must assemble the same source. Test bootstrap markers exist only to let the harness inspect application internals without starting a browser animation.

## Coordinate And Motion Contracts

- Field geometry is in metres: x increases rightward and y downward in the unrotated SVG world. Paint widths belong to this coordinate system and must not receive a screen-pixel minimum.
- A route position supplies finite `x` and `y` coordinates, with tangent direction where the caller requires it. Measured motion converts a route's parameter into actual travelled planar distance; a parameter increment alone is not proof of one metre of travel.
- The shared race clock advances in simulation seconds with a 10 m/s cruising section. Playback multipliers change the clock rate, not event distances, marking dimensions, or route geometry.
- Launch, merge, relay, and run-out transitions have continuity requirements. Compare positions, speed, and acceleration on both sides of joins; a visually plausible endpoint does not prove a smooth path.
- Camera coordinates are independent of event progress. Event changes, grouped-start changes, and playback seeking must preserve the intended camera and selection behavior. Selecting an athlete centres the camera on the visible token's body using its current or pending view size. In relays, use the current runner's body position, not the hidden baton/grip position. While following, wheel input changes the view size without cancelling follow; dragging pans from the latest position and clears both following and selection. Playback toggles retain both states.
- Layer order represents a particular marking plan. Keep permanent paint present across event selection, avoid duplicate physical strokes, and verify intersections against the cited diagram. Do not treat one global paint colour order as a rule for every intersection.

Internal browser globals such as `TrackApp` and `TrackMath` are useful for inspection. They are implementation details in the 0.x series, not a stable external API. New extension points should have explicit contracts and regression coverage before being documented as supported APIs.

## Adding Or Changing An Event

1. Identify the governing rule edition, relevant sections, and the exact competition variant. Record them in both model/reference translations. Distinguish required rules from chosen demonstration behavior.
2. Add the catalogue entry and both interface translations. Specify distance, route kind, start format, relay unit or hurdles, and any stagger parameters supported by that kind.
3. Reuse an existing route kind only if its start, lane restrictions, break point, finish, and exchange behavior apply. Otherwise implement the new geometry and motion policy explicitly.
4. Add permanent markings independently of the selected event. Preserve physical stroke width, forward/back edges, dash rhythm, clipping, and shared-mark ownership.
5. Verify all route distances, start offsets, legal lane footprints, break conditions, exchange-zone positions, and common finish alignment. Include normal and grouped starts where supported.
6. Check motion around starts, tangencies, merge joins, handovers, the finish, and the run-out. Sample actual elapsed time as well as the route parameter.
7. Exercise both interface languages and keyboard controls in a real browser. Capture the event, playback position, and camera state in review evidence.

A new tactics feature needs its own model choices: athlete abilities, pacing policy, legal overtaking, interaction decisions, and validation data are not supplied by the current preset-route engine. Keep such choices separate from surveyed facility geometry and rule requirements.

## Automated Validation

Run `npm run check` before submitting changes. The suite covers the geometry and motion invariants available in the source and uses lightweight DOM/animation harnesses for interaction and rendering regressions. Add tests that would fail for a meaningful error, rather than restating the implementation.

Build checks should catch unresolved source tokens and produce the same self-contained application that users run. The CI workflow also invokes the repository standards checker from a reviewed, fixed template revision. Repository conventions do not replace simulation tests.

Mock text metrics and Node DOM harnesses cannot prove the exact glyph layout, GPU work, event ordering, or rendering performance of a specific browser. Do not use a large assertion count as a substitute for reviewing these limits.

## Browser Acceptance

Use the built page when checking a release. At minimum, review Chromium and Safari when changing SVG rendering, detail thresholds, or camera input.

- Fit the whole horizontal track at desktop, short landscape, and narrow portrait viewport sizes; inspect the finish line, straight extensions, and every lane boundary.
- Open the event menu with mouse and keyboard, reach the last option, select it, and test Escape and focus return. Check English and Simplified Chinese at narrow widths.
- Pan, zoom deeply, drag while zoomed, and resize. Check that static texture/detail does not cause sustained stalls or detached markings.
- Select an athlete or team, play, pause, seek, change speed, zoom while following, and try to drag. Confirm the documented follow and selection behavior.
- Replay an event before and after a lane break and all three relay exchanges. Observe runner continuity and retired athletes, not only the active runner.
- Inspect starts, shared hooks, hurdle ticks, breakline crossings, line thickness, labels, goal nets, and the steeplechase kerb opening at high magnification.

Record the browser/version, viewport, event, grouped state, playback position, and observed result. Separate an automated pass from a manual visual or performance finding.

## Changes And Releases

Use Conventional Commit subjects, such as `fix(motion): preserve distance through the lane break`. Update both language versions when changing user-facing text, model assumptions, commands, or documented behavior.

The project follows Semantic Versioning. During 0.x development, document observable behavior and interface changes in `CHANGELOG.md`; do not imply a stable extension API. A release should identify the exact commit, include a clean `npm ci` and `npm run check`, and review the built page in actual browsers. Do not publish official rule PDFs or downloaded reference artwork as project-licensed assets; link the original source instead.
