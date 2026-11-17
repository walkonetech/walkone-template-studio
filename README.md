# WalkOne Template Studio

> **Status: working internal tool, in active development (2026-11-17).** The editor, project files, autosave/recovery, image import, print/proof PNG export, **dslrBooth 7.48 template export** and **dslrBooth template import** are built and tested on macOS. Next: real-booth validation on Windows with the DNP printer (Phase 6C), then the Design Guide + Editor redesign. To resume work in a fresh session use [docs/SESSION_STARTER.md](docs/SESSION_STARTER.md).

WalkOne Template Studio is an internal desktop application for **WalkOne Entertainment, LLC** that builds custom photo booth print templates (4x6 and 2x6 strips) for **LumaSoft dslrBooth / LumaBooth**. It replaces the manual Photoshop/Canva → rebuild-in-dslrBooth workflow with one focused editor whose output imports straight into dslrBooth.

## Who it is for
The photo booth operator's team: experienced designers and first-time staff. **Event clients never use the app**; the main client approves a proof before the event. Long term (owner direction, OPEN, ADR-042) the editor becomes a module of a standalone booth application; Windows workstation first-class, iPad later (ADR-043).

## Current phase
**Phase 6D — DSLR Booth importer: complete** (after 6B dslrBooth export and 6A print export). Next, awaiting approval: **Phase 6C** real-booth validation on Windows with the DNP printer; then GUI rounds for the **Design Guide** (guided, for first-timers) + **Canva-style Editor** (power users). See [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## What works today
Canvas editor with first-class photo slots, text, shapes, images, groups, layers panel and inspector; snapping (move and Canva-style resize/size matching); 2×6 strips designed once and printed two-up; sample photos with crop; fonts with missing-font warnings; Event Palette; `.boothproject` save/open, autosave and crash recovery; image import; Export: dslrBooth template ZIP (native 2×6 strip or 4×6 sheet), Print / Design / Proof PNGs, with checks before export; Import of dslrBooth template ZIPs into editable projects.

## Documentation
- [CLAUDE.md](CLAUDE.md) — operating rules for AI coding sessions
- [Product spec](docs/PRODUCT_SPEC.md) · [UX spec](docs/UX_SPEC.md) · [User workflows](docs/USER_WORKFLOWS.md)
- [Data model](docs/DATA_MODEL.md) · [Architecture plan](docs/ARCHITECTURE_PLAN.md)
- [DSLR Booth compatibility](docs/DSLRBOOTH_COMPATIBILITY.md) · [Assets & integrations](docs/ASSET_AND_INTEGRATION_STRATEGY.md)
- [Roadmap](docs/ROADMAP.md) · [Decisions](docs/DECISIONS.md) · [Testing strategy](docs/TESTING_STRATEGY.md) · [Glossary](docs/GLOSSARY.md) · [Session starter prompt](docs/SESSION_STARTER.md)
- [Research notes](research/README.md)

## Planned (see the roadmap)
Design Guide (event type → style → colours → photos → logo → words → company branding → layout → done) with an automatic safe-area / 2-inch-cut check; event theme presets; a bundled Canva-like font library; company profile/settings; asset library with project folders; simple client approval by email; Light/Dark appearance; Windows packaging/installer; later iPad and a video option.

## Development
Requires Node 20+ (tested on Node 24). Commands: `npm install`, `npm run dev`, `npm run build`, `npm run start` (preview of the build), `npm test` (876 unit tests), `npm run typecheck`, `npm run lint`, `npm run format:check`. Manual testing: [docs/MANUAL_TEST_GUIDE.md](docs/MANUAL_TEST_GUIDE.md). Private dslrBooth client templates used as fixtures are local-only and never committed.
