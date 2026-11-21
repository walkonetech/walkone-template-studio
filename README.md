# WalkOne Template Studio

> **Status: working internal tool, in active development (2026-11-21).** The editor, project files, autosave/recovery, image import, print/proof PNG export, **dslrBooth 7.48 template export and import** (including editable live text), and **Output Profiles + Safe Areas** are built, tested on macOS and validated on Windows (Phase 6C). Next: Phase 7B editor/shell refresh and Phase 7C Design Guide, as defined by the Phase 7A UX architecture ([docs/PHASE_7A_UX_ARCHITECTURE.md](docs/PHASE_7A_UX_ARCHITECTURE.md)). The 7B B1 mockups ([docs/PHASE_7B_B1_MOCKUP_REVIEW.md](docs/PHASE_7B_B1_MOCKUP_REVIEW.md)) are approved, **7B B2** (design-system foundation: Light default theme, Dark, Match system, Comfortable/Compact size, bundled Inter; ADR-055) is done and Windows-validated, and **7B B3** (Start screen, top bar, labelled rail with docked/floating drawers, canvas-state bar, Properties/Layers stacking and tabs) and **B3.1** are done and Windows-validated, and **7B B4** (Checks panel, picture-card Export, Printer & cutting, simplified dslrBooth import) is implemented. B5 waits for the owner's visual checkpoint of B4. To resume work in a fresh session use [docs/SESSION_STARTER.md](docs/SESSION_STARTER.md).

WalkOne Template Studio is an internal desktop application for **WalkOne Entertainment, LLC** that builds custom photo booth print templates (4x6 and 2x6 strips) for **LumaSoft dslrBooth / LumaBooth**. It replaces the manual Photoshop/Canva → rebuild-in-dslrBooth workflow with one focused editor whose output imports straight into dslrBooth.

## Who it is for
The owner/operator, internal staff and booth attendants: experienced designers and first-time staff. **Event clients never use the app**; they may later see proof links and approval requests, never editing.

## Product ecosystem (ADR-049)
Template Studio is a **first-class standalone** design app (macOS and Windows) **and** will become the **full-capability Template Studio module inside WalkOne Booth**, the future Windows-first, all-in-one local photo booth platform that replaces dslrBooth. There will be **one shared editor core**, never a second editor. WalkOne Booth development is **not yet approved**; the Template Studio UX refresh (Phase 7) is the immediate track. See [docs/PRODUCT_ECOSYSTEM.md](docs/PRODUCT_ECOSYSTEM.md).

## Current phase
**Phase 7A — UX architecture + editor refresh audit: complete (2026-11-19, planning only)** after 6C validation, the live-text import (C1) and Output Profiles + Safe Areas v1 (ADR-053). Phase 7A is approved; the **Phase 7B B1** mockups are approved, **B2** (design system, themes, density) is done and **B3** (editor shell refresh) is done. Then the rest of **Phase 7B** editor/shell refresh, then **Phase 7C** **Design Guide** (guided, for first-timers) over the same project as the **Full Editor** (ADR-054). See [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## What works today
Canvas editor with first-class photo slots, text, shapes, images, groups, layers panel and inspector; snapping (move and Canva-style resize/size matching); 2×6 strips designed once and printed two-up; fonts with missing-font warnings; Event Palette; `.boothproject` save/open, autosave and crash recovery; image import; Export: dslrBooth template ZIP (native 2×6 strip or 4×6 sheet), Print / Design / Proof PNGs, with checks before export; Import of dslrBooth template ZIPs into editable projects (live text becomes editable text); Output Profiles (first: DNP DS-RX1, provisional) with a Safe Areas overlay and safe-area checks.

## Documentation
- [CLAUDE.md](CLAUDE.md) — operating rules for AI coding sessions
- [Product ecosystem: Template Studio + WalkOne Booth](docs/PRODUCT_ECOSYSTEM.md) · [Product spec](docs/PRODUCT_SPEC.md) · [UX spec](docs/UX_SPEC.md) · [User workflows](docs/USER_WORKFLOWS.md)
- [Data model](docs/DATA_MODEL.md) · [Architecture plan](docs/ARCHITECTURE_PLAN.md)
- [DSLR Booth compatibility](docs/DSLRBOOTH_COMPATIBILITY.md) · [Assets & integrations](docs/ASSET_AND_INTEGRATION_STRATEGY.md)
- [Roadmap](docs/ROADMAP.md) · [Decisions](docs/DECISIONS.md) · [Testing strategy](docs/TESTING_STRATEGY.md) · [Glossary](docs/GLOSSARY.md) · [Session starter prompt](docs/SESSION_STARTER.md)
- [Research notes](research/README.md)

## Planned (see the roadmap)
Editor/shell refresh (Phase 7B: labelled tools, view bar, unified Checks, responsive panels; themes and density done in B2); Design Guide (Phase 7C: print size → event type → style → colours → photos → logo → words → company branding → layout → review) feeding the same project as the editor; event theme presets; a bundled Canva-like font library; company profile/settings; asset library with project folders; simple client approval by email (proof links and approval history later); Windows packaging/installer; later iPad and a video option.

## Development
Requires Node 20+ (tested on Node 24). Commands: `npm install`, `npm run dev`, `npm run build`, `npm run start` (preview of the build), `npm test` (1033 unit tests), `npm run typecheck`, `npm run lint`, `npm run format:check`. Manual testing: [docs/MANUAL_TEST_GUIDE.md](docs/MANUAL_TEST_GUIDE.md). Private dslrBooth client templates used as fixtures are local-only and never committed.
