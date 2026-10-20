<div align="center">
  <h1>Athletics Simulator</h1>
  <p><strong>English</strong> · <a href="README.zh-Hans.md">简体中文</a></p>
  <p>
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/lailai0916/athletics-simulator/ci.yml?branch=main&amp;style=flat-square" />
    <img alt="Last commit" src="https://img.shields.io/github/last-commit/lailai0916/athletics-simulator?style=flat-square" />
    <img alt="Top language" src="https://img.shields.io/github/languages/top/lailai0916/athletics-simulator?style=flat-square" />
    <img alt="Repository size" src="https://img.shields.io/github/repo-size/lailai0916/athletics-simulator?style=flat-square" />
    <img alt="Code style: Prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square" />
    <img alt="Code license: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  </p>
</div>

## Website Introduction

Athletics Simulator is a browser-based track-race simulation for demonstrating rules, studying race routes, and building extensions for tactical rehearsal.

A full-screen, eight-lane 400 m track supports 21 events, including five relays. The current release follows preset routes and a shared demonstration pace; it does not predict race results or provide a tactical editor. See the [model and event variants](docs/model.md) before interpreting its movement as competition behavior.

![An eight-lane track with a football pitch and floating playback controls](docs/images/preview.png)

## Website Features

🏟️ **Measured Field Geometry** — Track dimensions, staggered starts, permanent markings, breaklines, hurdles, and the steeplechase water-jump route are drawn in track metres, with a football pitch inside the oval.

🏃 **Event And Relay Routes** — Compare lane races, curved starts, two-group starts, lane breaks, and relay exchanges across sprint, middle-distance, long-distance, hurdle, and steeplechase events.

🎛️ **Direct Visual Controls** — Pan and zoom the field, select an athlete or team to follow, seek through the race, and switch between 0.25×, 0.5×, 1×, 2×, 4×, and 8× playback. Event changes preserve the camera view.

🌐 **Two Interface Languages** — Switch between English and Simplified Chinese while keeping the field as the main interface.

🧩 **Extensible Source And Checks** — Independent geometry, motion, camera, rendering, and event-data fragments build into one self-contained HTML file; automated regressions accompany the model and interaction code.

## Getting Started

Use Node.js 22 or later and npm. No external assets or runtime packages are required by the built application.

```bash
git clone https://github.com/lailai0916/athletics-simulator.git
cd athletics-simulator
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` (or the local URL printed by the server). Source changes appear on reload; the development server rebuilds the page when requested.

For an offline copy, download `index.html` from the [latest release](https://github.com/lailai0916/athletics-simulator/releases/latest). It includes the code license and works without a server.

To create and serve the distributable:

```bash
npm run build
npm run preview
```

`dist/index.html` contains the application, styles, and scripts. It can also be opened directly or served by a static host. Build output is reproducible from the source and is not committed.

Drag the field to pan and use the wheel to zoom. Click an athlete to follow it; while following, the wheel changes the zoom and dragging does not move the camera. Click the same athlete again or press Escape with the athlete focused to leave follow mode. Space starts or pauses playback. The event menu also supports arrow keys, Home, End, Enter, and Escape.

## Project Structure

```bash
athletics-simulator/
├── .github/                        # CI, issue forms, and contribution policies
├── docs/                           # Model assumptions, references, and development
│   └── images/                     # Application preview
├── scripts/                        # Shared assembler, build, and local server
│   ├── assemble.cjs                # Source assembly used by builds and tests
│   ├── build.cjs                   # Self-contained HTML output
│   └── serve.cjs                   # Development and preview HTTP server
├── src/                            # Browser application and geometry modules
│   ├── index.html                  # Application shell and SVG layers
│   ├── track-app.js                # Race state, controls, and module integration
│   └── track-data.js               # Event catalogue and reference parameters
├── tests/                          # Geometry, motion, rendering, and input regressions
├── CHANGELOG.md                    # Versioned changes
└── package.json                    # Commands and development dependencies
```

## Events And Model Scope

The catalogue contains 100 m, 200 m, 300 m, 400 m, 800 m, 1000 m, 1500 m, 1 mile, 2000 m, 3000 m, 5000 m, 10,000 m, 100 m hurdles, 110 m hurdles, 400 m hurdles, 3000 m steeplechase, and 4 × 100 m, 4 × 200 m, 4 × 400 m, 4 × 800 m, and 4 × 1500 m relays.

The model uses a common 10 m/s cruising speed and deterministic spacing so that route differences remain visible. It includes selected competition formats: for example, 4 × 200 m uses the all-lanes variant. It has no athlete physiology, individual performance calibration, collision decisions, or adjudication engine. Mixed relays, road races, and field events are outside the current catalogue.

The [model documentation](docs/model.md) separates rule-based dimensions and selected formats from visualization choices. The [references](docs/references.md) identify editions and sections of the source material. This project is an independent implementation; it is not an official or certified competition system.

## Development And Contributions

```bash
npm test
npm run build
npm run format:check
# Run formatting, regressions, and the build together:
npm run check
```

Read the [development guide](docs/development.md) for module contracts, event extensions, and browser acceptance checks, and the [contribution guide](.github/CONTRIBUTING.md) before submitting a change. CI checks formatting, project regressions, build output, and repository conventions. Passing Node tests does not establish real-browser visual fidelity or Safari performance.

For reproducible bug reports, include the event, grouped-start setting, playback position, camera/follow state, browser version, and reproduction steps. Report vulnerabilities through the [security policy](.github/SECURITY.md).

## License

This project's code is licensed under [MIT License](LICENSE), and its documentation is licensed under [CC BY 4.0](LICENSE-docs).
