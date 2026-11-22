# Product Specification

Status labels used: **Confirmed** (stated by owner / validated), **Proposed**, **Assumption**, **Unknown**, **Needs Validation**, **Future Research**. See [DECISIONS.md](DECISIONS.md) for decision status and [ROADMAP.md](ROADMAP.md) for sequencing.

## 0. Current direction (owner, 2026-11-16/17) — read this first
This spec was written before the build; the sections below remain the requirement baseline. These owner decisions refine it (details: [ROADMAP.md](ROADMAP.md) "GUI mockup rounds" and "Owner direction after 6A", [DECISIONS.md](DECISIONS.md) ADR-042…048):
- **Who uses it:** the photo booth operator's team — experienced designers and first-time staff. **Event clients never see the app.** The main client approves the template in advance (proof), then it is loaded into dslrBooth before the event. (**Confirmed**, owner.)
- **Goal restated:** nobody should need Canva or Photoshop to make a booth template; the app must be **self-explanatory** (big labelled icons, hover help, colour-coded element kinds, no hidden modes). Canva is the UX reference for the editor's feel, never its look. (**Confirmed**.)
- **Two ways in, one project (ADR-054; UX architecture: [PHASE_7A_UX_ARCHITECTURE.md](PHASE_7A_UX_ARCHITECTURE.md), 2026-11-19):** a heavily guided **Design Guide** for first-timers and a **Canva-style Editor** for power users; switch at any time. (**Confirmed**, round 1.)
- **Design Guide v2 order** (**Confirmed**, round 2): print size first (2×6 strip / 4×6 portrait / 6×4 landscape) → event type (wedding, birthday, prom/homecoming, church event, corporate & brand, graduation, baby shower, holiday party, sweet 16/quince, party, something else) → style for that event → colours (+ plain or picture background) → photos (how many, landscape/portrait/square, size relative to the print) → event logo/crest/image (upload / monogram / none) → words (names/title, date, optional line) → the operator's company branding (top or bottom; set once) → layout (a predetermined spot per element or a ready layout) → done. Steps and options are **conditional on earlier answers** (e.g. a monogram for weddings, not parties). The Guide must produce a finished, export-ready template without opening the editor.
- **Automatic safe-area check (required):** warn while designing when anything would be lost at the **2-inch cut** of a strip or the print edge, with a fix; visible cut/safe lines; re-checked before export. dslrBooth does not wrap text. **v1 built (2026-11-18, ADR-053):** Output Profiles outside the template (first: DNP DS-RX1 · 6×4 PC · 2-inch cut · borderless, provisional), View › Safe areas overlay (expected trim, keep-safe line, cut), live status-bar count and Export-dialog checks for text, logos/badges and photo slots; one-click fixes not built yet.
- **Event themes:** save a finished design's choices as an event theme preset and start the next similar event from it.
- **Photo count comes from the template** (ADR-045): the booth takes as many photos as the template has slots; at least one.
- **Platforms (ADR-043, OPEN):** Windows workstation first-class (dslrBooth runs on Windows), macOS (owner's daily driver), iPad later.
- **Product ecosystem (ADR-049, Accepted, 2026-11-17):** Template Studio stays a **first-class standalone** app **and** becomes the full-capability Template Studio module of **WalkOne Booth**, the future Windows-first, local-first booth platform (events, capture, camera, printing, sharing incl. SMS, media, event readiness, booth health) that replaces dslrBooth. One shared editor core, never a second editor. Company profile, output/printer profiles, sharing credentials and event data stay **outside** `TemplateProject`. WalkOne Booth development is not yet approved. Authoritative: [PRODUCT_ECOSYSTEM.md](PRODUCT_ECOSYSTEM.md). The §22 non-goals keep applying to Template Studio itself; the runtime belongs to WalkOne Booth.
- **Clients:** event clients never operate Template Studio or WalkOne Booth; later they may get proof links, approval requests, comments and approval snapshots, never editing. Approved event templates become immutable event revisions (future).
- **Planned additions (ADR-044/046, OPEN):** bundled Canva-like font library (licence-safe fonts, so the booth PC needs none); a **shared Company Profile** for both apps (name, logos, brand colours, preferred fonts, contacts, default sharing branding, export settings and output profiles) feeding "company" elements, kept outside templates; **Output Profiles** (media, safe margins, cut positions, borderless behaviour) that the safe-area check reads, never stored in templates; simple yes/no client approval by email first, proof links with comments and approved event revisions later (mechanism undecided, ADR-006/049); asset library with project folders; Light/Dark appearance; installer later; GIF/boomerang not needed; video maybe later.
- **Owner's real workflow today:** designs on a Mac (Adobe CC; previously Canva/Photoshop), then rebuilds element by element in dslrBooth's editor on the Windows booth PC. The importer (6D) and exporter (6B) remove the rebuild.

## 1. Problem statement
Creating a custom photo booth print template for each client event is slow and manual (**Confirmed**, owner workflow):

1. Gather event details; choose format (4x6 portrait/landscape, 2x6 strip, variants).
2. Find inspiration; search Freepik/Magnific and Envato Elements for backgrounds, textures, frames, florals, overlays, icons, accents.
3. Build the template at print size in Photoshop or Canva; create photo openings/frames; build event badging (title, names, date, organization, location, sponsor, logo/monogram).
4. Export multiple PNG layers.
5. Rebuild the template inside DSLR Booth from those PNGs, configure photo placeholders, adjust, test.
6. Export a DSLR Booth template ZIP and transfer/import it to the event's booth computer.

The same design work is effectively done twice (design tool, then DSLR Booth editor). The goal is to collapse this.

## 2. Business context
WalkOne Entertainment, LLC is a mobile entertainment business: DJ, MC/hosting, photo booths, event lighting, photo/video-related services. Photo booth templates are a recurring, per-event deliverable. Target (**Proposed**): automate or accelerate roughly 70–80% of repetitive assembly while keeping manual creative control. This figure is an aspiration, not a measured baseline (**Needs Validation**).

## 3. Target user
- **Initial:** the owner/operator and the operator's team (designers and first-time staff); event clients never use the app (§0). Optimized as an internal production tool.
- **Later (not v1):** other booth operators, DJs, event companies, photographers, rental businesses.
- No multi-user/cloud features in v1; architecture should not needlessly block commercialization (see [DECISIONS.md](DECISIONS.md) ADR-006).

## 4. Objectives
1. Reduce time from event brief to booth-ready template.
2. Make template creation repeatable via templates and Design Recipes.
3. Eliminate the "rebuild in DSLR Booth" step through DSLR Booth ZIP export.
4. Catch mistakes before the event via preflight.
5. Stay focused on photo booth print templates.

## 5. Product principles
Desktop-first; local-first and offline-capable; vendor-neutral internal model; DSLR Booth via adapters; parameterized (not flattened) designs; manual control preserved; deterministic export; never silently drop data; modern, readable, uncluttered UI. Engineering principles are in [CLAUDE.md](../CLAUDE.md) and [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).

## 6. Supported formats
Physical dimensions + DPI are first-class; pixels are derived (see [DATA_MODEL.md](DATA_MODEL.md)).

| Format | Orientation | Notes |
|---|---|---|
| 4x6 in | portrait, landscape | 300 DPI → 1200×1800 / 1800×1200; 600 DPI → 2400×3600 / 3600×2400 |
| 2x6 in strip | vertical (horizontal where useful) | single strip; 600 DPI → 1200×3600 |
| 2x6 two-up strip print | — | combined canvas (e.g., two strips on a 4x6 sheet); exact size depends on printer/template requirements |
| Custom | — | custom physical size and DPI where appropriate |

DPI options: 300, 600, custom. The pixel numbers above are arithmetic examples; whether they match DSLR Booth's expectations is **Needs Validation** ([DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md)).

## 7. Event metadata
Internal project name; event name, type, client, company/organization, date, location, city/state, subtitle/tagline, sponsor, hashtag, notes. Event types: Wedding, Birthday, Sweet 16 / Quinceañera, Corporate & Brand, School Dance / Prom / Homecoming, Graduation, Holiday Party, Baby Shower, Bridal Shower, Anniversary, Church Event, Fundraiser, Festival, Sports, Community Event, Party, Custom (the Design Guide v2 list in §0 is the first-screen subset). Categories must be extensible (data-driven list, not a hardcoded enum only).

Design direction: Elegant, Luxury, Glamorous, Modern, Minimal, Fun, Youthful, Romantic, Floral, Rustic, Vintage, Urban, Neon, Corporate, Holiday, Retro, Sports, Custom; plus a freeform design brief. This metadata may later drive palettes, fonts, layouts, asset searches, prompts, and recipes. **No AI generation in early phases.**

## 8. Editor requirements (future)
Three-panel workspace (left: templates/layouts/assets/uploads/text/graphics; center: canvas; right: layers/properties; top: project controls, undo/redo, zoom, preview, export). Final arrangement may change if better UX is found ([UX_SPEC.md](UX_SPEC.md)).

Canvas capabilities: select, drag, resize, rotate, duplicate, delete, copy/paste, lock, hide, z-order, grouping, align, distribute, snapping, smart guides, center guides, rulers, safe areas, optional bleed guides, zoom, pan, keyboard shortcuts, undo/redo, opacity, crop/fill.

Layer types (names refinable): Background, Image, Photo, Text, Shape, Overlay, Group, BadgeGroup. See [DATA_MODEL.md](DATA_MODEL.md).

Typography: local/installed and bundled fonts (where licensing permits), size, weight, alignment, letter spacing, line height, color, rotation, opacity, multiple text layers, effects where practical. Font licensing matters if commercialized.

## 9. Photo layer requirements
Photo placeholders are the most important special object. A `PhotoLayer` has: internal ID, photo number, x, y, width, height, rotation, z-index, crop/fill behavior, border/frame settings, corner radius where supported, visibility, lock, and metadata needed for DSLR Booth export. Also: orientation, shadow where supported by our rendering model, preview image.

Detect: duplicate photo numbers, missing expected numbers, invalid numbering, unsupported configurations.

**Frame styles:** none, solid, double line, rounded, Polaroid-style, offset, drop shadow, decorative, custom PNG frame; editable thickness, radius, color, padding, opacity, shadow, decorative overlay.

## 10. Template system
Templates are parameterized designs (layout, placeholders, background, typography, badge, styling, palette roles, decorative layers), not flattened images. Changing event info or palette updates compatible fields/elements. Gallery filters: event type, format, orientation, photo count, style, color, favorites, recently used.

## 11. Design Recipe system
A recipe defines creative *rules* rather than one fixed design (e.g., "Elegant Wedding": 3 photos, ivory/subtle texture background, thin white frames, botanical corner accent, serif+script type, bottom badge, default palette roles, suggested asset search phrases). Recipes can generate or suggest a starting design from event type, info, brief, and palette. Considered an important differentiator. Recipe schema is **Proposed/Future Research** — to be designed in its roadmap phase.

## 12. Badges
A dedicated Badge Builder with parameterized, reusable components (not flattened images). Content: initials, couple names, honoree, event title, company, date, location, tagline, sponsor. Styles: Elegant, Modern, Minimal, Script, Corporate, Birthday, Graduation, Retro, Neon, Monogram, Custom. Project info auto-populates compatible fields.

## 13. Palette system
Semantic roles: Primary, Secondary, Accent, Background, Text, plus optional extras. Future: color picker, HEX entry, saved palettes, extraction from logos/images, palette generation, global role replacement, instant canvas preview. Editable vector/shape/text elements reference roles rather than hardcoded colors where possible.

## 14. Assets
Import PNG, JPG/JPEG, WebP, SVG, PDF where practical. Categories: Background, Texture, Frame, Border, Overlay, Badge, Ornament, Icon, Pattern, Logo, Monogram, Floral, Holiday, Corporate, School, Wedding, Birthday, Sports, Custom. Reusable local library; project vs library assets are distinguishable; local search by metadata. Details: [ASSET_AND_INTEGRATION_STRATEGY.md](ASSET_AND_INTEGRATION_STRATEGY.md).

## 15. Photo slot preview
**Sample photos were removed (owner decision, Phase 7B B3.1, ADR-056):** the booth places each guest photo in its slot after capture, so Template Studio designs the slot and never simulates the future photograph. Photo slots always show a neutral numbered placeholder; Print Preview shows the printed sheet with those placeholders. _(Earlier scope, superseded: built-in sample photos with toggle, shuffle and replace.)_

## 16. Imports
**Status: built (Phase 6D, ADR-048).** Import a DSLR Booth template ZIP: safe extraction, read `template.xml`, discover referenced images, parse supported configuration, convert to the internal model, reconstruct an editable canvas where possible, warn about unsupported/unknown properties. Also import assets (above) and native projects.

## 17. Exports
A. DSLR Booth Template ZIP — **built (6B, ADR-047)**: native 2×6 strip by default (`print_2_per_page`), 4×6 sheet fallback, artwork/text flattened, photo slots native; real-booth validation pending (6C). B. Layer package — **withdrawn from the Export dialog** (owner, ADR-041 §8: clients should not need Canva/Photoshop). C. Flattened PNG — **built (6A)**: Print, Design and Proof PNGs. D. Native editable project — **built** (`.boothproject`).

**Custom formats (Phase 7B B5.5, ADR-059):** besides the built-in 2×6 strip, 4×6 portrait and 6×4 landscape, operators can design **any size** — magnet and keychain inserts, wallet/mini prints, squares, takeaway cards, badges, novelty products — through a Custom Size wizard (inches, millimetres or pixels; 300/600/custom DPI; exact size, repeated on a sheet, or a custom sheet layout with gaps and margins; a generic safe margin; a review before Create) and keep favourites in **My formats** (this computer). The result is a normal project in the same editor, Checks and Export. Format (what you design) ≠ Output Composition (how it is arranged) ≠ Output Profile (how it is produced). dslrBooth templates are offered only for sizes proven in dslrBooth; PNG files for every size.

**Editor experience (Phase 7B B5):** a contextual selection toolbar (3–5 frequent actions in words, Event Palette colours), Properties with the most-used fields first and summarised sections, Settings for this computer (theme, button size, interface scale, printer, editor helpers), getting-started tips on new blank projects, searchable recent projects, and Arial as the default font for new text (installed on macOS and Windows). Next: custom formats and sizes for keepsakes (B5.5), kept separate from printer profiles.

**Export dialog (Phase 7B B4):** three picture cards — **For the booth** (dslrBooth template; selected on first use), **Print files** (sheet + single design PNGs) and **Client proof** (numbered placeholders, never pictures) — with a pinned readiness line, the same Checks as the Checks panel, More options for the 4×6 template and single files, and a sticky footer. The choice is never stored in the project.

## 18. DSLR Booth compatibility
Critical requirement. DSLR Booth's format must never become the internal model; use `DSLRBoothImporter`/`DSLRBoothExporter` adapters. Existing owner-supplied exports act as fixtures. All behavior is **Needs Validation** until fixtures are analyzed. See [DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md).

## 19. Preflight
Errors vs warnings. Checks: canvas dimensions, DPI, photo placeholders exist, numbering valid/no duplicates, assets exist/paths valid, source resolution sufficient, transparency supported, background covers canvas, output assets generatable, fonts available, unsupported DSLR Booth features, safe-area warnings, content beyond canvas, XML compatibility, package completeness.

## 20. Project files
Own format, working extension `.boothproject` (not final), schema-versioned (a file carries the oldest schema version that can read it, so an older app says "Update the app" rather than failing; ADR-060), portable. Save/open/save as/recent/autosave/crash recovery/duplicate. Asset embedding strategy is a documented recommendation in [DATA_MODEL.md](DATA_MODEL.md) (hybrid, **Proposed**).

## 21. Future integrations
Magnific/Freepik, Envato, future providers: search, generation, background generation/editing/removal, upscaling, download where licensing/API terms permit. **Not assumed available.** Isolated behind provider adapters; core works without them. Not built in early phases.

## 22. Non-goals (initial)
_Note: these non-goals describe **Template Studio**. The booth runtime, sharing and event management belong to the future WalkOne Booth platform (ADR-049, [PRODUCT_ECOSYSTEM.md](PRODUCT_ECOSYSTEM.md)), not to Template Studio._

Not a Photoshop or Canva replacement; not a full vector illustration tool; not a complete image editor; not a video editor; not cloud SaaS; not a social media design suite; not a website builder; not a CRM; not an event booking system; not a photo booth runtime; not a replacement for DSLR Booth. Also out of scope: billing, subscriptions, accounts, cloud sync, marketplace.

## 23. MVP boundaries (Proposed)
A usable MVP, in roadmap terms, would be a native editor with: project setup, correct print-size canvas, photo placeholders, text/shape/image layers, palette roles, basic asset import, PNG export, **and** DSLR Booth ZIP export validated against real fixtures. Templates/recipes, badge builder polish, asset-library depth, and integrations may follow. Exact MVP cut is an owner decision (see [ROADMAP.md](ROADMAP.md)).

## 24. Future opportunities
Design Recipes with AI assistance; provider integrations; commercialization to other operators; additional booth software exporters via new adapters; template marketplace (explicitly out of scope now).

## 25. Acceptance philosophy
- A feature is done when it works on real inputs, not just synthetic ones; DSLR Booth features are accepted only against real fixtures and, ideally, a real booth test.
- Exports must be deterministic and validated by preflight.
- Unknown/unsupported input produces warnings, never silent loss.
- Each roadmap phase has explicit acceptance criteria ([ROADMAP.md](ROADMAP.md)); the owner approves phase completion.
- Test results are reported honestly ([TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

## 26. Canvas product contracts (Phase 5C)
1. **Artboard overflow.** Artwork may extend beyond the logical print artboard during authoring. Off-artboard content remains editable in the workspace, while printable rendering/export clips to the artboard boundary.
2. **Precision zoom and pan.** The canvas supports precision zoom and pan for detailed alignment without changing project geometry.
3. **Constrained dragging.** Holding Shift while dragging constrains layer movement horizontally or vertically based on the intended drag direction.
4. **Tooltips.** Canvas and editor tools provide contextual hover tooltips describing their purpose and relevant shortcuts/modifiers.
5. **A photo slot is a future booth capture slot.** Template Studio designs the slot (number, size, position, fit, frame) and shows it as a numbered placeholder; it never puts a picture in it, in the editor or in any output (sample photos were removed in B3.1, ADR-056).

## 27. Typography and palette contracts (Phase 5D)
1. **Requested font preservation.** A text layer stores the font family the designer asked for. It is never silently rewritten; if the font is not installed the app renders a fallback and says so.
2. **Missing-font warning.** A missing or unverifiable font is flagged on the layer and in a project font inventory ("N fonts used, M missing"), so it is visible before moving the project or exporting.
3. **Editable-project portability.** A `.boothproject` opened on another computer keeps its font requests; the warning appears there and the designer may replace fonts deliberately (one layer or all uses, one undo step). Printed output of a future export does not depend on fonts installed on the booth PC.
4. **Font embedding is deferred and subject to each font's license.** Nothing is embedded or bundled by default.
5. **Event Palette.** A project defines semantic colours (Primary, Secondary, Accent, Background, Text) and custom ones; elements may link to them.
6. **Global palette updates.** Changing a palette colour recolours every linked element everywhere (including both copies of a two-up sheet); fixed colours are untouched; a linked colour can be detached to a fixed one without changing its appearance; a used colour cannot be removed.
7. **Fit height.** "Fit height to content" resizes a text box's height to its rendered content, keeping width and font size; it is an explicit action, not an automatic mode.
