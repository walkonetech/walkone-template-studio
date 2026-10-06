# Current State

_Last updated: 2026-10-06 (Phase 2 domain foundation)_

## Project status
Electron + React + TypeScript shell (Phase 1) plus a tested, vendor-neutral domain model and JSON project serialization (Phase 2, partial). No editor, canvas, file IO, DSLR Booth importer/exporter or asset library exists.

## Current phase
**Phase 2 — Domain model and native project foundation: domain, validation, serialization, tests COMPLETE.** File IO/package container, recents and autosave are NOT started (see [ROADMAP.md](ROADMAP.md)). Phase 3 has not begun. Awaiting owner approval.

## Completed
- Phase 0 docs; Phase 1 shell (secure defaults, typed IPC ping); DSLR Booth fixture research ([../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)).
- Phase 2: `src/domain/` (zod 4 schemas; types inferred), print math and presets, design canvas vs output composition (`single`/`grid`), flat layers (photo, image with roles, text, shape, group), palette with literal/palette-reference colors, asset references with project-relative paths, optional adapter-scoped `sourceCompatibility`, `loadProject`/`serializeProject`/`deserializeProject` with schemaVersion check and an empty migration registry, `createProject` factory, explicit `rescaleProjectDpi`, integrity checks. Vitest with 39 tests.
- Decisions: ADR-009 (persistence model), ADR-010, ADR-017 accepted; ADR-018–024 added ([DECISIONS.md](DECISIONS.md)). Model documented in [DATA_MODEL.md](DATA_MODEL.md).

## Verified (this phase)
`npm run typecheck`, `lint`, `format:check`, `build`, `npm test` (39 passed) all ran and passed; the built Electron app launched on macOS and showed the IPC ping.

## In progress
Nothing.

## Not started
Project file IO and package container, recents/autosave, canvas (Phase 3 onward), importer/exporter, asset library, templates, recipes, badges.

## Open decisions
ADR-009 container (folder vs zip); ADR-011 canvas library (Fabric vs Konva) — pending; ADR-012 SQLite scope; ADR-014 render approach; ADR-015 fonts. See [DECISIONS.md](DECISIONS.md).

## Known risks
- DSLR Booth semantics still unknown for `Dimensions`, `IsLegacy`, `print_2_per_page`, rotation pivot, text elements ([analysis §25](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)).
- DSLR Booth is Windows-only; development is on macOS.
- Sharp/SQLite native modules complicate packaging (not installed).
- Strict schema (unknown keys rejected) means every model change needs a version bump and migration.
- Vite is held at 7 (ADR-016).

## Known limitations of the domain model
Inches only; photo frames limited to none/solid; no crop rectangles, gradients, shadows or blend modes; groups carry no rotation/opacity semantics; group geometry is not auto-derived; schema version 1 has no migrations; nothing populates `sourceCompatibility` yet; DPI rescale is a pure function with no UI. Integrity checks are not export preflight.

## Housekeeping
`AGENTS.md` (an untracked duplicate of CLAUDE.md for another agent) is git-ignored and untouched. No Git remote exists (intentional). Fixtures in `tests/fixtures/dslrbooth/source/` are private and unchanged.

## Next recommended action
Owner reviews the model, then approves either Phase 2b (file IO, package container, recents/autosave) or Phase 3 (canvas foundation, including the Fabric vs Konva decision).
