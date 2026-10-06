# Testing Strategy (Proposed)

Unit tests run on **Vitest** (`npm test`; ADR-019), covering the domain model (print math, composition, layers, serialization, validation, compatibility metadata). Component/E2E tooling (e.g., Playwright) is not chosen yet. No fixture-based tests exist yet; importer tests belong to Phase 13. Honest reporting is mandatory ([CLAUDE.md](../CLAUDE.md)).

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

## 10. Manual QA
Interaction (drag/drop, resize, rotate), guides/snapping, keyboard shortcuts, accessibility, UX flows ([USER_WORKFLOWS.md](USER_WORKFLOWS.md)); a checklist per phase.

## 11. Rules
Run relevant checks before declaring a phase done; report failures verbatim; don't skip silently; don't mark fixture tests as passing when fixtures are absent.
