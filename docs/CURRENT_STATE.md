# Current State

_Last updated: 2026-10-06 (end of Phase 3A)_

## Project status
Electron + React + TypeScript shell, a tested vendor-neutral domain model, a working native project lifecycle (`.boothproject`), and a completed canvas technology evaluation. There is still no production editor canvas, DSLR Booth importer/exporter or asset library. The home screen carries temporary project-lifecycle diagnostics; `#canvas-spike` in the renderer URL opens the experimental Konva harness.

## Current phase
**Phase 3A — Canvas technology evaluation: COMPLETE. Konva + react-konva chosen (ADR-029).** Phase 3B (production canvas foundation) has **not begun**; awaiting owner approval.

## Completed
- Phase 0 docs; Phase 1 shell; fixture research; Phase 2 domain model; Phase 2B persistence ([ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §6).
- Phase 3A: both engines built against the same domain-built 2400×3600 scene and driven with real mouse events on macOS; full findings, scored matrix and reasoning in [../research/CANVAS_LIBRARY_EVALUATION.md](../research/CANVAS_LIBRARY_EVALUATION.md). Konva 10.7.1 + react-konva 19.3.0 retained; Fabric removed from dependencies and code (git history `2349f7f`). Retained experimental reference code in `src/renderer/src/spikes/canvas/` (Konva engine, harness, pure `geometry`/`viewport`/`snap`/scene helpers + 32 unit tests).
- Decisions: ADR-011 resolved, ADR-029 added ([DECISIONS.md](DECISIONS.md)).

## Verified (this phase)
`npm run typecheck`, `lint`, `format:check`, `build` passed; `npm test` passed with **141 tests** (109 + 32 new). The built app launched on macOS: shell ping OK, renderer without `require`/`process`, spike harness mounted, 2400×3600 export produced.

## In progress
Nothing.

## Not started
Phase 3B canvas foundation; editor state store; layers panel; photo workflow; text/shape tools; palette UI; badges; asset library; templates; recipes; DSLR Booth importer/exporter; preflight.

## Deferred persistence UX (do not lose track)
Unsaved-changes prompt on close/quit; autosave timer; crash-recovery listing/UI. `ProjectService.close` still deletes the session regardless of unsaved changes. Scheduled for after meaningful editor interaction exists (see [ROADMAP.md](ROADMAP.md) Phase 3B notes).

## Open decisions
ADR-012 SQLite scope (not needed so far); ADR-014 preview/export render approach (Konva export proved exact at design size; confirm in Phase 12 with the DSLR exporter); ADR-015 fonts. See [DECISIONS.md](DECISIONS.md).

## Known risks
- DSLR Booth semantics still unknown for several fields ([analysis §25](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); Windows-only booth software vs macOS development.
- Windows is untested for the persistence atomic-replace fallback and for the canvas.
- Konva has no built-in inline text editing; an HTML overlay is needed. If rich on-canvas text editing becomes core, ADR-029 can be revisited (only the adapter is engine-specific).
- React 19 `react-hooks/refs` lint conflicts with react-konva's ref-closing handlers; a stable-callback pattern is needed in 3B.
- Strict schema: every model change needs a version bump and migration. Vite held at 7 (ADR-016).

## Known limitations of the evaluation
Scripted real-mouse runs on macOS only (not hand-tested); HMR hot-reload, inline text editing, multi-selection, undo/redo, web fonts, trackpad gestures and Windows were not tested; memory was not measured reliably; Fabric results reflect my adapter after fixing four adapter bugs found during the spike (documented in the research note).

## Housekeeping
`AGENTS.md` stays git-ignored and untouched. No Git remote exists (intentional). Fixtures in `tests/fixtures/dslrbooth/source/` are private and unchanged. Generated spike screenshots are git-ignored.

## Next recommended action
Owner reviews the evaluation and approves Phase 3B. In 3B, promote the pure canvas modules, build the real engine/component, and then schedule the deferred persistence UX.
