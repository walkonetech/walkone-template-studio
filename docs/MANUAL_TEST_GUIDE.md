# Manual Test Guide (cheat sheet + checklist)

For a **human** pass over the whole app (Phases 1–6A). Scripted suites already cover much of this by automation; this guide is for eyes, real mouse/keyboard, and anything automation cannot do. Record results honestly (Pass / Fail / Not tested) and note the machine.

## 1. Start the app

All commands run from the repository root.

| Goal | Command |
|---|---|
| First time / after pulling | `npm install` |
| Run the built app (closest to what ships) | `npm run build && npm start` |
| Dev mode (hot reload) | `npm run dev` |
| Throwaway profile (clean recents/recovery; real data untouched) | `npm run build && npx electron out/main/index.js --user-data-dir=$HOME/wts-test` |
| Reset the throwaway profile | `rm -rf $HOME/wts-test` |
| Quality gate | `npm run typecheck && npm run lint && npm run format:check && npm run build && npm test` (expect **963** tests; 951 + 2 skipped files without the private fixtures) |

Tips
- Use the throwaway profile for destructive tests (crash recovery, quit prompts) so your real autosave sessions stay safe.
- Real DSLR Booth fixture ZIPs are private and local-only (`tests/fixtures/dslrbooth/source/`); never upload or commit them.
- **Windows** (validated in Phase 6C on Windows 11): install Node.js 24 LTS, Git and (for the scripted suites) Python 3 with Pillow (`python -m pip install Pillow`). Clone, then `npm ci`, `npm run build`, `npm start`. `npm ci` completes normally; Electron 44 has no separate install step, and its binary is downloaded the first time Electron is used (the first `npm start` or `require('electron')`), so that first start needs internet and takes longer (6C re-test; no manual workaround needed). Clones made before `.gitattributes` existed have CRLF files and fail `format:check`: re-clone, or run `git rm -r --cached -q . && git reset --hard` in a clean working tree. The suites run on Windows too (`node research/editor-validation/validate-4b.js`, …).

Key shortcuts to know: ⌘Z / ⇧⌘Z undo/redo, ⌘S save, ⌘O open, ⌘E export, hold **Space** to pan, **Shift**-drag to lock an axis, arrows nudge (Shift = bigger step). Hover any toolbar button for its tooltip.

## 2. Checklist

Mark each item `[x]` when passed. Add a note line for any failure.

### A. Launch, welcome, projects
- [ ] App opens to the **Start screen** ("Start a template") without errors; window can resize, minimum size sane.
- [ ] New Project dialog: choose 2×6 strip, 4×6, custom size/DPI; project opens with correct size readout.
- [ ] A 2×6 strip shows one design; **Print Preview** shows two copies and cut lines.
- [ ] Save (⌘S) to a `.boothproject`; title/status shows Saved. Edit → shows Modified.
- [ ] Close and reopen the file: everything identical (layers, assets, palette, fonts).
- [ ] Recent projects show as cards (format drawing, name, "2×6 strip · opened …"); a moved file shows **File not found** + **Locate…** (opens the file picker; nothing is deleted).
- [ ] Quit/close with unsaved changes shows Save / Don't Save / Cancel; each choice behaves correctly.
- [ ] Force-quit (Activity Monitor) mid-edit, relaunch: Recovery dialog offers the work; Recover and Discard both work.

### B. Canvas and layers
- [ ] Add photo slots, text and shapes from the **Elements** drawer (rail); select, move, resize, rotate.
- [ ] **Photo placeholders keep their shape**: only corner handles; drag scales uniformly; inspector W/H keep ratio.
- [ ] Shapes and images resize as expected (images keep ratio; shapes free).
- [ ] Shift-drag locks to an axis; snapping guides appear and can be toggled.
- [ ] Resize snapping: drag a corner of one photo slot towards another slot's size — it snaps to the same width/height and pink size bars appear on both; edges also snap to other objects and the canvas; Alt/Option-resize and Snap off do not snap.
- [ ] A framed photo slot (e.g. white frame) at an odd position shows no grey hairline at its outer edge on the canvas, nor in the proof PNG.
- [ ] Zoom (wheel, pointer-centred), Space+drag pan, fit-to-window.
- [ ] Layers panel: select, multi-select (⇧/⌘), rename, lock, hide, reorder, group/ungroup, filter, 50+ layers scroll.
- [ ] Align/Distribute and exact X/Y fields; arrow-key nudging.
- [ ] Undo/redo across every action above; undo after save marks Modified correctly.
- [ ] Show overflow / Clipped view: artwork past the artboard is clipped in output.

### C. Assets and backgrounds
- [ ] Import PNG, JPEG, WebP, SVG (picker and drag-drop); duplicates are de-duplicated.
- [ ] Assets drawer: thumbnails, roles, replace, remove (warns if used), effective-DPI readout and low-resolution warning.
- [ ] Set as Background; canvas background colour editable.
- [ ] Save/reopen keeps assets; undo/redo of import works.

### D. Photo slots
- [ ] Photo slots show the numbered placeholder (no sample photos or Reposition since B3.1; see H2).
- [ ] Frame styling (thickness, colour, corner radius) and Photo fit update live and are undoable.

### E. Typography (Phase 5D)
- [ ] Add text; edit inline (double-click): Enter commits, Shift+Enter newline, Esc cancels.
- [ ] Font picker: opens, search ("garamond"), arrow-key navigation, Enter selects; names shown in their own typefaces; browsing alone changes nothing.
- [ ] Choose an installed font: canvas updates. Weight and italic controls work.
- [ ] Type a font you do not have (e.g. "Bickham Script Pro"): warning shown, fallback renders, requested name stays; save/reopen keeps the name.
- [ ] Project font inventory lists fonts (✓ / ⚠ missing); **Replace all uses** is one undo step.
- [ ] If the OS prompts for font access: allow once; also try denying (list limited, app still works, no repeated nagging).
- [ ] **Fit height to content** works for single line, multiline, after changing font/size/line height/width; undoable.
- [ ] Text presets (Title, Names, Subtitle, Date, Location, Caption) apply as one undo step.

### F. Event Palette (Phase 5D)
- [ ] Open Event Palette; add Primary/Secondary/Accent/Background/Text (or "basic palette"); each role only once.
- [ ] Edit a colour via picker and via HEX (Enter commits, Esc restores, partial typing makes no history).
- [ ] Add a custom colour, rename it (references survive).
- [ ] Link text colour, shape fill, shape stroke, photo frame colour, canvas background to palette colours; the field shows the palette name, not just HEX.
- [ ] Change Accent: every linked item updates immediately, in Design and both Print Preview copies.
- [ ] Undo/redo the palette change (one step per committed edit).
- [ ] "Use fixed color" detaches without changing appearance; later palette edits no longer affect it.
- [ ] Removing a palette colour that is in use is refused with a usage count; unused removal works.
- [ ] Palette edits survive save/reopen and crash recovery.

### G. Print Preview / output
- [ ] Switching Design ↔ Print Preview does not modify the project; edits are refused in preview.
- [ ] Both copies identical; artwork clipped to each cell; cut lines correct.

### G2. Export (Phase 6A)
- [ ] The Start screen shows no Export button and File → Export… is disabled; with a project Export works from the top bar (primary, always visible), File → Export… and ⌘E.
- [ ] 2×6 strip: Print sheet PNG + Design PNG ticked; Proof offered (unticked); no Layer package; sizes shown (e.g. 1200 × 1800 px · 4 × 6 in · 300 DPI).
- [ ] Open the print PNG: both strips identical, photo areas empty, frames drawn, artwork clipped at the strip edge, no "PHOTO n" labels.
- [ ] Preview / Get Info shows the DPI (300 or 600).
- [ ] Proof shows each photo slot as its numbered placeholder (never a picture); it is clearly named `-proof`.
- [ ] Export twice into the same folder: Replace / Keep both / Cancel all behave.
- [ ] Rename a font to something not installed: warning, export still allowed; result uses a fallback font.
- [ ] "Show in Finder" opens the folder with the file selected.
- [ ] Exporting does not mark the project Modified.

### G3. dslrBooth template (Phase 6B)
- [ ] 2×6 strip: Export shows **For dslrBooth** first: “dslrBooth template · 2×6 strip” (ticked) and “… · 4×6 sheet”; file names `<Project>.zip` / `<Project> 4x6.zip`.
- [ ] Checks show dslrBooth notes only while a dslrBooth template is ticked; a design with no photo slots, or a slot numbered 13, blocks it.
- [ ] Unzip the strip ZIP: `template.xml`, `preview.png`, `background.png`, `artwork-…png`. Stack the PNGs in Photoshop/Preview: it matches the design PNG (photo areas empty).
- [ ] **On the booth PC (Phase 6C):** import both ZIPs into dslrBooth 7.48; check photo slots, frames, rounded corners, text, the two-up print and the 2-inch cut.

### G4. Import a dslrBooth template (Phase 6D)
- [ ] Start screen **Import from dslrBooth…** (or File › Import dslrBooth template…): pick one of your real template ZIPs. The dialog shows dslrBooth's preview, size/DPI, photos per session, pictures and notes.
- [ ] A two-strip 4×6 sheet offers **One 2×6 strip** (recommended) or **the 4×6 sheet as it is**; switching changes the notes.
- [ ] A two-strip sheet with live text in both strips (e.g. owner template D) still offers **One 2×6 strip** (recommended); the strip import keeps one copy of each text line.
- [ ] A text wider than its box shows a `text-overflow` warning naming it, about how many lines it wraps to and what it runs over or under; elements sharing one stacking number show a `z-index-tie` note naming them.
- [ ] Import: the design looks like dslrBooth's preview (Print Preview for strips); locked layers stay locked (unlock in Layers); title shows Modified; Save asks where.
- [ ] Pick a ZIP that is not a template: a clear "could not be imported" message with Choose another….
- [ ] Export the imported project for dslrBooth; **on the booth PC (6C)** import that ZIP into dslrBooth and compare.

### G5. Output profile and safe areas (ADR-053)
- [ ] New 2×6 strip: the status bar shows **No printer** ("Output: none" before B4); the Safe areas button is greyed out; nothing extra is drawn.
- [ ] Click the chip (or View › Printer & cutting…, called Output profile… before B4), pick **DNP DS-RX1 · 6×4 PC · 2-inch cut · borderless**, Done. The title still shows the same Saved/Modified state as before (choosing a profile never changes the project).
- [ ] The dialog shows each value with a badge: driver/driver page/cut **Observed on test laptop**, trim **Inferred**, 3 mm **Provisional**, cut trim **Unknown**, finishing (auto-cut, cut on seam, gutter) **Observed on test laptop** (owner's test print, 2026-11-19), Verified "Not yet verified". Status: **Observed on test laptop**.
- [ ] The strip shows an amber hatched edge band, a teal dashed line 3 mm inside every edge and a legend under the artboard. Toggle View › Safe areas (or the dashed-square button): it hides and shows.
- [ ] Put a text near the left edge and a photo slot nearly touching the right edge: both get red dashed outlines and the chip says "2 safe-area warnings". A full-bleed background shows no outline.
- [ ] Print Preview: two copies, the dashed 2-inch cut in the middle, a teal line 3 mm each side of it and from the outer edges; both copies show the same red outlines.
- [ ] Export: an "Output profile" row names the profile; the Checks list has the warnings tagged **Output**; Export is still allowed. The exported files look exactly as before (no guides).
- [ ] 2×6 at 300 DPI shows the same physical margin; a 6×4 landscape project says "does not match this project" and draws nothing.
- [ ] Quit and reopen: the profile is still selected. Choose **No profile**: everything printer-specific disappears.
- [ ] (Optional, with the printer) print the strip and compare where the trim and cut fall with the overlay.

### H0. Appearance (Phase 7B B2)
- [ ] A fresh install opens in the **Light** theme at **Comfortable** size, interface text in Inter.
- [ ] View › **Dark theme** switches at once (no restart); the design on the artboard looks exactly the same; the title still says **Saved**; Undo stays as it was.
- [ ] View › **Match system theme**, then change the OS appearance (macOS: System Settings › Appearance; Windows: Settings › Personalisation › Colours › Choose your mode): the app follows within a second. On Windows the title bar follows too.
- [ ] View › **Compact size** makes controls smaller; every panel, button and menu is still in the same place. **Comfortable size** restores the larger sizes.
- [ ] Quit and reopen: the last theme and size are kept. Open a saved project: nothing in it changed (no Modified).
- [ ] Export the same project in Light and in Dark: the PNGs look identical.
- [ ] Safe areas (G5): the trim hatch is a muted amber, the keep-safe line teal, the same in both themes.
- [ ] Windows at 125 % display scaling: text is crisp, and the Export dialog's Export button stays visible on a short window.

### H1. Editor shell (Phase 7B B3) — compare with the B1 mockups (`design/phase-7b-b1/png/`)
- [ ] Start screen: **Blank design** (format drawings) opens New project; **Import dslrBooth** opens the import; **Open project…** shows ⌘O / Ctrl+O; no Guided Design anywhere.
- [ ] After **Decide later** in the recovery dialog, the Start screen shows a banner: **Review** brings the same choices back, **Not now** hides it.
- [ ] Top bar: File, Edit, **Arrange**, View, **Help**; the project name ellipsizes before any button is squeezed; Undo/Redo (words on a roomy window), **Checks** (count; opens a list; Escape closes it), **See how it prints** (becomes **Preview** on a narrow window, never just an icon), Save (greyed while saved), **Export** (blue, always visible).
- [ ] Rail: **Elements, Text, Photos, Uploads, Colors**, each with a word; the open one is highlighted in indigo with a bar on its left.
- [ ] Window ≥ 1600 px wide: the drawer sits beside the canvas and pushes it. Narrower (e.g. 1426×779): the drawer floats over the canvas, stays open while you add several items, and closes when you click the canvas, choose another category, press its ✕ or press Esc.
- [ ] Drag the drawer's right edge: it stays between 240 and 360 px and keeps its width after a restart. The project stays **Saved**.
- [ ] Canvas-state bar: **Design | Print Preview** (strips only), **Safe areas** ("No profile" until you choose an output profile in the status bar, then On/Off), **Overflow: Show/Hide**. None of them changes Saved/Modified. Print Preview says "read only" with **Edit in Design**.
- [ ] Tall window (≥ 860 px): Properties above Layers with a draggable divider. Short window (e.g. 1426×779): **Properties | Layers** tabs; picking a layer in Layers then switching to Properties shows that layer.
- [ ] Layers header: **+** and **⋯** only; ⋯ has Duplicate, Group, Ungroup, the four stacking moves, Delete, Keyboard shortcuts…
- [ ] Status bar: format, selection, Output, Snap, zoom; no sample/safe/overflow toggles there any more.
- [ ] **F6** / Shift+F6 moves focus between top bar, rail, drawer, canvas-state bar, canvas, right column and status bar. Esc closes a popover first, then a floating drawer, then clears the selection.
- [ ] Windows only: **F10** focuses the menus; **Alt+F/E/A/V/H** opens them and holding Alt underlines the letters.
- [ ] Help › Keyboard shortcuts… shows ⌘ on macOS and Ctrl on Windows.
- [ ] Every tooltip stays fully inside the window, including at the right edge, the status bar and inside a floating drawer.
- [ ] Repeat the main checks in **Dark** and **Compact** (View menu) and at 1100×650.

### H2. B3.1 follow-ups (Phase 7B B3.1)
- [ ] **No Sample photos anywhere:** not in the bar above the canvas (it shows Design | Print Preview · Safe areas · Overflow), not in the Photos drawer (Add photo slot + the slot list only), not in Properties for a selected photo slot, not in the View menu; no Shuffle, Reset samples, Choose photo… or Reposition. Double-clicking a photo slot does nothing special.
- [ ] Photo slots still work: add one from Photos or Elements, change its number, fit, frame and corner radius in Properties; it shows the numbered placeholder (tint + number). Export: print/design PNGs keep the slot areas empty with frames; the Proof PNG shows numbered placeholders, never pictures.
- [ ] Older projects (saved before B3.1) open, edit and save normally.
- [ ] Floating drawer (window < 1600 px wide): drag its right edge, then press **Esc** once: the drawer closes and focus moves to its rail button. With the edge focused, the arrow keys still resize it.
- [ ] Open a drawer, then press **See how it prints** / Design | Print Preview: the drawer closes; nothing covers the preview caption. Back in Design the drawer stays closed. Clicking a rail item while in Print Preview goes back to Design and opens it.
- [ ] Open Export, close it with the mouse (Cancel or ✕) and move the mouse away: no Export tooltip stays on screen. Same with Esc. Tabbing onto Export, or hovering it, still shows its tooltip.
- [ ] Windows: the window cannot be made narrower than 1100 DIP; at 1920×1080 125 % a half-screen Snap docks the minimum-size window at the left (expected, owner decision). F10 (or a tap on Alt) focuses the menus WITH the access-key underlines and every menu item has its own letter (B6, H6).

### H3. B4 workflow surfaces (Phase 7B B4)
- [ ] **Checks:** the top-bar **Checks** button shows a green check when nothing needs fixing, otherwise its icon and separate red (errors) / amber (needs attention) counts. Clicking it opens the Checks panel on the LEFT (where drawers open); Properties stays visible. Groups **Error · Needs attention · Good to know**; Good to know starts collapsed. With only notes the panel says **Ready · n notes**.
- [ ] Two texts in a missing font show as ONE card ("2 texts use a font that isn't installed") with **Select all 2** and **Details** (their names). **Select** picks the layer; the panel stays open. There is no Fix / Move inside / Later button anywhere.
- [ ] At 1426×779 and 1100×650 the Checks header stays visible, the list scrolls, and no button hides under the status bar. Esc (with focus in the panel, or when it floats) closes it and focus returns to Checks.
- [ ] **Export:** three picture cards. First time: **For the booth** on, **Print files** off, **Client proof** off. Turn cards on/off: "Creates n files" and the button "Export n files…" follow. **More options** has the 4×6 dslrBooth template and single files. The readiness line reads Ready / Almost ready (+ **Review**) / Fix n errors (checks open by themselves, Export disabled). The printer chip reads "DNP DS-RX1 · Tested" and opens Printer & cutting.
- [ ] The Export button and Cancel stay visible at 1426×779 and 1100×650 (the middle scrolls; the summary and footer do not). No drawing shows a photo or a person; the proof drawing shows numbered slots.
- [ ] Export works as before: the dslrBooth ZIP, print/design PNGs and the proof (numbered placeholders) open correctly.
- [ ] **Printer & cutting** (View menu, status chip, Export chip): title "Printer & cutting · DNP DS-RX1" with **Ready to use**; the corner drawing (striped "May be cut off · about 1.6–1.8 mm (estimate)", dashed "Keep names and logos inside · 3 mm") is visible without scrolling; **How sure are we?** marks **Tested on a print** and says the production booth is not yet verified; three setup tiles in plain words; **How do we know?** lists every value with its evidence (trim Inferred, safe line Provisional, cut loss Unknown). No file paths or developer notes.
- [ ] **dslrBooth import** (a two-strip 4×6 template): "We found a 2×6 design printed twice on a 4×6 sheet"; **One 2×6 strip, printed two per sheet** is first, Recommended and selected; **The 4×6 sheet exactly as it is** is the other choice; **For you** explains the choice and lists what needs attention; **Compatibility details** starts closed. Import gives the same project as before.
- [ ] **Safe-area warning:** put text near the edge of a red background with Safe areas on: the red dashed warning outline has a dark edge around it and stays readable; it is the same box as before, and it never appears in exports.
- [ ] Repeat the dialogs in **Dark** and **Compact**.
- [ ] **Checks focus (B4.1):** Tab to the Checks button and press Enter: focus moves into the panel (a group heading, with a ring). Tab walks Select / Select all / Printer & cutting… / Details and then leaves the panel; Shift+Tab goes back. Esc returns focus to the Checks button (ring, no tooltip). Open Checks with the mouse, click its heading, a card's text or the empty header space, press Esc: the panel closes and focus is on the Checks button. Open Checks, click a rail tool: focus stays on that tool.

### H4. B5 editor experience (Phase 7B B5)
- [ ] **New blank project** (Start › Blank design › 2×6 › Create): the "Three steps to a template" card appears beside the strip. Add photo slot adds one slot and ticks step 1. × hides the card for this project.
- [ ] Select a text: a toolbar appears above it with Edit text · Event colors… (or palette dots once the Event Palette has colours) · Arrange · Duplicate · More. A dot recolours the text and links it to the palette. Duplicate adds one copy (Undo removes it).
- [ ] Select a photo slot: − Photo n + · Frame · Arrange · Duplicate · More; no Reposition. Select two layers: Align · Group · Arrange · Duplicate · More.
- [ ] The toolbar is never in Print Preview, never for a locked layer, never off-screen (try a layer at the top edge and a small window).
- [ ] **Properties:** text shows Content, Font, Style + size, Color, Align; then Position & size, Spacing & box, Appearance, Align to canvas, Layer — closed, each with a summary. Opening a section does not mark the project Modified. Two layers with different opacity show "Mixed".
- [ ] **Settings** (File › Settings… or Ctrl/⌘+,): Theme, Button and text size, Interface scale apply right away; Printing shows the printer; Editor has Selection toolbar and getting-started tips switches. Restart: the choices are kept. The project stays Saved.
- [ ] Hide these tips → the next new blank project has none → Settings › Editor turns them on → the next one has them again. Opened or imported projects never show tips.
- [ ] A new text uses **Arial** and shows no missing-font note. An older project's Helvetica text stays Helvetica.
- [ ] Start: Search recent filters the cards; a 2×6 strip card shows two strips; a moved file shows File not found + Locate…; Locate… → Cancel leaves the card; Locate… → the moved file opens it, and back on Start there is ONE card for it (no stale File not found card) that reopens. File › Settings… → Escape puts focus on the File menu button (B5.1).
- [ ] Repeat in Dark + Compact + 125 % at a short window: toolbar and Properties stay usable; no sideways scrolling. No "Sample photos" anywhere.

### H5. Custom size and My formats (Phase 7B B5.5)
- [ ] Start shows **Custom size** as a card between Blank design and Import dslrBooth. Blank design still offers 4×6 Photo / 2×6 Photo Strip exactly as before, plus Other sizes › Custom size….
- [ ] Custom size: type 2.25 × 3.25 in at 300 DPI → "675 × 975 px @ 300 DPI". Switch to Millimeters → 57.15 × 82.55. Type 50 × 70 mm → 591 × 827 px. Switch to Pixels → 591 × 827; type 1080 × 1350, choose 600 DPI → still 1080 × 1350 px. Landscape swaps width and height.
- [ ] Width 0 or 200 in: a message in words under the field, "Fix 1 thing to continue.", Next disabled.
- [ ] 2 × 3 in → Next → Repeat on a sheet: 4 × 6, 2 × 2, diagram shows 1–4 and "Fits". A 0.1 in gap → an error that 4 copies need 4.1 × 6.1 in, Next disabled; back to 0 → fits. Custom sheet layout: margins and "From the top-left margin" move the copies in the diagram.
- [ ] Safe margin: Recommended 3 mm is chosen (None for a pixel format); Custom 5 mm shows its pixels; the note says it is general guidance, not a printer measurement.
- [ ] Review lists the design, pixels, output, gaps/margins, safe margin and "No printer profile assigned". Tick Save to My formats, name it, **Create design**: the normal editor opens (Modified).
- [ ] Safe areas shows the generic 3 mm line without a printer. Put a text near the edge: Checks says it is close to the edge. Print Preview shows four copies, Copy 1–4, the cut lines ("Cut line") and the safe line in each; View › Cut guides hides the lines.
- [ ] Export: Print sheet 1200 × 1800, Design 600 × 900, Proof; the booth card is offered for a 4×6 sheet. A 50 × 70 mm exact-size project offers no booth card and the Checks explain why; its PNGs are 591 × 827.
- [ ] Save, close, reopen: same size and copies. Start › My formats: the card opens the wizard on Review; Rename (Enter) and Delete (asks first) work. Built-in formats have no delete.
- [ ] Schema version (ADR-060): unzip the saved magnet `.boothproject` → `project.json` says `"schemaVersion": 2`; a standard 2×6 project saved by this build says `1`. An older build (e.g. `cb2f75d`) opening the magnet file shows "supports up to 1. Update the app" and still opens the 2×6 file.
- [ ] With a saved project open: File › New project… › Custom size…, click through the steps, Cancel → the project is unchanged and still Saved.
- [ ] An older 2×6 or 4×6 project opens unchanged and exports exactly as before. Dark theme, 1426 × 779 and the minimum window: every wizard step fits, no sideways scrolling. No "Sample photos" anywhere.

### H6. Keyboard, screen readers, high contrast (Phase 7B B6)
- [ ] Put the mouse over the canvas. Press Tab until **See how it prints** has a focus ring, then press **Space**: Print Preview opens. Enter works too. Click the canvas and hold Space: the hand cursor pans.
- [ ] Windows: press **F10** — File gets a ring and F/E/A/V/H are underlined; Escape goes back. Tap **Alt** alone — same; tap again — back. **Alt+V** opens View with every item's letter underlined; press a letter (e.g. the one in "Printer & cutting…") and the item runs; Escape returns focus to View. Opening a menu with the mouse shows no underlines.
- [ ] macOS: open File and type **s**: focus jumps to Save, then Save As…
- [ ] Arrow keys change choices in New project (print type), the Custom size wizard (units, DPI, printing, safe margin), Typography alignment and Settings.
- [ ] **F6** walks top bar → rail → drawer → view bar → canvas → Properties/Layers → status bar; Shift+F6 goes back.
- [ ] Do a whole 2×6 project without the mouse: Start › Blank design › Create, add text and a photo slot from the rail, pick a layer in Layers, change Font size, open Checks, Export (Ctrl/⌘E).
- [ ] Windows High Contrast (Settings › Accessibility › Contrast themes): focus rings, the selected layer, the open rail item, chosen options, menus and dialogs are all visible; warnings keep their icon and words.
- [ ] Reduce motion (macOS: Accessibility › Display › Reduce motion; Windows: Animation effects off): tooltips, menus and the tips card appear without animation.
- [ ] **VoiceOver (⌘F5) / Narrator (Ctrl+Win+Enter):** Start cards read their name and description; the rail reads "Text, button, collapsed/expanded"; the canvas reads its description (format, copies, layers, selection); a Layers row reads "Text: Title, hidden, locked"; the wizard announces "Step 2 of 4…", reads the arrangement sentence and the error next to a bad width; Export cards read checked/unchecked.
- [ ] With the getting-started tips showing, select a layer near them at 1426 × 779 and at the minimum window: the selection toolbar never hides a tips button.
- [ ] (B6.1) File › Open… and File › Import dslrBooth template… — by keyboard (F10 / Alt, arrows, Enter) and by mouse — then **Cancel** the Windows/macOS file picker: focus is on **File** (ring after keyboard use), the menu stays closed, no tooltip; Tab / F6 continue from there. Choose a project / a template instead: the project opens, or the import review opens with focus inside it — focus is not pulled back to File.
- [ ] (B6.1) Windows **High Contrast White** (and Black): pressed view toggles (Safe areas, Overflow, Cut guides) show both the label and the value (On / Show) in the highlight text colour, clearly readable.

### H7. Design Guide (Phase 7C)
- [ ] Start shows **Design Guide** first, the same size as Blank design, Custom size and Import dslrBooth; Open project and Recent unchanged.
- [ ] Open it: "Choose your print size", Step 1 of 5. Pick each size; the line under Resolution shows the size, pixels and how it prints; the preview changes (2×6: Design / Print sheet).
- [ ] Custom size → **Make a custom size…**: the Custom Size wizard opens on top; its last button says **Use this size** and has no project name. Back in the Guide the chosen size is shown; Next works.
- [ ] Photos: 1, 2, 3, 4 — each layout card is drawn with that many slots and the preview follows; Auto / Portrait / Landscape / Square change the slot shapes; photos are numbered 1, 2, 3…
- [ ] Colors: each starting set recolours the preview; typing a hex value changes it; frame None / Thin / Thick, Accent / White, corners Rounded.
- [ ] Text: Event name, Date, Message — turn one on and leave it empty: the field explains and Next is disabled (it says why). Font list shows only fonts this computer has.
- [ ] Back to Photos and forward again: nothing doubles in the preview.
- [ ] Review → **Finish**: the editor opens with Photo 1…n, the text layers and the palette (Colors drawer: Background, Accent, Text). Change Accent in the palette: every frame follows. Undo right away does nothing (the design is the starting point).
- [ ] From Photos (or Text) use **Open in editor**: the editor opens with the answers so far.
- [ ] Escape in the Guide: back to Start, focus on the Design Guide card; open it again — it resumes; **Start over** resets.
- [ ] Keyboard only: Tab to the card, Enter; arrows choose; Tab to Next, Enter; type the event name; Finish.
- [ ] Windows High Contrast (White and Black): the chosen size / layout / colour set and the current step are highlighted and readable; layout drawings and swatches visible.
- [ ] 1426 × 779 (Windows 125 %) and the minimum window: every step fits, the footer is visible, no sideways scrolling.
- [ ] Save, close, reopen a Guide project; export PNG and dslrBooth: same as any project. No sample photos anywhere.

### H. UI, accessibility, polish
- [ ] Tooltips on icon-only controls, with shortcut hints.
- [ ] Everything reachable by keyboard; visible focus ring; labels on fields.
- [ ] Panel splitters resize; layout sane at 1280×800, 1440×900, 1920×1080.
- [ ] No console errors in View → Toggle Developer Tools during normal use.

### I. Safety and data
- [ ] Open a corrupted/renamed non-project file: clear error, no crash.
- [ ] Importing a dslrBooth ZIP never changes the ZIP itself; a broken or non-template ZIP gives a clear error, no crash (§G4).
- [ ] No client data appears in `git status`.

### J. Not built yet (expect absent)
Design Guide re-entry ("Guide me") and its later steps (event type, styles, logo, company branding), one-click fixes and custom output profiles (the safe-area check itself exists, G5), event themes, bundled font library, company profile, asset library, client approval, Settings › Appearance (theme and size are in the View menu for now), the later 7B redesigns (selection toolbar, first-run tips, full Properties content, Settings, Learn links, recent-project thumbnails, drawer Pin, Elements search; the Checks panel and the Export / Printer & cutting / Import dialogs arrived in B4), installer, Windows installer/packaging, font embedding, image palette extraction, badge builder, templates/recipes.

## 3. Automated suites (optional cross-check)

Built-app suites live in `research/editor-validation/` (see its README). Self-launching: `node research/editor-validation/validate-5d.js` (also `-5c`, `-5b`, `-5a`, `-4b`, `-4c`, `-4d`). `validate.js` needs the app running with the `WALKONE_DEV_*` variables and anti-occlusion flags (see README). Last recorded: 4:97, 4B:40, 4C:97, 5A:53, 5B:39, 5C:59 (58/59 only while a stray test app held port 9510; 59/59 after it was closed), 5D:40, 6A:37, 6B:26, Import:17 (`validate-6a.js`, `validate-6b.js`, need python3 + Pillow).

## 4. Reporting issues
For each failure note: steps, expected vs actual, screenshot, OS/version, and whether it reproduces on a fresh `--user-data-dir`. Bring the list to the next session; it becomes the input for fixes before Phase 6.
