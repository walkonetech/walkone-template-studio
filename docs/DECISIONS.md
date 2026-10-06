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

## ADR-009 — Native project persistence model — Accepted (container OPEN)
A native project is a package: `project.json` manifest + `assets/` with copies of all used assets (hybrid; no external references). Manifest is container-independent; whether the package is a folder bundle or a zip (`.boothproject`) is decided in the file-IO phase. See [DATA_MODEL.md](DATA_MODEL.md) §7.

## ADR-010 — Geometry units and coordinate space — Accepted (Phase 2)
Hybrid: project stores physical size (inches) + DPI; pixel size is derived; layer geometry is stored as numbers in design-canvas pixels at the design DPI. DPI changes only via the explicit `rescaleProjectDpi` operation. Evidence: [fixture analysis §18](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). Implemented in `src/domain/print`.

## ADR-011 — Canvas library (Fabric.js vs Konva.js, or other) — OPEN
Criteria (preliminary): performance with large (up to 3600 px) canvases and HiDPI; rotation/resize handles; snapping/guides support; React integration; export fidelity/determinism; serialization independence from our model; maintenance/licensing; testability. Evaluate with prototypes in Phase 3. Not installed.

## ADR-012 — SQLite scope — OPEN
Likely library index/recents; whether anything else uses it is undecided. Native module packaging considerations.

## ADR-013 — Preferred stack (Electron, React, TS, Vite, Zustand, Sharp, JSZip, fast-xml-parser) — Proposed
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
