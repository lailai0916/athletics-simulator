# Athletics Simulator

Follow the canonical [repository standards](https://github.com/lailai0916/lailai-template/blob/main/SETUP.md).
This file adds only project-specific implementation and verification instructions.

## Project map

- `src/`: SVG scene, event data, geometry, motion and interaction source fragments.
- `scripts/assemble.cjs`: the single fragment manifest, shared by builds and tests.
- `scripts/build.cjs`: produces the self-contained `dist/index.html` artifact.
- `scripts/serve.cjs`: local development and static preview server.
- `tests/`: deterministic geometry, motion, rendering and input regression checks.
- `docs/`: model assumptions, references, development contracts and browser evidence.

## Commands

Use Node.js 22 or later. The application has no third-party runtime dependencies.

```bash
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

Run `npm run format` after edits and run `npm run check` before submitting them.
Repository standards are checked externally at the reviewed revision pinned in CI.
Do not copy the shared checker or standard into this repository.

## Implementation contracts

Geometry uses metres; physical time uses seconds. The race-clock distance and an
athlete's measured path distance are distinct. Preserve the shared cruise speed,
continuous relay handovers and legal course distances when changing routes.

Keep the complete permanent marking set independent of the selected event.
Preserve camera pan/zoom on event changes and timeline input. Following an athlete
locks manual panning, permits zoom and survives playback toggles.

Keep the page visual-first: floating controls, no explanatory panels or guide arrows.
Add public-facing text through `src/locale.js`, including accessible names, in English
and Simplified Chinese. Keep source filenames in English ASCII.

Preserve `BOOTSTRAP`, `BOOTSTRAP_END`, and `TRACE_SEGMENTS` diagnostic markers.
Use these explicit markers when test harnesses need internal state. Do not
parse another test's source or depend on historical snapshots. Tests must not mutate
tracked files. Verify visual changes in a real browser at narrow and wide sizes;
DOM stubs cannot establish Safari performance or exact font rendering.

Update both language versions of affected documentation. Cite a primary rule source
and its edition for rule changes; distinguish a regulatory requirement from a
rendering or demonstration choice. Do not claim certification or prediction accuracy.

Preserve unrelated work. Commit messages use Conventional Commits and contain no
automated authorship or promotional signatures.
