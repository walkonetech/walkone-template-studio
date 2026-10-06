# Current State

_Last updated: 2026-10-06 (end of Phase 2B)_

## Project status
Electron + React + TypeScript shell, a tested vendor-neutral domain model, and a working native project lifecycle (create/open/save/save as of single-file `.boothproject` packages). There is still no editor, canvas, DSLR Booth importer/exporter or asset library. The home screen carries temporary dev-diagnostic buttons for the project lifecycle only.

## Current phase
**Phase 2B — Native project persistence: COMPLETE.** Phase 2 (domain model) is complete. **Phase 3 (canvas) has not begun**; awaiting owner approval.

## Completed
- Phase 0 docs; Phase 1 shell; DSLR Booth fixture research ([../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); Phase 2 domain model ([DATA_MODEL.md](DATA_MODEL.md)).
- Phase 2B (`src/projects/`): strict `.boothproject` reader/writer (yauzl/yazl), deterministic output, atomic replace with backup-swap fallback, working sessions with recovery metadata, dirty-state model, bounded JSON recents, `ProjectService`, pure IPC handlers, typed IPC (`window.api.project.*`), native Open/Save dialogs, structured error codes with distinct cancellation. ADR-009 finalized; ADR-025–028 added ([DECISIONS.md](DECISIONS.md)). Architecture in [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §6.

## Verified (this phase)
`npm run typecheck`, `lint`, `format:check`, `build` all passed; `npm test` passed with 109 tests (39 domain + 70 persistence). Manual macOS validation on the built app (driven over the DevTools protocol with dev-only dialog overrides): created a sample project with an asset, saved a `.boothproject` (contents: `project.json` + `assets/sample.png`), closed, reopened it (same project id, metadata, asset path, clean state), recents listed it, a non-recent path was refused, and the renderer had no `require`/`process`/fs access.

## In progress
Nothing.

## Not started
Autosave scheduling, crash-recovery UI, unsaved-changes prompts on close/quit, asset import, project wizard/dashboard, canvas and editor (Phase 3+), DSLR Booth importer/exporter.

## Open decisions
ADR-011 canvas library (Fabric vs Konva) — pending; ADR-012 SQLite scope (not needed so far); ADR-014 render approach; ADR-015 fonts. See [DECISIONS.md](DECISIONS.md).

## Known risks
- DSLR Booth semantics still unknown for several fields ([analysis §25](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); Windows-only booth software vs macOS development.
- Windows file replacement logic (backup-swap fallback) and path rules are implemented from Node semantics and not tested on Windows.
- Strict schema: every model change needs a version bump and migration.
- Vite is held at 7 (ADR-016).

## Known limitations (Phase 2B)
- Sessions of a crashed app remain on disk; nothing lists or recovers them yet (`listSessions` exists). Quitting normally removes clean sessions only.
- No autosave timer and no unsaved-changes confirmation; `ProjectService.close` always deletes the session.
- Asset hashes are verified on open, not on every save (save checks existence and recorded size).
- Cross-volume atomicity is not provided (temp file is beside the destination); a network share may behave differently.
- The renderer sees the full path of recent projects (user-chosen locations); session paths are never exposed.
- A package with unused files under `assets/` opens with a warning and drops them on next save.
- Dev-only env overrides (`WALKONE_DEV_OPEN_PATH`/`WALKONE_DEV_SAVE_PATH`) exist for non-packaged builds.
- Only macOS was exercised manually.

## Housekeeping
`AGENTS.md` stays git-ignored and untouched. No Git remote exists (intentional). Fixtures in `tests/fixtures/dslrbooth/source/` are private and unchanged.

## Next recommended action
Owner reviews Phase 2B, then approves Phase 3 (canvas foundation, including the Fabric vs Konva evaluation). Small follow-ups worth scheduling: unsaved-changes prompt, autosave timer and recovery listing, once an editor exists.
