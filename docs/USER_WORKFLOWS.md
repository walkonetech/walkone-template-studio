# User Workflows

All workflows are **Proposed** future behavior. UI details: [UX_SPEC.md](UX_SPEC.md). Each lists happy path and key failure/edge states.

## A. Create new template from scratch
**Happy path:** New Project → enter event info → choose format/orientation/DPI (pixel size shown) → choose design direction/palette → "Blank" layout with photo count → editor opens with print canvas and photo placeholders numbered 1..N → add background, text, badge → save.
**Edge:** missing required fields (only name + format required); custom size out of sane range → validation message; photo count 0 → allowed but preflight error later.

## B. Create from reusable template
**Happy:** Template gallery → filter → pick → event info and palette auto-fill compatible fields → editor.
**Edge:** template format differs from chosen format → offer compatible variants or "adapt layout" (**Future Research**); template references missing asset → warning + placeholder asset.

## C. Create from Design Recipe
**Happy:** choose recipe (e.g., Elegant Wedding) → app proposes starting design (layout, palette roles, type pairing, suggested asset search phrases) → operator reviews/adjusts.
**Edge:** recipe wants assets not in library → show suggestions and manual import path; offline → recipe still works with local assets.

## D. Import existing DSLR Booth template
**Happy:** Import ZIP → safe extraction → parse `template.xml` → map to internal model → editable canvas + import report.
**Edge:** unknown properties → preserved and listed as warnings; unsupported objects → flattened/placeholder with warning; malformed/zip-slip/oversized archive → rejected with clear error; missing referenced images → listed. (Parsing details **Needs Validation** against fixtures.)

## E. Customize palette
**Happy:** open palette → change role (picker/HEX) → canvas updates instantly for role-bound elements.
**Edge:** raster assets don't recolor → indicate which layers are unaffected; low contrast text/background → warning.

## F. Upload client logo
**Happy:** drag file into Uploads → categorize as Logo → place → optional palette extraction.
**Edge:** low resolution → warning with effective DPI at placed size; unsupported format → error; transparent vs opaque background → suggest background removal (manual or future provider).

## G. Add / edit badge
**Happy:** Badge Builder → style → fields prefilled → edit → place.
**Edge:** text too long for badge → shrink/wrap rules and warning; override of bound field is tracked.

## H. Configure photo placeholders
**Happy:** add Photo layer → auto-number → set position/size/rotation/crop/frame → renumber via drag or field.
**Edge:** duplicate/missing numbers → inline warning; placeholder off-canvas → warning; unsupported rotation/corner/shadow for export → preflight warning.

## I. Preview with sample photos
**Happy:** toggle sample photos → shuffle/replace → final print preview.
**Edge:** sample aspect mismatch → show crop behavior; preview must match export render.

## J. Run preflight
**Happy:** run → report with errors/warnings → click item to select layer → fix → re-run → clean.
**Edge:** errors block DSLR Booth export; warnings need acknowledgement; checks that can't run (e.g., font missing) say so.

## K. Export DSLR Booth package
**Happy:** Export → DSLR Booth ZIP → preflight → generate assets, XML, preview → package → validate → save → reveal.
**Edge:** unsupported features → warn what will be flattened/dropped; write failure → no partial/corrupt output left; export validated by re-reading the ZIP. Real-booth test is a manual QA step.

## L. Export PNG layers
**Happy:** choose layer package or flattened PNG → select layers/groups → render at project DPI → files named predictably.
**Edge:** huge canvas memory use → progress and cancel; name collisions → confirm overwrite.

## M. Save reusable template
**Happy:** Save as Template → strip client-specific content or mark fields as bound → name/tags/format/event type → stored in template library.
**Edge:** embedded licensed assets → license note prompt; duplicate name → rename/replace.

## N. Save reusable Design Recipe
**Happy:** capture rules (photo count, background style, frame style, type pairing, palette roles, search phrases) from current project → name → recipe library.
**Edge:** project too custom to generalize → warn about non-parameterizable parts. (Recipe model **Future Research**.)

## O. Reopen existing project
**Happy:** Recent list or Open → load → schema migrated if older → editor restored.
**Edge:** newer schema than app understands → refuse read-only with message; missing referenced assets → relink dialog; corrupt file → recover from autosave if present; crash recovery prompt on launch.
