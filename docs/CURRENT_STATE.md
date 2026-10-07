# Current State

_Last updated: 2026-10-06 (end of Phase 4B)_

## Project status
The editor now has a functional production layout: toolbar, project rail, Konva canvas, a **Layers panel** and a **Properties inspector**, all operating on the same Zustand store and `TemplateProject`. Underneath: vendor-neutral domain model, `.boothproject` persistence with working sessions, snapshot undo/redo, exact-size render API. No DSLR Booth importer/exporter, asset library, templates, badges, palette manager or final visual design exists.

## Current phase
**Phase 4B — Persistence safety, autosave and crash recovery: COMPLETE.** Phase 4C (UI redesign) and Phase 5 have **not** begun; awaiting owner approval.

## Completed
- Phases 0–3B (see [ROADMAP.md](ROADMAP.md)).
- Phase 4: front-first Layers tree (groups, direct vs inherited lock/visibility, rename, pointer-drag reorder within a parent, stacking commands, filter, collapse), inspector for photo/image/text/shape/group and multi-selection, add layer (photo/text/rectangle/ellipse/line), duplicate/delete, group/ungroup, multi-selection (Cmd/Ctrl and Shift on canvas and panel, shared Transformer, one commit per interaction), keyboard shortcuts, status bar with canvas info, Modified/Saved indicator, platform-aware modifiers. ADR-033; UX/workflow/architecture/testing docs updated. No new dependencies; the domain model and `.boothproject` format are unchanged.

## Verified (this phase)
`typecheck`, `lint`, `format:check`, `build` and `npm test` passed (test count in the final report). The built Electron app was validated on macOS by **scripted real mouse/keyboard events over the DevTools protocol** (automation, not hand-testing): 97/97 checks covering the panel/inspector features above, an accessibility name/label scan, 50+ layers with scrolling, save → close → reopen preserving names/locks/visibility/order/photo numbers, and Phase 3B regression checks (drag, resize, rotate, off-canvas, snapping, zoom, exact 2400×3600 render, Node isolation). Details: `research/editor-validation/`.

## In progress
Nothing.

## Not started
Asset browser/library, palette manager, templates, badge builder, recipes, DSLR Booth importer/exporter, preflight, context menu, copy/paste, align/distribute, project wizard/dashboard, final styling.

## Phase 4B (done)
Native Save / Don't Save / Cancel on every close path via a main-process coordinator; debounced autosave to the working session only; session metadata with owner token; startup recovery scan (clean removed, corrupt/very old quarantined, others offered); temporary accessible recovery dialog (Recover / Discard / Decide later); conflict-aware recovery that never overwrites the portable file. ADR-034. Verified by unit tests plus 40/40 scripted checks on the built macOS app (`research/editor-validation/validate-4b.js`, **automation, not human testing**).
**State exposed for Phase 4C:** Saved/Modified (`selectDocumentState`), autosave state/last time/issue (`autosave` in the store, `#autosave-info`/`#autosave-issue`), recovery candidates (`recovery` in the store) and the dialog actions (`recoverCandidate`, `discardCandidate`, `dismissRecovery`).
**Remaining limits:** multiple windows unsupported; Windows/Linux quit and recovery paths unexercised; edits made in the last ~2 s before a crash are not recoverable; the native prompt wording and recovery dialog are temporary; a session whose `project.json` was cut mid-write is quarantined, not repaired; the scripted run answers the native prompt through dev overrides, so the real dialog rendering and a physical Cmd+Q keypress were not verified by automation.

## Open decisions
ADR-012 SQLite scope; ADR-014 final render/export approach; ADR-015 fonts.

## Known risks
- DSLR Booth semantics still unknown for several fields ([analysis §25](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); Windows-only booth software vs macOS development; Windows untested for persistence and the editor.
- Konva cannot run under Vitest and React components have no DOM test environment, so UI behavior rests on the scripted app run rather than CI tests.
- Panel layout assumes a desktop window (~1280×770 or larger); no responsive collapsing yet.
- Strict schema: every model change needs a version bump and migration. Vite held at 7 (ADR-016).

## Known limitations (Phase 4)
No context menu, no drag into/out of groups (cross-group drops are refused), no copy/paste, no align/distribute, no layer thumbnails or panel resizing; multi-selection has no inspector geometry editing (move/resize on the canvas instead); the palette-reference color UI path (show, "Use fixed color") is implemented but was not exercised by the scripted run (the sample has no palette); group opacity/rotation controls are intentionally not exposed; inspector edits on a layer whose ancestor is locked are disabled except name/locked/visible; the rename and field components are covered only by the scripted run; keyboard focus styling was not machine-verified.

## Housekeeping
`AGENTS.md` stays git-ignored. No Git remote exists (intentional). DSLR Booth fixtures are private and unchanged. Generated screenshots are git-ignored; the `#debug` hook is development-only.

## Next recommended action
Owner reviews Phase 4B (ideally by hand: quit with unsaved work, force-quit, relaunch), then approves Phase 4C (UI redesign) before Phase 5.
