# Roadmap

Phases are **Proposed** and refinable; later phases are intentionally less detailed. Work proceeds one phase at a time with owner approval ([CLAUDE.md](../CLAUDE.md)). Product scope: [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Suggested insertion: a short **fixture analysis** (research) step before Phase 2/13 — DSLR Booth findings affect the data model.

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

## Phase 2 — Project model and persistence
- **Objective:** Implement the vendor-neutral model and save/open.
- **Deliverables:** domain types, units/geometry helpers, schemaVersion + migration scaffold, project package read/write, new/open/save/save as, recents, autosave basics.
- **Dependencies:** Phase 1; ideally fixture findings reviewed for model gaps.
- **Acceptance:** round-trip save/load tests; px↔inches math tested; ADR-009/010 resolved.
- **Non-goals:** UI editor, DSLR Booth.

## Phase 3 — Canvas foundation
- **Objective:** Print-size canvas with zoom/pan and selection.
- **Deliverables:** Fabric vs Konva evaluation and ADR-011 decision, canvas abstraction, render of simple layers, rulers/guides basics.
- **Dependencies:** Phase 2.
- **Acceptance:** accurate canvas size from print config; smooth zoom/pan; decision recorded with prototype evidence.
- **Non-goals:** full layer tooling, photo logic.

## Phase 4 — Layer management
- **Objective:** Layer panel and core object manipulation.
- **Deliverables:** layers panel, z-order, lock/hide, group, align/distribute, snapping/smart guides, undo/redo, copy/paste, shortcuts.
- **Dependencies:** Phase 3.
- **Acceptance:** all manipulations undoable and persisted; keyboard shortcuts work.
- **Non-goals:** typography depth, palette.

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
