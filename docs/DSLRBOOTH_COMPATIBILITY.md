# DSLR Booth Compatibility — Research Plan

**This document is a compatibility plan plus observed evidence, not a DSLR Booth specification.** Five real exports in `tests/fixtures/dslrbooth/source/` were analyzed (2026-10-06); full evidence is in [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). "Observed" below means present in those five files only; it does not mean formally required. Sections 2–3 still list the original hypotheses/unknowns; §1a records which were resolved. Related: [DATA_MODEL.md](DATA_MODEL.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md), [DECISIONS.md](DECISIONS.md) ADR-003, ADR-008.

## 1. Known observations
Reported by the project owner (treated as **Confirmed by owner**, not independently verified):
- Target software is LumaSoft DSLR Booth / LumaBooth for Windows.
- DSLR Booth can export a template as a ZIP, and import such a ZIP onto another booth computer.
- The ZIP contains a `template.xml` and referenced image assets.
- Existing exports were supplied by the owner and have now been analyzed (see §1a).
- Templates are normally rebuilt in DSLR Booth from exported PNG layers, with photo placeholders configured in its editor.

## 1a. Observed in the five current fixtures (OBSERVED)
- Flat ZIP, deflate; always `template.xml` + `preview.png` + referenced PNGs; no folders; no unreferenced files.
- `template.xml`: UTF-8 with BOM, CRLF; root `<Template Name Width Height Dimensions Resolution BackgroundColor print_2_per_page PrintToSecondaryPrinter LastSavedDate Id IsLegacy OriginalDevice>` with one `<Elements>` child holding only `<Image>` and `<Photo>` elements (self-closing, no nesting).
- Geometry: integer pixels in canvas space at the template's `Resolution` (`Left`, `Top`, `Width`, `Height`); negative and off-canvas values occur. No physical inches and no orientation attribute are stored (derived: Width/Resolution).
- Seen canvases: 2400×3600@600 (×3), 1800×1200@300, 3600×2400@600. `Dimensions` is 0 except one fixture (1) — meaning unknown.
- `Photo` is a distinct element with `PhotoNumber` (1-based) and empty `ImagePath`; `Image` carries `ImagePath` (bare filename). Both share Opacity, Shadow*, Thickness, StrokeColor, KeepAspect, ZIndex, optional Rotation/IsLocked/IsVisible.
- Backgrounds, overlays, badges and frames are all plain `<Image>`; no role field.
- Two-up strips (3 fixtures) are plain duplication on one canvas, repeating `PhotoNumber` 1,2,3; `print_2_per_page` is `False` everywhere.
- `ZIndex` unique per file; XML lists elements in descending ZIndex; higher appears in front in previews (inferred).
- No text element, no enabled shadow, no non-zero border, no corner-radius attribute, no video/animation field observed.
- Assets are often authored at half size (300 DPI) and scaled 2× on a 600 DPI canvas.
- `preview.png` equals canvas size and shows numbered colored boxes for placeholders; can be older than `template.xml`.

## 2. Original hypotheses (status after fixture analysis)
- `template.xml` describes canvas size, image objects, and photo placeholders with positions/sizes. **Observed.**
- Photo placeholders are numbered and have position/size, possibly rotation, and possibly border/frame properties. **Numbering, position/size, rotation observed; border/frame attributes exist but only default values observed.**
- Images in the ZIP are PNG (possibly other formats). **PNG only observed; other formats unknown.**
- Template ZIP may contain a preview/thumbnail image. **Observed (`preview.png`, all five); whether required is unknown.**
- Coordinates are pixels in the template's own canvas (not necessarily at our DPI). **Observed (integers at `Resolution`).**
- Fonts/text may be rasterized or unsupported as live text. **Text rasterized in all fixtures; live-text support not observed (unknown).**
- Format details may differ between DSLR Booth versions.

## 3. Remaining unknowns
Resolved by fixtures: element/attribute names, coordinate system, z-order representation, two-up representation, preview presence. Still unknown (see analysis §15, §25): meaning of `Dimensions`, `IsLegacy`, `print_2_per_page`, `PrintToSecondaryPrinter`, `Id` rules, rotation pivot, `KeepAspect` on photos, shadow/border units, other element types, version markers, tolerance for missing/changed BOM/CRLF/preview, canvas sizes beyond those seen.

Original list: Exact XML structure and element/attribute names; coordinate system and units; canvas size conventions for 4x6 / 2x6 / two-up; photo placeholder properties (rotation, corner radius, border, shadow); layering/z-order model; text handling; supported image formats and transparency; preview file naming/size; required vs optional files; version markers; encoding; behavior for 2x6 two-up; how DSLR Booth reacts to unknown/invalid content; whether import validates; license/terms about format reverse-engineering (**Needs Validation** — review before commercial use).

## 4. Compatibility goals
1. Import real exports into an editable internal project with warnings for anything unmapped.
2. Export packages that DSLR Booth imports and renders correctly (verified on a real booth install).
3. Round-trip real fixtures with no silent data loss.
4. Tolerate format drift via an isolated adapter and version detection.

## 5. Importer responsibilities (`DSLRBoothImporter`, Proposed)
Safe ZIP extraction (path traversal/zip-slip, size and entry limits) → locate and parse `template.xml` (fast-xml-parser candidate) → resolve referenced assets → map recognized elements to `TemplateProject` → record unmapped elements/attributes in `preserved` and `importReport` → never throw away data silently → return a result object (project + warnings + errors).

## 6. Exporter responsibilities (`DSLRBoothExporter`, Proposed)
Convert `TemplateProject` to the DSLR Booth structure → render raster assets deterministically → generate `template.xml` → generate preview if required → package ZIP → self-validate by re-importing/inspecting → report features that cannot be represented (flattened or dropped) before writing.

## 7. XML mapping strategy
Update: the observed attribute list is in [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md) §2, §17, §20–21. Mapping tables remain to be written as data-driven code in Phase 13/14.

Mapping tables will be created **after** fixture analysis, as data-driven, test-covered code. Internal types never import adapter types. Mapping documented here as confirmed rows only (table to be added: DSLR element/attribute | meaning | internal field | status).

## 8. Unsupported feature strategy
Classify each internal feature as: *native* (maps directly), *rasterized* (baked into an image asset), or *unsupported* (warn). Preflight surfaces this before export. Editable features that must be flattened (e.g., live text) are rendered into assets with a warning.

## 9. Preservation of unknown values
Importer keeps unknown XML nodes/attributes verbatim in namespaced `preserved` data. Exporter re-emits them only when safe and known-valid for the target version; otherwise reports. Policy: warn, don't drop.

## 10. ZIP packaging
To determine: file layout, naming, compression, required entries, ordering, timestamps. Exporter output should be byte-deterministic given the same project (stable ordering, fixed timestamps) — **Proposed**.

## 11. Preview generation
Whether a preview is required and its size/format is **Unknown**. Preview will be produced from the same render pipeline as export.

## 12. Fixture strategy
Real exports copied (by the owner) into `tests/fixtures/dslrbooth/`, one directory per template, with the original ZIP untouched plus (later) an extracted copy and a notes file stating DSLR Booth version, template description, and any client-sensitive content removed. Never fabricate or hand-edit fixtures except clearly labeled derived test cases. Golden expectations (parsed JSON snapshots) are generated only after human review.

## 13. Round-trip tests
(a) DSLR ZIP → internal → DSLR ZIP: structure/semantic equivalence to the original (byte-equality not assumed). (b) internal → DSLR → internal: lossless for supported features. (c) Manual: import exported ZIP in real DSLR Booth and compare render. See [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## 14. Version compatibility concerns
Format may change between DSLR Booth releases; fixtures should record the originating version; importer should detect version markers (if any) and warn on unknown versions; exporter should target a named, tested version profile. Windows-only target while the editor runs on macOS means export validation requires a Windows test machine/VM (**Risk**).

## 15. Future discoveries
Record in research notes first, then update sections 1–3 and 7, ADRs if architecture changes.
