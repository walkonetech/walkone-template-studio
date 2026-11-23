# Data Model (Implemented in Phase 2 / 2B)

Source of truth is the code in `src/domain/` (zod schemas; TypeScript types are inferred from them). This document explains the model and why. It is vendor-neutral: DSLR Booth structures are handled only by adapters ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md), ADR-002/003). Evidence behind the choices: [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). Decisions: [DECISIONS.md](DECISIONS.md).

_Phase 7B B6 (accessibility and platform polish, ADR-061) changed nothing in this model: no field, no schema version, no file-format change._

## 1. Shape of `TemplateProject` (schemaVersion 2; files are written at the lowest version that represents them, ADR-060)
```
format: "walkone.template-project"      marker
schemaVersion: 1 | 2                    integer (file: oldest version that can read it; in memory: 2)
id                                      project id
metadata   { name, createdAt, updatedAt, notes? }
event      { eventName?, eventType?, clientName?, organization?, date? (YYYY-MM-DD), location?, cityState?, subtitle?, sponsor?, hashtag?, notes? }
design     { styleTags[], brief? }                         (DesignMetadata)
canvas     { print: PrintConfiguration, backgroundColor, safeMarginMm? }  (DesignCanvas; safeMarginMm optional, B5.5)
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
- `{ kind: 'grid', columns, rows, gap, rowGap?, margins?, align? }` — identical, unrotated copies. `gap` inches between columns (and rows unless `rowGap`); the block is centred inside the sheet minus `margins` (`align: 'center'`, default) or starts at the top-left margin (`'start'`). Two-up strip: `createTwoUpStripOutput(strip)` → 4×6 sheet, 2×1 grid, no optional fields.
- **B5.5 (ADR-059):** `rowGap`, `margins {top,right,bottom,left}` (inches, 0–50) and `align` are OPTIONAL; absent = the pre-B5.5 meaning, and writers omit default values, so every existing project reads, renders and saves unchanged. A file that USES any of them (or `canvas.safeMarginMm`) is written as `schemaVersion: 2`; one that uses none stays `1` (ADR-060).
Rules (`checkComposition`): output DPI must equal design DPI; the grid must fit inside the margins. `resolveCompositionCells` returns each copy's pixel rectangle on the output. DSLR Booth sees only one larger canvas (spatial duplication, repeated `PhotoNumber`s), so duplication happens in the exporter. Photo numbers in the *design* are therefore one set (1, 2, 3).

### 3a. Formats and the generic design safe margin (B5.5, ADR-059)
A **format** (`FormatDefinition`, `src/domain/print/format.ts`) is what a new project starts from: design size in inches (canonical) + DPI + entered unit + arrangement (exact size / repeat / custom sheet) + generic safe margin + cut-guide preference. Built-in and custom formats create projects through one path (`createProjectFromFormat` → `createProject`). A format is not stored in the project; the project keeps only its result: `canvas.print`, `output` and, when chosen, `canvas.safeMarginMm`.
- **Units:** inches are canonical (unrounded); mm = in × 25.4; px = round(in × DPI), the only rounding. Display: in 3 decimals, mm 2, px whole. Switching the display unit never rewrites the stored inches. A pixel-entered format keeps its pixels when the DPI changes (DPI is print-size metadata).
- **Limits:** each side > 0, ≤ 100 in, 10–30 000 px; each canvas (design, sheet) ≤ 64 megapixels; DPI 1–4800; 1–8 copies across/down; gaps ≤ 10 in; margins ≤ 50 in.
- **`canvas.safeMarginMm` (optional, 0–50 mm):** the format's generic keep-safe distance from every design edge. Generic guidance, never printer evidence; a fitting Output Profile's safe areas supersede it (§11 still holds for printer data).
- **My formats** (saved custom formats) are app-local (`formats.json`), never in a project.

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

## 7. Portability and native format (ADR-009, Accepted)
A native project is **one file with the extension `.boothproject`**: a ZIP-compatible archive containing exactly
```
project.json          the serialized TemplateProject (the only authoritative manifest)
assets/<file>         every asset the project references (copies; library assets are copied in on use)
```
Package rules (implemented in `src/projects/`): asset `path` values must live under `assets/`, be unique ignoring case, and be portable file names; the package never depends on external paths; **strict loading** — any entry other than `project.json` and files under `assets/` (including scripts, other folders, links, encrypted or duplicate entries, `..`/absolute/backslash paths) is rejected; files under `assets/` that no `AssetReference` uses are reported as a warning and not carried over (never silently kept or dropped); every referenced asset must be present, and recorded `byteSize`/`sha256` are verified on open.
**One version number:** the archive adds no version of its own. Its layout is fixed by `project.json` + `assets/` and evolves under `TemplateProject.schemaVersion`. A second container version will be added only if the archive layout itself must change independently.
**Working session (not part of the file):** while a project is open it lives in an app-managed directory (`<userData>/sessions/<sessionId>/` with `project.json`, `assets/`, `session.json`). `session.json` holds `projectId`, `originalPath`, `createdAt`, `lastWorkingSaveAt`, `lastPortableSaveAt`, `portableHash`, `hasUnsavedChanges`, `ownerPid`. See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §6 and ADR-027.

## 8. Serialization, validation, migrations
- `serializeProject(project)` → deterministic JSON text (validates first; throws on invalid). `deserializeProject(text)` / `loadProject(unknown)` → `{ok:true, project}` or `{ok:false, errors:[{code,path,message}]}`; never throws on bad input, never drops unknown fields (rejects them).
- Pipeline: detect `schemaVersion` → reject newer than supported with a clear message ("Update the app") → run migrations N → N+1 (1 → 2 only re-labels) → schema validation (zod) → refuse a file whose content needs a newer version than it declares (`schema-version-mismatch`) → integrity checks → model (always at the current version in memory).
- Integrity (`checkProjectIntegrity`): canvas pixel range, composition validity, unique ids/paths, palette roles, parent existence/type/cycles, sibling zIndex uniqueness, asset and palette references, compatibility entries pointing at real layers. This is structural validity, not export preflight.
- **Schema-version policy (ADR-060):** the number in a file is the oldest file-format version whose readers can parse it. Bump `CURRENT_SCHEMA_VERSION` whenever an older reader would reject or misread something the new writer can produce, **including optional fields** (unknown fields are rejected). Writers stamp the lowest version that represents the content (`fileSchemaVersion`), so files without newer features stay readable by older builds. Every bump ships a migration entry, a stored sample at the previous version (`tests/fixtures/projects/schema-vN/`, written by the last build of that version) and tests, in the same change.
- **Version history:** 1 — original. 2 — B5.5: optional grid `rowGap` / `margins` / `align`, optional `canvas.safeMarginMm` (migration only re-labels).

## 9. Source compatibility metadata (ADR-017)
Optional `sourceCompatibility: { [adapterId]: { adapterVersion?, importedAt, project?, layers?, unmapped? } }`. `project` holds project-level vendor fields (e.g. for DSLR Booth: root flags); `layers` is keyed by layer id and used only where round-tripping needs it; `unmapped` holds verbatim leftovers. Values are `JsonValue` only (no functions, no `any`). The editor never reads it; copying a layer must not copy its entry; the exporter decides what is still valid. Populated by the DSLR Booth importer (ADR-048, adapter id `dslrbooth`); every edit prunes `layers` entries whose layer no longer exists (`src/editor/compatibility.ts`).

## 10. JSON safety
The model is plain data produced by schemas: no functions, DOM/canvas/Electron objects or Buffers. Opaque compatibility data is restricted to JSON values and key-sorted on serialize.

## 11. What stays out of `TemplateProject` (ADR-049, ADR-043)
The template source document describes the design only. These belong to other, future stores and must **not** be added as `TemplateProject` fields:
- **Company Profile** (company name, logos, brand colours, preferred fonts, contacts, default sharing branding, default export settings and output profiles). A template may later *reference* a company element (e.g. "company logo"), resolved from the profile.
- **Output Profiles / printer finishing**: printer model, driver or PrintTicket settings, media, cut positions (e.g. the 2-inch cut), printer safe margins, overscan, borderless behaviour. (Not to be confused with a format's *generic design* safe margin, `canvas.safeMarginMm`, ADR-059: printer-independent guidance with no evidence claim.) The safe-area check reads the active profile; the template stays vendor-neutral. **v1 exists (ADR-053):** `walkone.output-profile` v1 in `src/output/` (bundled JSON profiles; no PrintTicket data); the selected profile is an app preference, not a project field; no schema change.
- **Sharing / SMS / email settings and provider credentials** (WalkOne Booth only; credentials in OS-backed secure storage, never in project files, event packages, plain JSON or logs).
- **Event-runtime state** (sessions, captures, print and share queues) and **approved event revisions** as records (the approval workflow is future; a revision snapshots a template, it is not a template field).

Where these live and how both apps read them is open (docs/PRODUCT_ECOSYSTEM.md §17). Any change to this list needs an ADR and, if it touches the file, a `schemaVersion` decision.

## 12. Known limitations
Only inches are stored (millimetres and pixels are entry/display units, B5.5); no gradients/blend modes/shadows; photo frame styles limited to none/solid; no crop rectangles; groups have no rotation/opacity semantics; layer order is by `zIndex` per parent; no badges, templates, recipes. Adding any of them to the file bumps `schemaVersion` (ADR-060: even optional fields, because older readers reject unknown fields).
