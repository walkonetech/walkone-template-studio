# Real Template Validation — Product Workflow Audit

**Status:** findings, not decisions. Recreation done through the **real UI** of the Phase 4D build (real mouse/keyboard events driven over the DevTools protocol by the assistant, with every gesture counted). No importer or parsing code was written; the reference numbers below were read from the fixture's `template.xml` and previews. The fixture was only extracted as a **copy** in a scratch folder (hashes unchanged). Gesture counts are an automation measurement of *how many actions the workflow requires*, not a human timing; no time-saving percentage is claimed.

## 1. Template selected
`Chaney Wedding 8-20-23 B.zip` (F1 in [DSLRBOOTH_FIXTURE_ANALYSIS.md](DSLRBOOTH_FIXTURE_ANALYSIS.md)).

## 2. Why
Of the two preferred candidates it is the cleaner representative of the owner's typical "two 2×6 strips on one 4×6" product: 4 distinct assets, **no rotated backgrounds** (Pauwels/F4 uses ±180° pattern tricks that would test rotation semantics rather than the workflow), a gold-framed photo grid, a petal overlay, and a name badge that mixes script, display-serif and date text, which exercises the text/font path. Pauwels would add nothing structurally new for this audit.

## 3. Reference structure (from `template.xml` and the assets; CONFIRMED FROM FILE unless noted)
- Canvas 2400×3600, Resolution 600 → 4×6 in portrait; `BackgroundColor #211F1F` (hidden: the full-bleed background PNGs cover it).
- 13 elements, bottom → top (ZIndex): 0–1 strip background PNG ×2 (600×1802 px source, placed ≈1200×3600, i.e. 2× upscale); 2–7 six `Photo` placeholders, 1049×700 (3:2) at Left 76 / 1263, Top 168 / 934 / 1704, numbers 1-2-3 repeated in each strip; 8–9 gold photo-frame overlay PNG ×2 (1200×3600, Left −4 and 1182: **slightly off-canvas**); 10–11 badge PNG ×2 (1191×1000 at Top 2420/2423); 12–13 top "rose petals" overlay PNG ×2 (1197/1200×3600).
- All visible text ("Kara & Saher", "CHANEY", "8.20.23") is **baked into the badge PNG**; the XML has no text element.
- Photo placeholders carry no border, radius or shadow attributes; the gold frames, the marble texture, the petals and the rose are raster art.

## 4. Recreation checklist (✔ done natively · ≈ approximated · ✘ blocked)

| Item | Result |
|---|---|
| Format 4×6 portrait, 600 DPI | ✔ New-project dialog default (2 gestures) |
| 6 photo placeholders, numbers 1,2,3,1,2,3 | ✔ exact geometry typed in |
| Photo layer order and number repetition | ✔ |
| Photo frame (gold border around each photo) | ≈ solid frame, 8 px, `#c9a860` (the original is a thin art frame PNG) |
| Page background (marble texture) | ✘ texture; ≈ a full-canvas rectangle `#f1efea` sent to back (no UI sets the canvas background color) |
| Strip background art ×2 | ✘ no way to add an image |
| Gold frame overlay PNG ×2 (off-canvas −4 px) | ✘ asset; off-canvas placement itself works |
| Petal / rose overlay PNG ×2 | ✘ asset, not reproducible with shapes |
| Name badge (script + serif caps + date) | ≈ white rectangle with gold stroke + 3 live text layers in system fonts |
| Right-hand strip (mirror of the left) | ✔ by duplicating and retyping positions |
| Save as `.boothproject`, reopen | ✔ 15 layers, reopens clean, no warnings |

## 5. What worked
Format and DPI; photo placeholders with exact numbers/geometry/frames; duplicate-preserves-number (exactly the repeated 1-2-3 behavior the fixture needs); numeric positioning with off-canvas values; text typography controls (family, size, weight, alignment, letter spacing, color); layer order; Save/Reopen; the editor never lagged. The best current feature is the **photo placeholder + inspector** pair: precise, predictable, and faithful to how DSLR Booth thinks about photos.

## 6. What could be approximated
Frames as solid strokes; the badge as rectangle + text; the page color as a rectangle. The result ([`research/editor-validation/shots/rec-07-render-2400x3600.png`](editor-validation/shots/) — git-ignored) has the **same grid, spacing, counts and typographic hierarchy** as the reference, but none of its character: it is a clean wireframe of it.

## 7. What could not be reproduced
Everything raster: background texture, gold frames, petals, rose, the badge's decorative border — i.e. almost all of the visual identity. **Roughly the layout skeleton (photos, text hierarchy, grid) was reproducible; the artwork (8 of 13 original elements, and all of what makes it look finished) was not.**

## 8. Asset blockers (the main finding)
- **There is no way to bring an image into a project from the UI.** The Add menu and drawer offer Photo placeholder, Text, Rectangle, Ellipse, Line only; File has New/Open/Save/Save As/Close; no drop handler; the Assets rail entry is a disabled placeholder. The only image layers that exist come from the debug sample project. The domain model, `.boothproject` format, render pipeline and Layers/inspector all support image layers (role, fit, source info) — only the *import entry point* is missing.
- Consequently background, overlay, frame, badge and logo workflows are all blocked, and so is assigning a **sample photo** to a placeholder (`sampleAssetId` exists in the model; no UI).
- Not blockers but needed with import: effective-DPI display (the fixture's assets are authored at half size and 2× upscaled), role presets (background/overlay/frame), "fit to canvas/strip".

## 9. Photo workflow findings
Strong: add, number, exact X/Y/W/H, rotation, solid frame (thickness + color), corner radius, fit select, duplicates keep the number. Gaps: **no way to supply a preview photo, so "Preview photos" changes nothing visible** (verified: toggling it renders identically); layer names do not follow numbers (`Photo 1 copy` is photo #2; `Photo 1 copy copy copy` is #3 on the right) and accumulate " copy" suffixes; the fixture's photo has no frame/radius concept at all, so frames are a *design* convenience that will have to be baked into an overlay at export.

## 10. Text workflow findings
Strong: live text with family/size/weight/style/alignment/line height/letter spacing/color; inline edit on the canvas; duplicate-and-edit is a fast way to build the 3-line badge. Friction: each text layer needs ≈8–10 field edits before it looks right (no text styles/presets); the text box height does **not** adapt to content (CHANEY at 230 px sits in a 170 px box, so the selection box lies about the text extent); no "fit box to text"; no per-line spacing preview of the exact reference script. **Fidelity:** none of the fixtures contains a text element, so on export every text layer must be rasterized — the exporter, not the editor, decides final fidelity.

## 11. Layout / precision findings
- **Numeric positioning is the real workhorse and works well** — but everything is typed, per layer.
- Duplicate offsets by 48 px (x and y), so every duplicate needs two corrective edits.
- **There is no way to move a multi-selection or group by an exact amount.** Multi-selection and group inspectors show no geometry; arrow-key nudging moves in **screen** pixels (measured at fit zoom: one Arrow = 4.787 design px, Shift+Arrow = 47.87), so exact moves need zoom 100% or per-layer typing. Mirroring the left strip to the right therefore cost **21 of the 68 history entries (≈ 31%)** in this recreation (retyping X/Y on 3 photos and 4 badge layers), and would be near-zero with a "duplicate strip cell / offset by N" feature.
- Missing align left/center/right, top/middle/bottom, distribute, custom guides, rulers: **they would *not* have slowed this recreation** (every coordinate was supplied numerically), but without the XML numbers a designer working from artwork would need them constantly. Rank: align/distribute P1, guides P2, rulers P3.
- Snapping, lock/hide, grouping, stacking, off-canvas placement all worked as designed (Phase 4/4D suites).

## 12. Color / palette findings
Literal hex entry works but the gold `#c9a860` had to be typed for each *fresh* element (photo frame, panel stroke); duplicating copies it, so reuse was cheap while building and **expensive when changing**: swapping the gold would mean editing 6 photo frames + 2 panel strokes individually. The palette model exists in the domain but there is no palette UI, so "event colors" cannot be defined once and reused. Real friction, moderate (P1 once assets exist, because artwork usually dictates the palette).

## 13. Font findings
Free-text family entry works with any installed font (Snell Roundhand, Bodoni 72, Didot approximated the reference's script/Didone/serif well). Problems: **no installed-font browser or preview** (you must know the name); **a nonexistent font silently falls back, with no warning** (verified with "Totally Fake Font"); and the three fonts used are **macOS-only**, while DSLR Booth runs on Windows, so the project would fall back there until fonts are embedded or text is rasterized. The ADR-015 font decision is now clearly needed before text is relied on. No licensing issue is directly relevant yet.

## 14. Badge / frame findings
Photo borders: workable as the placeholder's frame (but the fixtures bake frames into art). Event badge: **recreated as text + rectangle (≈ 8 layers per strip, 4 duplicated)** — works, but the decorative border, ornaments and the script/serif lockup are image art in the original. Best representation today: *group of text + shape*; best long-term: image asset for decoration + live text for the event fields. A Badge Builder would help materially because the three text lines are exactly the fields that change per event and were the most repetitive part to style (≈ 30 gestures per badge).

## 15. Preview findings
Designing against flat numbered placeholders is adequate for geometry and hierarchy but **cannot judge spacing against real faces, frame weight, or how the badge sits against photos**. Sample photos would materially improve composition decisions (frame thickness, photo-to-badge gap, overlay clipping of faces) and are required to make the existing "Preview photos" toggle meaningful. Rated: important, after asset import.

## 16. Export-readiness gaps
- **Flattened PNG:** closest. The deterministic offscreen render at 2400×3600 exists (Phase 3B) and was used here. Missing: an export command/dialog, file writing through main, placeholders-as-numbered vs omitted vs sample photos option, and an asset-complete project (blocked by import).
- **Layer package:** missing the package definition, per-layer PNG/asset writing, and a manifest; text/shape rasterization policy; asset import.
- **DSLR Booth ZIP:** missing the exporter itself plus: rasterizing text and shapes into `Image` PNGs (no text element exists in any fixture), baking placeholder frames, strip-cell duplication semantics, `ZIndex`/rotation-pivot rules (unvalidated), `template.xml` fields (`Dimensions`, `Id`, etc.) and a preview image. Nothing here should be built before a real DSLR Booth import of an exported test file is possible on Windows.

## 17. UX friction (summary)
Gestures to recreate this one design **excluding all art**: 209 (75 clicks, 58 typed values, 68 key presses incl. Enter/⌘D, 7 layer selections, 1 menu choice); 68 undoable edits; 15 layers; zero trips outside the app except typing values read from the XML. A real designer would also leave the app to prepare each of the 4 PNGs and could not return them. Repetitive: restating strip positions, per-text styling, retyping colors. Awkward: duplicate offset, copy-name accumulation, exact moves of groups, text box height. Missing: asset import, canvas background control, align/distribute, sample photos, strip mirroring. Compared conceptually with Photoshop/Canva + manual DSLR Booth reconstruction: the app already beats the *DSLR Booth reconstruction* half for geometry and numbering, but it cannot replace the *art assembly* half until assets can be placed, and the strip/badge repetition is currently as manual as in Photoshop.

## 18. Bugs discovered
No outright incorrect behavior was found; no code was changed. Observations that are *close* to bugs: `Preview photos` has no visible effect without a sample photo (incomplete feature, not a defect); copy names accumulate (design choice, poor ergonomics); silent font fallback.

## Classified findings

| Class | Finding |
|---|---|
| BUG | none confirmed |
| UX FRICTION | duplicate offset forces 2 edits; copy-name accumulation and photo names not matching numbers; text box height ignores content; arrow nudge in screen px; per-element hex typing; ≈10 edits to style one text layer; no group/multi geometry editing; Preview-photos toggle is a no-op |
| MISSING CORE FEATURE | **image asset import + image layers in the UI**; **export (PNG at minimum, then DSLR ZIP)**; sample photos for placeholders; canvas background color; font availability/warning and cross-platform font strategy; strip/two-up mirroring |
| NICE TO HAVE | align/distribute, custom guides, rulers, installed-font browser, layer thumbnails, text styles |
| FUTURE DIFFERENTIATOR | Badge Builder bound to event fields, Design Recipes, palette from artwork, template library, AI/external assets |

## 19. Priority ranking (driven only by this recreation)

| P | Item | Why |
|---|---|---|
| **P0** | Image import → project assets → Image layers (file picker + drop; role presets; effective-DPI readout; off-canvas allowed) | Without it 8 of 13 reference elements and every sample photo are impossible |
| **P0** | Flattened PNG export (command + file write), then DSLR ZIP exporter | Nothing can leave the app; PNG is the cheapest end-to-end proof |
| P1 | Sample photos for placeholders (makes Preview meaningful) | Composition decisions; reuses the asset pipeline |
| P1 | Strip / two-up mirroring (duplicate a set of layers offset by an exact amount; editing a group/multi-selection's X/Y) | ≈31% of edits were mirroring |
| P1 | Canvas background color control; palette basics (named event colors, change once) | Cheap, repeated friction |
| P1 | Font strategy: missing-font warning, installed-font list, embed/rasterize policy (ADR-015) | Windows target makes macOS fonts a silent risk |
| P1 | Align/distribute | Needed whenever coordinates are not supplied |
| P2 | Text box auto-fit, text style presets, smarter duplicate (no offset / naming), nudge in design pixels | Smaller friction |
| P2 | Custom guides, thumbnails | |
| P3 | Rulers, context menu, copy/paste between projects | |
| P3 | Badge Builder, Design Recipes, templates, providers | Valuable but only after assets/export exist; the badge is mostly art + 3 text lines |

## 20. Recommended next development phase
Not the roadmap's Phase 5 as written (photo placeholders are already strong). Recommend a reordered **"Asset import and flattened export"** phase: (1) import image into project assets with Image layers and role presets, (2) sample photos for placeholders, (3) flattened PNG export. That is the shortest path to recreating this template *with its artwork* and seeing it end-to-end. Strip mirroring, canvas background and the font warning are small and can ride along or immediately follow. DSLR Booth ZIP export should follow once a test export can be imported into DSLR Booth on Windows.

## Reproducibility notes
The driver and probe scripts lived in the session scratchpad and are not committed (they embed this client's strings). Results above come from: `shots/rec-log.txt`, `shots/rec-01…09*.png` and `shots/chaney-recreation.boothproject` (all git-ignored; the project contains the client's names, so it is not committed). The reference geometry was read from the fixture XML by hand and typed through the UI.
