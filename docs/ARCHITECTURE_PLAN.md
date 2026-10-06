# Architecture Plan (Proposed)

Nothing is implemented. The stack listed is a **preferred direction**, not a locked decision, except where [DECISIONS.md](DECISIONS.md) says Accepted. Canvas library: **Konva with react-konva** (ADR-029, chosen in Phase 3A).

## 1. Principles
Desktop-first, local-first; strict separation of UI, editor state, rendering, storage, and export adapters; vendor-neutral domain; testable pure modules; deterministic rendering; offline-capable; no speculative abstraction.

## 2. Preferred stack (Proposed)
Electron, React, TypeScript (strict), Vite, Zustand, Sharp, JSZip, fast-xml-parser, SQLite where appropriate. Canvas: Konva + react-konva (ADR-029). Each is validated in its relevant phase and recorded in [DECISIONS.md](DECISIONS.md).

## 3. Process model
- **Main process:** app lifecycle, windows, filesystem, dialogs, ZIP/XML/image processing orchestration, SQLite, secrets, integrations. Heavy work in worker threads/utility processes to keep UI responsive.
- **Preload:** minimal, typed `contextBridge` API. No Node in renderer.
- **Renderer:** React UI, editor state, canvas. Never touches the filesystem directly.
- **Security model:** `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, strict CSP, IPC channels allowlisted and validated (schema-checked payloads), no arbitrary path access — paths come from user-chosen dialogs or app-managed directories. Safe ZIP extraction. Untrusted SVG sanitized.

## 4. Layers and boundaries
```
UI (React) ──► editor state (Zustand + commands/history)
                    │
                    ├─► domain (pure TS: model, geometry, palette, validation rules)
                    ├─► canvas/render abstraction (interface; Fabric/Konva behind it)
                    └─► services via IPC: projects, assets, importers, exporters, integrations
```
- **Domain:** no Electron/React/DOM imports; unit-testable.
- **Editor state:** commands over the domain model for undo/redo; selection and view state separate from document state.
- **Canvas abstraction:** the editor talks to an engine contract (props in: domain project, images, selection, view transform, snapping; events out: normalized `GeometryChange[]`, selection, guides; handle: export/benchmark hooks) so the library stays swappable; the library never owns the source of truth (the domain model does). The Phase 3A spike (`src/renderer/src/spikes/canvas/`) prototyped this contract with both Fabric and Konva.
- **Canvas rules from the spike (ADR-029):** design coordinates are in design pixels; the view (zoom/pan) is only a Stage transform; Konva nodes use a box-center origin (`offsetX/Y` = half size) so rotation matches the domain; after a transform, scale is folded into width/height and reset; group children are absolute in the domain and baked back from runtime-group matrices; photo placeholders are single custom-drawn `Shape`s (`sceneFunc` + `hitFunc`); text uses `Text` with an HTML overlay for editing; exports render in a neutral view at the requested pixel size with an explicit `pixelRatio`; snapping is a pure function with a screen-pixel tolerance converted to design units.
- **Rendering/export:** a deterministic renderer producing pixels from the domain model for preview and export, ideally sharing logic so preview == export (approach — e.g., Sharp-based compositing vs canvas-based — **Needs Validation**, may require parity tests).

**Implemented (Phase 2):** `src/domain/` exists as a pure module with sub-folders `print/ layers/ palette/ assets/ color/ compatibility/ project/ validation/`, exposed through `src/domain/index.ts` and the `@domain` alias; zod is the runtime validator; Vitest runs `src/**/*.test.ts`. See ADR-018–024.

## 5. State management
Zustand stores: document (project), selection/tool, UI/layout, preferences. Undo/redo by command or patch history on the document store. Autosave subscribes to document changes.

## 6. Persistence (implemented in Phase 2B)
**Code layout:** `src/projects/` is Node-only and Electron-free (testable with Vitest): `packageReader` / `packageWriter` (yauzl / yazl), `atomicFile`, `session`, `recents`, `service` (`ProjectService`), `handlers` (pure IPC handlers with injected dialogs), `errors`. `src/main/projectIpc.ts` wires Electron dialogs and `ipcMain`; `src/preload` exposes `window.api.project.*`; `src/shared/ipc.ts` + `persistence.ts` hold the typed contract. The renderer never touches the filesystem and never receives session paths.
**Two stores:** the **portable package** (`.boothproject`, used for Save/Save As/transfer) and the **working session** (`<userData>/sessions/<id>/` — `project.json`, `assets/`, `session.json`) used while a project is open. Autosave (not scheduled yet) calls `saveWorkingSession`, which rewrites only the small working `project.json` and metadata, never the archive.
**Open:** validate extension → scan central directory (limits, path/link/encryption/duplicate checks) → read and validate `project.json` (schema + integrity + package asset-path rules) → verify referenced assets exist → create session → extract assets (size/sha256 checked) → return project, clean. Any failure removes the half-built session.
**Save / Save As:** serialize and validate → verify assets in session → write `<dest>.tmp-xxxx` via yazl (fixed order, fixed timestamps/modes → deterministic bytes) → reopen and verify the temp package → fsync → atomic replace (below) → mark session clean and update recents. Save As changes the file association only after success.
**Atomic replace (ADR-028):** `rename(tmp, dest)` replaces atomically on macOS/Linux and normally on Windows. If the OS refuses to rename over the existing file (EPERM/EEXIST/EBUSY/EACCES), the old file is moved to a backup name, the new file renamed in, and the backup deleted; if the second rename fails the backup is restored. The existing file is never truncated; temp files are removed on failure. Limits: no cross-volume atomicity (temp is created beside the destination), and directory fsync is best-effort.
**Dirty state:** `dirty` means "differs from the last successful portable save/open", computed by comparing the SHA-256 of the serialized project with `portableHash`. Autosave never clears it; only Save/Save As (or opening a package) does. It lives in the session metadata and `ProjectService`, not React state.
**Recovery foundation (proposed, UI not built):** on clean close the session is deleted; on app quit clean sessions are deleted and sessions with `hasUnsavedChanges` are kept. At launch, a future recovery step lists sessions (`listSessions`): ones with unsaved changes and a dead `ownerPid` are offered for recovery (compare `lastWorkingSaveAt` with the package), clean or unreadable ones are deleted, and very old ones are purged.
**Recents (ADR-026):** `<userData>/recent-projects.json` (`{version:1, items:[{path, projectId?, name, lastOpenedAt}]}`), max 10, atomic writes, corrupted file set aside as `.corrupt`; missing files flagged `exists:false`. `openRecent` only accepts paths already in this list.
**SQLite (ADR-012)** remains reserved for future library/index features, not project files or recents.
**Errors:** every failure is a `PersistenceError` with a code (`file-not-found`, `invalid-project`, `unsupported-version`, `corrupted-package`, `missing-asset`, `unsafe-path`, `permission-denied`, `write-failed`, `replace-failed`, `session-not-found`, `not-allowed`, `invalid-request`, `unexpected`) and a user-safe message; internal detail is logged in main only. IPC returns `{status:'ok'|'cancelled'|'error'}` — cancellation is not an error.
**Dev-only dialog override:** non-packaged builds honor `WALKONE_DEV_OPEN_PATH` / `WALKONE_DEV_SAVE_PATH` so scripted validation can answer native dialogs; packaged builds ignore them.

## 7. Image, ZIP, XML
Sharp for raster ops/compositing (native module → packaging per-platform concern, **Risk**); JSZip for ZIP; fast-xml-parser for XML parse/build. All wrapped in thin modules so they are replaceable and testable.

## 8. Importers/exporters (adapters)
`importers/dslrbooth` and `exporters/dslrbooth` depend on `domain`, never the reverse. Native format and PNG/layer exporters follow the same interface shape. Adapters return result objects with warnings.

## 9. Assets and integrations
Asset service manages library/project assets. `integrations/<provider>` behind capability interfaces; core runs without them ([ASSET_AND_INTEGRATION_STRATEGY.md](ASSET_AND_INTEGRATION_STRATEGY.md)).

## 10. Validation / preflight
Pure rule functions over the domain model plus context (asset metadata, fonts); each rule returns typed issues (error/warning, layer ref, fix hint). Adapter-specific rules live with the adapter.

## 11. Testing boundaries
Domain/validation/adapters = pure unit + fixture tests; rendering = visual tests; main-process services = integration tests; UI = component + manual QA ([TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

## 12. Proposed source tree (not mandatory)
```
src/
  main/            Electron main: windows, IPC handlers, services wiring
  preload/         typed contextBridge API
  renderer/        React app, panels, dialogs
  domain/          (IMPLEMENTED Phase 2) zod schemas/types, print math, composition, validation, serialization, migrations
  editor/          editor state, commands, history, selection
  canvas/          (Phase 3B) engine contract + Konva implementation; pure geometry/viewport/snap promoted from the spike
  projects/        (IMPLEMENTED Phase 2B) package read/write, sessions, atomic save, recents, project service
  assets/          library + project asset services, metadata
  templates/       template library
  recipes/         design recipes
  badges/          badge components/builder logic
  palettes/        palette logic, color extraction
  importers/       dslrbooth/, native/
  exporters/       dslrbooth/, png/, layers/, native/
  integrations/    magnific/, envato/, ... (optional)
  validation/      preflight rules
  storage/         SQLite, settings
  utils/
tests/
  fixtures/dslrbooth/
```
Consider a monorepo-lite or path aliases to enforce one-way dependency (domain ← everything) with lint rules — **Future Research**.

## 13. Cross-platform
macOS and Windows targets; avoid platform-specific paths; test font and Sharp behavior on both; DSLR Booth itself is Windows ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md)).

## 14. Packaging/updates
Deferred to Phase 18 (signing/notarization, installers, auto-update are unresolved).
