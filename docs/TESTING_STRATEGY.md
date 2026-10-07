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

## 10. Manual QA
Interaction (drag/drop, resize, rotate), guides/snapping, keyboard shortcuts, accessibility, UX flows ([USER_WORKFLOWS.md](USER_WORKFLOWS.md)); a checklist per phase.

## 11. Rules
Run relevant checks before declaring a phase done; report failures verbatim; don't skip silently; don't mark fixture tests as passing when fixtures are absent.
