# User Workflows

Workflows A–O were written before the build as **Proposed** behaviour; sections marked "implemented" describe what exists. D (import), K (dslrBooth export) and V/W are implemented; L (layer package) was withdrawn (ADR-041 §8); the Design Guide (X) is planned. UI details: [UX_SPEC.md](UX_SPEC.md). Each lists happy path and key failure/edge states.

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

## T. Precision layout and photo preview (Phase 5C, implemented)
1. **Artwork past the edge:** place or drag a petal overlay beyond the artboard; keep **Show overflow** on to keep editing it; switch to **Clipped view** to see what prints. Print Preview shows the clipped result per copy.
2. **Fine alignment:** zoom to 200–400% (buttons, ⌘/Ctrl +/−, Ctrl/Cmd + wheel at the detail), Space + drag to pan, drag with **Shift** for a straight horizontal/vertical move, let snapping settle the free axis, release; Undo undoes the whole gesture.
3. **Discover tools:** hover any control for a tooltip with its purpose and shortcut/modifier.
4. **Preview real photography:** turn on **Preview Photos**, pick or **Shuffle** samples, or **Choose photo…** for a picture of your own (preview only). Switch **Cover/Contain**; **Reposition…** to move/zoom the picture inside the frame; **Reset position**; style the **Frame** (colour, thickness, corner radius). Turn Preview Photos off to return to numbered placeholders. Samples never become project artwork or capture content.

## U. Typography and event colours (Phase 5D, implemented)
1. **Choose an installed font:** select text → Typeface → Font → type part of a name → Enter.
2. **Handle a missing font:** the warning names the font; choose a replacement in the card (this layer, or all uses) or leave it: the project keeps asking for the original.
3. **Fit text box to content:** Text box → **Fit height to content** (run again after changing text, font, size or width).
4. **Create an event palette:** Design drawer → Event palette → Add basic colors, then set Accent, Background, Text, Primary; add custom colours (e.g. Rose Gold).
5. **Link object colours:** in any colour field choose a palette entry; **change Accent once** to recolour everything linked, in Design and in both Print Preview copies.
6. **Detach:** Use fixed color keeps the look but stops following the palette. **Remove an unused colour** with its trash button (refused while something uses it).

## V. Export print files (Phase 6A, implemented)
1. **Open Export:** top-bar **Export**, File → Export…, or ⌘E.
2. **Choose files:** Print sheet PNG and Design PNG are ticked for a 2×6 strip (a 4×6 offers one Print PNG). Tick **Proof PNG** for client approval (sample photos; labelled Not for printing). (The layer package is not offered: the booth composites the photos itself; see ADR-041 §8.)
3. **Review checks:** errors (e.g. a deleted palette colour, a missing image) block export; warnings (missing font, low-resolution image, artwork outside) and notes do not.
4. **Export…** → choose a folder → files are written as `<Project>-print.png` etc. If names exist: **Replace**, **Keep both** (adds a number) or **Cancel**.
5. **Show in Finder/Explorer** next to each written file. The project itself is never changed by exporting.
DSLR Booth packages (workflow K) are Phase 6B; workflow L (layer package) was built in 6A and then withdrawn from the dialog by owner decision (ADR-041 §8); its classification is reused by 6B.

## W. Import a dslrBooth template (Phase 6D, implemented)
**Happy:** Start screen **Import from dslrBooth…** (or File › Import dslrBooth template…) → pick the ZIP dslrBooth exported → the dialog shows dslrBooth's preview, size/DPI, photos per session and notes → for a 4×6 sheet with two copied strips choose **one 2×6 strip printed two per sheet** (recommended) or **the sheet as is** → Import (asks about unsaved changes) → a new, Modified project opens; locked layers stay locked → Save.
**Edge:** not a template (no template.xml) → clear error + Choose another…; missing/unreadable pictures, unknown settings, shadows, differences between the two strips → listed in the dialog, kept in the project's import notes, never silently dropped; text and decorations made as pictures arrive as pictures. A two-strip sheet whose text copies were placed a little differently from its photo copies is still offered as one strip (recommended) or as is. **Live text typed in dslrBooth's own editor arrives as editable text** (6C C1, ADR-051): retype it, change font, size, colour or alignment, then export. The dialog notes what is approximated: "Auto" size (dslrBooth stretches the letters; here the largest size that fits), "Bold Italic" shown as Italic (as dslrBooth prints it), a line wider than its box (dslrBooth cuts it off; here it wraps and nothing is removed — the note says about how many lines it becomes and what they run over or under, so shorten it, make it smaller or widen the box before exporting), elements sharing one stacking number (which one is in front in dslrBooth is not confirmed: the note names them; check against the preview), drop shadows (not drawn), and fonts not installed on this computer (name kept, stand-in font shown). On export back to dslrBooth the text is drawn into the artwork, so the booth needs no fonts but the text cannot be retyped inside dslrBooth's editor.

## K2. Export for dslrBooth (Phase 6B, implemented)
**Happy:** Export → **dslrBooth template · 2×6 strip** is ticked (one native strip, dslrBooth prints two per 4×6) → optional **4×6 sheet** version → Export → import the ZIP into dslrBooth on the booth PC.
**Edge:** no photo slots or a photo number above 12 → blocked with the reason; Fit/Stretch slots, faded photos, unusual DPI → warnings. Validated in dslrBooth 7.48 in Phase 6C (both versions import and print correctly).
**Updating a template already in dslrBooth (observed in 6C):** dslrBooth never replaces a template on Import; importing a newer export always adds a copy ("… Copy1") with its own Id. Select the new copy for the event, then delete the old one in dslrBooth if it is no longer needed.

## X. Design Guide (planned; owner direction, mockups first)
Print size → event type → style → colours/background → photos (count, orientation, size) → logo/monogram → words → company branding → layout → done (export, client proof, open in the editor). Conditional steps per event type; automatic safe-area / 2-inch-cut check; "Save as event theme" for the next similar event. Clients never use it; the main client approves the proof.

## Y. Edit an event's template inside WalkOne Booth (future, ADR-049; not approved to build)
**Happy:** WalkOne Booth → Event → Template → Open Template Studio (the same editor as the standalone app) → event name, date, client, venue, format, output profile, company branding and palette arrive prefilled → design or adjust → Save → back to Event Setup → Event Readiness checks the template (valid, safe-area passed) together with camera, printer, sharing and storage → Launch Event.
**Edge:** a template designed in standalone Template Studio opens without conversion; an approved event revision is immutable, so later edits create a new revision that needs approval again.

## Z. Proof and client approval (future)
**Happy:** template source → proof → client approval (link, comments, approval snapshot; clients never edit) → approved immutable event revision → live event.
**Edge:** the mechanism for sending links (hosted service vs email hand-off) is undecided (ADR-006, PRODUCT_ECOSYSTEM.md §17).
