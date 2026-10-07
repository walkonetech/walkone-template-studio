# CLAUDE.md — Operating Rules for WalkOne Template Studio

This file is the persistent rulebook for every Claude Code session on this project. Follow it before anything else.

## Project in one paragraph
WalkOne Template Studio is an internal desktop tool (Electron + React + TypeScript; see docs/CURRENT_STATE.md for what exists) for WalkOne Entertainment, LLC that speeds up creating custom photo booth print templates for LumaSoft DSLR Booth / LumaBooth. It is a focused print-template tool, not a general design app. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Before beginning any work
1. Read this file.
2. Read [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) — it says which phase is active.
3. Read the documents relevant to the task (product, architecture, data model, DSLR Booth compatibility, roadmap).
4. Inspect existing code before changing architecture. Do not assume the docs match the code; if they disagree, surface it.

## Source-of-truth map
| Topic | Document |
|---|---|
| What & why | docs/PRODUCT_SPEC.md |
| UX | docs/UX_SPEC.md, docs/USER_WORKFLOWS.md |
| Domain model | docs/DATA_MODEL.md |
| DSLR Booth | docs/DSLRBOOTH_COMPATIBILITY.md |
| Assets / providers | docs/ASSET_AND_INTEGRATION_STRATEGY.md |
| Architecture | docs/ARCHITECTURE_PLAN.md |
| Phases | docs/ROADMAP.md |
| Decisions (incl. OPEN) | docs/DECISIONS.md |
| Testing | docs/TESTING_STRATEGY.md |
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
