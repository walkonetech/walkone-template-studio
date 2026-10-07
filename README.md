# WalkOne Template Studio

> **Status: early development.** A temporary editor shell exists (canvas foundation, project save/open); the real editor UI is still to come.

WalkOne Template Studio is a planned internal desktop application for **WalkOne Entertainment, LLC** that streamlines building custom photo booth print templates (4x6 and 2x6 strips) for **LumaSoft DSLR Booth / LumaBooth**. It aims to replace a manual Photoshop/Canva → DSLR Booth reconstruction workflow with one focused editor.

## Who it is for
The owner/operator of WalkOne Entertainment (v1 is an internal production tool). Later commercialization is not ruled out but is out of scope for now.

## Current phase
**Phase 4C — Editor UI/UX redesign and design system: complete** (first pass, after Phase 4B persistence safety and Phase 4 layers/inspector). Next phases await approval. See [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md).

## Documentation
- [CLAUDE.md](CLAUDE.md) — operating rules for AI coding sessions
- [Product spec](docs/PRODUCT_SPEC.md) · [UX spec](docs/UX_SPEC.md) · [User workflows](docs/USER_WORKFLOWS.md)
- [Data model](docs/DATA_MODEL.md) · [Architecture plan](docs/ARCHITECTURE_PLAN.md)
- [DSLR Booth compatibility](docs/DSLRBOOTH_COMPATIBILITY.md) · [Assets & integrations](docs/ASSET_AND_INTEGRATION_STRATEGY.md)
- [Roadmap](docs/ROADMAP.md) · [Decisions](docs/DECISIONS.md) · [Testing strategy](docs/TESTING_STRATEGY.md) · [Glossary](docs/GLOSSARY.md)
- [Research notes](research/README.md)

## Planned capabilities (not yet built)
Event-driven project setup, reusable templates and Design Recipes, a purpose-built canvas editor with first-class photo placeholders, palette roles, a badge builder, a local asset library, sample-photo preview, preflight validation, and DSLR Booth template ZIP import/export plus PNG/layer exports.

## Development
Requires Node 20+ (tested on Node 24). Commands: `npm install`, `npm run dev`, `npm run build`, `npm run start` (preview of the build), `npm run typecheck`, `npm run lint`, `npm run format:check`.
