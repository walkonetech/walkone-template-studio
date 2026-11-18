# Roadmap

Phases are **Proposed** and refinable; later phases are intentionally less detailed. Work proceeds one phase at a time with owner approval ([CLAUDE.md](../CLAUDE.md)). Product scope: [PRODUCT_SPEC.md](PRODUCT_SPEC.md). The **fixture analysis** research step was completed before Phase 2 ([../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../research/DSLRBOOTH_FIXTURE_ANALYSIS.md)); no phase sequencing changes are needed. Phase 2 should account for layout cells (two-up), non-unique photo numbers, and opaque vendor-data preservation.

Dependency note: Phases 13–15 (DSLR Booth) need real fixture analysis; analysis may start earlier as research without code.

---
## Phase 0 — Planning and documentation
- **Objective:** Establish the project's source-of-truth documents.
- **Deliverables:** Root + docs set, research README, fixtures dir, git init.
- **Dependencies:** none.
- **Acceptance:** All documents exist, consistent, open decisions marked OPEN, no app code. **Status: complete.**
- **Non-goals:** any code, packages, or library selection.

## Phase 1 — Repository and desktop shell
- **Objective:** Runnable Electron + React + TS shell with secure defaults.
- **Deliverables:** package setup, Vite, strict TS, lint/format, secure main/preload/renderer skeleton, empty home screen, basic CI-less scripts.
- **Dependencies:** Phase 0 approval.
- **Acceptance:** app launches on macOS (Windows build verified or tracked), context isolation on, typed IPC ping, typecheck passes. **Status: complete (macOS verified; Windows build not yet verified).**
- **Non-goals:** editor, canvas, persistence.

## Phase 2 — Project domain model
**Status: complete.** Vendor-neutral domain model, validation, JSON serialization, schema-version/migration boundary, factories, DPI rescale, Vitest.

## Phase 2B — Native project persistence and desktop file lifecycle
**Status: complete.**
- **Objective:** create/open/save/save as a single-file `.boothproject`, safely, with working sessions, recents and an autosave/recovery foundation.
- **Deliverables:** `src/projects/` (package reader/writer, atomic replace, sessions, recents, `ProjectService`, pure IPC handlers), typed IPC + preload API, native dialogs, dev-diagnostic buttons, tests.
- **Dependencies:** Phase 2.
- **Acceptance:** round-trip with assets, failure leaves the old file intact, hostile packages rejected, cancellation distinct from errors, renderer has no Node access, all checks pass.
- **Non-goals:** autosave scheduler, recovery UI, unsaved-changes prompts, project wizard/dashboard, Windows packaging, SQLite.
Remaining for later phases: autosave timer, recovery UX, close/quit confirmation, asset import into sessions (Phase 6/9).

## Phase 3A — Canvas technology evaluation
**Status: complete.** Fabric 7.4.0 vs Konva 10.7.1 + react-konva 19.3.0 compared on the same domain-built 2400×3600 scene; **Konva chosen** (ADR-029). Evidence: [../research/CANVAS_LIBRARY_EVALUATION.md](../research/CANVAS_LIBRARY_EVALUATION.md). Fabric removed; Konva spike retained as experimental reference.

## Phase 3B — Production canvas foundation
**Status: complete.** Konva/react-konva canvas, Zustand editor store with pure mutations and snapshot undo/redo, transform normalization, one-spec rendering for editor and offscreen render, exact-size render API, image asset bridge, text overlay editing, snapping with guides, keyboard actions, dirty/working-copy integration, temporary editor shell, spike removed. See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §5–5a and ADR-030–032.

## Phase 4 — Layer management, selection and properties inspector
**Status: complete.** Layers panel (front-first tree, groups, lock/visibility with inherited state, rename, drag reorder, stacking commands, filter), Properties inspector for every layer type with draft-then-commit fields, add/duplicate/delete, multi-selection with shared transformer, group/ungroup, toolbar/status bar, modified indicator. See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §5b, [UX_SPEC.md](UX_SPEC.md) §19, ADR-033.
- **Not delivered (deferred):** context menu, drag into/out of groups, rulers, layer thumbnails, palette manager, copy/paste, align/distribute.

## Phase 4B — Persistence safety, autosave and crash recovery
**Status: complete.** Unified close/quit protection (native Save / Don't Save / Cancel, main-process coordinator), debounced autosave to the working session, session metadata with owner token, startup recovery with conflict handling, quarantine/retention, temporary recovery dialog. See ADR-034.
- **Not delivered:** designed (non-temporary) dialogs and status UI (Phase 4C); multi-window; persisted undo history.
- **Recommended next:** Phase 4C — UI/UX redesign — before Phase 5.

## Phase 4C — Editor UI/UX redesign and design system
**Status: complete (first pass; owner visual review pending).** Tokens, component library, icon set (`lucide-react`), welcome screen, menus, tool rail/drawer, top/status bars, redesigned Layers and Properties, resizable panels, restyled dialogs, focus/accessibility pass. See ADR-035 and [../research/UI_UX_REVIEW.md](../research/UI_UX_REVIEW.md).
- **Not delivered:** layer thumbnails, context menu, light theme, persisted panel sizes, native-select theming.
- **Recommended next:** owner review, then Phase 5 (photo placeholders).

## Approved product-driven sequence (owner-approved 2026-10-07; supersedes the order of the original Phases 5–15 below)
A real production template recreated through the UI ([../research/REAL_TEMPLATE_VALIDATION.md](../research/REAL_TEMPLATE_VALIDATION.md)) showed that image import was the first blocker. The sequence now is:

### Phase 5A — Project Assets & Image Import
**Status: complete (2026-10-07).** Import PNG/JPEG/WebP/SVG into the project (native picker + drag and drop), project-owned assets with content-hash de-duplication, Assets drawer with thumbnails, add-to-canvas, image roles, Set as Background (cover/contain/original), canvas background colour, effective-DPI readout, per-layer Replace, unused-asset removal, undo/redo, save/Save As/reopen/recovery with assets, safe-SVG policy. ADR-036. Not delivered (by design): export, sample photos, 2×6 composition, palette/font managers, global library.

### Phase 5B — Photo Strip Authoring & Print Composition
**Status: complete (2026-10-08).** Derived 2-up composition, Design / Print Preview, strip New Project, exact selection X/Y, align/distribute, design-pixel nudging; ADR-037. Original scope:
- logical **2×6** authoring (one design); 2-up 4×6 output derived from it (`OutputComposition` already models this); Design / Print Preview
- exact group/multi-selection positioning; alignment/distribution

### Phase 5C — Photo Preview, Crop, Frame & Precision Canvas Workflow
**Status: complete (2026-10-09).** Sample photos + Preview Photos, crop/reposition (editor state), frame styling, Show overflow/Clipped view, precision zoom/pan, Shift-constrained drag, tooltips; ADR-038 (shadow deferred, no schema change). Original scope:
- realistic sample photos; Preview Photos (the toggle is disabled until then); crop/reposition; fit/fill refinement; frame workflow

### Phase 5D — Typography & Palette Foundation
**Status: complete (2026-10-10).** Font picker/availability/portability, fit-height, text presets, Event Palette with global updates; ADR-015 (in part), ADR-039/040. Original scope:
- installed fonts, missing-font handling, font portability (ADR-015); palette UI; canvas/background colour refinement; reusable event colours

### Phase 6A — Production Render & General Export Foundation
**Status: complete (2026-11-16).** Vendor-neutral: Print / Design / Proof PNGs from the Konva exact-size renderer (ADR-014 accepted), semantic layer package (background, frames, overlay, text, design, proof, manifest, readme; withdrawn from the dialog after owner testing, ADR-041 §8, code kept for 6B), export preflight, Export dialog (⌘E) with main-owned folder picker, verification, conflicts (Replace / Keep both), atomic writes, PNG density and reveal. ADR-041. No schema change. No DSLR Booth XML/ZIP.

### Phase 6B — DSLR Booth 7.48 Export Adapter
**Status: complete (2026-11-16), ADR-047.** dslrBooth template ZIP from the Export dialog: native 2×6 strip (default) and a 4×6 sheet fallback; photo slots native, artwork/text flattened into images by stacking order, frames and rounded corners exact; fixture-faithful `template.xml`/ZIP; dslrBooth preflight; verified before writing. Real-booth checks are Phase 6C. Original brief: uses the externally established interoperability rules in [../research/DSLRBOOTH_748_RUNTIME_FINDINGS.md](../research/DSLRBOOTH_748_RUNTIME_FINDINGS.md): native 2×6 by default (dslrBooth composes the two-up `_2x` print; sharing uses `_1x`), pre-composed 4×6 compatibility export later, outward photo borders, KeepAspect mapping, text native vs rasterized, PhotoNumber 1–12. Builds on the 6A renderer and file lifecycle.

### Phase 6D — DSLR Booth Importer (done before 6C)
**Status: complete (2026-11-17), ADR-048.** Import a dslrBooth template ZIP into a new editable project: safe ZIP reading, tolerant XML reader, mapping to photo slots / image layers / assets, two-strip sheet → one 2×6 strip (or as is), import report, unknown data preserved in `sourceCompatibility`. Validated against the five fixtures and their own previews. (Replaces the historical "Phase 13 — DSLR Booth importer".)

### Phase 6C — Real DSLR Booth compatibility validation
**Stage 1 done (2026-11-17) on the Windows test laptop with the DNP DS-RX1; Mac-side fixes done.** Results: [../research/PHASE_6C_RESULTS.md](../research/PHASE_6C_RESULTS.md) (observed findings only, ADR-050). Template Studio runs on Windows; dslrBooth 7.48 accepts both exports and a live session matches the design; one real defect (C1: live dslrBooth text not imported) is **implemented: live text imports as editable text (2026-11-18, ADR-051)**. The Windows re-test of `5f7c26a` passed the round trip but was partial (two-strip regression, ZIndex tie, long-line wrap); the stabilization pass fixed the regression and made the other two explicit (clipping proposed as ADR-052, OPEN). **Implemented — pending Windows revalidation**; not closed until then. **Still open (owner):** reading the measurement print (safe area / 2-inch cut), the manual `/print` check, the booth PC's own printer settings. Original plan: Hardware ready: the owner installed the DNP printer on a **Windows test laptop with dslrBooth installed** (2026-11-17; exact dslrBooth version to be noted). Scope: (A) run Template Studio on Windows for the first time (build from source, `npm test`, dialogs, Explorer reveal, fonts, rendering); (B) import Template Studio's dslrBooth exports (native strip + 4×6 sheet, 4×6 postcards at 300/600 DPI) into dslrBooth 7.48 and check slots, frames, rounded corners, rotation pivot, `_1x`/`_2x` outputs, re-import with an equal `Id`, preview requirements; (C) print on the DNP printer with the 2-inch cut (printer/driver settings recorded, never stored in templates) and test the `/print` endpoint; (D) import the owner's own dslrBooth templates into Template Studio, export them back and compare prints. Results come back as a numbered pass/fail list; fixes and doc updates follow.

### GUI mockup rounds → Design Guide + Editor redesign (after 6B)
Rounds 1–2 done as mockups (2026-11-16). **Sequencing (owner):** Phase 6B first; then a few more rounds of redesign, scoping and Guide work, then the build as its own phase(s). Several rounds of GUI mockups for owner review **before** any UI rebuild. Owner feedback from the first manual test (2026-11-16) that the mockups must answer:
- **Self-explanatory for non-technical users** (the operator's first-time staff; clients never see the app); the goal is that nobody needs Canva or Photoshop. Canva is the reference for the canvas-editing feel.
- **Hidden modes are confusing.** The owner did not know what the sample photos were (Reposition turned Preview photos on) nor how to turn them off (a small status-bar icon). Modes that change what the canvas shows need a visible, labelled on/off state.
- **Much bigger, self-explanatory icons**, ideally with text labels, and hover helpers (tooltips) everywhere.
- **Colour differences** in icons and controls to tell kinds of elements apart (e.g. photo slots vs text vs artwork vs canvas/view controls).
- **Better use of space** so the different parts of the app read as distinct areas.
- **Canva is the UX reference** for the canvas editor, its icons, editing buttons and controls (owner, 2026-11-16): patterns, not its look. Observed patterns and a first mapping: [../research/CANVA_UX_REFERENCE.md](../research/CANVA_UX_REFERENCE.md).
- **Round 1 outcome (owner, 2026-11-16): a hybrid of two ways in, one project.**
  - **Design Guide** for first-time designers, heavily guided, one question at a time with a live preview: event type → styles suited to that event → colour combinations → "Does the event have a logo?" (upload / monogram from the names / none) → names, date, extra line → print format and number of photos → ready (export, fine-tune in the editor, client preview).
  - **Design Guide v2 (owner, 2026-11-16)**: must produce a finished, ready-to-export template without opening the editor. Order: **print size first** (2×6 strip / 4×6 portrait / 6×4 landscape) → event type (wedding, birthday, prom/homecoming, church event, corporate & brand, graduation, baby shower, holiday party, sweet 16/quince, party, something else) → style for that event → colours (+ plain or picture background) → photos (how many, landscape/portrait/square, size relative to the print: large/balanced/small) → event logo/crest/image (upload / monogram / none) → words (names or title, date, optional line) → the operator's company branding (logo or website line, top or bottom; set once, remembered) → layout (a predetermined spot for each element, or a ready layout) → done (export, client preview, matching strip/4×6). Clients mostly want control over colours and their logo; the rest is style preference.
  - **Owner decisions after round 2 (2026-11-16):**
    - **Who uses it:** the photo booth operator's team (designers and first-time staff). **Event clients never see the app**; the main client approves the template in advance (via the client preview/proof) and it is added to dslrBooth before the event.
    - **Automatic safe-area check (required):** warn while designing when anything would be lost at the **2-inch cut** of a strip (or the print edge of a postcard), with a fix ("Shrink to fit", "Edit the text"); visible cut and safe-area lines; checked again before export. dslrBooth does not wrap text, so a line that is too long is cut, not wrapped.
    - **Event themes:** save the choices of a finished design (guide or editor) as an event theme preset, and start the next similar event from it (start screen, editor Design ideas).
    - **Steps are scoped to the event type:** questions and options depend on earlier answers (e.g. a monogram is offered for weddings, not for a party; label and hint wording per event; layout rows only for chosen elements).
  - **Editor** for power users (Canva-style, round 1 direction A) with a "Design ideas" panel and a "Guide me" button, so the Guide's suggestions stay one click away.
  - Start screen offers both; users can switch at any time.
  - Round 1 direction B (dark) becomes a **Light / Dark appearance setting** later, once Template Studio is part of the booth software build.
  - Round 2 mockups (Start, Design Guide, Editor) are in a private artifact the owner holds; decisions are recorded here, not there.

### Owner direction after 6A (2026-11-16) — see DECISIONS ADR-042…046
- **Done:** Phase 6B (ADR-047). **Next:** The owner will bring the DNP printer to the booth PC for the open printer checks.
- **Done after 6B:** the **DSLR Booth importer** (Phase 6D, ADR-048), then **6C Stage 1** on the Windows test laptop with the DNP printer and its Mac-side fixes (ADR-050). **Next proposed:** finish 6C (owner print readout, `/print` check, Windows revalidation of the C1 stabilization, owner decision on ADR-052), then safe-area check + output profiles.
- **Then:** more GUI rounds (Design Guide + Editor), including the **font library** (ADR-044), **company profile/settings** and **asset library**; then the redesign build.
- **Long term:** standalone Template Studio + the same editor inside **WalkOne Booth**, the dslrBooth replacement (ADR-049, which resolves the architecture part of ADR-042); Windows-first booth runtime, iPad/tablet later for guest/companion roles (ADR-043); video option; installer.

### After 6C: two coordinated tracks (ADR-049, [PRODUCT_ECOSYSTEM.md](PRODUCT_ECOSYSTEM.md))
Future work is no longer only "continue Template Studio": Template Studio stays a standalone product and becomes the full-capability editor module of **WalkOne Booth**, with one shared core.
- **Template Studio track** (continues; each phase still needs approval): complete 6C validation and fixes → safe-area check + **output profiles** (2-inch cut, media, margins; from 6C measurements) → **Design Guide** (+ GUI rounds and the Canva-style editor redesign) → asset library and **company profile** improvements → proof / client approval → installer / packaging → standalone polish.
- **WalkOne Booth track** (**not approved; starts only on explicit owner approval**): architecture and shared contracts (incl. package extraction strategy) → Windows shell → Event Manager → native Template Studio integration (event context in, native template out, Event Readiness) → template runtime format → test capture simulator → Print Service / output profiles → sharing queue → SMS / email / QR → real camera adapters → guest runtime → operator dashboard and Booth Health → migration away from dslrBooth (dslrBooth support becomes a legacy adapter).

### Later
Badge Builder, template library, Design Recipes, asset library (global), external providers, further polish.

**Numbering note:** the historical phase list below keeps its original numbers so completed history stays readable. Where it conflicts with the sequence above, the sequence above wins: old Phase 5 (photo placeholders) is largely delivered already; old Phase 6 (text, shapes, **image import**) is delivered by 5A and 5D; old Phase 7 → 5D; old Phase 12 (render/export) → 6A and 14 (DSLR exporter) → 6B/6C; old Phase 13 (importer) → 6D (done).

---
## Historical phase list (original numbering)

## Phase 5 — Photo placeholders
- **Objective:** First-class PhotoLayer.
- **Deliverables:** PhotoLayer UI, numbering rules, frame styles v1, sample-photo preview basics.
- **Dependencies:** Phase 4.
- **Acceptance:** duplicate/missing number detection; frames render; distinct from shapes in model and UI.
- **Non-goals:** DSLR export.

## Phase 6 — Text, shapes and graphics
- **Objective:** Content layers.
- **Deliverables:** text layer with typography controls, shapes, image import to project assets, font handling approach (ADR).
- **Dependencies:** Phase 4.
- **Acceptance:** text renders consistently; missing fonts detected; assets embed in project package.
- **Non-goals:** badge builder, library.

## Phase 7 — Palette system
- **Objective:** Semantic palette roles.
- **Deliverables:** palette model/UI, role-bound colors, saved palettes, extraction from images (basic).
- **Dependencies:** Phase 6.
- **Acceptance:** changing a role updates bound layers instantly; HEX input validated.
- **Non-goals:** AI palette generation.

## Phase 8 — Badge builder
- **Objective:** Parameterized badges.
- **Deliverables:** badge components/styles, field binding to event metadata, builder UI.
- **Dependencies:** Phases 6–7.
- **Acceptance:** editing event info updates badges; overrides tracked.
- **Non-goals:** large style catalog.

## Phase 9 — Asset library
- **Objective:** Reusable local library.
- **Deliverables:** library storage/index (SQLite scope decided), import, tags, search, project vs library distinction.
- **Dependencies:** Phase 6.
- **Acceptance:** offline search works; library→project copy preserves portability.
- **Non-goals:** external providers.

## Phase 10 — Template library
- **Objective:** Reusable parameterized templates.
- **Deliverables:** save as template, gallery, filters, field binding.
- **Dependencies:** Phases 7–9.
- **Acceptance:** applying template fills event info and palette.
- **Non-goals:** marketplace/sharing.

## Phase 11 — Design Recipes
- **Objective:** Rule-based starting designs.
- **Deliverables:** recipe model (ADR), recipe runner, a few seed recipes.
- **Dependencies:** Phase 10.
- **Acceptance:** recipe produces editable starting project from event info + palette.
- **Non-goals:** AI generation.

## Phase 12 — Preview/render pipeline
- **Objective:** Deterministic render shared by preview and export.
- **Deliverables:** renderer, sample photos, flattened PNG and layer-package export.
- **Dependencies:** Phases 5–6.
- **Acceptance:** same input → identical output; visual regression baseline established.
- **Non-goals:** DSLR packaging.

## Phase 13 — DSLR Booth importer (delivered as Phase 6D, 2026-11-17)
- **Objective:** Import real DSLR Booth ZIPs.
- **Deliverables:** fixture analysis findings, safe extraction, parser, mapper, import report, unknown preservation.
- **Dependencies:** real fixtures; Phases 2, 12.
- **Acceptance:** all supplied fixtures import with documented warnings; compatibility doc updated with confirmed facts.
- **Non-goals:** export.

## Phase 14 — DSLR Booth exporter (delivered as Phase 6B; real-booth acceptance in 6C)
- **Objective:** Produce DSLR Booth-compatible ZIPs.
- **Deliverables:** exporter, deterministic packaging, preview image, round-trip tests.
- **Dependencies:** Phase 13.
- **Acceptance:** round-trip tests pass; owner confirms an exported ZIP imports and renders correctly in real DSLR Booth.
- **Non-goals:** other booth software.

## Phase 15 — Preflight and compatibility validation
- **Objective:** Pre-export validation.
- **Deliverables:** rule engine, error/warning UI, package completeness checks.
- **Dependencies:** Phases 5, 14.
- **Acceptance:** each listed check implemented or explicitly deferred; errors block export.
- **Non-goals:** auto-fix everything.

## Phase 16 — External integrations
- **Objective:** Optional provider adapters.
- **Deliverables:** provider interface, first provider(s) only if API/terms validated, secure credential storage.
- **Dependencies:** Phase 9; provider research.
- **Acceptance:** app fully works with providers disabled/offline.
- **Non-goals:** assuming APIs; scraping.

## Phase 17 — UX polish
- **Objective:** Production-quality experience.
- **Deliverables:** accessibility pass, empty/error states, onboarding, performance.
- **Dependencies:** most prior phases.
- **Acceptance:** manual QA checklist passed.
- **Non-goals:** new major features.

## Phase 18 — Packaging/release
- **Objective:** Installable builds.
- **Deliverables:** macOS/Windows installers, signing decisions, update strategy, release notes.
- **Dependencies:** Phase 17.
- **Acceptance:** clean-machine install and launch verified on both OSes.
- **Non-goals:** store distribution, billing, accounts.

> 2026-10-14: paused after Phase 5D for human testing (docs/MANUAL_TEST_GUIDE.md).
> 2026-11-16: owner approved Phase 6A (manual testing no longer a blocker); 6A complete. Phase 6B awaits approval.
