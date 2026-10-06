# Canvas Library Evaluation (Phase 3A)

Status: complete. Recommendation: **Konva + react-konva** (not unanimous; see caveats). This is a research note; the decision itself is ADR-029 in [../docs/DECISIONS.md](../docs/DECISIONS.md).

## Scope and method
Both libraries were implemented behind the same contract (`src/renderer/src/spikes/canvas/shared/engine.ts`) against the **same scene built from the real `TemplateProject`/`Layer` types**: 4×6 portrait @600 DPI = 2400×3600 design pixels, three photo placeholders (photoNumber separate from id, one rotated 3°, one filled with a cover-cropped sample image), a rotated image layer, two text layers, a rectangle partly off-canvas, overlapping z-order, and a flat-model group (`parentId`). The editor viewport is 600×720 CSS px; the design is displayed through a separate view transform (fit ≈ 0.187, 100%, 50%).

Direction of data: domain → engine (Fabric: imperative sync keyed by layer id; Konva: declarative React render) and engine → domain (interaction end → normalized plain geometry → reducer). No library object is stored in domain state.

Evidence was gathered on **macOS (Retina, devicePixelRatio = 2)** against the **built** Electron app, driven over the DevTools protocol with **real mouse events** (`Input.dispatchMouseEvent`) at handle coordinates reported by each engine — scripts and raw results are in `canvas-spike/`. **Not** done by hand with a physical mouse. Not tested: Windows, HMR hot-reload, inline text editing, multi-selection, undo/redo, web fonts, trackpad gestures.

Versions evaluated (exact): **fabric 7.4.0**, **konva 10.7.1**, **react-konva 19.3.0** (peer `react ^19.3.0`), React 19.3.0, TypeScript 6.0.3 with `strict` + `exactOptionalPropertyTypes`, Vite 7.3.7, Electron 44.5.1. Both MIT.

## What both libraries did correctly (all scripted checks passed)
- Selection by real click; drag by (+60, −40) screen px moved the domain layer by exactly (321.43, −214.29) design px at scale 0.1867 (both).
- Resize via corner handle, rotate via rotation handle (center preserved, size preserved), move partly off-canvas (x = −232, **not clamped**), z-order swap, lock (locked layer does not move or select), hide, delete/recreate, 30 repeated selection cycles, 20 destroy/recreate cycles with no leaked canvases.
- Zoom (fit/100%/50%) never changed any domain value; exports are 2400×3600 and 1200×1800 regardless of view zoom or DPR (2).
- Group: click selects the group, drag moves both children by the exact delta, rotating the group leaves children rotated about the group with preserved center distance; the domain group stays rotation 0 and children hold absolute geometry.
- Text: side handle changes box width only; corner handle scales glyphs (fontSize ×scaleY) and widens the box. Same convention implemented for both.
- Snapping (center/edges of canvas and other layers, tolerance 10 **screen** px = 53.6 design px at fit) with live guides and cleared on release — one shared pure function, so each engine only needed a hook.
- After the final configuration, the two 2400×3600 exports are visually identical; mean absolute channel difference **0.65/255**, **0.44 %** of pixels differ by more than 48 (text anti-aliasing). Probes of canvas corners, border edges, the off-canvas accent, title text and the crop were identical.

## Findings by topic

### Transform model (high priority)
| | Fabric 7 | Konva 10 |
|---|---|---|
| Resize result | `width/height` unchanged + `scaleX/scaleY` (Textbox side handles change `width`, corners scale) | `width/height` unchanged + `scaleX/scaleY` on the node after Transformer |
| Image size | **is** scale (width/height = source pixels); adapter must set `scaleX = w/img.width` | `width/height` props directly |
| Rotation pivot | about `originX/originY` (v7.4 default is **center**; needed `originX:'left'` for the background) | about the node origin; `offsetX/Y` = half size gives center rotation |
| Hidden geometry | `strokeWidth` defaults to 1 and is part of the bounding box (insets fills by 0.5 px); `uniformScaling` default **true** on corners | none observed; stroke drawn centered on the edge |
| Normalization | `matrix = calcTransformMatrix()` (includes group) → our `matrixToGeometry(m, obj.width, obj.height, 'center')` | `getAbsoluteTransform()` × inverse(stage matrix) → `matrixToGeometry(m, node.width, node.height, 'top-left')` |
After a resize both leave scale ≠ 1 on the live object; the adapter must fold it into the domain value and **reset scale to 1** (Fabric: in the sync step; Konva: imperatively on the node because react-konva only updates changed props). Both are fine once written, and the math is in `shared/geometry.ts` with unit tests. Konva needed fewer special cases; Fabric had four defaults that silently affect geometry or output (origin, strokeWidth, uniformScaling, objectCaching).

### React 19 and lifecycle (high priority)
- **Konva/react-konva:** declarative; the scene is a pure function of domain props, which matches "domain is authoritative". Needed three imperative patches: re-center text after Konva measures its height (layout effect), reset scale after transform, reset the runtime group after drag. Event handlers closure over Konva refs, which the React 19 compiler lint (`react-hooks/refs`) flags; the spike disables it with a comment — production needs a stable-callback pattern. A Stage-level `transformend` handler never produced a geometry update in my first attempt (the event target was not the transformed node); attaching handlers on each node worked. Works under dev StrictMode (double effects): 1 canvas, no warnings.
- **Fabric:** no official wrapper; imperative `Canvas` created in an effect, disposed in cleanup (`dispose()` is async). The sync/diff layer is ours (roughly a third of the 454-line component). Creates 2 canvas elements + wrapper div; cleanup removed them (20 remounts, still 2). Works under dev StrictMode. A bug I introduced (sync removed the design background each pass) is an example of the burden of hand-written sync.
- HMR hot reload: **not tested** for either.

### Photo placeholder (high priority)
Both work well as **one object with custom rendering** (rectangle + sample image clipped, border, big number, "Photo N" label): Fabric by subclassing `Rect` and overriding `_render` (underscore, semi-private API); Konva with `Shape` + `sceneFunc` and an explicit `hitFunc` for the full box (public API). Single-object placeholders keep resize/rotate handles clean (no label scaling). Grouped primitives would transform their text/borders with the group in both libraries and are not recommended.

### Crop / clip (high priority)
Cover-fit with clipping (`coverSource` helper + `clip()` in the draw routine) worked identically in both, rendered and exported correctly, and responded correctly to resize/rotate because it is part of the object's own drawing. Fabric additionally has `clipPath`; Konva has `clipFunc`. Neither is a blocker.

### High-resolution export (high priority)
- **Fabric:** reset `viewportTransform` to identity, `toCanvasElement(multiplier, {left:0, top:0, width, height})`; retina scaling is disabled inside. Exact 2400×3600 and 1200×1800. **But** pixel-exactness required `objectCaching:false` (cached bitmaps resampled the placeholder borders by ~0.25 px) and `strokeWidth:0` on the background (0.5 px inset at the top/left edges). Without these, canvas corners and borders were visibly anti-aliased.
- **Konva:** temporarily set stage scale 1 / position 0 / size = design, `toDataURL({pixelRatio: out/design})`, restore. Exact output, corners and borders pixel-exact with no special settings. `pixelRatio` is explicit so DPR does not matter.
Both produced correct dimensions from any zoom; timings (warm) ≈ 50–90 ms for 2400×3600 at 100 layers (cold first call 160–220 ms).

### Zoom / DPR
Both keep the view as a transform separate from design coordinates (Fabric `viewportTransform`, Konva stage scale/position). Canvas backing store was 1200×1440 for a 600×720 CSS viewport at DPR 2 in both (crisp); neither affects project geometry or export size.

### Text
Both render nearly identical text (Georgia/Helvetica system fonts; system fonts need no loading, web fonts untested). Fabric `Textbox` has built-in inline editing, character spacing in 1/1000 em, per-character styling; Konva `Text` has no built-in editing — inline editing would be an HTML `<textarea>` overlay (standard pattern, also better for IME/accessibility). Text height is measured by the library in both; the domain `height` for text is advisory and must be read back.

### Groups
Both can render domain groups as runtime groups and convert children back to absolute domain geometry from world matrices (same results). Konva's group model is simpler (children local to the group); Fabric's group uses center-relative children and sub-target flags. The domain flat/`parentId` model needed no change.

### Snapping / guides
Feasible in both at low cost; the pure `computeSnap` handles canvas/center/edge/other-object targets with a screen-pixel tolerance converted to design units. Hook-up: Fabric `object:moving` + drawing guides in `after:render`; Konva `onDragMove` + `Line` nodes. Neither engine is a differentiator.

### Performance (practical)
Mixed scenes of 20/60/110 objects: drag redraw ≈ 0.3–0.5 ms/step, zoom redraw ≈ 0.2–0.6 ms/step, first render 7–14 ms in both (Fabric with objectCaching disabled). Realistic template sizes are far below any limit. Memory was not measured reliably (`performance.memory` stayed at ~12 MB).

### TypeScript
Fabric 7's typings are strong (class generics, event maps); casts needed: Textbox, matrix, `oCoords`. Konva's config objects are loosely typed and conflict with `exactOptionalPropertyTypes` (cannot pass `undefined` for `fill`/`stroke`); casts: `currentTarget` to `Group`/`Ellipse`, matrix, raw `ctx._context`. Both ~6–11 assertions; no `any`.

### Accessibility / DOM
Neither adds accessibility; canvas content is opaque to assistive tech in both. Surrounding React UI and the layers panel must carry accessibility.

### Electron / security
Entirely renderer-side; no Node access (`typeof require === 'undefined'`), no CSP changes (data URLs for generated images, no blob/remote), no filesystem or network use.

### Bundle / dependencies
Minified: Fabric 299 kB (92 kB gzip), 28 MB in `node_modules`; Konva 194 kB (58 kB gzip) + react-konva 11 kB, 2.1 MB. Konva adds `react-reconciler`/`its-fine`/`scheduler`.

### Adapter size
~450 lines each for the engine component (Fabric 454 + 59 for the placeholder class; Konva 451), same shared modules (geometry/viewport/snap/images/scene, 575 lines, unit-tested).

### Serialization implications
Neither library's serializer is used. Reconstruction from domain data is deterministic in both: after 20 destroy/recreate cycles and after interactive transforms, domain geometry was identical (`recreateKeepsGeometry: true` for both).

## Scored matrix
Scale: 1 poor · 2 weak · 3 acceptable · 4 strong · 5 excellent. Weights: 3 = high priority, 2 = medium, 1 = lower (assigned from the brief's priorities; images/text/off-canvas/retina treated as medium).

| # | Criterion | W | Fabric 7.4 | Konva 10.7 + react-konva 19.3 | Note |
|---|---|---|---|---|---|
| 1 | React 19 integration | 3 | 3 | 4 | Fabric imperative with own sync; react-konva official for React 19 |
| 2 | TypeScript quality | 3 | 4 | 3 | Konva configs loose, `exactOptionalPropertyTypes` friction |
| 3 | Transform model / normalization | 3 | 3 | 4 | Fabric: four silent defaults; image size = scale |
| 4 | Domain-model synchronization | 3 | 3 | 4 | declarative render vs hand-written diff |
| 5 | Photo placeholder implementation | 3 | 4 | 4 | single custom-drawn object in both |
| 6 | Image handling | 2 | 4 | 4 | |
| 7 | Text handling | 2 | 4 | 3 | Fabric has built-in editing |
| 8 | Shapes | 1 | 4 | 4 | |
| 9 | Groups | 2 | 3 | 4 | |
| 10 | Z-order | 1 | 4 | 5 | React child order is z-order in Konva |
| 11 | Off-canvas support | 2 | 5 | 5 | no clamping in either |
| 12 | Zoom/pan architecture | 3 | 4 | 4 | |
| 13 | Snapping/guides feasibility | 2 | 4 | 4 | |
| 14 | Crop/clip feasibility | 3 | 4 | 4 | |
| 15 | High-resolution export | 3 | 3 | 4 | Fabric needs caching/stroke fixes for exactness |
| 16 | Retina behavior | 2 | 4 | 4 | |
| 17 | Performance at realistic counts | 2 | 4 | 4 | |
| 18 | Cleanup/lifecycle | 3 | 3 | 4 | async dispose + DOM wrapper vs unmount |
| 19 | Extensibility | 1 | 5 | 4 | |
| 20 | Bundle/dependency impact | 2 | 3 | 4 | |
| 21 | Documentation/maintainability | 1 | 3 | 4 | Fabric 7 defaults origin to center and has several geometry-affecting defaults; both maintained (Konva released 2026-10-05) |
| 22 | Adapter/custom code required | 2 | 3 | 4 | |
| | **Unweighted total (max 110)** | | **81** | **88** | |
| | **Weighted average (weights sum 49)** | | **3.61** | **3.96** | |
| | **High-priority items only (9 criteria)** | | **3.44** | **3.89** | |

The totals are not the decision by themselves. The decision rests on the product-specific weighting below.

## Reasoning and caveats
Why Konva: (1) the declarative scene makes the domain model the only source of truth with no hand-written reconciliation; (2) fewer silent geometry/output defaults — exports were pixel-exact out of the box and the transform model maps to our width/height/rotation with one normalization point; (3) groups and z-order are simpler; (4) smaller bundle.
What Konva costs: no built-in text editing (needs an HTML overlay), looser TypeScript with `exactOptionalPropertyTypes`, three imperative patches inside a declarative tree, and a React 19 lint rule that needs a stable-callback pattern.
What would flip the decision: if on-canvas inline text editing with rich per-character styling becomes a core requirement, Fabric's `Textbox` is materially ahead. Both libraries are viable; the margin is moderate, not overwhelming. Fabric's weaknesses are all solvable (and are now documented), so it is not "unsafe" — it just needs more defensive adapter code.

## Recommended Phase 3B architecture (for approval)
- `src/canvas/` with: pure `geometry`, `viewport`, `snap` (promoted from the spike, already tested); an `EditorCanvas` React component wrapping Konva; domain-state via a store with command history (Zustand per ADR-013, introduced then); engine only receives props and emits `GeometryChange[]`.
- Placeholder as a single `Shape` with `sceneFunc/hitFunc`; text via `Text` plus HTML overlay for editing; group handled as runtime `Group` baked back to absolute child geometry on end.
- Always: design-space coordinates in the domain; the view transform on the Stage only; export via an off-screen/neutral-view render at the requested pixel size.
- Stable-callback pattern (e.g., `useEffectEvent`/store selectors) to satisfy `react-hooks/refs`.

## Reproducing
`canvas-spike/` holds the driver scripts and recorded results. The dual-engine spike code lives in git history at commit `2349f7f`; the cleanup commit that follows removes the Fabric implementation.
