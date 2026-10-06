# Data Model (Implemented in Phase 2)

Source of truth is the code in `src/domain/` (zod schemas; TypeScript types are inferred from them). This document explains the model and why. It is vendor-neutral: DSLR Booth structures are handled only by adapters ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md), ADR-002/003). Evidence behind the choices: [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). Decisions: [DECISIONS.md](DECISIONS.md).

## 1. Shape of `TemplateProject` (schemaVersion 1)
```
format: "walkone.template-project"      marker
schemaVersion: 1                        integer
id                                      project id
metadata   { name, createdAt, updatedAt, notes? }
event      { eventName?, eventType?, clientName?, organization?, date? (YYYY-MM-DD), location?, cityState?, subtitle?, sponsor?, hashtag?, notes? }
design     { styleTags[], brief? }                         (DesignMetadata)
canvas     { print: PrintConfiguration, backgroundColor }  (DesignCanvas)
output     { print: PrintConfiguration, layout }           (OutputComposition)
palette    { colors: PaletteColor[] }
layers     Layer[]                      flat list
assets     AssetReference[]
export     { preferredExporterId | null, includePreview }  (ExportSettings)
sourceCompatibility?  { [adapterId]: AdapterCompatibility }
```
Naming notes: `BackgroundLayer` and `OverlayLayer` from the original plan became `ImageLayer.role` values (§5); `BadgeGroup` is deferred to the badge phase (a badge is a `GroupLayer` for now); the app metadata block from the early proposal was dropped (no use yet). Unknown keys are rejected at load.

## 2. Coordinates and print geometry (ADR-010, Accepted)
- `PrintConfiguration { width, height, unit: 'in', dpi }`. Pixel size is derived: `round(inches × dpi)` (`getPixelSize`). 4×6 @300 → 1200×1800; 4×6 @600 → 2400×3600; 2×6 @600 → 1200×3600.
- Layer geometry (`x, y, width, height`) is stored as plain numbers in **design-canvas pixels at the design's DPI**, origin top-left, +y down. Negative/off-canvas values are valid. Numbers are not forced to integers; exporters round.
- Rotation: degrees, clockwise, about the layer center (pivot for DSLR Booth is unconfirmed — adapter concern). Opacity 0–1.
- **DPI never changes implicitly.** `rescaleProjectDpi(project, newDpi)` is the only operation that changes it: physical size is kept and every canvas-pixel length is scaled (positions, sizes, font size, letter spacing, stroke width, corner radius, frame thickness). No UI yet.

## 3. Design canvas vs output composition
`canvas` is what the operator authors (e.g., 2×6 @600 = 1200×3600). `output` is the print sheet plus how copies of the design are arranged:
- `{ kind: 'single' }` — output equals the design (same physical size and DPI).
- `{ kind: 'grid', columns, rows, gap }` — identical, unrotated copies, `gap` inches apart, centered. Two-up strip: `createTwoUpStripOutput(strip)` → 4×6 sheet, 2×1 grid.
Rules (`checkComposition`): output DPI must equal design DPI; the grid must fit. `resolveCompositionCells` returns each copy's pixel rectangle on the output. DSLR Booth sees only one larger canvas (spatial duplication, repeated `PhotoNumber`s), so duplication happens in the exporter. Photo numbers in the *design* are therefore one set (1, 2, 3).

## 4. Identity, time, colors
- **IDs:** opaque strings (1–128 chars), generated with the runtime's `crypto.randomUUID()` (UUIDv4); no dependency. Identity is never the name, array index, `photoNumber` or filename.
- **Time:** ISO 8601 UTC strings (`createdAt`, `updatedAt`) — human-readable, sortable, no epoch-unit ambiguity, JSON-native. `event.date` is a calendar date with no time zone.
- **Colors:** canonical lowercase hex `#rrggbb` or `#rrggbbaa` (alpha last): easy UI editing, SVG/CSS compatible, deterministic. Layers use `ColorValue`: `{kind:'literal', value}` or `{kind:'palette', paletteColorId}` — both supported so role-bound colors recolor automatically.
- **Palette:** `PaletteColor { id, role, name, value }`; roles `primary|secondary|accent|background|text|custom`; any subset; each non-custom role at most once; ids are stable so layers can reference them.

## 5. Layers (flat, discriminated by `type`)
Shared base: `id, type, name, x, y, width, height, rotation, opacity, zIndex, visible, locked, parentId?` (no per-layer timestamps — not needed yet).
- **PhotoLayer** (`photo`): `photoNumber` (positive integer, **not unique** — repeats are valid), `fit` (`cover|contain|stretch`), `frame` (`none` or `solid{thickness,color}`), `cornerRadius`, `sampleAssetId?`. Width/height must be > 0. No DSLR Booth field names.
- **ImageLayer** (`image`): `assetId`, `role`, `fit`. Roles: `background|overlay|frame|badge|logo|graphic`.
- **TextLayer** (`text`): `content, fontFamily, fontSize, fontWeight, fontStyle, align, lineHeight (×fontSize), letterSpacing, fill`.
- **ShapeLayer** (`shape`): `shape` (`rectangle|ellipse|line`), `fill|null`, `stroke|null {color,width}`, `cornerRadius`.
- **GroupLayer** (`group`): organizational; rotation must be 0 for now.
Image roles (ADR-020): one `ImageLayer` with a `role`, not separate near-identical types. DSLR Booth stores all of these as generic images, so roles are our semantics and are lost on export unless recorded in adapter metadata. A solid background is `canvas.backgroundColor`; a background image is an `ImageLayer` with role `background`.
Groups (ADR-021): **flat storage with `parentId`**; groups hold no child list. Stacking is `zIndex` among siblings (unique per parent; higher in front). Child coordinates are absolute canvas coordinates. Rationale: simple serialization, easy duplicate/reparent/undo patches, matches flat canvas-library object lists. Group opacity/rotation semantics are deferred.

## 6. Assets
`AssetReference { id, filename, mediaType (png|jpeg|webp|svg), path, pixelWidth?, pixelHeight?, hasAlpha?, byteSize?, sha256?, source{kind,label?,licenseNote?} }`. `path` is a project-relative POSIX path inside the project package (e.g. `assets/<id>.png`); absolute paths, `..`, backslashes and drive letters are rejected. Layers reference `assetId`; many layers may share one asset. The asset *library* is not implemented.

## 7. Portability and native format (ADR-009)
Decision: a native project is a **package** — a `project.json` manifest (the serialized `TemplateProject`) plus an `assets/` directory containing a copy of every asset used (library assets are copied in on use). It never depends on Downloads/Desktop paths. The physical container (folder bundle vs zip, `.boothproject`) is deferred to the file-IO phase; the manifest is container-independent. Implemented now: JSON manifest only, no files.

## 8. Serialization, validation, migrations
- `serializeProject(project)` → deterministic JSON text (validates first; throws on invalid). `deserializeProject(text)` / `loadProject(unknown)` → `{ok:true, project}` or `{ok:false, errors:[{code,path,message}]}`; never throws on bad input, never drops unknown fields (rejects them).
- Pipeline: detect `schemaVersion` → reject newer than supported with a clear message → run migrations (registry exists and is empty; version 1 only) → schema validation (zod) → integrity checks → model.
- Integrity (`checkProjectIntegrity`): canvas pixel range, composition validity, unique ids/paths, palette roles, parent existence/type/cycles, sibling zIndex uniqueness, asset and palette references, compatibility entries pointing at real layers. This is structural validity, not export preflight.
- Adding schema version 2 requires a migration entry, a stored v1 sample and a test, in the same change.

## 9. Source compatibility metadata (ADR-017)
Optional `sourceCompatibility: { [adapterId]: { adapterVersion?, importedAt, project?, layers?, unmapped? } }`. `project` holds project-level vendor fields (e.g. for DSLR Booth: root flags); `layers` is keyed by layer id and used only where round-tripping needs it; `unmapped` holds verbatim leftovers. Values are `JsonValue` only (no functions, no `any`). The editor never reads it; copying a layer must not copy its entry; the exporter decides what is still valid. Not populated yet.

## 10. JSON safety
The model is plain data produced by schemas: no functions, DOM/canvas/Electron objects or Buffers. Opaque compatibility data is restricted to JSON values and key-sorted on serialize.

## 11. Known limitations
Only inches; no gradients/blend modes/shadows; photo frame styles limited to none/solid; no crop rectangles; groups have no rotation/opacity semantics; layer order is by `zIndex` per parent; no badges, templates, recipes. These are additive and will bump `schemaVersion` when they change existing shapes.
