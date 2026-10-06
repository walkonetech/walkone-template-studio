# Current State

_Last updated: 2026-10-06 (end of Phase 1)_

## Project status
Phase 1 delivered a runnable, secured Electron + React + TypeScript shell. There is no editor, canvas, project model or persistence yet.

## Current phase
**Phase 1 — Repository and desktop shell: COMPLETE** (awaiting owner approval to begin Phase 2).

## Completed
- Phase 0: planning docs (see [ROADMAP.md](ROADMAP.md)).
- Phase 1: `package.json` with electron-vite, Vite 7, React 19, TypeScript (strict), ESLint, Prettier. Sources in `src/main`, `src/preload`, `src/renderer`, `src/shared` (IPC contract). Secure defaults: contextIsolation on, nodeIntegration off, sandbox on, CSP, navigation and window-open blocked, IPC sender check. Typed `app:ping` IPC shown on an empty home screen.
- Verified: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all pass. Built app launched on macOS; the renderer showed the IPC ping result and had no `require`/`process` access.

## In progress
Nothing.

## Not started
Phases 2–18.

## Open decisions
ADR-009 container format; ADR-010 geometry units; **ADR-011 canvas library (Fabric vs Konva) — pending**; ADR-012 SQLite scope; ADR-014 render approach; ADR-015 fonts. See [DECISIONS.md](DECISIONS.md).

## Known risks
- DSLR Booth format is unvalidated; **fixtures still need to be analyzed**.
- DSLR Booth is Windows-only; development is on macOS.
- Sharp/SQLite native modules complicate packaging (not yet installed).
- Preview/export render parity; provider APIs and licensing unknown.
- Vite is held at 7 until electron-vite supports 8 (ADR-016).

## Known issues / not verified
- No automated tests or test runner yet; verification was typecheck, lint, build and one manual launch.
- Windows build and launch not verified.
- `npm run dev` (HMR path) was not exercised; only the built app was launched.
- When launched directly via `electron out/main`, the reported app version is Electron's; via npm scripts it uses package.json.
- The renderer bundle is ~640 kB, so React dev mode is not an issue, but no size budget exists.

## Known blockers
None for Phase 2. Real DSLR Booth fixtures (private data, local only) should be added to `tests/fixtures/dslrbooth/` and analyzed before the data model is finalized.

## Next recommended action
Owner approves Phase 2 (project model and persistence), ideally after a research-only pass on the DSLR Booth fixtures.
