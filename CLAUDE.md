# CLAUDE.md — Operating Rules for WalkOne Template Studio

This file is the persistent rulebook for every Claude Code session on this project. Follow it before anything else.

## Project in one paragraph
WalkOne Template Studio is an internal desktop tool (Electron + React + TypeScript; see docs/CURRENT_STATE.md for what exists) for WalkOne Entertainment, LLC that speeds up creating custom photo booth print templates for LumaSoft DSLR Booth / LumaBooth. It is a focused print-template tool, not a general design app. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

**Long-term direction (ADR-049, [docs/PRODUCT_ECOSYSTEM.md](docs/PRODUCT_ECOSYSTEM.md); planning only):** Template Studio stays a first-class standalone app (macOS and Windows) and will also be the full-capability template editor inside **WalkOne Booth**, a future Windows-first, local-first booth platform that replaces dslrBooth. One shared Template Studio core serves both; dslrBooth support is a migration adapter that later becomes legacy interoperability. WalkOne Booth development is **not** approved to start.

## Before beginning any work
1. Read this file.
2. Read [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — it says which phase is active.
3. Read the documents relevant to the task (product, architecture, data model, DSLR Booth compatibility, roadmap).
4. Inspect existing code before changing architecture. Do not assume the docs match the code; if they disagree, surface it.

## Source-of-truth map
| Topic | Document |
|---|---|
| What & why | docs/PRODUCT_SPEC.md |
| Product ecosystem (standalone + WalkOne Booth, long-term) | docs/PRODUCT_ECOSYSTEM.md |
| UX | docs/UX_SPEC.md, docs/USER_WORKFLOWS.md |
| UX architecture for the refresh + Design Guide (Phase 7A, authoritative) | docs/PHASE_7A_UX_ARCHITECTURE.md |
| 7B B1 mockups (approved; design-only reference; B3 status §0b, B4 status §0d, B5 status §0e; Sample Photos in them are superseded, §0c / ADR-056) | docs/PHASE_7B_B1_MOCKUP_REVIEW.md, design/phase-7b-b1/ |
| Editor shell layout rules (7B B3/B3.1: tiers, drawer, right column, top bar, Escape/F6, key ownership, Print Preview closes the drawer) | src/editor/layout.ts, src/editor/tools.ts, docs/CURRENT_STATE.md (B3, B3.1) |
| Checks / Export / Printer & cutting / dslrBooth import presentation (7B B4; one Checks model, first-use Export defaults, plain-language printer view) | src/editor/checks.ts, src/editor/exportCards.ts, src/editor/importView.ts, src/output/printerView.ts, docs/UX_SPEC.md §23 |
| Editor experience (7B B5: selection toolbar, Properties Essentials + sections, Settings, getting-started tips, new-text default font) | src/editor/selectionToolbar.ts, src/editor/propertiesModel.ts, src/editor/firstRun.ts, docs/UX_SPEC.md §24, docs/DECISIONS.md ADR-057/058 |
| Next phase: B5.5 Custom Format / Custom Size Wizard (not started; Format ≠ Output Profile) and the B6 carry-forward ledger | docs/ROADMAP.md |
| Built-app suites and the responsive right-column contract (stacked ≥ 860 CSS px, tabs below; `WTS_VALIDATE_SIZE`) | research/editor-validation/README.md, research/editor-validation/harness.js, docs/TESTING_STRATEGY.md §9n |
| Design tokens, themes, density (7B B2, ADR-055) | src/renderer/src/styles/tokens.css, src/editor/appearance.ts, docs/DECISIONS.md ADR-055 |
| Domain model | docs/DATA_MODEL.md |
| DSLR Booth | docs/DSLRBOOTH_COMPATIBILITY.md |
| Assets / providers | docs/ASSET_AND_INTEGRATION_STRATEGY.md |
| Architecture | docs/ARCHITECTURE_PLAN.md |
| Phases | docs/ROADMAP.md |
| Decisions (incl. OPEN) | docs/DECISIONS.md |
| Testing | docs/TESTING_STRATEGY.md |
| Manual test guide / run cheat sheet | docs/MANUAL_TEST_GUIDE.md |
| Terms | docs/GLOSSARY.md |
| Fresh-session prompt (refresh every session) | docs/SESSION_STARTER.md |
| Research notes (not decisions) | research/ |

## Non-negotiable architecture rules
- Desktop-first, local-first; the editor must work offline.
- The internal `TemplateProject` model is **vendor-neutral**. DSLR Booth's XML schema must never become the internal model. Use adapters only (`DSLRBoothImporter`, `DSLRBoothExporter`).
- Photo placeholders are a distinct `PhotoLayer` type, never just rectangles.
- Physical size + DPI are first-class project properties; pixels are derived.
- Native project files carry a `schemaVersion` and must remain migratable.
- External providers (Magnific/Freepik, Envato, …) live behind provider adapters; core must work without them.
- Never silently discard imported data — warn, and preserve unknown values where feasible.
- Prefer deterministic rendering/export.
- No cloud, accounts, billing, sync, or marketplace in v1.
- No speculative abstractions without a foreseeable use.
- **One template editor only (ADR-049).** Never build a second editor for WalkOne Booth; the standalone app must never become a thin screen that needs the booth runtime. Keep the seams that make later extraction a move, not a rewrite: domain free of Electron/React, editor state behind its ports, typed IPC, adapters outside the domain. Do not restructure the repo into `apps/`/`packages/` without approval.
- Company Profile, Output Profiles (printer/media/cut/safe margins) and sharing/SMS settings stay **outside** `TemplateProject`; SMS and provider credentials never belong in Template Studio.
- Strict TypeScript. Prefer small, testable modules. Keep UI, editor state, rendering, storage, and export adapters separated.

## Honesty rules
- Do **not** present unvalidated DSLR Booth behavior as fact. Label claims: Confirmed / Proposed / Assumption / Unknown / Needs Validation / Future Research.
- Do not invent XML schemas, API access, licensing rights, or technical findings.
- Real DSLR Booth exports in `tests/fixtures/dslrbooth/` are the compatibility ground truth. Never fabricate fixtures.
- Never fabricate test success. Report failures with their output.

## During development
- Work only on the explicitly requested phase. Do not silently expand scope.
- Do not start the next roadmap phase without approval.
- Do not silently replace architectural decisions; record meaningful ones in docs/DECISIONS.md (OPEN items stay OPEN until the owner decides).
- Keep documentation aligned with implementation.
- Prefer incremental changes; preserve working functionality; avoid large unrelated refactors.
- Run relevant tests/checks before declaring work complete.
- Surface unresolved problems, assumptions, and compatibility concerns.

## At the end of every phase
1. Update docs/CURRENT_STATE.md.
2. Update docs/ROADMAP.md if appropriate.
3. Update docs/DECISIONS.md for relevant decisions.
4. Summarize files changed.
5. Summarize tests performed.
6. List known issues.
7. Recommend the next phase.
8. **Refresh docs/SESSION_STARTER.md** (commit list, test count, architecture/gotchas, findings, and the "where I left off" block) so a brand-new session can resume from it alone.
9. **STOP and await approval.**

## Version control and secrets
- Commit at stable milestones (Git is initialized as of Phase 0). Use clear, conventional messages.
- Never commit secrets. Never put API keys or credentials in source; use environment/OS keychain storage designed in a later phase.
- Do not commit real client data or licensed third-party assets without confirming license terms.
