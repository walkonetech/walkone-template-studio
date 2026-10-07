# Current State

_Last updated: 2026-10-07 (end of Phase 4D)_

## Project status
The editor has a redesigned, original dark-neutral interface: welcome screen, File/Edit/View menus, document title with Modified/Saved state, tool rail + drawer, canvas workspace with a floating artboard, resizable Layers + Properties column, status bar with zoom/snap/preview controls, and one accessible dialog shell. Underneath: vendor-neutral domain model, `.boothproject` persistence with working sessions, autosave and crash recovery, snapshot undo/redo, exact-size render API. No DSLR Booth importer/exporter, asset library, templates, badges or palette manager exists.

## Current phase
**Phase 4D — Focused editor polish: COMPLETE** (on top of Phase 4C, whose direction the owner approved). Phase 5 has **not** begun; awaiting owner approval.

## Completed
- Phases 0–3B (see [ROADMAP.md](ROADMAP.md)).
- Phase 4: front-first Layers tree (groups, direct vs inherited lock/visibility, rename, pointer-drag reorder within a parent, stacking commands, filter, collapse), inspector for photo/image/text/shape/group and multi-selection, add layer (photo/text/rectangle/ellipse/line), duplicate/delete, group/ungroup, multi-selection (Cmd/Ctrl and Shift on canvas and panel, shared Transformer, one commit per interaction), keyboard shortcuts, status bar with canvas info, Modified/Saved indicator, platform-aware modifiers. ADR-033; UX/workflow/architecture/testing docs updated. No new dependencies; the domain model and `.boothproject` format are unchanged.

## Verified (this phase)
`typecheck`, `lint`, `format:check`, `build` and `npm test` passed (test count in the final report). The built Electron app was validated on macOS by **scripted real mouse/keyboard events over the DevTools protocol** (automation, not hand-testing): 97/97 checks covering the panel/inspector features above, an accessibility name/label scan, 50+ layers with scrolling, save → close → reopen preserving names/locks/visibility/order/photo numbers, and Phase 3B regression checks (drag, resize, rotate, off-canvas, snapping, zoom, exact 2400×3600 render, Node isolation). Details: `research/editor-validation/`.

## In progress
Nothing.

## Not started
Asset browser/library, palette manager, templates, badge builder, recipes, DSLR Booth importer/exporter, preflight, context menu, copy/paste, align/distribute, project wizard/dashboard, final styling.

## Real-template validation (done, no code changes)
One production template (Chaney Wedding F1) was recreated through the real UI: layout skeleton, photo grid/numbering, text hierarchy and strips were reproducible (209 gestures, 15 layers); **all raster artwork was not**, because the UI has no image import. Findings, bug/friction/feature classification and P0–P3 ranking: [../research/REAL_TEMPLATE_VALIDATION.md](../research/REAL_TEMPLATE_VALIDATION.md). Biggest blockers: image asset import and any export. No bugs confirmed.

## Phase 4D (done)
Polish only (details in [../research/UI_UX_REVIEW.md](../research/UI_UX_REVIEW.md) §12): brighter label/metadata text, more visible disabled tools, quieter Konva selection outline, one-row recovery actions (Discard · Decide later · **Recover**), grouped Layers header actions with tooltips on the menu buttons, larger welcome composition, filled slider track, `:active`/hover refinements, drawer auto-collapse when shrinking would cramp the canvas. No behavior, schema, persistence or store changes. **Verified** (automation): 413 unit tests; `validate-4c.js` 97/97, Phase 4 regression 97/97, `validate-4b.js` 40/40, new `validate-4d.js` 6/6 (continuous layout sweep + computed-style facts). **Not done:** physical keyboard/close-button/frame-drag testing (the environment forbids synthetic OS input).

## Phase 4C (done)
Design tokens (`styles/tokens.css`), small component library (`renderer/src/ui`), `lucide-react` icons (the only new dependency), welcome screen with recents, New project dialog, in-app menus driven by a single command model (`editor/commands.ts`), tool rail/drawer architecture (`editor/tools.ts`, only *Design* live), top bar hierarchy, restyled Layers panel (hover actions, Arrange menu, empty states, shortcuts dialog) and Properties inspector (collapsible sections, compact transform grid, opacity slider, swatch+hex color control), status bar redesign, resizable side panels (UI-only), restyled recovery dialog and quiet autosave-issue badge, minimal native menu, minimum window 1100×680, ⌘N/⌘O/⌘0/⌘1/⌘=/⌘− wired. ADR-035; [../research/UI_UX_REVIEW.md](../research/UI_UX_REVIEW.md). No domain, schema, persistence or store-behaviour change.
**Verified:** `typecheck`, `lint`, `format:check`, `build`, `npm test` (410 tests) and three scripted built-app suites on macOS — **automation, not human testing**: `validate-4c.js` (97 checks: welcome, menus, dialogs, recents, editor flows, input edits, keyboard/focus rings, recovery Decide later/Discard/Recover, autosave issue, 4 window sizes), `validate.js` Phase 4 regression (97/97, adapted to menus), `validate-4b.js` (40/40). Screenshots (git-ignored): `research/editor-validation/shots/`.
**Not verified:** a human visual review on a real display, VoiceOver, Windows, ⌘Z on a physical keyboard with the native Edit menu, window resizing by dragging the frame (sizes were set at launch), the native `<select>` popup and OS color-picker appearance.
**Known UX limitations:** see [../research/UI_UX_REVIEW.md](../research/UI_UX_REVIEW.md) §10; notably no layer thumbnails/context menu, stacking via a menu (one extra click), placeholder Export/Templates/Photos/Assets, panel sizes not persisted, one theme.

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
Owner reviews [../research/REAL_TEMPLATE_VALIDATION.md](../research/REAL_TEMPLATE_VALIDATION.md) and approves the next phase. Recommendation: **asset import + sample photos + flattened PNG export** before roadmap Phase 5 (photo placeholders already work well).
