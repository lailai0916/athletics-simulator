# References and modelling choices

**English** · [简体中文](references.zh-Hans.md)

The implementation is independently written from published rules and facility dimensions. The following editions form its documented reference baseline, reviewed on 2026-10-21. This date is a review date, not a guarantee that no later rule amendment exists. Meet-specific regulations and the current governing rules take precedence in real competition.

## World Athletics sources

| Source                                                                                                                                                                                                                                                 | Relevant sections                            | Implementation use                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Competition and Technical Rules — 2026 Edition](https://worldathletics.org/download/download?filename=df5b2373-0019-4fab-9c1a-e8409ee99bef.pdf&urlslug=Competition%20and%20Technical%20Rules%20%E2%80%93%202026%20Edition)                            | TR14–17; TR19; TR22–24                       | Track measurement, starts and blocks, lanes and break lines, finish alignment, hurdles, steeplechase, relay zones and lane variants                                                 |
| [March 2026 amendments](https://worldathletics.org/download/download?filename=1878ae9f-6548-458d-91be-9aa22fb1be13.pdf&urlslug=Competition%20and%20Technical%20Rule%20Amendments%20March%202026)                                                       | TR15.1; TR22.6; TR23.6                       | Relevant revisions to block wording, hurdle displacement, and the distinction between existing water pits and new or renovated installations; not all rule procedures are simulated |
| [July 2026 amendments](https://worldathletics.org/download/download?filename=d345c869-4ecd-43b9-96d7-dfdf270d51a9.pdf&urlslug=Competition%20and%20Technical%20Rule%20Amendments%20July%202026)                                                         | CR32                                         | Reviewed update concerning U20 5000 m race-walk records; outside the current event catalog                                                                                          |
| [Track and Field Facilities Manual 2019, Chapters 1–3](https://worldathletics.org/download/download?filename=7d39b677-8043-45f4-89f4-6c8814023057.pdf&urlslug=Track%20and%20Field%20Facilities%20Manual%202019%20Edition%20-%20Chapters%201-3)         | §2.2.1, printed pp. 26–42; §2.2.4, pp. 46–51 | Standard-track geometry and measurement; start, lane and break-line construction; the inside-water-jump layout                                                                      |
| [400 m Standard Track, Marking Plan](https://worldathletics.org/download/download?filename=596848ce-6afe-4f00-8eb0-62a019ee215e.pdf&urlslug=Track%20and%20Field%20Facilities%20Manual%202019%20Edition%20-%20Marking%20Plan%20400m%20Standard%20Track) | Figure 2.2.1.6a and marking tables           | Mark widths, colours, stations, exchange-zone hooks, hurdle ticks, steeplechase position marks, and illustrated crossings                                                           |

Printed page numbers can differ from PDF viewer page numbers. For steeplechase, Figures 2.2.4.1a and 2.2.4.1d are the main facility references. TR23 and TR24 are the main obstacle-race and relay references. Zone boundaries are measured at the edges specified in TR24.3, rather than the centres of the painted stripes.

## Traceability

| Component                                     | Rule or facility basis                                          | Code                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Event catalog and selected relay variants     | TR15–17, TR22–24                                                | `src/track-data.js`, `src/track-app.js`                                                    |
| Oval, lane, start and break-line geometry     | Facilities Manual §2.2.1; TR14, TR16, TR17.5                    | `src/track-app.js`, `src/marking-precision.js`                                             |
| Finish and ground paint                       | TR19.17; marking plan and its tables                            | `src/marking-precision.js`                                                                 |
| Inside-water course and barriers              | Facilities Manual §2.2.4; TR23                                  | `src/steeple-precision.js`, `src/steeple-kerb-fragment.js`                                 |
| Relay zones and sequence                      | TR24, with selected variants described in [the model](model.md) | `src/relay-motion.js`, `src/relay-render.js`, `src/marking-precision.js`                   |
| Pace, smooth motion, formation and retirement | Implementation conventions, not prescribed race rules           | `src/race-motion.js`, `src/course-motion.js`, `src/merge-motion.js`, `src/relay-motion.js` |

Values taken from an official drawing can still be rounded. The 84.39 m straight and 36.80 m lane-1 measurement radius produce a circumference about 1.219 mm longer than exactly 400 m. The steeplechase example also publishes rounded coordinates and slightly differing rounded lap-length figures. The implementation documents its selected construction and reconciles those values; it does not claim a higher independent survey precision.

Some dimensions are selected within a rule's range; others exist only to make the drawing readable. In particular:

- Eight lanes, 1.22 m lane width, and a 0.12 m kerb are the selected facility configuration.
- The 3.8 m steeplechase diversion pavement width is a drawing choice. The 3.800 dimension in the cited detail denotes the water jump's longitudinal location, not a compulsory pavement width.
- The complete 4 × 1500 m exchange-station marking arrangement is an implementation extension using the official 20 m zone length.
- Paint layering follows the cited marking plan's illustrated conventions; line topology should not be presented as a universal paint-order regulation.
- Uniform 10 m/s pace, smooth launch/stop curves, pack gaps, fixed team order, and retiring-runner routes are demonstration choices.
- Athlete symbols, labels, equipment styling, textures, and zone highlighting are visual aids.

## Infield football references

The football field is contextual scenery. [FIFA stadium guidelines](https://inside.fifa.com/innovation/stadium-guidelines/technical-guidelines/stadiums-guidelines/pitch-dimensions-and-surrounding-areas) inform the selected 105 × 68 m pitch. [IFAB Law 1](https://www.theifab.com/laws/latest/the-field-of-play/) informs the field markings and goal dimensions. The 0.12 m line width, 2 m goal depth, 0.22 m spot diameter, and mowing pattern include project choices. The IFAB link follows its latest published web edition rather than a vendored rule snapshot. This project does not implement football gameplay.

## Use and attribution

World Athletics, IFAB, and FIFA retain rights to their publications. These links identify reference material; the repository's code licence does not relicense those documents. Official PDFs, copied diagrams, and governing-body logos are not required to build or run the simulator.

The project has no claimed governing-body endorsement or facilities certification. For use in an actual meet, verify the current rules, approved venue configuration, and competition-specific regulations. For model limitations and appropriate research use, see [Simulation model](model.md).
