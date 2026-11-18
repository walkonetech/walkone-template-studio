# Manual Test Guide (cheat sheet + checklist)

For a **human** pass over the whole app (Phases 1–6A). Scripted suites already cover much of this by automation; this guide is for eyes, real mouse/keyboard, and anything automation cannot do. Record results honestly (Pass / Fail / Not tested) and note the machine.

## 1. Start the app

All commands run from `/Users/walkone/Projects/Apps/walkone-template-studio`.

| Goal | Command |
|---|---|
| First time / after pulling | `npm install` |
| Run the built app (closest to what ships) | `npm run build && npm start` |
| Dev mode (hot reload) | `npm run dev` |
| Throwaway profile (clean recents/recovery; real data untouched) | `npm run build && npx electron out/main/index.js --user-data-dir=$HOME/wts-test` |
| Reset the throwaway profile | `rm -rf $HOME/wts-test` |
| Quality gate | `npm run typecheck && npm run lint && npm run format:check && npm run build && npm test` (expect **880** tests) |

Tips
- Use the throwaway profile for destructive tests (crash recovery, quit prompts) so your real autosave sessions stay safe.
- Real DSLR Booth fixture ZIPs are private and local-only (`tests/fixtures/dslrbooth/source/`); never upload or commit them.
- **Windows** (validated in Phase 6C on Windows 11): install Node.js 24 LTS, Git and (for the scripted suites) Python 3 with Pillow (`python -m pip install Pillow`). Clone, then `npm ci`, `npm run build`, `npm start`. `npm ci` completes normally; Electron 44 has no separate install step, and its binary is downloaded the first time Electron is used (the first `npm start` or `require('electron')`), so that first start needs internet and takes longer (6C re-test; no manual workaround needed). Clones made before `.gitattributes` existed have CRLF files and fail `format:check`: re-clone, or run `git rm -r --cached -q . && git reset --hard` in a clean working tree. The suites run on Windows too (`node research/editor-validation/validate-4b.js`, …).

Key shortcuts to know: ⌘Z / ⇧⌘Z undo/redo, ⌘S save, ⌘O open, ⌘E export, hold **Space** to pan, **Shift**-drag to lock an axis, arrows nudge (Shift = bigger step). Hover any toolbar button for its tooltip.

## 2. Checklist

Mark each item `[x]` when passed. Add a note line for any failure.

### A. Launch, welcome, projects
- [ ] App opens to the Welcome screen without errors; window can resize, minimum size sane.
- [ ] New Project dialog: choose 2×6 strip, 4×6, custom size/DPI; project opens with correct size readout.
- [ ] A 2×6 strip shows one design; **Print Preview** shows two copies and cut lines.
- [ ] Save (⌘S) to a `.boothproject`; title/status shows Saved. Edit → shows Modified.
- [ ] Close and reopen the file: everything identical (layers, assets, palette, fonts).
- [ ] Recent projects list works; missing file is handled gracefully.
- [ ] Quit/close with unsaved changes shows Save / Don't Save / Cancel; each choice behaves correctly.
- [ ] Force-quit (Activity Monitor) mid-edit, relaunch: Recovery dialog offers the work; Recover and Discard both work.

### B. Canvas and layers
- [ ] Add photo, text, shape layers from the tool rail; select, move, resize, rotate.
- [ ] **Photo placeholders keep their shape**: only corner handles; drag scales uniformly; inspector W/H keep ratio.
- [ ] Shapes and images resize as expected (images keep ratio; shapes free).
- [ ] Shift-drag locks to an axis; snapping guides appear and can be toggled.
- [ ] Resize snapping: drag a corner of one photo slot towards another slot's size — it snaps to the same width/height and pink size bars appear on both; edges also snap to other objects and the canvas; Alt/Option-resize and Snap off do not snap.
- [ ] A framed photo slot (e.g. white frame) at an odd position shows no grey hairline at its outer edge with Preview photos on, nor in the proof PNG.
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

### D. Photo preview and cropping
- [ ] Preview Photos toggle shows sample photos by photo number; Shuffle photos; Choose photo… with your own image.
- [ ] Reposition/crop a photo: zoom and drag inside the frame; reset crop.
- [ ] Frame styling (thickness, colour, corner radius) updates live.
- [ ] Samples/crops never mark the project Modified and are not saved.

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
- [ ] Export is disabled on the welcome screen; enabled with a project (button, File → Export…, ⌘E).
- [ ] 2×6 strip: Print sheet PNG + Design PNG ticked; Proof offered (unticked); no Layer package; sizes shown (e.g. 1200 × 1800 px · 4 × 6 in · 300 DPI).
- [ ] Open the print PNG: both strips identical, photo areas empty, frames drawn, artwork clipped at the strip edge, no "PHOTO n" labels.
- [ ] Preview / Get Info shows the DPI (300 or 600).
- [ ] Proof shows the same sample photos you see with Preview Photos on (incl. a Reposition crop); it is clearly named `-proof`.
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
- [ ] Import: the design looks like dslrBooth's preview (Print Preview for strips); locked layers stay locked (unlock in Layers); title shows Modified; Save asks where.
- [ ] Pick a ZIP that is not a template: a clear "could not be imported" message with Choose another….
- [ ] Export the imported project for dslrBooth; **on the booth PC (6C)** import that ZIP into dslrBooth and compare.

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
Design Guide and the Canva-style redesign, safe-area / 2-inch-cut check, event themes, bundled font library, company profile, asset library, client approval, Light/Dark appearance, installer, Windows installer/packaging, font embedding, image palette extraction, badge builder, templates/recipes.

## 3. Automated suites (optional cross-check)

Built-app suites live in `research/editor-validation/` (see its README). Self-launching: `node research/editor-validation/validate-5d.js` (also `-5c`, `-5b`, `-5a`, `-4b`, `-4c`, `-4d`). `validate.js` needs the app running with the `WALKONE_DEV_*` variables and anti-occlusion flags (see README). Last recorded: 4:97, 4B:40, 4C:97, 5A:53, 5B:39, 5C:59 (58/59 only while a stray test app held port 9510; 59/59 after it was closed), 5D:40, 6A:37, 6B:26, Import:17 (`validate-6a.js`, `validate-6b.js`, need python3 + Pillow).

## 4. Reporting issues
For each failure note: steps, expected vs actual, screenshot, OS/version, and whether it reproduces on a fresh `--user-data-dir`. Bring the list to the next session; it becomes the input for fixes before Phase 6.
