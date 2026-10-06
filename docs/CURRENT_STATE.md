# Current State

_Last updated: 2026-10-06 (after DSLR Booth fixture research)_

## Project status
Phase 1 delivered a runnable, secured Electron + React + TypeScript shell. There is no editor, canvas, project model or persistence yet.

## Current phase
**Phase 1 — Repository and desktop shell: COMPLETE.** **DSLR Booth fixture research: COMPLETE** (research only, no code). **Phase 2 has NOT begun**; awaiting owner approval.

## Completed
- Phase 0: planning docs (see [ROADMAP.md](ROADMAP.md)).
- Phase 1: `package.json` with electron-vite, Vite 7, React 19, TypeScript (strict), ESLint, Prettier. Sources in `src/main`, `src/preload`, `src/renderer`, `src/shared` (IPC contract). Secure defaults: contextIsolation on, nodeIntegration off, sandbox on, CSP, navigation and window-open blocked, IPC sender check. Typed `app:ping` IPC shown on an empty home screen.
- Verified: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` all pass. Built app launched on macOS; the renderer showed the IPC ping result and had no `require`/`process` access.

## DSLR Booth fixture research (complete)
Five real exports analyzed; evidence in [../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md). Key findings: flat ZIP with `template.xml` + `preview.png` + PNGs; XML has only `Image` and `Photo` elements; integer pixel geometry at the stored `Resolution`, no physical size or orientation field; `PhotoNumber` is 1-based and repeats in two-up layouts; two-up is plain duplication on one canvas; `ZIndex` unique and XML listed in descending order; no text/shadow/border/corner-radius observed; several root flags have unknown meaning; assets are often at 300 effective DPI on 600 DPI canvases. Recommendation: hybrid coordinate model (ADR-010) and opaque vendor-data preservation (ADR-017, Proposed).

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
None for Phase 2. Fixtures are private local data in `tests/fixtures/dslrbooth/source/` (never upload; no Git remote exists).

## Remaining DSLR Booth open questions
Meaning of `Dimensions`, `IsLegacy`, `print_2_per_page`, `PrintToSecondaryPrinter`, `Id`; whether `preview.png`/BOM/CRLF are required; rotation pivot; text and other element types; border/shadow units. Fixture requests are listed in analysis §24.

## Next recommended action
Owner reviews the research and confirms/adjusts ADR-010 and ADR-017, then approves Phase 2. Optionally collect the targeted extra fixtures (analysis §24) first, and run a Windows import test of a hand-modified copy to learn DSLR Booth's tolerance.
