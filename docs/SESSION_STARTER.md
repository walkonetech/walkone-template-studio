# Session Starter

**Purpose:** a self-contained prompt for starting a brand-new Claude Code session with everything needed to continue. **It must be refreshed at the end of every session/phase** (CLAUDE.md makes this a required step). Copy everything inside the fenced block below into the first message of the new session.

_Last refreshed: 2026-10-10, end of Phase 5D (typography, font portability & event palette). The creative foundation 5A–5D is complete. HEAD is the latest commit on `main` (the Phase 5D commit); not pushed._

````text
You are continuing work on WalkOne Template Studio, an internal Electron + React + TypeScript desktop tool for WalkOne Entertainment, LLC that builds custom photo-booth print templates (4x6 and 2x6 strips) for LumaSoft DSLR Booth / LumaBooth. Working directory: /Users/walkone/Projects/Apps/walkone-template-studio (git repository, macOS development; the booth software runs on Windows).

READ FIRST, IN THIS ORDER, BEFORE DOING ANYTHING
1. CLAUDE.md (operating rules — follow them exactly)
2. docs/CURRENT_STATE.md (what is done, verified, not verified, known limits)
3. docs/SESSION_STARTER.md (this file; the prompt you are reading)
4. research/REAL_TEMPLATE_VALIDATION.md (the latest product findings and the P0–P3 priority list)
5. Then whatever the task needs: docs/ROADMAP.md (see the "Approved product-driven sequence"), docs/DECISIONS.md (ADR-001…040), docs/ARCHITECTURE_PLAN.md, docs/UX_SPEC.md, docs/USER_WORKFLOWS.md, docs/TESTING_STRATEGY.md, docs/DATA_MODEL.md, research/UI_UX_REVIEW.md, research/DSLRBOOTH_FIXTURE_ANALYSIS.md
Inspect the code before changing architecture; if docs and code disagree, say so.

GOVERNANCE (strict)
- Do ONLY the phase/task I request. When it is done: update docs, run the quality gate, commit, report, then STOP and WAIT for my approval. Never start the next phase on your own.
- Phase-end checklist (CLAUDE.md): update docs/CURRENT_STATE.md, ROADMAP.md if appropriate, DECISIONS.md for real decisions, REFRESH docs/SESSION_STARTER.md, summarize files changed, tests run, known issues, recommend the next phase.
- Honesty: never fabricate test results; label DSLR Booth claims Confirmed/Proposed/Assumption/Unknown/Needs Validation; clearly distinguish scripted automation from human testing (automation cannot send real OS keystrokes or drag the window frame here).
- Never commit secrets, client data, recovery/session data, temp projects, generated screenshots/PNGs. Commit trailers (always): "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" and "Claude-Session: <the session URL given to you>". The repository is backed up to a PRIVATE GitHub repo (remote `origin`, account walkonetech). Push only when I ask (or tell you to at session end). The fixture ZIPs were purged from git history before the first push and are git-ignored: never `git add -f` them.
- DSLR Booth fixtures in tests/fixtures/dslrbooth/source/ are PRIVATE client data and immutable (never modify; they are local-only and NOT on GitHub; a fresh clone has an empty source/ folder; their SHA-256s are in research/DSLRBOOTH_FIXTURE_ANALYSIS.md). AGENTS.md stays git-ignored. Fabric is removed and must stay absent.
- Do not change the TemplateProject schema (schemaVersion 1) or the .boothproject format without asking me first.

WHAT EXISTS (all committed; git log, newest first)
HEAD feat: add typography and event palette workflow (Phase 5D, ADR-039/040)
b59357e feat: add photo preview and precision canvas workflow (Phase 5C, ADR-038)
7e27f94 feat: add photo strip print composition (Phase 5B, ADR-037)
8b9739e feat: add project asset import workflow (Phase 5A, ADR-036)
a2a1eae docs: human keyboard-shortcut and quit-prompt verification; 17445d0 docs: refresh session starter; 1a1a54c chore: private fixtures local-only + GitHub backup policy; ca196da docs: session starter; edb2891 research: validate real template workflow
9096a3c style: polish (4D); 5a85fca feat: redesign (4C, ADR-035); 8cb5e86 feat: autosave + recovery (4B, ADR-034); 33235b1 feat: layers + inspector (4, ADR-033); 066e14d feat: canvas foundation (3B); 8aece5f/693be9e Konva vs Fabric → Konva (ADR-029); 143a72e persistence (2B); 7c95e95 domain (2); b63160a fixture analysis; 745230a shell; 9690f45 docs.
Status: 672 unit tests passing (413 before 5A, 502 before 5B, 543 before 5C, 631 before 5D); the app builds and runs. Phase 5A is done: image import (PNG/JPEG/WebP/SVG, native picker + drop), project assets, Assets drawer, roles, Set as Background, canvas background colour, effective-DPI readout, replace/remove, recovery with assets. Phase 5D is done: font picker + availability + portability (requested family never rewritten, shared fallback stack), Fit height to content, text presets, Event Palette with global recolouring, linking/detaching, removal refused while used. Phase 5C is done: Preview Photos with procedural samples (by PhotoNumber), Reposition/crop, frame styling, Show overflow / Clipped view, Space pan, pointer-centred zoom, Shift-constrained drag, tooltips from the command model. Phase 5B is done: 2x6 strips authored once, derived 2-up 4x6 sheet, Design / Print Preview, exact selection X/Y, align/distribute, design-pixel nudging. Not started: export of any kind (Phase 6 is next), photo shadow and persistent Auto Height (need schema), font embedding, image palette extraction, palette/font managers, DSLR Booth importer/exporter, badge builder, global asset library, recipes, providers.

ARCHITECTURE IN BRIEF
- Electron main/preload/renderer, contextIsolation + sandbox, typed IPC, CSP unchanged. Renderer has no Node.
- src/domain: vendor-neutral TemplateProject (print size in inches + DPI as first-class; flat layers with parentId; photo/image/text/shape/group; palette; assets). Strict TypeScript with exactOptionalPropertyTypes (use conditional spreads for optional props).
- Assets (5A): src/projects/imageInspect.ts (byte sniffing, header metadata, SVG reject policy), ProjectService.importAssetFiles/importAssetBytes (SHA-256 dedup, atomic copy to <session>/assets/<id>.<ext>, session remembers every asset so undo/redo works, orphans pruned on recovery); IPC project:importAssets (main-owned dialog) and project:importAssetData (bytes; the renderer never sends paths); src/editor/assetMutations.ts + imagePlacement.ts (pure); domain/assets/resolution.ts + usage.ts; renderer AssetsDrawer, CanvasBackgroundSection, thumbnails.ts, dropFiles.ts. Assets belong to the LOGICAL design (a future 2-up compositor copies the whole design).
- Print composition (5B): src/canvas/rendering/composition.ts (pure: planOutput translates the ONE authored layer list per cell; copies are never stored; each copy clipped to its cell; cutLines), renderOutputToCanvas (exact sheet, internal), PrintPreviewCanvas + WorkspaceModeSwitch (viewMode is editor state; commits refused in preview), src/editor/arrange.ts (exact X/Y, align, distribute), nudge.ts (design px), describe.ts/welcome.ts (status + New Project wording). createProject defaults strip-2x6-* to a two-up output. No schema change.
- Photo preview & precision (5C): canvas/rendering/photoFit.ts (placePhoto/crop math), transforms/axisLock.ts, editor/previewPhotos.ts, spacePan.ts, tooltips.ts (+ command `hint`/`commandTip`); sample photos and crops are EDITOR state (store: showOverflow, previewPhotos, userSamples, photoCrops by layer id, cropSession), never project/history/dirty; production output (`photos:'omit'`) never contains samples; renderer: samplePhotos.ts (procedural samples + own ImageCache), usePreviewPhotos, useSpacePan, CropOverlay/CropBar; IPC project:pickPreviewPhoto (bytes only). Shift lock + follower re-placement live in EditorCanvas. No schema change.
- Typography & palette (5D): canvas/rendering/fontStack.ts (requested family -> render stack, one function for canvas/overlay/exact render), editor/fonts.ts (availability with an injected environment, inventory, picker logic), typographyMutations.ts, paletteMutations.ts, textPresets.ts, preflight.ts; textLayout()+measureTextHeight (Konva) behind Fit height; renderer fontCatalog.ts (queryLocalFonts names + measurement probe), FontPicker, TypographySection, PalettePanel, FontInventoryPanel; ColorField links Fixed<->Palette; main installs a permission policy (local-fonts only). The requested font is NEVER rewritten except by an explicit user action. No schema change.
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
- Scripted built-app suites (automation over the DevTools protocol, in research/editor-validation/, results-*.json recorded): validate.js (Phase 4 regression, 97 checks; run with WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH, WALKONE_DEV_UNSAVED_CHOICES=discard, WALKONE_DEV_WINDOW_SIZE=1440x900 exported and the app launched on port 9350), validate-4b.js (40), validate-4c.js (97), validate-4d.js (6; layout sweep), validate-5d.js (40; fonts, palette, fit height; self-launching), validate-5c.js (59; overflow, zoom/pan, Shift drag, preview/crop/frame, tooltips; the harness disables window occlusion), validate-5b.js (39; strips, preview pixels, arrange; self-launching), validate-5a.js (53; assets: needs python3+Pillow for fixture JPEG/WebP; launches the app itself; dev override WALKONE_DEV_IMPORT_PATHS, files '|' dialogs ';'). The last three launch the app themselves. Dev-only env overrides (ignored when packaged): WALKONE_DEV_UNSAVED_CHOICES, WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH (sequences separated by ';', CANCEL supported), WALKONE_DEV_WINDOW_SIZE.
- Screenshots go to research/editor-validation/shots/ (git-ignored). Always write script outputs with __dirname, never the repo root.

LESSONS / GOTCHAS
- macOS can mark the Electron window occluded (another app in front, display asleep) and scripted mouse/wheel input then stalls; the harness passes occlusion/backgrounding-disabling switches and Page.bringToFront. A zustand selector that returns a new object each call loops: select pieces and useMemo (see cropContext.ts). In a Konva multi-selection drag the Transformer ignores constraints applied to the grabbed node, so followers are re-placed explicitly.
- Inside page.evaluate snippets `const s=getState()` is a stale snapshot; re-read getState() after actions. Prettier/hook may convert escapes (\uFEFF) into literal characters: check lint's no-irregular-whitespace.
- Prettier reformats code, so naive string replacement scripts fail silently — verify replacements applied (assert) or edit by line.
- zustand selectors must return stable values; Konva multi-select drag fires dragend per node (deduped); Enter + blur double-commit is prevented with the useDraft().take() pattern.
- macOS sed needs -i ''; there is no `timeout` command; run Electron suites with the dev env vars exported for BOTH the app and the node script.
- Native Edit-menu Undo/Redo are registered without accelerators so the editor owns ⌘Z; this was verified only with synthetic key events — a human should confirm on a real keyboard.
- Fonts used in the recreation are macOS-only; the booth runs on Windows (font strategy ADR-015 still open).

LATEST PRODUCT FINDINGS (research/REAL_TEMPLATE_VALIDATION.md §21-24)
With live text, an event palette and fit-height, the Chaney strip changes colour everywhere from one edit (both print copies); a missing font keeps its name, warns and falls back. The creative foundation is complete. Remaining before real production use: (6) export of any kind (PNG, layer package, DSLR Booth exporter, preflight screen, text rasterization), real-booth validation on Windows, photo shadow / persistent Auto Height / font embedding only if justified.

OPEN DECISIONS: ADR-012 SQLite scope; ADR-014 final render/export approach; ADR-015 only for font embedding/bundling and text rasterization at export (discovery, preservation, fallback resolved in ADR-039). Windows is untested everywhere. Human check done 2026-10-07: keyboard shortcuts (⌘Z, ⇧⌘Z etc.) worked on a real keyboard and the native Save / Don't Save / Cancel quit prompt appeared as designed. Still owed: a human visual review of the UI, the physical close button/frame drag, a deliberate force-quit → recovery dialog test, and Windows.

WHERE I LEFT OFF / WHAT I WILL ASK NEXT
(Replace this block at the end of every session.) Phase 5D is complete and committed (not pushed); the creative foundation 5A-5D is done. The recommended next phase is Phase 6 - Production Export: flattened PNG (printable-boundary clipping already exists in renderOutputToCanvas/renderProjectToCanvas), layer package, DSLR Booth exporter with compatibility validation (needs real DSLR Booth import tests on Windows), and a preflight screen built on the pure font/palette/asset preflight helpers; text rasterization and font embedding policy are decided there (ADR-014, ADR-015 remainder). I have not approved Phase 6 yet. Start by confirming the current state (git log, npm test = 672), summarize what you understood in a few lines, and wait for my instruction before changing anything. Still owed by a human: a visual review of the font picker, palette and fit-height, Windows, a real second computer missing a font.
````

## How to refresh this file (end of every session)
1. Update "Last refreshed" and the HEAD commit above the fence.
2. In the prompt: update the commit list, test count, "WHAT EXISTS", any new architecture/gotchas/scripts, the latest findings, open decisions, and rewrite **WHERE I LEFT OFF**.
3. Keep it self-contained: a fresh session with no memory must be able to continue from this text plus the repository.
