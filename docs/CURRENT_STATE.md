# Current State

_Last updated: 2026-10-06 (end of Phase 3B)_

## Project status
The app has a vendor-neutral domain model, native `.boothproject` persistence, and now a **production canvas foundation**: a Konva/react-konva editor canvas over a Zustand store with pure mutations, snapshot undo/redo, transform normalization, snapping, text overlay editing, project-image loading and an exact-size offscreen render API. The UI is a **temporary editor shell** (toolbar + canvas + status bar) — no layers panel, properties panel, asset browser, wizard or dashboard. No DSLR Booth importer/exporter exists.

## Current phase
**Phase 3B — Production canvas foundation: COMPLETE.** Phase 4 has **not** begun; awaiting owner approval.

## Completed
- Phases 0–3A (see [ROADMAP.md](ROADMAP.md)); Konva chosen in ADR-029.
- Phase 3B: `src/canvas/` (geometry, viewport, snapping, transforms, rendering, adapters, image cache), `src/editor/` (mutations, history, store, ports), `src/renderer/src/editor/` (EditorCanvas, TextEditOverlay, keyboard, EditorScreen, asset loader), `project:readAsset` IPC with `ProjectService.readAsset`, a realistic 4×6 @600 DPI sample project for validation, `Layer` tree helpers in the domain. The Phase 3A spike code was removed (history keeps it); Fabric is gone. ADRs 030 (editor store), 031 (undo/redo), 032 (image bridge); ADR-013 updated (Zustand accepted).

## Verified (this phase)
`npm run typecheck`, `lint`, `format:check`, `build`, `npm test` passed; test count in the final report. The built Electron app was validated on macOS by **scripted real mouse/keyboard events over the DevTools protocol** (not by a person): 53/53 checks — create sample, render, select, drag, resize, rotate, off-canvas, undo/redo, lock/hide, duplicate/delete, arrow nudge, zoom (buttons, ctrl+wheel, pan), snapping guides, group move, text edit (Enter/Escape/blur), text resize, save, close, reopen with identical geometry and asset, exact 2400×3600 / 1200×1800 / 2×6 1200×3600 renders with printable-only content, no Node access in the renderer. Scripts and results: `research/editor-validation/`.

## In progress
Nothing.

## Not started
Layers/properties panels, asset import and library, palette UI, badge builder, templates, recipes, DSLR Booth importer/exporter, preflight, project wizard/dashboard, final styling.

## Deferred persistence UX (do not lose track)
- **Window close / app quit with unsaved changes is still unprotected** (`ProjectService.shutdown` keeps only dirty sessions on disk; there is no prompt or recovery UI).
- Replacing or closing the open project now asks via `window.confirm` when dirty (small, interim); the main process closes the previous session when a new project is adopted.
- Autosave timer: not implemented (the editor writes the working manifest after each committed change, latest-wins, which does not rebuild the package).
- Crash-recovery listing/UI: not implemented.

## Open decisions
ADR-012 SQLite scope; ADR-014 final render/export approach (Konva offscreen render proved exact; confirm for DSLR export in Phase 12–14); ADR-015 fonts.

## Known risks
- DSLR Booth semantics still unknown for several fields ([analysis §25](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); Windows-only booth software vs macOS development; Windows untested for persistence and canvas.
- Konva cannot run under Vitest (native canvas in Node), so rendering/interaction rely on scripted app runs rather than CI tests.
- Large images cross IPC as bytes (ADR-032); revisit for very large assets.
- Strict schema: every model change needs a version bump and migration. Vite held at 7 (ADR-016).

## Known limitations of the canvas foundation
Single selection only (state is multi-select-ready); no rulers or custom guides (the overlay layer is ready); no equal-spacing snapping; group rotate/scale commit logic exists and is unit-tested with fake nodes but was not exercised by the scripted run (group drag was); text overlay is basic (no rich styling, textarea height can exceed the glyph box); image `fit` supports cover/contain/stretch only; photo preview mode exists (toggle) but no sample-photo library; text node height is measured by Konva and written back to the domain as advisory; line shapes are horizontal through the box centre; no multi-line `Backspace` guard beyond ignoring typing fields; dev-only env overrides and the `#debug` hook exist (no extra privileges).

## Housekeeping
`AGENTS.md` stays git-ignored. No Git remote exists (intentional). DSLR Booth fixtures are private and unchanged. Generated screenshots are git-ignored.

## Next recommended action
Owner reviews Phase 3B and approves Phase 4 (layers panel and the remaining layer-management tools), then schedules window-close protection, autosave and recovery once the panels exist.
