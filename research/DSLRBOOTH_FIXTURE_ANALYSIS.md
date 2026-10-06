# DSLR Booth Fixture Analysis

## Status
Complete for the five fixtures present on 2026-10-06. This is a **research note, not a decision** ([README.md](README.md)). Evidence labels: **CONFIRMED FROM FILE** (directly read from the fixtures), **DERIVED** (calculated from file values), **LIKELY** (interpretation that fits the evidence but is not stated in the files), **NOT OBSERVED**, **UNKNOWN**. Nothing here is a formal DSLR Booth specification. "Present in all five" never means "required".

## Research Scope
Archive layout, `template.xml`, canvas/print values, photo placeholders, image objects, text, z-order, assets, previews, two-up behavior, video-booth differences, and what each means for the internal model ([../docs/DATA_MODEL.md](../docs/DATA_MODEL.md)) and the adapters ([../docs/DSLRBOOTH_COMPATIBILITY.md](../docs/DSLRBOOTH_COMPATIBILITY.md)). No importer/exporter/parser code was written.

## Fixtures Analyzed
Enumerated from `tests/fixtures/dslrbooth/source/` (exactly 5 ZIPs; no other files). Short IDs F1–F5 are used below (alphabetical order).

| ID | File | Size (bytes) | SHA-256 (first 16) |
|---|---|---|---|
| F1 | `Chaney Wedding 8-20-23 B.zip` | 4,401,721 | b50bb3e3429f9c21 |
| F2 | `Detroit Popup Shop 8-28-2022.zip` | 1,366,163 | 676d30c3c943ce7d |
| F3 | `Mya & Myka's Sweet 16 4-18-2025.zip` | 2,965,904 | 2f1814249e7b5c41 |
| F4 | `Pauwels Wedding 9-23-23.zip` | 3,119,359 | d5c086390d3e7a5e |
| F5 | `Ramiyah's 13th Bday 12-21-2024 - Testing Video Booth.zip` | 7,972,759 | 8acefedb7816753c |

All five are private production data ([../tests/fixtures/dslrbooth/README.md](../tests/fixtures/dslrbooth/README.md)). The hashes were taken before analysis; the source files were never modified.

## Methodology
Extracted **copies** into the session scratchpad (an OS temp directory outside the repo), never into `source/`. Used `unzip`, `file`, `sips` (macOS image metadata), `xmllint`-compatible reading, and a throw-away Python script (standard library only, run from the scratchpad and not committed) to parse the XML, read PNG headers, and compare values. Viewed downscaled copies of three `preview.png` files to infer rendering behavior. No packages were installed. Nothing was uploaded.

## Executive Summary
1. **CONFIRMED FROM FILE:** every fixture is a flat ZIP (no folders) containing `template.xml`, `preview.png`, and the PNGs referenced by the XML.
2. **CONFIRMED:** `template.xml` is a very simple flat format: root `<Template>` with one child `<Elements>` holding only two element types, `<Image>` and `<Photo>`. No text, shape, or group elements appear.
3. **CONFIRMED:** canvas size and `Resolution` are explicit; **no physical inch size is stored**. Physical size is DERIVED (Width/Resolution).
4. **CONFIRMED:** geometry is integer pixels in canvas space (`Left`, `Top`, `Width`, `Height`); negative `Left`/`Top` occur (content hangs off the canvas).
5. **CONFIRMED:** `Photo` and `Image` share one attribute set; `Photo` adds `PhotoNumber`, and has an empty `ImagePath`. A placeholder is a distinct element type, not a rectangle.
6. **CONFIRMED:** the "two 2x6 strips on one 4x6 print" layouts (F1, F3, F4) are plain **spatial duplication**: one 2400x3600 canvas, every strip element copied at `Left`+~1200, **PhotoNumber values 1,2,3 repeated** in each half. No structural "two-up" concept appears (`print_2_per_page="False"` in all five).
7. **CONFIRMED:** `ZIndex` is present on every element, unique, and the XML lists elements in **descending ZIndex**. Higher ZIndex is in front — INFERRED from the preview images (derived, not stated).
8. **Surprising and important:** images are authored at 300 DPI half-size (e.g., 600x1800) then **scaled 2x** on a 600 DPI canvas; effective print resolution of those assets is 300 DPI (DERIVED).
9. F5 ("Testing Video Booth") has **no video-related fields** (see §11).

## 1. Archive Structure
All CONFIRMED FROM FILE.
- Flat: no directories, no extra files, no ZIP comments. Deflate (method 8), no flags, creator system byte 0 (DOS/FAT-style, typical of .NET/Windows writers — LIKELY).
- Entry order appears **case-insensitive alphabetical** in all five (e.g., F3: `2025_…`, `preview.png`, `template.xml`, `Top-Overlay…`).
- Entries per ZIP: F1 6, F2 5, F3 5, F4 6, F5 4. Fixed names: `template.xml`, `preview.png` (present in all five). Variable/user-derived: every other PNG (named after the source design file, including spaces-free hyphen/underscore names and an `&` in F3; F5 uses `1.png`, `2.png`).
- Entry timestamps: assets keep their original file times; `template.xml`/`preview.png` carry the save time. In **F5, `template.xml` (2025-01-03 16:20) is newer than `preview.png` (2024-12-21 17:28)** — the preview can be stale relative to the XML (see §9).
- Every non-fixed file is referenced by the XML; no unreferenced files (all five).

| ID | Entries | Contents (besides template.xml, preview.png) |
|---|---|---|
| F1 | 6 | Chaney-Wedding-Photo-Strip-1_BADGE_B.png, …-2-BG.png, …-2-top.png, Happy_Birthday_Clara_Herbert-Frames.png |
| F2 | 5 | 5443209.png, det-ppop-up-shop-label.png, ITCOT-NewLogo_500px-300px.png |
| F3 | 5 | 2025_Mya&Myka_Sweet_16_BG_PhotoStrip_A3-01.png, …_B2_BADGE-01-01.png, Top-Overlay-Photo-Frames-WHITE.png |
| F4 | 6 | Pauwels-Wedding-Photo-Strip-1_BADGE_A2.png, …-BACKGROUND_C.png, …-Foral-OVERLAY.png, Top-Overlay-Photo-Frames-WHITE.png |
| F5 | 4 | 1.png, 2.png |

Note: `Top-Overlay-Photo-Frames-WHITE.png` (77,502 bytes) is **byte-identical** (same SHA-256) in F3 and F4 and `Happy_Birthday_Clara_Herbert-Frames.png` in F1 carries a different client's name: designers **reuse assets across templates**, so filenames are not reliable semantic labels.

## 2. XML Structure
CONFIRMED FROM FILE (all five identical in shape).
- Encoding: UTF-8 **with BOM**, CRLF line endings, 2-space indentation, declaration `<?xml version="1.0" encoding="UTF-8"?>`.
- Root `<Template>` attributes, in this order: `Name, Width, Height, Dimensions, Resolution, BackgroundColor, print_2_per_page, PrintToSecondaryPrinter, LastSavedDate, Id, IsLegacy, OriginalDevice`. Single child `<Elements>`. No other children, namespaces, or version attribute.
- `<Elements>` children: `<Image …/>` and `<Photo …/>` only; all self-closing; no nesting.
- Attributes with XML escaping: `&amp;` appears in `Name` and `ImagePath` (F3); an apostrophe is unescaped in a double-quoted attribute (F5).
- Element order = descending `ZIndex` (§7).

Root attribute values:

| Attr | F1 | F2 | F3 | F4 | F5 |
|---|---|---|---|---|---|
| Name | = ZIP stem | = ZIP stem | = ZIP stem | = ZIP stem | = ZIP stem |
| Width×Height | 2400×3600 | 1800×1200 | 2400×3600 | 2400×3600 | 3600×2400 |
| Dimensions | 0 | 0 | 0 | 0 | **1** |
| Resolution | 600 | 300 | 600 | 600 | 600 |
| BackgroundColor | #FF211F1F | #FFFFFFFF | #FF211F1F | #FF211F1F | #FF211F1F |
| print_2_per_page | False | False | False | False | False |
| PrintToSecondaryPrinter | False | False | False | False | False |
| LastSavedDate | 07/27/2023 22:26:37 | 09/17/2022 13:11:45 | 03/23/2025 14:46:25 | 09/23/2023 11:39:14 | 01/03/2025 16:20:36 |
| Id | 25-char alphanumeric, unique per file | | | | |
| IsLegacy | True | True | True | True | True |
| OriginalDevice | DESKTOP-NMVSRAG (same in all five) | | | | |

`Name` equalled the ZIP file stem in all five (the ZIP name and Template Name may be coupled — NEEDS VALIDATION). `LastSavedDate` is US `MM/DD/YYYY HH:mm:ss` without timezone. `OriginalDevice` is a machine name (machine-identifying metadata; consider before sharing templates).

Element attributes, in file order:
- `Image`: `Name, [IsVisible], Opacity, ShadowEnabled, ShadowColor, ShadowDepth, ShadowRadius, ShadowDirection, Width, Height, Top, Left, ImagePath, KeepAspect, Thickness, StrokeColor, ZIndex, [Rotation], [IsLocked]`
- `Photo`: same, plus `PhotoNumber` between `StrokeColor` and `ZIndex`.
Bracketed attributes are optional (see §14). Seven distinct attribute sequences occur on `Image` and four on `Photo` — all differences are only presence/absence of `IsVisible`, `Rotation`, `IsLocked`.

## 3. Canvas and Print Configuration
| ID | Width×Height (CONFIRMED) | Resolution (CONFIRMED) | Physical (DERIVED = px/Resolution) | Likely format (LIKELY) | Orientation (DERIVED) |
|---|---|---|---|---|---|
| F1 | 2400×3600 | 600 | 4×6 in | 4x6 portrait carrying two 2x6 strips | portrait |
| F2 | 1800×1200 | 300 | 6×4 in | 4x6 landscape | landscape |
| F3 | 2400×3600 | 600 | 4×6 in | 4x6 portrait, two 2x6 strips | portrait |
| F4 | 2400×3600 | 600 | 4×6 in | same | portrait |
| F5 | 3600×2400 | 600 | 6×4 in | 4x6 landscape | landscape |

- **No physical inch dimension and no orientation attribute are stored.** Both are derived. `preview.png` is exactly the canvas size in all five.
- `Dimensions` is `0` in four fixtures and `1` only in F5. F2 and F5 are both landscape, so it is **not** simply orientation, and F5 differs from F2 also in Resolution. Meaning **UNKNOWN**. Hypothesis: an index into a print-size/preset list. Needs a fixture with different sizes.
- Resolution values seen: 300 and 600 only.
- A 2x6-only (single strip) canvas is NOT OBSERVED.
- `print_2_per_page` and `PrintToSecondaryPrinter` are `False` everywhere; behavior UNKNOWN (§10).

## 4. Photo Placeholder Model
`<Photo>` elements. CONFIRMED FROM FILE unless stated. Fields not in the table were constant: `Opacity=100`, shadow defaults (see §5), `ImagePath=""`, `KeepAspect=True`, `Thickness=0`, `StrokeColor=#FF000000`.

**F1** (6 photos; canvas 2400×3600)
| Name | PhotoNumber | W×H | Left | Top | Rotation | ZIndex | IsLocked |
|---|---|---|---|---|---|---|---|
| Photo 1 | 1 | 1049×700 | 76 | 168 | 0 | 2 | True |
| Photo 2 | 2 | 1049×700 | 76 | 934 | 0 | 3 | True |
| Photo 3 Copy | 3 | 1049×700 | 76 | 1704 | 0 | 7 | True |
| Photo 1 Copy | 1 | 1049×700 | 1263 | 168 | 0 | 6 | True |
| Photo 2 Copy | 2 | 1049×700 | 1263 | 934 | (absent) | 5 | True |
| Photo 3 Copy | 3 | 1049×700 | 1263 | 1704 | 0 | 4 | True |

**F3** and **F4**: identical geometry, numbers, and names as F1 (F3 additionally has `IsVisible="True"`; ZIndex 5–10 in F3, 2–7 in F4).
**F2**: one photo, `Photo 1`, #1, 1331×887, Left 245, Top 140, **Rotation −3**, ZIndex 1, locked.
**F5**: one photo, `Photo 1`, #1, 2839×1893, Left 381, Top 254, no Rotation, ZIndex 1, `IsLocked=False`.

Findings:
- **Numbering starts at 1** in all five (CONFIRMED). Numbers within a design: F2/F5 {1}; F1/F3/F4 {1,2,3} each appearing twice.
- **Numbers repeat when a strip is duplicated** (F1/F3/F4). Placeholders are NOT unique by `PhotoNumber`. `Name` is also non-unique (two elements named `Photo 3 Copy` in F1/F3/F4).
- Photo count is inferable as **number of unique PhotoNumber values** (3 for strips). LIKELY-reliable; NEEDS VALIDATION against how DSLR Booth itself decides capture count (not stated in the file).
- Placeholder aspect ≈ 3:2 (1049/700 = 1.499; 1331/887 = 1.501; 2839/1893 = 1.500) — DERIVED; all are landscape-oriented boxes even in the portrait strip.
- Strip pitch: Top 168, 934, 1704 (steps 766, 770). The right strip's Left (1263) is **not** exactly 1200 + left strip's Left (76): offset 63 vs 76 (manual placement).
- Placeholder ZIndex is unrelated to PhotoNumber: in F1, ascending ZIndex 2..7 yields PhotoNumbers 1,2,3,2,1,3 — no monotonic relation, and originals interleave with copies.
- Rotation observed: `0` (often) and `−3` (F2). A rotated placeholder exists, but no evidence for how rotation pivots (see §7).
- `Thickness` (border) is always 0 and `StrokeColor` is a constant default; **borders on placeholders are NOT OBSERVED with non-zero values**. Shadows: NOT OBSERVED enabled. Corner radius: no attribute exists in any element (UNKNOWN whether DSLR Booth supports it). Crop behavior: only `KeepAspect` exists; always `True` for photos.
- Preview images draw placeholders as flat colored boxes with the PhotoNumber (red=1, green=2, teal=3): the preview shows editor placeholders, not captured photos.

## 5. Image Layer Model
`<Image>` elements: counts F1 8, F2 3, F3 6, F4 8, F5 2.
- Fields: `Name, [IsVisible], Opacity, Shadow*, Width, Height, Top, Left, ImagePath, KeepAspect, Thickness, StrokeColor, ZIndex, [Rotation], [IsLocked]`.
- `Opacity` is `100` everywhere (scale 0–100; 100 = opaque is LIKELY; only one value observed, so range semantics are UNKNOWN).
- Shadow attributes are present on every element with identical values in all 47 elements: `ShadowEnabled="False" ShadowColor="#FF000000" ShadowDepth="10" ShadowRadius="20" ShadowDirection="-45"`. Enabled shadows are NOT OBSERVED.
- `ImagePath` is a bare filename (relative, no folders) matching a ZIP entry. The same file is referenced multiple times (duplicate strips) and stored once.
- `Image.Name` ≈ file stem, with ` Copy` appended on duplicates.
- `KeepAspect` is `True` for every element but one (F2's background `5443209`, `False`; its placed 1792×1202 ratio equals the source 1563×1048 ratio to within 0.1%, so it didn't visibly distort).
- **Backgrounds, overlays, frames and badges are NOT different XML types.** All are `<Image>`; role is only inferable from ZIndex relative to `Photo` elements and from the image content. Examples: lowest ZIndex full-canvas/strip images = background-like (F1 z0/1, F4 z0/1, F5 z0, F2 z0); images above photos = overlays/frames/badges (F1 z8–13; F5 z2). Role assignment from ZIndex is a heuristic; DSLR Booth itself stores no role.
- Images may extend beyond the canvas: negative `Left`/`Top` (F1 −4, F3 −20/−250/−155, F4 −250/−155) and sizes exceeding the canvas (F2 background 1792×1202 on a 1800×1200 canvas at Left 5, Top 3; F3 background 1215×3645 at Top 5).
- Dimensions are **integers**; near-1200 values like 1197, 1199, 3596 show manual drag-resizing with tiny non-uniform scale (F1 scaleX 1.998 vs scaleY 1.998; F1 BG Copy 2.000 vs 1.998). Aspect is nearly but not always exactly preserved.

Image-to-asset relationship (DERIVED from PNG header vs XML Width/Height):

| ID | Asset (shortened) | Pixels (W×H) | Placed (W×H) | Scale | Inferred use (LIKELY) |
|---|---|---|---|---|---|
| F1 | Strip-2-BG | 600×1802 | 1199×3600 / 1200×3600 | ≈2.0× | per-strip background (z0–1) |
| F1 | Frames | 600×1800 | 1200×3600 | 2.0× | frame overlay over photos (z8–9) |
| F1 | BADGE_B | 1980×1663 | 1191×1000 | 0.60× | badge/text block (z10–11) |
| F1 | Strip-2-top | 599×1802 | 1197–1200×3600 | ≈2.0× | top overlay (z12–13) |
| F2 | 5443209 | 1563×1048 | 1792×1202 | 1.15× | full background (z0) |
| F2 | det-ppop-up-shop-label | 1160×914 | 545×429 | 0.47× | label/badge (z2) |
| F2 | ITCOT-NewLogo | 500×300 | 339×203 | 0.68× | logo (z3) |
| F3 | …BG_PhotoStrip_A3-01 | 600×1800 | 1215×3640–3645 | ≈2.0× | per-strip background, **rotated 180** |
| F3 | …B2_BADGE-01-01 | 2084×2084 | 1113×1113 | 0.53× | badge |
| F3 | Top-Overlay-Photo-Frames-WHITE | 846×1438 | 1692×2876 | 2.0× | frame overlay (z11–12), partly off-canvas |
| F4 | BACKGROUND_C | 601×1801 | 1200×3596–3600 | ≈2.0× | strip background, rotated ±180 |
| F4 | Foral-OVERLAY | 600×1800 | 1200×3600 | 2.0× | decorative overlay (z12–13) |
| F4 | …BADGE_A2 | 1780×1409 | 1200×950 | 0.67× | badge |
| F4 | Top-Overlay-Photo-Frames-WHITE | 846×1438 | 1692×2876 | 2.0× | frame overlay |
| F5 | 1.png | 1800×1200 | 3600×2400 | 2.0× | full-canvas background (z0) |
| F5 | 2.png | 1800×1200 | 3600×2400 | 2.0× | full-canvas overlay (z2), has transparent hole for photo |

All PNGs are RGB with alpha (CONFIRMED via `sips`); embedded DPI metadata varies (300, 150, 72, 96) and is not used by the XML. **Significant:** on 600 DPI canvases, strip assets are authored at exactly half the placed size, i.e., **effective resolution 300 DPI** (DERIVED); badge images are downscaled (effective > 600 DPI). Preflight must compute effective DPI = source px / placed inches.

## 6. Text Layer Observations
**NOT OBSERVED IN CURRENT FIXTURES.** There is no text element type in any `template.xml`; all visible text (titles, names, dates) is baked into PNG assets (e.g., F1 badge, F5 `2.png`). This does not show DSLR Booth lacks text support (UNKNOWN). Text must therefore be treated as raster on export unless a fixture proves a text element (§24).

## 7. Layer Ordering / Z-Index
Observed representation (CONFIRMED FROM FILE):
- `ZIndex` exists on every element in all five.
- Within each file all `ZIndex` values are **unique** (no duplicates). Values are integers starting at 0. F1, F2, F4, F5 are contiguous 0..N−1; **F3 skips 2** (0,1,3,…,12), so ZIndex values are not guaranteed contiguous.
- XML element order is **descending ZIndex** in all five files.

Inferred rendering (LIKELY, from viewing `preview.png` for F1, F2, F5; not confirmed for F3/F4): **higher ZIndex draws in front**. Evidence: F1 rose petals/frames (z8–13) overlap the numbered placeholders (z2–7) and the strip backgrounds (z0–1) lie beneath; F5 balloons from `2.png` (z2) overlap the placeholder (z1). Whether XML order or ZIndex governs when they disagree is UNKNOWN (they never disagree in these files).
- Rotation pivot: F3/F4 rotated backgrounds (±180) have `Left/Top/Width/Height` forming a normal unrotated box (e.g., F3: Left 1190 + Width 1215 = 2405 ≈ canvas width). That fits "geometry describes the unrotated box; rotation about its center" — LIKELY, because 180° is symmetric it cannot distinguish pivots. F2's −3° photo is the only asymmetric case and its pivot is UNKNOWN. `-180` and `180` both appear and are equivalent.

## 8. Asset References
- `ImagePath` only; values are bare filenames exactly matching ZIP entry names including case and special characters. XML-escaped when containing `&`.
- No absolute paths, folders, or URLs. Reuse of one file by several elements (F1: 4 distinct files for 8 images).
- Referenced assets per fixture: F1 4, F2 3, F3 3, F4 4, F5 2. `Photo` elements reference nothing (`ImagePath=""`).
- No hashes, IDs, or per-asset metadata exist.

## 9. Preview Files
- `preview.png` present in all five; exact canvas size in each (F1/F3/F4 2400×3600, F2 1800×1200, F5 3600×2400); RGB+alpha; embedded 96 DPI. Not referenced by XML.
- Content: the composed design with colored numbered boxes where `Photo` elements sit (viewed F1, F2, F5).
- **Staleness risk:** F5's preview predates its XML by ~2 weeks (§1). Whether DSLR Booth requires/regenerates the preview on import is UNKNOWN.
- Preview sizes are large (2–4 MB each, the largest part of most archives).

## 10. Two-Up Strip Behavior
(F1, F3, F4 — all 2400×3600 @ 600 → 4×6 in.)
- CONFIRMED: no structural two-strip element, group, or flag exists. DSLR Booth "sees" one 2400×3600 canvas.
- Each half is 1200 px wide (= 2 in at 600 DPI, DERIVED): strip assets are placed at `Left≈0` and `Left≈1200` with width ≈1200 and height 3600.
- Every placeholder is **duplicated** with the same PhotoNumber (1,2,3 appear twice); names carry ` Copy`. Shared graphics (frames, badges, backgrounds, overlays) are **duplicated Image elements** referencing the same PNG once in the ZIP.
- The second background in F3/F4 is rotated 180° (and in F4 the first as well, as `-180`): rotation is used as a pattern/mirroring trick on the *design* side — meaning is a designer choice, not DSLR structure.
- Duplicates are not exact: offsets differ by a few pixels (Left −4 vs 1182; photo Left 76 vs 1263−1200=63).
- `print_2_per_page="False"` in all three. DSLR Booth may offer a built-in "2 per page" feature (**UNKNOWN**); these designs don't use it. Whether the booth prints/cuts the sheet into strips is a printer/software setting outside the file.
- Implication: "two-up" is a **layout concept in our app**, expressed to DSLR Booth as duplicated elements on a larger canvas. Our model should know strip cells so that edits to one cell can be mirrored.

## 11. Special Fixture Observations
F5 (`…Testing Video Booth`): searching all XML for video/GIF/boomerang/animation terms found only the word "Video" inside the `Name`. Differences from the others:
- Landscape 3600×2400 @ 600 DPI with **`Dimensions="1"`** (only fixture).
- Two full-canvas 1800×1200 PNGs (`1.png` background, `2.png` overlay with a window cut-out) scaled 2×; one 2839×1893 photo; no rotations; `IsLocked` explicitly `False` on two elements.
- Smallest XML (1,280 bytes), largest ZIP (7.97 MB).
- `template.xml` newer than `preview.png`.
**No evidence of video configuration, animation, or special output in the XML.** Any video settings (if they exist) are stored outside the template ZIP or not exercised. The `Dimensions="1"` difference is a candidate but its meaning is UNKNOWN; do not infer video semantics from it.

## 12. Cross-Fixture Comparison
| Fixture | Canvas W | Canvas H | Res | Likely physical | Orientation | Photo objs | Unique PhotoNumbers | Image objs | Text objs | Preview | Referenced assets | Two-up | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F1 | 2400 | 3600 | 600 | 4×6 | portrait | 6 | 3 ({1,2,3}) | 8 | 0 | yes | 4 | yes (duplicated) | Rotation present on some; negative Left |
| F2 | 1800 | 1200 | 300 | 6×4 | landscape | 1 | 1 | 3 | 0 | yes | 3 | no | white bg; photo Rotation −3; KeepAspect False once; logo |
| F3 | 2400 | 3600 | 600 | 4×6 | portrait | 6 | 3 | 6 | 0 | yes | 3 | yes | `IsVisible` present; ZIndex gap; 180° backgrounds |
| F4 | 2400 | 3600 | 600 | 4×6 | portrait | 6 | 3 | 8 | 0 | yes | 4 | yes | ±180 backgrounds; shared asset with F3 |
| F5 | 3600 | 2400 | 600 | 6×4 | landscape | 1 | 1 | 2 | 0 | yes | 2 | no | Dimensions=1; "video" test; stale preview |

## 13. Common Fields
Present in all five current fixtures (not claimed as required):
- ZIP: `template.xml`, `preview.png`, flat layout, deflate.
- Root: all 12 attributes, always in the same order; single `<Elements>` child.
- Elements: `Name, Opacity, ShadowEnabled, ShadowColor, ShadowDepth, ShadowRadius, ShadowDirection, Width, Height, Top, Left, ImagePath, KeepAspect, Thickness, StrokeColor, ZIndex` on every element; `PhotoNumber` on every `Photo`.
- At least one `Photo` and at least one `Image`.
- UTF-8 BOM, CRLF.

## 14. Optional / Variable Fields
- `IsVisible` — present in **F3 only** (all 12 elements, always `True`). Observed once.
- `IsLocked` — present on 37 of the 47 elements (F1 9/14, F2 4/4, F3 10/12, F4 12/14, F5 2/3); `False` appears only in F1 (1) and F5 (2). Absent mostly on badge images and some placeholders' copies.
- `Rotation` — present on 22 of 47 elements (F1 7, F2 1, F3 7, F4 7, F5 0); inconsistently present even among identical copies (F1: 5 of 6 `Photo`); values 0, −3, 180, −180.
- `Dimensions` — values 0 (×4) and 1 (×1).
- `Resolution` — 300 (F2), 600 (others).
- `BackgroundColor` — `#FFFFFFFF` (F2) or `#FF211F1F` (others). ARGB hex. The dark default may be a DSLR Booth default (LIKELY, NEEDS VALIDATION). The canvas background color is hidden under full-coverage images in most designs.
- `KeepAspect=False` — once (F2).
- Attribute sequence differences are only the optional attributes above.

## 15. Unknown Fields
Meaning UNKNOWN (store verbatim, do not interpret): `Dimensions`, `IsLegacy` (always `True`, even for a 2025 template), `print_2_per_page`, `PrintToSecondaryPrinter`, `ShadowDepth`/`ShadowRadius`/`ShadowDirection` semantics (units, direction convention), `Thickness`/`StrokeColor` semantics on photos (non-zero never seen), `KeepAspect` semantics on `Photo` (fit vs fill vs stretch), `Opacity` range, `Id` purpose and generation, whether `IsLocked` has any export/runtime effect.

## 16. Vendor-Specific Fields
Everything in the format is DSLR Booth-specific, but these should NOT become domain concepts: `Id`, `IsLegacy`, `OriginalDevice`, `LastSavedDate` format, `Dimensions`, `print_2_per_page`, `PrintToSecondaryPrinter`, `ShadowDepth/Radius/Direction` raw values, `Thickness`/`StrokeColor` raw values, `Name`'s " Copy" convention, ARGB `#AARRGGBB` color syntax, BOM/CRLF encoding, ZIP entry order.

## 17. Internal Domain Model Implications
**A. Core domain (needed regardless of vendor)**
- Canvas pixel size + DPI; physical size derived. Orientation derived/explicit in our model.
- Background color.
- Ordered layers with integer-or-float x/y/width/height, rotation, opacity, visibility, lock, z-order.
- Distinct photo placeholder layer with `photoNumber` (1-based, **non-unique across cells by design**), plus an `Image` layer with an asset reference.
- Layer **name** (non-unique), asset reference by identifier rather than path.
- Notion of **layout cells / strips** (a repeating cell structure on a larger canvas) to model two-up; the format itself has none (§10). Whether this is modeled as groups or a "layout" concept is a design decision for Phase 2.
- Asset records: pixel size, alpha, effective DPI at placement (derived).
- Placeholder frame/border properties live in *our* model (the file only has defaults).
- Negative coordinates and off-canvas content must be representable.

**B. DSLR Booth adapter properties (kept in adapter-owned data)**
`Id`, `IsLegacy`, `Dimensions`, `print_2_per_page`, `PrintToSecondaryPrinter`, `OriginalDevice`, `LastSavedDate`, shadow raw fields, `Thickness`/`StrokeColor` raw, original element order, original attribute presence, XML formatting details, ZIP order/times, preview bytes.

**C. Unknown / preservation data**
Any attribute or element not in our mapping table, verbatim with its source position (§19).

Not required by the evidence: text layer, shape layer, group, or corner radius in the DSLR export. These stay in our model as editor concepts that **must be rasterized** on DSLR export (until fixtures prove otherwise).

## 18. Coordinate Model Recommendation
Evidence: DSLR Booth stores **integer pixel geometry in a canvas pixel space at the template's Resolution** (§2, §5). Physical size is not stored. Our requirements: exact print output, 300/600 DPI, visual editing, resolution conversion, deterministic export.

| Option | Assessment against evidence |
|---|---|
| A. Pixels only | Maps 1:1 to DSLR fields; but DPI changes (300↔600) and physical size need a separate, easily-lost DPI link; non-integer scaling ambiguous |
| B. Inches | Resolution-independent, but every DSLR import/export converts and rounds (e.g., 1049 px / 600 = 1.74833 in) → needless float drift; fixtures are pixel-native |
| C. Normalized 0–1 | Fits poorly: strips are 1200 px on a 2400 px canvas; rounding and aspect issues; no advantage |
| **D. Hybrid (recommended)** | Project stores physical size (inches) + DPI; derived canvas pixel size; **layer geometry stored in canvas pixels at project DPI** (numbers, not forced integer); explicit DPI-rescale operation; exporter rounds to integers |

**Recommendation: D**, consistent with the existing proposal in [../docs/DATA_MODEL.md](../docs/DATA_MODEL.md) §1 — the fixtures strengthen it. Reasons: DSLR round-trip is exact when the importer takes integers into canvas px with no conversion; physical size/effective-DPI preflight remain possible; 300→600 conversion is one controlled scale. Importer must derive physical size = Width/Resolution and warn when it matches no known format. Not implemented yet; to be confirmed in Phase 2.

## 19. Unknown Data Preservation Strategy
Question: keep unmapped vendor data in a block like `vendorExtensions.dslrBooth` / `sourceMetadata`?

- **Benefits:** lossless round-trip of unknown fields (`IsLegacy`, `Dimensions`, `Id` …); honest warnings; lets exporter re-emit identical values; aids debugging.
- **Risks:** stale values after edits (e.g., `Dimensions` may depend on canvas size; `Id` should likely change on export); privacy (`OriginalDevice`); schema bloat; users might assume preserved = valid; per-element extras must follow elements through copy/delete/regroup.
- **Portability:** native project must remain vendor-neutral; the block is opaque, namespaced, versioned, optional, and ignorable by the editor.
- **Interaction with editing:** per-element preserved data attaches to the layer ID; copying a layer should copy *no* vendor data (new element); changing canvas size/DPI should flag root-level vendor values as "possibly stale" and reconsider on export.
- **Proposal (not final syntax):** an opaque, adapter-namespaced `source` object holding `{ adapter, adapterVersionHint, rootAttributes, perLayerAttributes keyed by layer ID, unmappedElements, originalOrder }`, plus an import report listing preserved/warned items. Recorded as ADR-017 (Proposed).

## 20. Importer Requirements
(Derived from evidence; testable with these fixtures.)
1. Safe ZIP read: reject `..`/absolute entries, directories, excessive sizes; accept flat layouts; do not assume order.
2. Strip UTF-8 BOM, accept CRLF; parse root + `Elements`.
3. Treat `Image` and `Photo` as the only known element types; any other element → warning + preserve.
4. Parse integers for geometry; accept negatives; accept absent `Rotation`/`IsLocked`/`IsVisible` with documented defaults (default values are UNKNOWN: treat absent `IsVisible` as visible, absent `Rotation` as 0 — ASSUMPTION).
5. Derive physical size and orientation; warn if Resolution not in {300, 600}.
6. Do not require PhotoNumber uniqueness; detect repeated sets as probable two-up cells.
7. Resolve `ImagePath` to ZIP entries by exact (case-sensitive and case-insensitive fallback with warning) match; report missing/unreferenced files.
8. Read PNG pixel size and alpha; compute effective DPI at placement.
9. Import ZIP `preview.png` as non-authoritative; do not trust it as current.
10. Preserve every unmapped root attribute/element/element-attribute.
11. Names are not identifiers: generate internal IDs.
12. Parse `LastSavedDate` leniently (US format, no TZ) and never fail on it.

## 21. Exporter Requirements
1. Emit BOM + CRLF + declaration exactly like the fixtures unless proven unnecessary (ASSUMPTION: DSLR Booth is tolerant — NEEDS VALIDATION on a real booth).
2. Root attributes in observed order; generate a new 25-char alphanumeric `Id` (format observation only; generator rules UNKNOWN).
3. Element order: **descending ZIndex**; ZIndex unique integers.
4. Geometry as integers; round deterministically.
5. `Photo` elements need `PhotoNumber`, empty `ImagePath`, `KeepAspect="True"` (observed default), `Thickness="0"`.
6. All text/shape/badge/frame styling must be **rasterized into PNG assets**; no editable text export.
7. Write placeholders' effective appearance (frames, borders) into overlay PNGs rather than relying on `Thickness`/shadow.
8. Include `preview.png` at canvas size, generated from the current model (compose placeholder boxes like DSLR's preview? NEEDS VALIDATION whether real sample photos or placeholders are preferred).
9. ZIP flat, deflate, case-insensitive alphabetical order, fixed timestamps for determinism.
10. Escape `&`, `<`, `"` in attributes; keep filenames safe (avoid `&` where possible, but must match XML exactly).
11. Verify the produced ZIP by re-reading it with the importer.

## 22. Round-Trip Compatibility Risks
| Risk | Level | Notes |
|---|---|---|
| Unknown root flags (`Dimensions`, `IsLegacy`, `print_2_per_page`, `PrintToSecondaryPrinter`) mishandled | **HIGH** | meaning unknown; wrong value could change booth behavior |
| `Id` handling (reuse vs regenerate) | MEDIUM | duplicates across machines may collide; purpose unknown |
| Floating-point / rounding of geometry | LOW | import integers → keep ints; only editor-produced floats round |
| Dimension/aspect drift from rounding scaled images | LOW | |
| Asset filenames (`&`, spaces, case, duplicates after rename) | MEDIUM | must match XML and ZIP exactly |
| Image recompression / color-profile changes | MEDIUM | byte-copy untouched assets; re-encode only when edited |
| Element/attribute order and optional attribute presence | LOW–MEDIUM | semantic equivalence testing, not byte equality |
| ZIndex gaps / reordering | MEDIUM | F3 has a gap; renumbering is legal-looking but unverified |
| Two-up structure lost on import (becomes unrelated layers) | MEDIUM | need heuristic cell detection; failing safe = keep as flat layers |
| Duplicate PhotoNumbers treated as an error | HIGH (for validation logic) | would falsely reject valid designs |
| Unsupported object types (text/shape) in future templates | HIGH | no fixture; must warn+preserve |
| Preview staleness | LOW | regenerate on export |
| BOM/CRLF/encoding | LOW | tolerance unknown; replicate |
| `LastSavedDate` locale format | LOW | |
| Privacy of `OriginalDevice` | LOW | offer to rewrite/strip |

## 23. Recommended Compatibility Tests
1. Parse all five fixtures; assert counts and root values in §3, §12.
2. Per-fixture: element order descending ZIndex; unique ZIndex; PhotoNumber sets.
3. Import → export → re-import: semantic equality (layers, geometry, assets, preserved fields).
4. Export determinism (same output twice).
5. Missing/unreferenced asset, unknown element, unknown attribute, absent optional attributes, negative coordinates, `&` in filenames, BOM/CRLF handling (derived test cases, labeled as derived).
6. Effective-DPI computation for F1 backgrounds (=300) and badges.
7. Two-up cell detection on F1/F3/F4; non-detection on F2/F5.
8. Manual: import each exported ZIP into real DSLR Booth on Windows and compare to `preview.png`.

## 24. Additional Fixture Coverage Needed
Specific evidence gaps; each closes a named unknown:
1. **Editable text object** (if DSLR Booth has one) — to learn element name, font/size/color attributes. (§6)
2. **Photo with non-zero `Thickness`/colored `StrokeColor` and `ShadowEnabled=True`** — to learn border/shadow units and direction convention. (§4, §5)
3. **Template with `print_2_per_page="True"`** and one with `PrintToSecondaryPrinter="True"` — meaning of those flags and whether it changes canvas/duplication. (§10)
4. **Templates at other sizes/resolutions**: a 2x6 single strip (e.g., 1200×3600 @600), 4x6 @300 portrait (1200×1800), a non-4x6 size — to decode `Dimensions` and orientation. (§3)
5. **Same layout saved with `Dimensions` toggled** (e.g., F5 re-saved as 1800×1200@300 if that is possible in the UI) — isolates the `Dimensions` meaning.
6. **Photo with a non-zero rotation other than 0/180** plus an *image* at ±30° with an asymmetric position — to confirm the rotation pivot. (§7)
7. **Duplicate ZIndex or manually reordered layers**, and one with an element whose XML order differs from ZIndex — to learn what governs rendering. (§7)
8. **A template exported from a newer DSLR Booth version** (or one with `IsLegacy="False"`) — to see version differences. (§15)
9. **One-photo vs four-photo/ six-photo layouts** (e.g., 4 photos on a 4x6) — numbering and count inference. (§4)
10. **Image with partial opacity (Opacity<100)** and `IsVisible=False` — range and effect.
11. **Corner radius / rounded photos** if the UI offers it — to find the attribute.
12. **QR code / other special element** if DSLR Booth offers one (e.g., for sharing) — new element types.
13. **A template saved with an asset filename that collides or contains non-ASCII/space** — path/encoding behavior.
14. **Package where the preview is regenerated after a later XML change vs not** — is `preview.png` ever required.
Also useful, not a fixture: one successful and one failing **import into DSLR Booth** of a hand-edited copy (owner-run) to learn tolerance, e.g., missing preview, no BOM, LF endings, reordered attributes.

## 25. Open Questions
1. What does `Dimensions` encode (0 vs 1)? 2. What are `IsLegacy`'s semantics (and does `False` exist)? 3. Does DSLR Booth require `preview.png`, BOM, CRLF, attribute order? 4. Is `Id` required to be unique/valid? 5. How is `PhotoNumber` used at runtime (capture order, sequence, repeats)? 6. How does rotation pivot and how is `KeepAspect` applied to photos (crop-to-fill vs fit)? 7. Are `Opacity`/shadow values scaled as assumed? 8. Does the booth enforce element-name uniqueness? 9. Do other element types exist (Text, QR, Overlay)? 10. Can templates exceed the observed sizes/DPIs? 11. How does DSLR Booth treat out-of-canvas content? 12. Are there DSLR Booth-side settings (video, GIF, printing) stored elsewhere? 13. What does `print_2_per_page` do? 14. Terms of use for the format.
