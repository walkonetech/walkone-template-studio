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

## ADR-009 — Native project container format — OPEN
Options: zip package vs folder bundle vs single JSON + external assets. Leaning (non-binding): package with `project.json` + `assets/`. Resolve in Phase 2.

## ADR-010 — Geometry units and coordinate space — OPEN (leaning proposed)
Leaning: physical inches + DPI at project level, deterministic pixel canvas space for layers. Confirm in Phase 2. See [DATA_MODEL.md](DATA_MODEL.md) §1.

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
