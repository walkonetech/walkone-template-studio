# Product Specification

Status labels used: **Confirmed** (stated by owner / validated), **Proposed**, **Assumption**, **Unknown**, **Needs Validation**, **Future Research**. See [DECISIONS.md](DECISIONS.md) for decision status and [ROADMAP.md](ROADMAP.md) for sequencing.

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
- **Initial:** the owner/operator. Optimized as an internal production tool.
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
Internal project name; event name, type, client, company/organization, date, location, city/state, subtitle/tagline, sponsor, hashtag, notes. Event types: Wedding, Birthday, Sweet 16, Corporate, School, Graduation, Prom, Holiday, Baby Shower, Bridal Shower, Anniversary, Church, Fundraiser, Festival, Sports, Community Event, Custom. Categories must be extensible (data-driven list, not a hardcoded enum only).

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

## 15. Sample photo preview
Built-in sample photos: toggle, shuffle, replace individual sample, preview without placeholders, final print preview.

## 16. Imports
Import a DSLR Booth template ZIP: safe extraction, read `template.xml`, discover referenced images, parse supported configuration, convert to the internal model, reconstruct an editable canvas where possible, warn about unsupported/unknown properties. Also import assets (above) and native projects.

## 17. Exports
A. DSLR Booth Template ZIP. B. Layer package (e.g., background.png, photo-frames.png, overlay.png, badge.png, preview.png). C. Flattened PNG. D. Native editable project.

## 18. DSLR Booth compatibility
Critical requirement. DSLR Booth's format must never become the internal model; use `DSLRBoothImporter`/`DSLRBoothExporter` adapters. Existing owner-supplied exports act as fixtures. All behavior is **Needs Validation** until fixtures are analyzed. See [DSLRBOOTH_COMPATIBILITY.md](DSLRBOOTH_COMPATIBILITY.md).

## 19. Preflight
Errors vs warnings. Checks: canvas dimensions, DPI, photo placeholders exist, numbering valid/no duplicates, assets exist/paths valid, source resolution sufficient, transparency supported, background covers canvas, output assets generatable, fonts available, unsupported DSLR Booth features, safe-area warnings, content beyond canvas, XML compatibility, package completeness.

## 20. Project files
Own format, working extension `.boothproject` (not final), schema-versioned, portable. Save/open/save as/recent/autosave/crash recovery/duplicate. Asset embedding strategy is a documented recommendation in [DATA_MODEL.md](DATA_MODEL.md) (hybrid, **Proposed**).

## 21. Future integrations
Magnific/Freepik, Envato, future providers: search, generation, background generation/editing/removal, upscaling, download where licensing/API terms permit. **Not assumed available.** Isolated behind provider adapters; core works without them. Not built in early phases.

## 22. Non-goals (initial)
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
5. **Sample photos are a design aid.** A photo placeholder is a future booth capture slot. A sample picture shown in it never changes its photo number, the project, the output composition or any future DSLR Booth export, and is never baked into production output.
