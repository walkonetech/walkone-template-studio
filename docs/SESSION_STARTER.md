# Session Starter

**Purpose:** a self-contained prompt for starting a brand-new Claude Code session with everything needed to continue. **It must be refreshed at the end of every session/phase** (CLAUDE.md makes this a required step). Copy everything inside the fenced block below into the first message of the new session.

_Last refreshed: 2026-11-16, after Phase 6A (production render & general export foundation). HEAD is the Phase 6A commit (`feat: add production render and general export (Phase 6A, ADR-041)`). Not pushed (push only when the owner asks). Phase 6B is NOT approved._

````text
You are continuing work on WalkOne Template Studio, an internal Electron + React + TypeScript desktop tool for WalkOne Entertainment, LLC that builds custom photo-booth print templates (4x6 and 2x6 strips) for LumaSoft DSLR Booth / LumaBooth. Working directory: /Users/walkone/Projects/Apps/walkone-template-studio (git repository, macOS development; the booth software runs on Windows).

READ FIRST, IN THIS ORDER, BEFORE DOING ANYTHING
1. CLAUDE.md (operating rules — follow them exactly)
2. docs/CURRENT_STATE.md (what is done, verified, not verified, known limits)
3. docs/SESSION_STARTER.md (this file; the prompt you are reading)
4. research/DSLRBOOTH_748_RUNTIME_FINDINGS.md (owner-reported dslrBooth 7.48 interoperability rules; the input for Phase 6B)
5. docs/MANUAL_TEST_GUIDE.md (how to start the app + the full human test checklist, incl. §G2 Export)
6. Then whatever the task needs: docs/ROADMAP.md (6A done, 6B/6C defined), docs/DECISIONS.md (ADR-001…041; ADR-014 accepted, ADR-041 export), docs/ARCHITECTURE_PLAN.md (§5h export), docs/DSLRBOOTH_COMPATIBILITY.md (§1b 7.48 summary), docs/UX_SPEC.md, docs/USER_WORKFLOWS.md (V export), docs/TESTING_STRATEGY.md (§9h), docs/DATA_MODEL.md, research/REAL_TEMPLATE_VALIDATION.md, research/DSLRBOOTH_FIXTURE_ANALYSIS.md
Inspect the code before changing architecture; if docs and code disagree, say so.

GOVERNANCE (strict)
- Do ONLY the phase/task I request. When it is done: update docs, run the quality gate, commit, report, then STOP and WAIT for my approval. Never start the next phase on your own.
- Phase-end checklist (CLAUDE.md): update docs/CURRENT_STATE.md, ROADMAP.md if appropriate, DECISIONS.md for real decisions, REFRESH docs/SESSION_STARTER.md, summarize files changed, tests run, known issues, recommend the next phase.
- Honesty: never fabricate test results; label DSLR Booth claims Confirmed/Proposed/Assumption/Unknown/Needs Validation; the 7.48 findings are "Confirmed via external clean-room runtime research reported by the owner; not independently reproducible from repository fixtures"; clearly distinguish scripted automation from human testing (automation cannot send real OS keystrokes or drag the window frame here).
- Never copy external proprietary dslrBooth implementation; use the findings only as interoperability requirements.
- Never commit secrets, client data, recovery/session data, temp projects, generated screenshots/PNGs/exports. Commit trailers: end every commit message with the Co-Authored-By and Claude-Session lines the session's system instructions provide (they name the current model and session URL; do not copy an older model name). The repository is backed up to a PRIVATE GitHub repo (remote `origin`, account walkonetech). Push only when I ask (or tell you to at session end). The fixture ZIPs were purged from git history before the first push and are git-ignored: never `git add -f` them.
- DSLR Booth fixtures in tests/fixtures/dslrbooth/source/ are PRIVATE client data and immutable (never modify; they are local-only and NOT on GitHub; a fresh clone has an empty source/ folder; their SHA-256s are in research/DSLRBOOTH_FIXTURE_ANALYSIS.md). AGENTS.md stays git-ignored. Fabric is removed and must stay absent.
- Do not change the TemplateProject schema (schemaVersion 1) or the .boothproject format without asking me first. Never add printer model, centre-cut, driver media or PrintTicket to TemplateProject (printer finishing is printer/driver configuration; guidance only).

WHAT EXISTS (all committed; git log, newest first)
HEAD feat: add production render and general export (Phase 6A, ADR-041)
2c8b768 docs: manual test guide + session refresh
e2232bd feat: add typography and event palette workflow (Phase 5D, ADR-039/040)
b59357e feat: add photo preview and precision canvas workflow (Phase 5C, ADR-038)
7e27f94 feat: add photo strip print composition (Phase 5B, ADR-037)
8b9739e feat: add project asset import workflow (Phase 5A, ADR-036)
a2a1eae docs: human keyboard-shortcut and quit-prompt verification; 17445d0 docs: refresh session starter; 1a1a54c chore: private fixtures local-only + GitHub backup policy; ca196da docs: session starter; edb2891 research: validate real template workflow
9096a3c style: polish (4D); 5a85fca feat: redesign (4C, ADR-035); 8cb5e86 feat: autosave + recovery (4B, ADR-034); 33235b1 feat: layers + inspector (4, ADR-033); 066e14d feat: canvas foundation (3B); 8aece5f/693be9e Konva vs Fabric → Konva (ADR-029); 143a72e persistence (2B); 7c95e95 domain (2); b63160a fixture analysis; 745230a shell; 9690f45 docs.
Status: 760 unit tests passing (752 after 6A, before the resize-snapping/seam follow-up; 413 before 5A, 502 before 5B, 543 before 5C, 631 before 5D, 673 before 6A); the app builds and runs.
Phase 6A is done: Export dialog (top-bar Export, File → Export…, ⌘E) → Print PNG (print sheet; 2×6 → derived 4×6 two-up), Design PNG (one copy, offered when the sheet has several), Proof PNG (current sample photos + crops, "Not for printing", not watermarked), Layer package ZIP — built but NOT offered in the dialog since ADR-041 §8, code kept for 6B (semantic bands: background/frames/overlay/text + design.png, proof.png, manifest.json `walkone.layer-package` v1, readme.txt). Production = all printable layers + native frames, photo areas empty, no samples. Preflight (errors block / warnings / notes; repeated PhotoNumbers never reported; no DSLR limits). Main: folder picker → opaque destination id, verification, conflicts (Replace / Keep both / Cancel), atomic writes, PNG pHYs density, deterministic ZIP, reveal written files only. Export never modifies the project.
Earlier phases: 5D font picker/availability/portability, Fit height, text presets, Event Palette, ratio-locked photo placeholders; 5C Preview Photos (procedural samples by PhotoNumber), Reposition/crop, frame styling, Show overflow/Clipped view, Space pan, pointer-centred zoom, Shift-constrained drag, tooltips; 5B 2×6 strips authored once with a derived 2-up 4×6, Design / Print Preview, exact X/Y, align/distribute, nudging; 5A image import, project assets, Assets drawer, roles, backgrounds, effective-DPI readout.
Not started: DSLR Booth exporter (6B) and importer, real-booth validation (6C), photo shadow / persistent Auto Height (need schema), font embedding, image palette extraction, badge builder, global asset library, recipes, providers.

ARCHITECTURE IN BRIEF
- Electron main/preload/renderer, contextIsolation + sandbox, typed IPC, CSP unchanged. Renderer has no Node; no filesystem path ever crosses IPC.
- src/domain: vendor-neutral TemplateProject (print size in inches + DPI as first-class; flat layers with parentId; photo/image/text/shape/group; palette; assets; output composition). Strict TypeScript with exactOptionalPropertyTypes (use conditional spreads for optional props).
- src/export (alias @export; in BOTH tsconfigs; pure; tests under src/export/__tests__ are node-only and excluded from the web tsconfig): naming.ts (portable stems, kinds/suffixes, isSafeExportFileName, uniqueFileName), png.ts (crc32, readPngInfo, withPngDensity → pHYs), package.ts (format id/version, flat entry rule).
- Export (6A, ADR-014/041): editor/exportPlan.ts (exportOutputs, printableLeaves, classifyLayerPackage → bands + notes, packageFiles, buildPackageManifest, packageReadme), editor/exportPreflight.ts (runExportPreflight). canvas/rendering: RenderOptions.photos 'placeholder'|'preview'|'omit'|'frame' ('frame' = native frame only; production uses it), include (leaf filter, groups kept), background 'transparent'; drawPhotoPlaceholder frameOnly. Renderer: exportActions.ts (load images; proof lookup from current previewPhotos/photoCrops; render; toBlob), ExportDialog.tsx, command file.export, layoutStore.exportOpen. Main: exportService.ts (Electron-free, zod-validated; verify, density, in-memory yazl ZIP with fixed mtime, conflict policy, writeFileAtomic which now accepts bytes, reveal only written), exportIpc.ts (dialog + shell + dev overrides). IPC export:chooseDestination / export:write / export:reveal. New error codes export-destination-missing, export-invalid-output.
- Assets (5A): src/projects/imageInspect.ts, ProjectService.importAssetFiles/importAssetBytes (SHA-256 dedup, atomic copy to <session>/assets/<id>.<ext>), IPC project:importAssets / project:importAssetData; editor/assetMutations.ts + imagePlacement.ts; domain/assets/resolution.ts + usage.ts. Assets belong to the LOGICAL design.
- Print composition (5B): canvas/rendering/composition.ts (planOutput translates the ONE authored layer list per cell; copies are never stored; each copy clipped to its cell; cutLines), renderOutputToCanvas, PrintPreviewCanvas, editor/arrange.ts, nudge.ts. createProject defaults strip-2x6-* to a two-up output.
- Photo preview & precision (5C): photoFit.ts, axisLock.ts, previewPhotos.ts, spacePan.ts, tooltips.ts; samples and crops are EDITOR state, never project/history/dirty; production output never contains samples.
- Typography & palette (5D): fontStack.ts, editor/fonts.ts, typographyMutations.ts, paletteMutations.ts, textPresets.ts, preflight.ts (font/palette helpers reused by the export preflight); renderer fontCatalog.ts (fontEnvironment()), FontPicker, PalettePanel; main permission policy (local-fonts only).
- src/projects: .boothproject (ZIP via yauzl/yazl), working sessions under <userData>/sessions/<id>/, atomic save, recents, recovery, ProjectService, IPC handlers.
- src/main: window/menu (appMenu.ts), closeCoordinator.ts + documentLifecycle.ts, devOverrides.ts, projectIpc.ts, exportIpc.ts.
- src/editor: Zustand vanilla store with pure mutations, snapshot undo/redo, autosave, commands.ts (single command model), layout.ts, tools.ts.
- src/renderer/src: styles/ (tokens.css etc.), ui/ (Button, Dialog — Escape works even when focus fell out of it, …), editor/ (EditorScreen, TopBar, dialogs, panels; useEditorKeyboard ignores keys while any aria-modal dialog is open). Icons: lucide-react.
- Dirty state = project !== savedProject (reference equality). UI-only state lives in layoutStore, never in the project.

HOW TO RUN / CHECK
- Install: npm install. Run built app: npm run build && npm start. Dev mode: npm run dev.
- Quality gate (all must pass before a commit): npm run typecheck && npm run lint && npm run format:check && npm run build && npm test.
- Manual testing: docs/MANUAL_TEST_GUIDE.md. Throwaway profile: npx electron out/main/index.js --user-data-dir=$HOME/wts-test (add #debug to the URL hash to get window.__wts).
- Scripted built-app suites (automation over the DevTools protocol, research/editor-validation/, results-*.json recorded): validate.js (Phase 4 regression, 97; needs the app launched on port 9350 with WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH, WALKONE_DEV_UNSAVED_CHOICES=discard, WALKONE_DEV_WINDOW_SIZE=1440x900 and the anti-occlusion flags), and self-launching validate-4b.js (40), validate-4c.js (97), validate-4d.js (6), validate-5a.js (53; python3+Pillow), validate-5b.js (39), validate-5c.js (59), validate-5d.js (40), validate-6a.js (48; exports through the real dialog and measures the files with inspect-export.py: python3 -P + Pillow). Dev-only env overrides (ignored when packaged): WALKONE_DEV_UNSAVED_CHOICES, WALKONE_DEV_SAVE_PATH, WALKONE_DEV_OPEN_PATH, WALKONE_DEV_IMPORT_PATHS, WALKONE_DEV_WINDOW_SIZE, WALKONE_DEV_EXPORT_DIR (';' per picker, CANCEL), WALKONE_DEV_NO_REVEAL=1.
- Screenshots go to research/editor-validation/shots/ (git-ignored). Always write script outputs with __dirname, never the repo root.

LESSONS / GOTCHAS
- macOS can mark the Electron window occluded and scripted input then stalls; the harness passes occlusion-disabling switches and Page.bringToFront. validate-4c's SIGKILL/recovery scenario is timing-sensitive (one 93/97 run in 6A, 97/97 on rerun): rerun before suspecting a regression.
- `python3 -I` hides the user-site Pillow install; use `python3 -P` for inspect-export.py.
- When a focused button becomes disabled, Chromium moves focus to <body>: dialogs must not rely on focus being inside them (fixed in Dialog + useEditorKeyboard; ExportDialog re-focuses its primary action after each phase).
- A zustand selector that returns a new object each call loops: select pieces and useMemo. Inside page.evaluate snippets `const s=getState()` is a stale snapshot. Konva multi-select drag fires dragend per node; the Transformer ignores constraints on the grabbed node, so followers are re-placed explicitly.
- Prettier reformats code, so naive string replacement scripts fail silently — assert replacements or edit by line. macOS sed needs -i ''; there is no `timeout` command.
- eslint react-hooks/refs forbids writing ref.current during render (assign in an effect).
- Fonts used in recreations are macOS-only; the booth runs on Windows (font embedding is still open, ADR-015).

LATEST PRODUCT FINDINGS
- Export (6A): the print sheet's two copies are pixel-identical, the left copy equals the Design PNG, and re-stacking the package bands reproduces design.png exactly for a typical strip (measured by validate-6a.js).
- dslrBooth 7.48 (owner-reported, external): native 2×6 with print_2_per_page=True → _1x (one strip; gallery/email/SMS/QR/LumaShare) and _2x (two-up 4×6; printing); so 6B should export native 2×6 by default, pre-composed 4×6 later as compatibility. Photo: centred Cover, clockwise rotation after crop, borders grow OUTWARD (Template Studio frames are drawn INSIDE the box: convert), PhotoNumber 1–12. Image: KeepAspect True=fit, False=stretch; transparent PNG overlays work. Text: newlines yes, no wrapping, clips, FontSize=0 auto-fits, missing fonts silently fall back → rasterize text when fidelity needs it, keep simple single-line text native. Printer finishing (2-inch cut) and the /print endpoint: Needs Validation on the DNP printer (paused; not a blocker).

OPEN DECISIONS: ADR-012 SQLite scope; ADR-015 remainder (font embedding/bundling; native vs rasterized text in the DSLR Booth adapter). ADR-014 accepted in 6A. Windows is untested everywhere. Still owed by a human: a visual review of the UI (incl. the Export dialog), opening exported files in Preview/Photoshop, the physical close button/frame drag, a deliberate force-quit → recovery test, a real second computer missing a font, and Windows.

WHERE I LEFT OFF / WHAT I WILL ASK NEXT
(Replace this block at the end of every session.) Phase 6A (Production Render & General Export Foundation) is complete and committed locally (not pushed), plus owner-testing follow-ups: layer package removed from the Export dialog (ADR-041 §8; code kept for 6B), Canva-style resize snapping (edges + same width/height, size marks) and the photo-frame hairline fix (CURRENT_STATE "After 6A"). The approved sequence is 6A (done) → 6B DSLR Booth 7.48 Export Adapter → 6C real DSLR Booth compatibility validation on the authorized Windows install (DNP printer checks in parallel). Phase 6B is NOT approved yet: wait for my approval. When I approve 6B, build it on the 6A renderer, preflight and file lifecycle, use research/DSLRBOOTH_748_RUNTIME_FINDINGS.md as interoperability requirements (native 2×6 default, outward borders, KeepAspect, text native-vs-raster, PhotoNumber 1–12 in the adapter's own preflight), keep the adapter isolated (DSLRBoothExporter; XML never becomes the internal model), no schema change without asking. Start the next session by confirming the state (git log, npm test = 760), summarize what you understood in a few lines, and wait for my instruction.
````

## How to refresh this file (end of every session)
1. Update "Last refreshed" and the HEAD commit above the fence.
2. In the prompt: update the commit list, test count, "WHAT EXISTS", any new architecture/gotchas/scripts, the latest findings, open decisions, and rewrite **WHERE I LEFT OFF**.
3. Keep it self-contained: a fresh session with no memory must be able to continue from this text plus the repository.
