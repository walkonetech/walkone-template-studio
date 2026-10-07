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

## Phase 13 — DSLR Booth importer
- **Objective:** Import real DSLR Booth ZIPs.
- **Deliverables:** fixture analysis findings, safe extraction, parser, mapper, import report, unknown preservation.
- **Dependencies:** real fixtures; Phases 2, 12.
- **Acceptance:** all supplied fixtures import with documented warnings; compatibility doc updated with confirmed facts.
- **Non-goals:** export.

## Phase 14 — DSLR Booth exporter
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
