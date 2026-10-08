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
**Happy:** Recent list or Open… → the package is validated and unpacked into a working session → schema migrated if older → editor restored; the project starts clean.
**Edge:** newer schema than the app understands → refuse with an "update the app" message; missing referenced assets or a damaged/unsafe package → clear error, nothing is opened; unused files in the package → opened with a warning; recent entry whose file is gone → shown as missing and removed when opening fails; crash recovery prompt on launch (built in Phase 4B; see the last section and ADR-034).

## P. New / Save / Save As (native project lifecycle)
**New:** creates an unsaved project (modified until first saved). **Save:** if the project has a file, rewrites it; if never saved, behaves like Save As. **Save As:** native dialog (`*.boothproject`), writes the new file, and only then switches the project to it; the original file is untouched. A project becomes *saved* only after a successful Save/Save As; working-copy autosave never marks it saved.
**Edge:** cancelling a dialog is silent (not an error); a failed save keeps the previous file intact and reports a specific reason (missing asset, permission, replace failed). Unsaved-changes prompts on close/quit belong to the UI phase.

## Q. Manage layers (Phase 4)
**Happy path:** open a project → select by clicking the canvas or a Layers row (both stay in sync) → rename (double-click), lock/hide with the row buttons, drag rows or use the stacking buttons to reorder, group/ungroup, duplicate, delete, add a photo/text/rectangle/ellipse/line → every change is one undo step and marks the project Modified → Save.
**Edge/failure states:** locked layers render but cannot be moved; they stay selectable from the panel to unlock them; a layer hidden or locked by a parent shows that distinctly; reordering across groups is refused with a message; empty names are rejected; an added photo takes the next capture slot while a duplicated photo keeps its number (two-up strips); deleting a group deletes its contents.

## R. Edit properties (Phase 4)
**Happy path:** select a layer → edit X/Y/size/rotation/opacity or type-specific fields in the inspector → Enter or blur commits one undo step → the canvas updates; moving a layer on the canvas updates the inspector.
**Edge/failure states:** invalid numbers show an alert and revert; Escape discards the draft; repeated photo numbers are valid; locked layers' geometry fields are disabled; multi-selection offers only common bulk controls; a palette-linked color is not silently converted.

## Unsaved changes, autosave and recovery (Phase 4B)
**Closing with unsaved work.** Close Project, Open, New, New Sample, closing the window and quitting (Cmd+Q) all show the same native prompt: **Save** (Save As if never saved), **Don't Save**, **Cancel**. Cancel, a failed save or a cancelled Save As keeps the project open and the app running. Nothing is asked when the project is unchanged since its last save/open.
**Autosave.** About 2 seconds after edits stop (at most 10 s while editing continuously) a recovery copy is written to the app's working area. It does not save the project file and the title stays **Modified**; the status bar shows "Recovery copy saved <time>" or an "Autosave issue" warning.
**After a crash.** On next launch a **Recover unsaved work** dialog lists each recoverable project (name, file name or "never saved", last recovery copy time, warnings). **Recover** opens it as Modified (your saved file is untouched; Save writes it). If the saved file changed or disappeared since, the project opens without its file link so Save becomes Save As. **Discard** asks for confirmation and deletes only the recovery copy. **Decide later** keeps everything for the next launch. Undo history starts fresh after recovery.

## Starting, navigating and resizing (Phase 4C)
**Start.** With no project open the app shows the welcome screen: **New project** (⌘N; name and print format in a dialog), **Open project…** (⌘O) and recent projects (click a card to open; a card whose file moved shows "File not found"). File commands afterwards live in **File ▸** (New, Open, Save, Save As, Close project); Edit ▸ and View ▸ hold history, layer commands and zoom/snap/preview toggles with their shortcuts.
**Adding things.** Click the **Design** tool at the left, then a photo placeholder, text or shape to add it to the centre of the artboard (or use + in the Layers header).
**Layers and properties.** Layers sits above Properties; drag the thin bars to resize the column or the split (or focus a bar and use the arrow keys, Shift for bigger steps). Visibility and lock icons appear on hover/selection and stay visible while a layer is hidden or locked.
**Zoom.** Status bar `− 21% + Fit 100%`, or ⌘− ⌘= ⌘0 (fit) ⌘1 (100%).

## R. Bring artwork into a project (Phase 5A, implemented)
1. Open a project → **Assets** → **Import files…** (or drop files on the canvas/drawer). Supported: PNG, JPEG, WebP, SVG. Images are copied into the project; the originals can be moved or deleted.
2. **Add** an asset to the canvas (button, double-click, or drag). The same asset can be added many times; each layer has its own position, size, rotation, opacity and role.
3. Choose a **role** (overlay for transparent petals, frame art, badge, logo, graphic) in Properties; check **Print quality**.
4. **Background:** *Background* on a card, or Design → Background → Background image…; the result is a locked, full-canvas layer at the back.
5. Remove an asset only when unused; Replace image… swaps one layer's image. Save/Save As/reopen and crash recovery keep every image. Identical files imported twice are stored once.

## S. Design a photo strip once, print it twice (Phase 5B, implemented)
1. File → New project → **2×6 Photo Strip** → Create. The artboard is the single 2×6 strip.
2. Add photo placeholders 1-2-3, artwork, text; use **Selection position**, **Align/Distribute** and the arrow keys for exact placement.
3. Switch to **Print Preview** to see the 4×6 sheet: both copies, the cut line and labels. Nothing in Print Preview is editable; edit in Design and the preview follows.
4. Save as usual. The project holds one set of layers. Cutting the sheet in two is configured in DSLR Booth / the printer, not here.
