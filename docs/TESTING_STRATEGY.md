# Testing Strategy (Proposed)

Unit tests run on **Vitest** (`npm test`; ADR-019), covering the domain model (print math, composition, layers, serialization, validation, compatibility metadata). Component/E2E tooling (e.g., Playwright) is not chosen yet. No fixture-based tests exist yet; importer tests belong to Phase 13.

**Phase 4 tests** add the panel order (reverse of canvas paint order, tie-breaking, nested groups, collapse, filter, inherited flags, 50 layers), selection helpers (toggle, range, topmost), numeric/hex parsing, new-layer defaults (new photo = next slot, duplicate = same slot), rename/reorder/group/ungroup mutations, idempotent edits, store actions for multi-selection, bulk edits, UI-state exclusion from history/dirty, and `describePrint`/`transformTargets`. React components have no unit tests (no DOM test environment); they are covered by the scripted app run (97 checks: panel/inspector interaction through real events, an accessibility name/label scan, 50+ layer scrolling, save/reopen of names, locks, visibility, order and photo numbers, plus Phase 3B regression checks).

**Phase 3B tests** cover transform normalization (resize, rotated resize, negative coordinates, minimum size, 1000-cycle drift), viewport/zoom math, snapping, node specs for every layer type, photo drawing with a recording context, render plan (exact output sizes, printable-only content), image cache, adapters with duck-typed Konva nodes, all project mutations (group, duplicate, z-order, photoNumber), history, and the editor store (dirty state, working-copy write-through, undo/redo, locks, viewport exclusions) through a fake `EditorPorts`. Konva itself is not run under Vitest (it needs a native canvas in Node); real rendering, interaction, export size and persistence were validated by scripted real-mouse runs of the built app (`research/editor-validation/`, 53 checks).

**Canvas pure-logic tests (Phase 3A)** in `src/renderer/src/spikes/canvas/shared/__tests__/`: center-box conversion, scale normalization, matrix → domain geometry (including removing the view transform), viewport fit/zoom/round-trips, snapping, spike scene validity and cover-crop math. Interaction and export fidelity were validated by scripted real-mouse runs (`research/canvas-spike/`), not automated in CI.

**Persistence tests (Phase 2B)** live in `src/projects/__tests__/` and run against temporary directories created per test (never inside the repo). They build packages dynamically (through the real writer, or a small raw-ZIP builder for hostile/malformed archives: traversal, absolute and drive paths, links, duplicates, case collisions, unexpected files/folders, bad manifests/versions, size/checksum mismatches). Atomic-save failures are simulated by injecting a failing `rename`. Handler tests use fake dialogs, covering cancellation, validation and error mapping without GUI automation. Manual macOS validation drives the built app over the DevTools protocol with dev-only dialog overrides. Windows behavior is untested. The real DSLR Booth ZIPs are not used for native persistence. Honest reporting is mandatory ([CLAUDE.md](../CLAUDE.md)).

## 1. Unit tests
Calculations (inches↔px, DPI rescale, rounding), schema conversion and migrations, project serialization, palette logic (role resolution, extraction), coordinate/transform math, XML conversion, preflight rules, photo numbering.

## 2. Golden DSLR Booth fixtures (emphasis)
Real owner-supplied exports live in `tests/fixtures/dslrbooth/` ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md) §12, ADR-008).
- Never fabricate or silently edit fixtures; derived cases are labeled.
- Each fixture records DSLR Booth version and description.
- Importer tests assert on parsed internal-model snapshots (reviewed by a human before being accepted as golden) and on the warnings list.
- Fixtures may contain client data/licensed images: review before committing; consider keeping sensitive ones out of the repo (Needs Decision).
- The directory is empty until the owner supplies files; fixture tests are skipped (not faked) when absent.

## 3. Round-trip compatibility
DSLR ZIP → internal → DSLR ZIP; compare semantically (object count, placeholders, positions/sizes, assets, unknown-preserved data), not by assuming byte equality. Internal → DSLR → internal must be lossless for supported features. Final truth: manual import into real DSLR Booth.

## 4. Visual / rendering regression
Known project → expected PNG. Compare with a tolerance policy (pixel diff threshold) and review diffs. Baselines per platform if rendering differs (fonts, antialiasing). Covers frames, text, palette changes, sample-photo preview.

## 5. Serialization and schema migrations
Every `schemaVersion` bump ships a migration + a stored sample project at the previous version; tests load old samples and compare to expected upgraded output. Test newer-than-supported files are rejected safely; unknown fields preserved.

## 6. Export determinism
Same project → identical outputs (files, ordering, timestamps normalized, hashes). Tests run export twice and compare; ZIP entry order and metadata fixed.

## 7. Image resolution validation
Tests for effective-DPI computation and threshold warnings, upscaled-image detection, alpha handling, and large-canvas memory behavior.

## 8. Integration tests
Project save/open (atomic write, recovery), asset import/copy-into-project, import/export end to end, ZIP safety (zip-slip, bombs, malformed XML), IPC validation.

## 9. Cross-platform behavior
Run core suites on macOS and Windows (CI later). Check path handling, filename case/illegal characters, line endings, fonts, Sharp/native module loading, HiDPI. Windows is also where DSLR Booth runs, so final export validation is manual on Windows.

## 9b. Persistence safety (Phase 4B)
Unit: `CloseCoordinator` decision table (all reasons, failed/cancelled save, dedupe), autosave scheduler with fake timers, store autosave/guard/recovery actions, `scanRecovery` (clean/untouched removal, corrupt and expired quarantine, retention purge, owner-token skip, conflicts, missing assets), service `recover`/`discardRecovery`/`closeAll`, handler validation and no path leakage. Scripted (built Electron, DevTools protocol, SIGKILL + relaunch on the same user-data dir): `research/editor-validation/validate-4b.js`, 40 checks. It is automation, not human testing; native dialogs are answered through dev-only env overrides, so real dialog rendering and a physical Cmd+Q keypress still need a human pass.

## 9c. UI logic and visual system (Phase 4C)
Unit: command model (enablement, checkable items, shortcut labels and `commandForKey` matching for every menu shortcut), panel/drawer layout clamps and the minimum-window workspace width, welcome decisions (relative time, preset labels), tool-rail state transitions (planned tools never change state), and **design-token contrast** (WCAG AA for text on every surface, focus ring ≥ 3:1, minimum type size, spacing/radius scale). No CSS snapshot tests. Scripted (built Electron, real mouse/keyboard): `validate-4c.js` (welcome, menus, dialogs, recents, inspector edits, Layers actions, zoom/snap/preview, shortcuts and input protection, Tab traversal with focus-ring check, recovery Decide later / Discard / Recover, autosave issue, 1100×680 / 1280×800 / 1440×900 / 1920×1080 overflow and minimum-pane checks), plus the adapted Phase 4 (`validate.js`) and Phase 4B suites as regression. Automation cannot judge visual design: the owner reviews the screenshots in `research/editor-validation/shots/`.

## 10. Manual QA
Interaction (drag/drop, resize, rotate), guides/snapping, keyboard shortcuts, accessibility, UX flows ([USER_WORKFLOWS.md](USER_WORKFLOWS.md)); a checklist per phase.

## 11. Rules
Run relevant checks before declaring a phase done; report failures verbatim; don't skip silently; don't mark fixture tests as passing when fixtures are absent.

## 9d. Project assets and image import (Phase 5A)
Unit (Vitest, 89 tests): format sniffing/headers for PNG (alpha, tRNS), JPEG, WebP (lossy/lossless/extended) and SVG; damaged/oversized/unsupported files; the SVG policy (11 unsafe cases, safe cases, no false positives); service import (copy into session, source deleted afterwards, per-file failures, content-over-extension, id-based names, dedup incl. same-name/different-content and undo/redo reuse, missing-file re-import); package round trip on a second "machine", Save As, crash recovery and orphan pruning; handler shape validation (no path-taking handler); effective-DPI math and thresholds; initial sizing; drop-point conversion at several zooms/pans; asset mutations (shared assets, in-use removal refused, background, replace, original size); store behaviour (one undo step per import, redo/undo, autosave, closed-project guard). Real-pixel checks cannot run under Vitest (no canvas), so transparency and stacking are verified in the built app: `research/editor-validation/validate-5a.js` (53 checks, `results-phase5a.json`) drives real pointer events, native-dialog overrides, synthetic DataTransfer drops, SIGKILL + relaunch recovery, and samples pixels of the exact-size render. Automation only; a human visual check is still owed.

## 9e. Print composition and arrangement (Phase 5B)
Unit (41 tests): preset dimensions (4×6 single; 2×6 @300/@600 design, sheet, cell origins; gap and DPI derived from physical size), composition (translation per copy, all layer types, rotation/opacity/role/photoNumber/asset/text/group preserved, deep-frozen source unchanged, one asset record, PhotoNumbers 1-2-3 once and repeated on the sheet, 4×6 composes to itself), clipping per cell, cut guide position/label and its absence from layers, view mode (not dirty, no history, read-only preview, single-up never previews, resets on open), status text, New Project choices and wording, command enablement, exact X/Y (multi, group, locked, group+child), align (6 modes, canvas/selection, rotated bounds), distribute (equal gaps, outer items fixed, order independent, needs 3), undo/redo and dirty, nudge constants and equal distance at 20/100/400% zoom. Built-app: `validate-5b.js` (39 checks, `results-phase5b.json`): real clicks in the New Project dialog, 2×6 artboard, photos, imported transparent graphic, Print Preview pixel checks of the exact 2400×3600 sheet (both copies; all 8.6M pixels of the two halves compared: ≤1/255 gradient rounding in a handful of values), cut guide absent from pixels, read-only preview, source edit updates both copies, real Arrow/Shift+Arrow at four zooms, exact inspector X/Y, align, distribute, group X, undo/redo, save/reopen, keyboard-operable switch, 4×6 without a switch. Automation only.

## 9f. Photo preview, precision canvas and tooltips (Phase 5C)
Unit (88 new tests): photo placement/crop math (cover/contain matrix for portrait/landscape/square/same-aspect, slack, drag, zoom, clamps, reset), frame/corner clamps and drawing via a recording 2D context (rounded clip order, radius 0/moderate/large/beyond half, frame none/solid/thickness/colour, number/label only in placeholder mode, "#n" tag editor-only), `specFor` preview policy (no lookup → placeholder, production never supplies samples, both two-up copies resolve identically), artboard clipping geometry, axis lock (dominant axis, jitter threshold, stability, release, ties, zoom-scaled threshold, snap restriction), sample mapping by PhotoNumber/shuffle/reset, store (overflow/preview/shuffle/crop never dirty or in history; Reposition begin/commit/cancel/leave; crops keyed by layer so copies share them; resets per project), zoom (range, Fit, 100%, pointer-centred, geometry-independent, Print Preview), Space-pan eligibility, tooltips/commands (hints complete, shortcuts equal the command definitions and trigger them), off-artboard geometry (valid, never clamped by group/move/align/duplicate), and persistence (save, Save As, second machine, autosave + recovery; preview-photo picker returns bytes and no path). Real-pixel behaviour runs in the built app: `validate-5c.js` (59 checks, `results-phase5c.json`): overflow visible vs clipped (stage pixels), exact design/sheet render clipping, real mouse/key events for Shift lock at three zooms, jitter, mid-gesture Shift release, snap interaction, multi-select, Space pan, ctrl-wheel pointer zoom, preview/shuffle/fit/crop/frame pixels, real hover tooltips, save/reopen and SIGKILL recovery. Automation only.
