# Data Model (Proposed)

Conceptual TypeScript only — **no runtime code exists**. The model is vendor-neutral: it must not mirror DSLR Booth's XML ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md), [DECISIONS.md](DECISIONS.md) ADR-002/003). Everything here is **Proposed** and may be refined in Phase 2.

## 1. Geometry representation — analysis and recommendation

| Option | Pros | Cons |
|---|---|---|
| Pixels | Matches rasters/export; simple canvas math; integer-friendly | Meaning depends on DPI; DPI change requires rescale |
| Inches | Resolution-independent; matches physical intent | Float error; every render converts; rasters still pixel-based |
| Normalized (0–1) | Format-agnostic scaling | Distorts across aspect ratios; imprecise for fixed-size print; awkward for text/borders |

**Recommendation (Proposed):** The project stores **physical size (inches) + DPI** as first-class `PrintConfiguration`. The **canvas coordinate space is deterministic pixels** at the project's DPI (`widthPx = round(widthIn × dpi)`). Layer geometry is stored in that canvas space (numbers; non-integers permitted, rounded only at render/export). Changing DPI is an explicit operation that rescales all geometry by `newDpi/oldDpi` with a defined rounding rule. Helpers convert px↔inches for UI. Rationale: deterministic rendering/export, easy mapping to raster output, physical dimensions never lost. Final choice remains confirmable in Phase 2 (ADR-010 OPEN).

Conventions: origin top-left, +x right, +y down; rotation in degrees clockwise about the layer's center (**Proposed**); opacity 0–1; units explicit in field names or `units` field.

**Fixture evidence (2026-10-06):** five real DSLR Booth exports store integer pixel geometry at the template's resolution, with negative/off-canvas values, and no physical size ([research analysis](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md) §18). This supports the recommendation above and does not change it.

## 1a. Requirements surfaced by fixtures (vendor-neutral)
- `photoNumber` is **1-based and not unique** per project: duplicated strip cells repeat the same numbers. Validation must treat "set of numbers" (not uniqueness) as the photo count; flag only genuinely suspicious cases.
- Layer names are not unique; identity is the internal `id`.
- Two-up/multi-strip prints need a notion of repeating **layout cells** (e.g., 2 strips of 1200×3600 on 2400×3600). DSLR Booth has none, so this is our concept and is flattened on export. Representation (group vs layout object) is a Phase 2/5 decision.
- Layers may extend beyond the canvas (negative x/y, oversize); the model must allow it and preflight should warn only where useful.
- Effective DPI (asset pixels ÷ placed inches) is a derived value; fixtures show assets at 300 effective DPI on 600 DPI canvases.
- Placeholder frame/border/shadow styling is ours; DSLR export rasterizes it (fixtures only show defaults). Text layers are rasterized on DSLR export (no text element observed).
- Vendor-only fields (`Id`, `IsLegacy`, `Dimensions`, print flags, `OriginalDevice`, etc.) never become core fields; they live in an opaque adapter-owned `source` block (ADR-017, Proposed). The existing `preserved` field in `TemplateProject` is the placeholder for this.

## 2. Conceptual interfaces

```ts
type Id = string;              // stable unique ID (e.g., UUID/ULID)
type IsoTimestamp = string;    // ISO 8601 UTC

interface TemplateProject {
  schemaVersion: number;       // integer, migrated forward only
  id: Id;
  metadata: ProjectMetadata;
  event: EventMetadata;
  design: DesignMetadata;
  print: PrintConfiguration;
  canvas: CanvasConfiguration;
  palette: Palette;
  layers: Layer[];             // ordered; z-index derived from order or explicit
  assets: AssetReference[];
  origin?: { templateId?: Id; recipeId?: Id };   // template/recipe references
  export: ExportSettings;
  app: { createdWith: string; lastSavedWith: string };  // app metadata
  importReport?: ImportWarning[];  // preserved import notices
  preserved?: Record<string, unknown>; // unknown data kept for round-trip (adapter-scoped)
}

interface ProjectMetadata {
  name: string; createdAt: IsoTimestamp; updatedAt: IsoTimestamp; notes?: string;
}

interface EventMetadata {
  eventName?: string; eventType?: string;   // extensible string, with known list
  clientName?: string; organization?: string; date?: string;
  location?: string; cityState?: string; subtitle?: string;
  sponsor?: string; hashtag?: string; notes?: string;
}

interface DesignMetadata {
  styleTags: string[]; brief?: string; recipeId?: Id;
}

interface PrintConfiguration {
  widthIn: number; heightIn: number;       // physical, orientation applied
  dpi: number;
  format: 'photo-4x6' | 'strip-2x6' | 'strip-2x6-two-up' | 'custom';
  orientation: 'portrait' | 'landscape';
  bleedIn?: number; safeMarginIn?: number;
}

interface CanvasConfiguration {
  widthPx: number; heightPx: number;       // derived from print; stored for integrity check
  backgroundColor?: ColorRef;
  guides: Guide[];
}

interface Palette { id?: Id; name?: string; colors: PaletteColor[] }
interface PaletteColor { role: 'primary'|'secondary'|'accent'|'background'|'text'|string; hex: string; label?: string }
type ColorRef = { kind: 'role'; role: string } | { kind: 'hex'; hex: string };

interface BaseLayer {
  id: Id; type: LayerType; name: string;
  x: number; y: number; width: number; height: number;  // canvas px
  rotation: number; opacity: number; zIndex: number;
  visible: boolean; locked: boolean;
  parentId?: Id;
}
type LayerType = 'background'|'image'|'photo'|'text'|'shape'|'overlay'|'group'|'badge';
type Layer = BackgroundLayer|ImageLayer|PhotoLayer|TextLayer|ShapeLayer|OverlayLayer|GroupLayer;

interface PhotoLayer extends BaseLayer {
  type: 'photo';
  photoNumber: number;                      // 1-based; NOT unique across strip cells
  fit: 'cover'|'contain'|'stretch';         // crop/fill behavior
  frame?: FrameStyle;                       // none/solid/double/rounded/polaroid/offset/shadow/decorative/png
  cornerRadius?: number;
  sampleImageAssetId?: Id;
  exportHints?: Record<string, unknown>;    // vendor-neutral hints only
}
interface FrameStyle { kind: string; thickness?: number; radius?: number; color?: ColorRef; padding?: number; opacity?: number; shadow?: ShadowStyle; overlayAssetId?: Id }

interface ImageLayer extends BaseLayer { type: 'image'; assetId: Id; fit: 'cover'|'contain'|'stretch'; crop?: Rect }
interface BackgroundLayer extends BaseLayer { type: 'background'; fill?: ColorRef; assetId?: Id; fit?: 'cover'|'tile' }
interface OverlayLayer extends BaseLayer { type: 'overlay'; assetId: Id; blend?: 'normal' }
interface TextLayer extends BaseLayer { type: 'text'; text: string; boundField?: string; fontFamily: string; fontSize: number; fontWeight: number|string; align: 'left'|'center'|'right'; letterSpacing: number; lineHeight: number; color: ColorRef }
interface ShapeLayer extends BaseLayer { type: 'shape'; shape: 'rect'|'ellipse'|'line'|'path'; fill?: ColorRef; stroke?: { color: ColorRef; width: number }; cornerRadius?: number }
interface GroupLayer extends BaseLayer { type: 'group'; childIds: Id[]; badge?: { styleId: string; bindings: Record<string,string> } }

interface AssetReference {
  id: Id; scope: 'project'|'library'; kind: 'raster'|'svg'|'pdf';
  category?: string; originalName: string;
  path: string;            // path within project package (project scope) or library key
  sha256?: string; widthPx?: number; heightPx?: number; mimeType: string;
  source?: { provider?: string; url?: string; licenseNote?: string };
  tags?: string[];
}

interface ExportSettings {
  dslrBooth?: { /* vendor-neutral prefs; adapter owns mapping */ includePreview: boolean };
  png?: { dpi?: number; flatten: boolean };
  layerPackage?: { groups: string[] };
}
```
`Rect`, `Guide`, `ShadowStyle`, `ImportWarning` are to be defined in Phase 2. `BadgeGroup` is modeled as a `GroupLayer` with `badge` binding data (Proposed; may become its own type).

## 3. IDs, timestamps, versioning
Opaque string IDs generated at creation, never reused. Timestamps ISO-8601 UTC. `schemaVersion` is an integer; each increment ships a pure migration function and fixture. Files with a newer version than the app are opened read-only or refused. Unknown fields are preserved where feasible.

## 4. z-order and hierarchy
Proposed: array order is authoritative; `zIndex` is derived/normalized on save. Groups hold children via `parentId`/`childIds` (pick one canonical direction in Phase 2).

## 5. Portability and asset references — options and recommendation
- **A. Embed assets** (inside one file): fully portable; large files; slow saves.
- **B. Copy into a project package** (folder/zip with `assets/`): portable, inspectable, incremental.
- **C. Reference external files**: small, but breaks on move/transfer.
- **D. Hybrid.**

**Recommendation (Proposed): D/B hybrid.** A `.boothproject` is a package (zip container or folder bundle — container choice OPEN, ADR-009) holding `project.json` plus an `assets/` directory with copies of every project-scope asset (content-hashed). Library assets are referenced by library ID in the library but **copied into the project on use**, so a project stays self-contained. Provenance (library ID, source, license note) is retained in `AssetReference`. External absolute paths are never stored.

## 6. Unknown / preserved data
Importers store unmapped vendor data in `preserved` namespaced by adapter, plus `importReport`, so exporters can re-emit it where valid and users are warned. Details in [DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md).

## 7. Open questions
Container format; DSLR Booth `Photo` elements do carry a `Rotation` (−3 observed) but its pivot is unconfirmed; how layout cells are modeled; fonts embedding; group representation; ID scheme; text box auto-size semantics.
