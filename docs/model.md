# Simulation model

**English** · [简体中文](model.zh-Hans.md)

Athletics Simulator uses metre-based, two-dimensional geometry to visualize track-event starts, lane staggers, break lines, exchange zones, and race paths. It is a teaching and spatial-analysis tool, and a foundation for developing further race models. It is not an officially certified facility model, a rules adjudication system, or a validated performance predictor.

## Event presets

The current catalog has 21 presets. “Blocks” describes the displayed equipment and start arrangement; athlete tokens do not animate the crouch or standing posture.

| Event               | Start               | Lane treatment                         |
| ------------------- | ------------------- | -------------------------------------- |
| 100 m               | Blocks, straight    | Entirely in lanes                      |
| 200 m               | Blocks, staggered   | Entirely in lanes                      |
| 300 m               | Blocks, staggered   | Entirely in lanes                      |
| 400 m               | Blocks, staggered   | Entirely in lanes                      |
| 800 m               | Standing, staggered | First bend in lanes, then shared track |
| 1000 m              | Standing, curved    | Shared track                           |
| 1500 m              | Standing, curved    | Shared track                           |
| 1 mile              | Standing, curved    | Shared track; 1609.344 m               |
| 2000 m              | Standing, curved    | Shared track                           |
| 3000 m              | Standing, curved    | Shared track                           |
| 5000 m              | Standing, curved    | Shared track; optional two-group start |
| 10,000 m            | Standing, curved    | Shared track; optional two-group start |
| 100 m hurdles       | Blocks, straight    | Entirely in lanes; 10 hurdles          |
| 110 m hurdles       | Blocks, straight    | Entirely in lanes; 10 hurdles          |
| 400 m hurdles       | Blocks, staggered   | Entirely in lanes; 10 hurdles          |
| 3000 m steeplechase | Standing, curved    | Inside-water-jump course               |
| 4 × 100 m           | Blocks, staggered   | Entirely in lanes                      |
| 4 × 200 m           | Blocks, staggered   | Entirely in lanes; four bends          |
| 4 × 400 m           | Blocks, staggered   | Three bends in lanes                   |
| 4 × 800 m           | Standing, staggered | One bend in lanes                      |
| 4 × 1500 m          | Standing, curved    | Unlaned                                |

Lane-based presets have eight athletes or teams. Regular shared-track individual presets have 12 athletes. The 5000 m and 10,000 m group-start option uses 16 athletes: 10 in the inner group and 6 in the outer group. These field sizes are demonstration choices. Other events for which the rules allow group starts do not currently expose that option.

Individual tokens use numbers. Relay tokens use a team letter and leg number, such as A1. These are interface identifiers. The eight-colour palette repeats when the field has more than eight athletes.

## Track and markings

The standard-track construction uses a 36.50 m inner radius, 84.39 m straights, and eight 1.22 m lanes. Measurement lines are 0.30 m from a kerb in lane 1 and 0.20 m from the inner line in the other lanes. Ground paint is 0.05 m wide in world coordinates; the outer lane line is included in the lane width. The selected kerb width is 0.12 m. Start lines, exchange marks, hurdle stations, the finish line, and the mile start remain painted when the selected event changes.

Curved starts use equal-distance constructions. The 800 m break line uses the facilities manual's wire-unwinding construction. Crossings use separate paint layers to reproduce the conventions shown in the standard marking plan. That drawing interpretation is not a universal written rule prescribing paint order at every venue. See [references and assumptions](references.md) for sources and rule sections.

The published 84.39 m / 36.80 m measurement dimensions are rounded: their circumference exceeds exactly 400 m by approximately 1.219 mm. The implementation preserves the survey construction and locates the final forward crossing numerically. Other source coordinates are also rounded. Metre-based modelling does not establish independent sub-millimetre survey accuracy, and browser rasterization does not guarantee identical pixels at every scale.

## Selected relay variants

The presets implement the following choices from Technical Rule 24:

| Relay      | Exchange zone                               | Selected variant and scope                                                                                                                                                                 |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4 × 100 m  | 30 m: scratch line 20 m after the beginning | Entirely in lanes                                                                                                                                                                          |
| 4 × 200 m  | 30 m: scratch line 20 m after the beginning | Entirely in lanes; the permitted three-bend and one-bend alternatives are not selectable                                                                                                   |
| 4 × 400 m  | 20 m, centred on the scratch line           | First leg and first bend of leg 2 in lanes; the one-bend alternative is not selectable                                                                                                     |
| 4 × 800 m  | 20 m, centred on the scratch line           | First bend of leg 1 in lanes; the fully unlaned alternative is not selectable                                                                                                              |
| 4 × 1500 m | 20 m, centred on each scratch line          | Unlaned; the rendered set of exchange-station marks is a project extension based on this zone length, not a claim that the complete arrangement appears on the cited standard marking plan |

Receiver acceleration begins inside the exchange zone. Incoming and outgoing runners follow continuous preset paths. After handing over, the runner who completed that leg slows, moves aside, and fades. Hands and batons are intentionally not drawn, although logical transfer state remains in the model. The animation therefore does not show grip technique or allow visual adjudication of the whole baton's position at a zone boundary.

Waiting positions and exchange timing are deterministic. The simulation does not dynamically rearrange receivers from a changing last-bend race order, model an official's decisions, or let users choose exchange points or check marks. The preset formation keeps team order stable.

## Steeplechase and hurdles

The 3000 m steeplechase uses the facilities manual's inside-water layout, with an initial section without jumps and seven obstacle laps. Each obstacle lap has four ordinary barriers and one water jump: 28 ordinary-barrier clearances and 7 water jumps in total. The nominal obstacle lap is 396.0849 m. Tangent constructions reconcile rounded source coordinates. The 3.8 m diversion pavement width is selected for this drawing; it is not a mandatory width inferred from the figure's similarly numbered water-jump position.

The water-jump geometry includes a 3.66 m by 3.66 m footprint, including its barrier, and a selected 0.50 m deep section followed by a sloping bottom. The view is orthographic. Athlete tokens do not jump vertically, collide with hurdles, experience water resistance, or lose speed during clearance.

Gender metadata is not a separate configuration or performance model. The 100 m hurdles metadata uses senior women's specifications; 110 m hurdles uses senior men's specifications. The 400 m hurdles entry stores one 0.914 m height value. Height is not visualized in this top-down model. Full men's, women's, U18, and U20 apparatus configurations are not implemented; mixed relays are absent.

## Motion and race clock

All presets use a **10 m/s cruise speed** so distance and lane-path comparisons share a common scale. This is a presentation convention, not realistic pacing across disciplines. A 10,000 m demonstration must not be interpreted as a feasible race prediction.

The common race clock integrates smooth launch and post-finish velocity ramps. Baseline launch and stop durations are 2.4 seconds. Each route maps the clock to measured planar arc length, including bends and merges. Launch durations can be extended to establish clearance before athletes reach the common cruise speed. The shared stop begins after the last athlete crosses the finish.

Quintic transitions smooth merges, receiver acceleration, transfers, and retirement. Formation gaps, at least 0.7 m of finish-clock separation in shared-track fields, lane-centre placement, receiver approach offsets, and retiring-runner fans are display parameters. They are not official spacing requirements, calibrated biomechanics, or emergent tactics. The route after a break line illustrates one choice; the rules do not mandate that exact path.

## Research and tactical scope

The current implementation supports visual reasoning about spatial race structure: starts, staggers, available track space, lane restrictions, exchange zones, and selected routes. Deterministic playback and geometry hooks provide a reproducible base for code experiments. `TrackMath`, `TrackApp.getState()`, and `render_game_to_text()` are inspection/debug interfaces, not a stable scenario API.

The application does not currently provide:

- Editable athlete abilities, pace plans, lineups, exchange points, or scenario save/load.
- Calibrated reaction times, fatigue, drafting, wind, environmental effects, or athlete biomechanics.
- Autonomous tactics, overtaking decisions, contact/collision dynamics, or live pack-position competition.
- Race-data import, video/tracking calibration, experimental comparisons, or result/statistics export.
- Automatic decisions for false starts, lane infringements, obstruction, dropped batons, invalid exchanges, disqualification, or photo-finish torso placement.
- Heats, rounds, qualification, or a complete competition-management workflow.

These limits define the current release, rather than commitments to implement future features. For geometry or motion changes, verify source-derived values separately from rendering and interaction behavior. Numerical tests alone do not establish browser performance or full rules compliance.
