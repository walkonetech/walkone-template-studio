# Architecture Plan (Proposed)

Nothing is implemented. The stack listed is a **preferred direction**, not a locked decision, except where [DECISIONS.md](DECISIONS.md) says Accepted. Canvas library is **OPEN** (ADR-011).

## 1. Principles
Desktop-first, local-first; strict separation of UI, editor state, rendering, storage, and export adapters; vendor-neutral domain; testable pure modules; deterministic rendering; offline-capable; no speculative abstraction.

## 2. Preferred stack (Proposed)
Electron, React, TypeScript (strict), Vite, Zustand, Sharp, JSZip, fast-xml-parser, SQLite where appropriate. Canvas: Fabric.js vs Konva.js (OPEN). Each is validated in its relevant phase and recorded in [DECISIONS.md](DECISIONS.md).

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
- **Canvas abstraction:** the editor talks to a `CanvasView` interface so the library can be swapped; the library never owns the source of truth (the domain model does).
- **Rendering/export:** a deterministic renderer producing pixels from the domain model for preview and export, ideally sharing logic so preview == export (approach — e.g., Sharp-based compositing vs canvas-based — **Needs Validation**, may require parity tests).

## 5. State management
Zustand stores: document (project), selection/tool, UI/layout, preferences. Undo/redo by command or patch history on the document store. Autosave subscribes to document changes.

## 6. Persistence
- Native project package (`.boothproject`, container OPEN ADR-009) with `project.json` + `assets/`. Atomic writes (temp + rename). Schema migrations on load.
- Autosave/crash recovery in an app data directory.
- **SQLite** (scope OPEN, ADR-012): likely for library index, recents, template/recipe index — not for the project document itself.
- Settings in app data JSON or SQLite.

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
  domain/          TemplateProject types, geometry, units, migrations
  editor/          editor state, commands, history, selection
  canvas/          canvas abstraction + chosen-library implementation
  projects/        project package read/write, autosave, recents
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
