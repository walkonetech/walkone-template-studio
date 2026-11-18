# DSLR Booth Compatibility — Research Plan

**This document is a compatibility plan plus observed evidence, not a DSLR Booth specification.** Five real exports in `tests/fixtures/dslrbooth/source/` were analyzed (2026-10-06); full evidence is in [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). "Observed" below means present in those five files only; it does not mean formally required. Sections 2–3 still list the original hypotheses/unknowns; §1a records which were resolved. Related: [DATA_MODEL.md](DATA_MODEL.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md), [DECISIONS.md](DECISIONS.md) ADR-003, ADR-008.

## 1. Known observations
Reported by the project owner (treated as **Confirmed by owner**, not independently verified):
- Target software is LumaSoft DSLR Booth / LumaBooth for Windows.
- DSLR Booth can export a template as a ZIP, and import such a ZIP onto another booth computer.
- The ZIP contains a `template.xml` and referenced image assets.
- Existing exports were supplied by the owner and have now been analyzed (see §1a).
- Templates are normally rebuilt in DSLR Booth from exported PNG layers, with photo placeholders configured in its editor.

## 1b. dslrBooth 7.48 runtime findings (external, owner-reported)
**Confirmed via external clean-room runtime research reported by the owner; not independently reproducible from repository fixtures.** Summary only; details and labels in [../research/DSLRBOOTH_748_RUNTIME_FINDINGS.md](../research/DSLRBOOTH_748_RUNTIME_FINDINGS.md): native 2×6 with `print_2_per_page=True` yields `_1x` (one strip; used for gallery, email, SMS, QR, LumaShare) and `_2x` (two-up 4×6; used for printing); photos are centred Cover, rotated clockwise after the crop, borders grow outward, PhotoNumber 1–12; images map `KeepAspect` True → fit, False → stretch; transparent PNG overlays work; text has newlines but no wrapping, clips, `FontSize=0` auto-fits, missing fonts silently fall back. Printer finishing (2-inch cut) belongs to the printer/driver, not the template (**Needs Validation** on the DNP printer, as is the `/print` endpoint). Used by Phase 6B; validated by Phase 6C.

## 1e. Phase 6C observations (dslrBooth 7.48.0903.1, Windows 11, DNP DS-RX1; ADR-050)
**OBSERVED at runtime or in files dslrBooth wrote; code-derived conclusions are not recorded here.** Details: [../research/PHASE_6C_RESULTS.md](../research/PHASE_6C_RESULTS.md).
- dslrBooth **accepts** Template Studio's native 2×6 (`Dimensions="0"`, `print_2_per_page="True"`, 1:3 canvas) and its 4×6 sheet: right paper, dpi, two-up switch, layers and slot boxes. For a non-1:3 canvas the two-up switch is hidden.
- A live session matches Template Studio's design outside the photo slots (mean 1.2/255). Photos fill their slot (centred cover); rotation is **clockwise about the slot centre**; `Thickness` borders grow **outward**.
- `_1x` = one strip; `_2x` = two equal strips side by side, no gutter (300 and 600 dpi).
- **Re-import always creates a copy** with a new Id ("… Copy1"); a template is never replaced in place.
- `preview.png` is **optional**: without it the template imports and runs, but its picker thumbnail is blank.
- `Dimensions` is the unit dslrBooth's editor displays (0 px, 1 in, 2 cm); geometry stays in pixels.
- On import dslrBooth renames image layers to their file names, adds `IsVisible`, rewrites `OriginalDevice`, keeps `IsLegacy="True"` and saves at once.
- **Live `<Text>` elements exist** in real templates made in dslrBooth's editor (seen in two owner templates; none of the five repository fixtures has one). Attributes seen: `Text`, `FontName`, `FontSize`, `FontColor`, `IsBold`, `IsItalic`, `TextHorizontalAlignment`, `Rotation`. Units and rendering are **Unknown** until a real sample is in the fixtures.
- Printing: the `_2x` sheet goes to the DNP as one borderless page; the 2-inch cut is the driver's `CUT_2INCH` setting in the print settings dslrBooth saved, not a template value.

## 1c. Exporter (Phase 6B, ADR-047)
`src/export/dslrbooth/` writes dslrBooth 7.48 template ZIPs. Mapping (data-driven, test-covered):

| Template Studio | dslrBooth | Status |
|---|---|---|
| Photo slot (number, box, rotation) | `<Photo PhotoNumber Left Top Width Height [Rotation]>` integer px, whole degrees | Format CONFIRMED FROM FILE; rotation clockwise about the centre OBSERVED (6C) |
| Slot frame (inside the box) | drawn into the `<Image>` above the photo; `Thickness="0"` | exact by construction (borders would grow outward natively) |
| Slot corner radius | rounded-corner mask in the `<Image>` above (what lies beneath) | exact by construction (no corner attribute exists) |
| Slot fit Cover / Fit / Stretch | always Cover (dslrBooth fills) | Fit/Stretch warn |
| Images, shapes, text, groups, background | flattened into full-canvas PNG `<Image>`s by stacking order | text always raster (fonts not needed on the booth PC) |
| Canvas colour | `BackgroundColor="#AARRGGBB"` + the opaque base image | — |
| 2×6 strip on a two-up 4×6 | native strip canvas, `print_2_per_page="True"` (default) / 4×6 sheet with duplicated elements (fallback) | native strip ACCEPTED by dslrBooth 7.48 (6C) |
| Project name | `Name` = ZIP stem | as in every fixture |

Root values written: `Dimensions="0"` (or an imported template's own editor unit, 6C C2), `IsLegacy="True"`, `PrintToSecondaryPrinter="False"`, `LastSavedDate` (local, US format), stable 25-character `Id` (project + variant), `OriginalDevice="WalkOneTemplateStudio"`. Elements: observed defaults (Opacity 100, shadows off, KeepAspect True, StrokeColor default), `IsLocked="False"`. Encoding and ZIP layout as in §1a. **Validated in 6C (§1e):** import into the real 7.48 install, native strip sharing/printing (`_1x`/`_2x`), `Dimensions` on a strip canvas, rotation pivot, re-import (always a copy), preview (optional). **Still open:** the physical cut/trim readout and the booth PC's own printer settings.

## 1d. Importer (Phase 6D, ADR-048)
`src/import/dslrbooth/` (pure) + `src/projects/dslrImport.ts` (ZIP reading). Mapping (test-covered):

| dslrBooth | Template Studio | Status |
|---|---|---|
| `Width`/`Height`/`Resolution` | canvas inches = px / Resolution, DPI | CONFIRMED FROM FILE |
| `BackgroundColor="#AARRGGBB"` | canvas colour `#rrggbb[aa]` | CONFIRMED FROM FILE |
| `<Photo>` PhotoNumber, box, Rotation, Opacity/100, IsVisible, IsLocked | photo slot, Cover, same values | format CONFIRMED; centre pivot OBSERVED (6C) |
| `<Photo Thickness>0 StrokeColor>` | inside frame, slot grown by Thickness (borders grow outward) | Assumption (never seen non-zero) |
| `<Image ImagePath KeepAspect>` | image layer + asset; True → Fit, False → Stretch | runtime findings |
| `ZIndex` | stacking order (higher in front) | LIKELY (fixtures) |
| `print_2_per_page="True"` (portrait) | two-up 4×6 output | runtime findings |
| two strips repeated on a 4×6 sheet | one 2×6 strip printed two-up (default when the copies match) or the sheet as is | design choice (ADR-048) |
| shadows, unknown attributes/elements, `Id`, `Dimensions`, `IsLegacy`, … | kept verbatim in `sourceCompatibility.dslrbooth` + report | preserved; `Dimensions` (editor unit) written back on export (6C C2) |
| live `<Text>` | **not imported yet** (6C C1): kept in `sourceCompatibility.dslrbooth`, `live-text` warning quoting the text; missing on export | editable import planned once a real sample exists (ADR-050) |
| `OriginalDevice` | dropped (privacy), reported | — |
| `preview.png` | shown in the import dialog only | — |

Measured (validate-import.js, built app): every fixture imported as is renders as close to its own `preview.png` (outside photo boxes) as a direct Python rebuild of the XML does (mean difference 1.5–4.3 of 255; the residue is dslrBooth's own resampling); every photo slot exports back to its original box.

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

## 16. Long-term role of this adapter (ADR-049, planning only)
dslrBooth compatibility is the **migration path**, not the destination. Now: Template Studio exports to (6B) and imports from (6D) dslrBooth 7.48. Later: Template Studio also exports a native WalkOne Booth template/runtime package (format not designed). Once WalkOne Booth is the primary runtime, this adapter stays as **legacy interoperability** (importing old templates, supporting booths still on dslrBooth). It is never the internal format, and `TemplateProject` is never reshaped around dslrBooth. Research into dslrBooth behaviour stays **clean-room** (observable behaviour, outputs and files only; no copied code, assets or branding). See docs/PRODUCT_ECOSYSTEM.md §7.
