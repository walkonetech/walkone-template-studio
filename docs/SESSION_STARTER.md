# Session Starter

**Purpose:** a self-contained prompt for starting a brand-new Claude Code session with everything needed to continue. **It must be refreshed at the end of every session/phase** (CLAUDE.md makes this a required step). Copy everything inside the fenced block below into the first message of the new session.

_Last refreshed: 2026-10-07, after the real-template validation (HEAD `269f243`)._

````text
You are continuing work on WalkOne Template Studio, an internal Electron + React + TypeScript desktop tool for WalkOne Entertainment, LLC that builds custom photo-booth print templates (4x6 and 2x6 strips) for LumaSoft DSLR Booth / LumaBooth. Working directory: /Users/walkone/Projects/Apps/walkone-template-studio (git repository, macOS development; the booth software runs on Windows).

READ FIRST, IN THIS ORDER, BEFORE DOING ANYTHING
1. CLAUDE.md (operating rules — follow them exactly)
2. docs/CURRENT_STATE.md (what is done, verified, not verified, known limits)
3. docs/SESSION_STARTER.md (this file; the prompt you are reading)
4. research/REAL_TEMPLATE_VALIDATION.md (the latest product findings and the P0–P3 priority list)
5. Then whatever the task needs: docs/ROADMAP.md, docs/DECISIONS.md (ADR-001…035), docs/ARCHITECTURE_PLAN.md, docs/UX_SPEC.md, docs/USER_WORKFLOWS.md, docs/TESTING_STRATEGY.md, docs/DATA_MODEL.md, research/UI_UX_REVIEW.md, research/DSLRBOOTH_FIXTURE_ANALYSIS.md
Inspect the code before changing architecture; if docs and code disagree, say so.

GOVERNANCE (strict)
- Do ONLY the phase/task I request. When it is done: update docs, run the quality gate, commit, report, then STOP and WAIT for my approval. Never start the next phase on your own.
- Phase-end checklist (CLAUDE.md): update docs/CURRENT_STATE.md, ROADMAP.md if appropriate, DECISIONS.md for real decisions, REFRESH docs/SESSION_STARTER.md, summarize files changed, tests run, known issues, recommend the next phase.
- Honesty: never fabricate test results; label DSLR Booth claims Confirmed/Proposed/Assumption/Unknown/Needs Validation; clearly distinguish scripted automation from human testing (automation cannot send real OS keystrokes or drag the window frame here).
- Never commit secrets, client data, recovery/session data, temp projects, generated screenshots/PNGs. Commit trailers (always): "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" and "Claude-Session: <the session URL given to you>". Do not push unless I explicitly ask.
- DSLR Booth fixtures in tests/fixtures/dslrbooth/source/ are PRIVATE client data and immutable (never modify, never upload to public services). AGENTS.md stays git-ignored. Fabric is removed and must stay absent.
- Do not change the TemplateProject schema (schemaVersion 1) or the .boothproject format without asking me first.

WHAT EXISTS (all committed; git log, newest first)
269f243 research: validate real template workflow  (no code changes)
cce8b67 style: polish editor interface (Phase 4D)
dee03b2 feat: redesign editor interface and design system (Phase 4C, ADR-035)
36eb45c feat: add autosave and crash recovery (Phase 4B, ADR-034)
4fd8af6 feat: add layer management and inspector (Phase 4, ADR-033)
2319a27 feat: establish production canvas foundation (Phase 3B, ADR-030–032)
3d86f98/2349f7f Konva vs Fabric spike → Konva chosen (ADR-029)
93261ce feat: add native project persistence (Phase 2B, ADR-025–028)
4222b07 feat: establish project domain model (Phase 2)
e8d460f research: analyze DSLR Booth template fixtures
745230a Phase 1 shell; 9690f45 Phase 0 docs.
Status: 413 unit tests passing; the app builds and runs. Not started: asset import, export of any kind, DSLR Booth importer/exporter, palette UI, badge builder, asset/template library, recipes, providers.

ARCHITECTURE IN BRIEF
- Electron main/preload/renderer, contextIsolation + sandbox, typed IPC, CSP unchanged. Renderer has no Node.
- src/domain: vendor-neutral TemplateProject (print size in inches + DPI as first-class; flat layers with parentId; photo/image/text/shape/group; palette; assets). Strict TypeScript with exactOptionalPropertyTypes (use conditional spreads for optional props).
- src/projects: .boothproject (ZIP via yauzl/yazl), working sessions under <userData>/sessions/<id>/ (project.json, assets/, session.json), atomic save, recents, recovery scan/recover/discard with quarantine, ProjectService, IPC handlers.
- src/main: window/menu (appMenu.ts), closeCoordinator.ts + documentLifecycle.ts (native Save/Don't Save/Cancel on every close/quit path), devOverrides.ts.
- src/editor: Zustand vanilla store with pure mutations, snapshot undo/redo, autosave scheduler, commands.ts (single command model: menus/tooltips/enablement/key matching), layout.ts, tools.ts, welcome.ts.
- src/canvas: Konva rendering spec shared by the editor and the offscreen exact-size render (renderProjectToCanvas), geometry, viewport, snapping.
- src/renderer/src: styles/ (tokens.css and friends — dark theme via CSS variables), ui/ (Button, IconButton, Tooltip, Menu, Dialog, Splitter, PanelSection…), editor/ (screens: EditorScreen, TopBar, ToolRail, StatusBar, Welcome, LayersPanel, PropertiesInspector, RecoveryDialog, NewProjectDialog, fields.tsx, layoutStore.ts, commandRunner.ts). Icons: lucide-react (only UI dependency added).
- Dirty state = project !== savedProject (reference equality). Autosave writes only the working session. UI-only state (panel sizes, drawer) lives in layoutStore, never in the project.

HOW TO RUN / CHECK
- Install: npm install. Run built app: npm run build && npm start. Dev mode: npm run dev.
- Quality gate (all must pass before a commit): npm run typecheck && npm run lint && npm run format:check && npm run build && npm test.
- Use a throwaway profile for manual runs: npx electron out/main/index.js --user-data-dir=/tmp/wts-test (add #debug to the URL hash to get window.__wts and the "New sample project" button).
- Scripted built-app suites (automation over the DevTools protocol, in research/editor-validation/, results-*.json recorded): validate.js (Phase 4 regression, 97 checks; run with WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH, WALKONE_DEV_UNSAVED_CHOICES=discard, WALKONE_DEV_WINDOW_SIZE=1440x900 exported and the app launched on port 9350), validate-4b.js (40), validate-4c.js (97), validate-4d.js (6; layout sweep). The last three launch the app themselves. Dev-only env overrides (ignored when packaged): WALKONE_DEV_UNSAVED_CHOICES, WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH (sequences separated by ';', CANCEL supported), WALKONE_DEV_WINDOW_SIZE.
- Screenshots go to research/editor-validation/shots/ (git-ignored). Always write script outputs with __dirname, never the repo root.

LESSONS / GOTCHAS
- Prettier reformats code, so naive string replacement scripts fail silently — verify replacements applied (assert) or edit by line.
- zustand selectors must return stable values; Konva multi-select drag fires dragend per node (deduped); Enter + blur double-commit is prevented with the useDraft().take() pattern.
- macOS sed needs -i ''; there is no `timeout` command; run Electron suites with the dev env vars exported for BOTH the app and the node script.
- Native Edit-menu Undo/Redo are registered without accelerators so the editor owns ⌘Z; this was verified only with synthetic key events — a human should confirm on a real keyboard.
- Fonts used in the recreation are macOS-only; the booth runs on Windows (font strategy ADR-015 still open).

LATEST PRODUCT FINDINGS (research/REAL_TEMPLATE_VALIDATION.md)
A real template (Chaney Wedding strip) was recreated through the real UI: layout, photo grid/numbering, text hierarchy reproducible (209 gestures), but ALL raster artwork was impossible because the UI cannot import images. Priorities: P0 image import → project assets → image layers, and flattened PNG export then DSLR ZIP export; P1 sample photos for placeholders, strip mirroring / exact group-or-multi-select geometry, canvas background color, palette basics, font strategy, align/distribute; P2 text-box auto-fit, text presets, nudge in design pixels, guides; P3 rulers, context menu, Badge Builder, recipes. The roadmap has NOT yet been rewritten to match; I will approve that.

OPEN DECISIONS: ADR-012 SQLite scope; ADR-014 final render/export approach; ADR-015 fonts. Windows is untested everywhere. A human visual/keyboard review of Phases 4B–4D is still owed.

WHERE I LEFT OFF / WHAT I WILL ASK NEXT
(Replace this block at the end of every session.) The recommended next phase is "Asset import and flattened PNG export": image import with role presets and effective-DPI readout, sample photos for placeholders, flattened PNG export. I have not approved it yet. Start by confirming the current state (git log, npm test), summarize what you understood in a few lines, and wait for my instruction before changing anything.
````

## How to refresh this file (end of every session)
1. Update "Last refreshed" and the HEAD commit above the fence.
2. In the prompt: update the commit list, test count, "WHAT EXISTS", any new architecture/gotchas/scripts, the latest findings, open decisions, and rewrite **WHERE I LEFT OFF**.
3. Keep it self-contained: a fresh session with no memory must be able to continue from this text plus the repository.
