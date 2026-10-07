# Decision Log (ADR style)

Statuses: **Accepted**, **Proposed**, **OPEN** (undecided — do not decide without owner approval). Format: Context → Decision → Consequences. Date of Phase 0 entries: 2026-10-06.

## ADR-001 — Desktop-first application — Accepted
**Context:** needs filesystem, ZIP, image processing, drag-and-drop. **Decision:** build a desktop app (macOS + Windows), web-style GUI. **Consequences:** Electron-class runtime; web version not a v1 requirement but not prohibited.

## ADR-002 — Vendor-neutral internal project model — Accepted
**Decision:** `TemplateProject` is our own schema ([DATA_MODEL.md](DATA_MODEL.md)). **Consequences:** DSLR Booth structures never leak into core.

## ADR-003 — DSLR Booth integration via adapters — Accepted
**Decision:** `DSLRBoothImporter` / `DSLRBoothExporter` convert to/from the internal model. **Consequences:** tolerates DSLR Booth format changes; mapping isolated and tested.

## ADR-004 — Local-first — Accepted
**Decision:** editor works offline; data stored locally. **Consequences:** integrations degrade gracefully.

## ADR-005 — Project schema versioning from day one — Accepted
**Decision:** `schemaVersion` + forward migrations with fixtures. **Consequences:** backward compatibility obligation.

## ADR-006 — No cloud/accounts/billing for initial release — Accepted
**Decision:** v1 is an internal tool; no auth, sync, billing, marketplace. **Consequences:** keep architecture from needlessly blocking commercialization.

## ADR-007 — External providers behind adapters — Accepted
**Decision:** Magnific/Freepik, Envato, etc. live under `integrations/<provider>`; core independent. API availability is unvalidated.

## ADR-008 — Real DSLR Booth exports are compatibility fixtures — Accepted
**Decision:** owner-supplied exports in `tests/fixtures/dslrbooth/` are golden references; never fabricate. See [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## ADR-009 — Native project format: single-file `.boothproject` package — Accepted (Phase 2B)
**Decision:** the portable project is one ZIP-compatible file, `.boothproject`, containing `project.json` and `assets/` (copies of all used assets). Loading is strict: only those two kinds of entries are accepted; unsafe paths, links, encryption, duplicates, case collisions and unreferenced assets are rejected or reported. No separate container version: the layout evolves under `TemplateProject.schemaVersion`. Active work happens in an app-managed working session, not by rewriting the archive. See [DATA_MODEL.md](DATA_MODEL.md) §7.

## ADR-010 — Geometry units and coordinate space — Accepted (Phase 2)
Hybrid: project stores physical size (inches) + DPI; pixel size is derived; layer geometry is stored as numbers in design-canvas pixels at the design DPI. DPI changes only via the explicit `rescaleProjectDpi` operation. Evidence: [fixture analysis §18](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). Implemented in `src/domain/print`.

## ADR-011 — Canvas library — Accepted: Konva (see ADR-029)
Resolved by the Phase 3A spike. Original criteria: large-canvas/HiDPI performance, rotation/resize handles, snapping/guides, React integration, export fidelity/determinism, independence from our serialization, maintenance/licensing, testability.

## ADR-012 — SQLite scope — OPEN
Likely library index/recents; whether anything else uses it is undecided. Native module packaging considerations.

## ADR-013 — Preferred stack — Partly accepted
Accepted so far: Electron, React, TypeScript, Vite (electron-vite), zod, Vitest, Konva/react-konva, **Zustand (ADR-030)**, yauzl/yazl (instead of JSZip, ADR-025). Still proposed/not installed: Sharp, fast-xml-parser, SQLite.
Direction only; confirm per phase when introduced.

## ADR-014 — Preview/export rendering approach — OPEN
Single shared renderer (e.g., Sharp-based) vs canvas-library renderer with parity tests. Decide in Phase 12.

## ADR-015 — Font strategy (system vs bundled, licensing) — OPEN
Decide in Phase 6.

## ADR-016 — Build tooling: electron-vite, Vite 7, ESLint + Prettier — Accepted (Phase 1)

**Context:** Phase 1 needed one build pipeline for main, preload and renderer. **Decision:** use `electron-vite` (which wraps Vite). Vite is pinned to `^7` and `@vitejs/plugin-react` to `^5` because `electron-vite@5` supports Vite 5–7 only. Keep `package.json` without `"type": "module"` so the sandboxed preload stays CommonJS. Prettier skips Markdown to avoid churn in docs. **Consequences:** upgrade Vite only when electron-vite supports it. Zustand, Sharp, JSZip, fast-xml-parser and a test runner are not yet installed (ADR-013 stays Proposed).

## ADR-017 — Adapter-scoped source compatibility metadata — Accepted (Phase 2; population is future)
Optional `sourceCompatibility` map keyed by adapter id, holding `project`-level values, `layers` entries keyed by layer id only where needed, and `unmapped` verbatim data, all JSON-only. The core model stays vendor-neutral and the editor ignores it. Layer copies don't inherit entries; the exporter decides validity of stale values. Populated by the DSLR Booth importer in a later phase.

## ADR-018 — Runtime validation with zod — Accepted (Phase 2)
**Context:** project files must be validated on load with located errors, and types should not drift from validation. **Options:** hand-written validators (no dependency, but duplicated types and many bespoke checks), valibot, zod. **Decision:** zod 4 (`strictObject` to reject unknown keys, discriminated unions for layers); types are inferred from schemas; cross-field rules live in `checkProjectIntegrity`. **Consequences:** one runtime dependency; domain code imports zod only; schemas are the single source of truth.

## ADR-019 — Test runner: Vitest — Accepted (Phase 2)
Fits the Vite/TypeScript stack and needs no extra transform setup; node environment; `npm test`. Component/E2E tooling is not chosen yet.

## ADR-020 — Image roles instead of separate layer types — Accepted (Phase 2)
`ImageLayer.role` (`background|overlay|frame|badge|logo|graphic`) rather than distinct Background/Overlay/Frame interfaces: they share all fields and DSLR Booth stores them identically. A solid background is `canvas.backgroundColor`.

## ADR-021 — Flat layer storage with `parentId` — Accepted (Phase 2)
Groups don't own children; children point to the group. Easier serialization, duplication, reparenting and undo; matches flat canvas-library lists. zIndex is per sibling set.

## ADR-022 — IDs, timestamps, colors — Accepted (Phase 2)
UUIDv4 via `crypto.randomUUID()`; ISO 8601 UTC strings; lowercase hex `#rrggbb[aa]` with literal-or-palette-reference `ColorValue`.

## ADR-023 — Domain location and dependency direction — Accepted (Phase 2)
`src/domain/` is a dedicated pure-TypeScript module (no Electron/React/DOM), imported by renderer, main, tests and future adapters via the `@domain` alias; `src/shared` stays for IPC contracts. Domain imports nothing from the app.

## ADR-024 — Design canvas vs output composition — Accepted (Phase 2)
Authoring canvas and print sheet are separate; `single` or `grid` arrangement of unrotated copies at equal DPI. DSLR Booth two-up (duplicated elements on a larger canvas) is produced by the exporter.

## ADR-025 — Archive implementation: yauzl + yazl — Accepted (Phase 2B)
**Context:** need path-safe extraction, deterministic creation, low memory with large rasters, Node/Electron main only. **Options:** JSZip (promise API, but loads whole archives in memory, no built-in traversal protection), fflate (tiny and fast, in-memory buffers), yauzl/yazl (stream- and file-based, random-access reading, strict file-name validation, per-entry mtime/mode control). **Decision:** `yauzl` (read) and `yazl` (write), plus their type packages. Assets are streamed between disk and archive; hashes are computed while streaming. **Consequences:** two small CommonJS dependencies kept external in the main bundle; no browser/renderer ZIP capability (not needed). JSZip remains unnecessary for native projects; DSLR Booth ZIP handling can revisit the choice.

## ADR-026 — Recent projects stored in a small JSON file — Accepted (Phase 2B)
A bounded (10) JSON list in the app-data directory; no SQLite. It stores only path, name, project id and time, tolerates corruption, and flags missing files. SQLite stays reserved for library/index features (ADR-012).

## ADR-027 — Working sessions and dirty state — Accepted (Phase 2B)
Each open project has a unique session directory under `<userData>/sessions/` holding the working `project.json`, `assets/` and `session.json` recovery metadata. Autosave writes only the working manifest. "Dirty" = serialized project hash differs from the last successful portable save; only Save/Save As/Open make it clean. Clean sessions are deleted on close; sessions with unsaved changes survive an unclean exit for future recovery.

## ADR-028 — Atomic save strategy — Accepted (Phase 2B)
Write a temp file beside the destination, verify it by reopening, fsync, then rename over the destination; fall back to backup-and-swap when the OS refuses to rename over an existing file, restoring the backup on failure. The existing file is never truncated. Windows behavior is implemented per Node semantics but has not been tested on Windows.

## ADR-029 — Canvas rendering/editing engine: Konva + react-konva — Accepted (Phase 3A)
**Context:** the editor needs a print-resolution canvas (2400×3600 design px at 600 DPI) with selection, transforms, photo placeholders, text, shapes, groups, off-canvas geometry, z-order, snapping, crop/clip and exact high-resolution export, over a vendor-neutral domain model that must stay authoritative. **Alternatives:** Fabric.js 7.4.0 (imperative, richer text editing) and Konva 10.7.1 with react-konva 19.3.0 (declarative). **Evidence:** both were implemented against the same domain-built scene and driven with real mouse events on macOS; both passed every functional check (selection, drag/resize/rotate, off-canvas without clamping, z-order, lock/hide, groups, text, snapping, crop, destroy/recreate, zoom independence, 2400×3600 and 1200×1800 exports, Retina) and performed far beyond need at ~110 objects. Differences: Konva needed fewer special cases (Fabric: default origin center, `strokeWidth` 1 in the bounding box, `uniformScaling`, and `objectCaching` all had to be changed for pixel-exact export; image size is scale), the declarative scene removes hand-written reconciliation, groups and z-order are simpler, and the bundle is smaller (194 kB vs 299 kB min). Fabric is ahead on built-in inline text editing and TypeScript typings. Weighted score 3.96 vs 3.61 (high-priority criteria 3.89 vs 3.44). Details: [../research/CANVAS_LIBRARY_EVALUATION.md](../research/CANVAS_LIBRARY_EVALUATION.md). **Decision:** use Konva with react-konva as the editor canvas engine, behind our own engine contract; library objects are never persisted or stored in domain state. **Consequences:** inline text editing will use an HTML overlay; stable-callback pattern needed for the React 19 `react-hooks/refs` lint; Konva's loose config typing must be wrapped; if rich on-canvas text editing becomes a core requirement the choice can be revisited because only the adapter is engine-specific. Fabric was removed from dependencies; its spike remains in git history (`2349f7f`). Phase 3B builds the real canvas from the retained pure modules (`geometry`, `viewport`, `snap`).

## ADR-030 — Editor state: Zustand vanilla store over pure mutations — Accepted (Phase 3B)
**Context:** the editor needs shared state (project, selection, view, interaction, snapping) usable from React, Konva event handlers and tests, with the project as the single source of truth. **Alternatives:** React context/reducer; Redux Toolkit; Zustand. **Decision:** Zustand (5.x) using the vanilla `createStore` so the store has no React dependency and can be driven in Vitest; project changes are **pure functions** (`src/editor/mutations.ts`) applied through one `commit` action; Electron access is an injected `EditorPorts` object. The store holds the project exactly once (no second copy of geometry); Konva handlers read it with `getState()` rather than closing over React state or refs. React reads it through `useStore(selector)`; selectors must return stable values (a selector that builds a new object each call loops, which was hit and fixed with `useViewTransform`). **Consequences:** one small dependency; store logic fully unit-tested without Electron; undo/redo, dirty state and working-copy writes live in one place.

## ADR-031 — Undo/redo: snapshots with structural sharing — Accepted (Phase 3B)
**Context:** undo must exist before dozens of editor actions do. **Alternatives:** command pattern (an inverse per action), patches, snapshots. **Decision:** snapshots of the immutable `TemplateProject`; because every mutation shares unchanged layers, a snapshot is a cheap reference. History (past/future, limit 200) covers project content only: selection, zoom/pan, guides, snapping and interaction mode are outside it. A transform/drag commits ONE mutation at interaction end (so one entry); rapid same-key edits (arrow-key nudges) coalesce within 600 ms; a new edit clears redo; opening/creating a project resets history. Dirty = `project !== savedProject` by reference, so undoing back to the saved snapshot is clean. **Consequences:** every future mutation is undoable for free; memory grows with distinct layer objects (bounded by the limit); if projects become huge, patches can replace snapshots behind the same API.

## ADR-032 — Loading project images: IPC byte bridge, no new protocol — Accepted (Phase 3B)
**Context:** the sandboxed renderer must show project-owned images without filesystem access and without weakening the CSP. **Alternatives:** custom `app-asset://` protocol (needs privileged scheme registration, CSP `img-src`, and CORS headers to keep the canvas untainted); blob/data URLs created in main. **Decision:** `project:readAsset` IPC takes `{sessionId, assetId}` (never a path); main resolves the asset from the validated project record, confines the path to the session `assets/` directory, size-caps (256 MB) and returns bytes; the renderer decodes raster images with `createImageBitmap` (no URL, untainted canvas) and SVG through an `<img>` with a `data:` URL (already allowed). The CSP is unchanged. Decoded images live in an `ImageCache` keyed by session+asset and are released when the session closes. **Consequences:** bytes cross IPC once per asset (fine for desktop-sized files; revisit with a protocol or streaming for very large assets); main-process asset index follows `updateWorkingCopy`, so newly added assets must be registered there first.

## ADR-033 — Layer-management rules: order, selection, multi-select, grouping, commits — Accepted (Phase 4)
**Order:** the Layers Panel shows the REVERSE of canvas paint order per sibling set (top of panel = front); the persisted `zIndex` model is unchanged and ties break by array order in both views (`buildPanelRows` vs `sortedSiblings`), with a test that panel and canvas agree. **Selection:** the store holds `selectedIds` (multi-selection implemented). Canvas click selects the OUTERMOST group (a group behaves as one object); Alt/Option-click selects the clicked layer itself; clicking a row in the panel selects exactly that layer (child or group); pressing something already selected keeps the selection, so a panel-selected child can be moved on its own; Cmd (macOS) / Ctrl (Windows) or Shift click toggles on the canvas, Cmd/Ctrl-click toggles and Shift-click selects a visible range in the panel. Locked and hidden layers can be selected from the panel (so they can be unlocked/shown) but are never selectable by canvas click and never get transform handles. **Multi-selection** uses one shared Konva Transformer; Konva drags all attached nodes together; one interaction commits ONE mutation; bulk operations act on the topmost selected layers only so a group and its own child are never processed twice. **Reorder:** pointer-based drag within the same parent (no DnD library); cross-group drops are refused with a message. Stacking commands move selected siblings as a block. **Grouping:** `Group` wraps same-parent siblings (positions unchanged, group takes the topmost member's stacking slot); `Ungroup` returns children in place and folds the group's opacity/hidden/locked into them so the picture does not change. **Commit semantics:** inspector fields keep a text draft and commit on Enter/blur (Escape discards), one undo entry per committed edit; an edit that changes nothing is a no-op and creates no history; continuous color-picker input coalesces. **Consequences:** a documented selection model with a few modifier rules; cross-group drag and drag-into-group are deferred; group opacity/rotation controls are not exposed.

## ADR-034 — Unsaved-changes protection, autosave and crash recovery — Accepted (Phase 4B)
**Close/quit lifecycle.** One main-process `CloseCoordinator` decides every close path (Close Project, Open, New, New Sample, window close, Cmd+Q/app quit). The renderer owns document state but is not the only guardian: main asks it for the state (`document:request`, 1.5 s timeout, treated as "no state, proceed") and shows the **native** Save / Don't Save / Cancel dialog. Cancel, a dismissed dialog, a failed Save, or a cancelled Save As abort the close (the app stays open); Don't Save and a successful Save proceed. Concurrent requests (window close + Cmd+Q) share one in-flight decision, so there is one prompt. Window `close` and `before-quit` call the same coordinator; after approval main sets an approval flag and re-issues the close/quit, and `service.closeAll()` removes sessions only once the close has really succeeded. On macOS closing the last window does not quit (standard); Cmd+Q and Dock Quit take the `before-quit` path; reopening via the Dock creates a fresh window. A single main window and a single instance (`requestSingleInstanceLock`) are assumed. Renderer-initiated closes (Close Project, replace) use the same coordinator via `document:requestClose`.
**Autosave.** The renderer store debounces (2 s, max wait 10 s, retry backoff) and writes ONLY the working session (`updateWorkingCopy`). It never builds a `.boothproject`, never clears Modified, is not in undo history, does not fire for view/selection changes or when content is unchanged, and failures never throw into the UI: status is Saved / Modified / Recovery copy saved / Autosave issue (after repeated failures).
**Session metadata.** `session.json` gains `ownerToken` (random per run), `projectName`, `baselineHash`, `changedFromBaseline`, `portableFileStamp` (mtime+size of the portable file at last save/open), `endedCleanly`, `recoveredAt`; the project schema and `.boothproject` format are unchanged. Ownership is by token, not PID alone (PIDs are reused); the PID is informational.
**Recovery lifecycle.** At startup (before the window) `scanRecovery` examines sessions not owned by this run: clean/ended-cleanly or never-edited sessions (`changedFromBaseline` false and never saved) are deleted; corrupt metadata/manifest and sessions older than 30 days are **quarantined** (moved to `<userData>/session-quarantine`, purged after 60 days), never deleted outright and never fatal; everything else is a candidate. Recent unsaved work is never auto-deleted. A temporary accessible dialog lists candidates (Recover / Discard with a confirm step / Decide later, Escape = decide later).
**Recover semantics.** Recovery loads into memory as a new session, stays Modified, and never writes the portable file. Assets are validated (`recovery-asset-missing`, `recovery-corrupt`). The portable file association is kept only when the file is unchanged since the last save (stamp compare); if it changed or vanished the project is recovered **without** association with a warning (`recovery-conflict` class), so Save becomes Save As and neither side is silently overwritten. Untitled projects recover as untitled. Undo history after recovery starts fresh (history is not persisted).
**Errors.** autosave-failed, recovery-corrupt, recovery-asset-missing, recovery-conflict, recovery-discard-failed. **Dev overrides.** `WALKONE_DEV_UNSAVED_CHOICES` (`save|discard|cancel`, `;` sequences) answers the native prompt for scripted validation; ignored when packaged. **Consequences:** `window.confirm` is gone; Phase 4C can restyle the temporary dialogs without changing behavior. The recovery dialog and prompts are functional only, not designed.
