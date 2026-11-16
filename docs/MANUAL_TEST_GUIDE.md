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
| Quality gate | `npm run typecheck && npm run lint && npm run format:check && npm run build && npm test` (expect **752** tests) |

Tips
- Use the throwaway profile for destructive tests (crash recovery, quit prompts) so your real autosave sessions stay safe.
- Real DSLR Booth fixture ZIPs are private and local-only (`tests/fixtures/dslrbooth/source/`); never upload or commit them.
- Windows is untested everywhere. If you have a Windows machine, run section 12 there.

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
- [ ] 2×6 strip: Print sheet PNG + Design PNG ticked; Proof and Layer package offered; sizes shown (e.g. 1200 × 1800 px · 4 × 6 in · 300 DPI).
- [ ] Open the print PNG: both strips identical, photo areas empty, frames drawn, artwork clipped at the strip edge, no "PHOTO n" labels.
- [ ] Preview / Get Info shows the DPI (300 or 600).
- [ ] Proof shows the same sample photos you see with Preview Photos on (incl. a Reposition crop); it is clearly named `-proof`.
- [ ] Layer package: unzip; stack background → (photos) → frames → overlay → text in Photoshop or similar at 0,0; it matches design.png. Read readme.txt.
- [ ] Export twice into the same folder: Replace / Keep both / Cancel all behave.
- [ ] Rename a font to something not installed: warning, export still allowed; result uses a fallback font.
- [ ] "Show in Finder" opens the folder with the file selected.
- [ ] Exporting does not mark the project Modified.

### H. UI, accessibility, polish
- [ ] Tooltips on icon-only controls, with shortcut hints.
- [ ] Everything reachable by keyboard; visible focus ring; labels on fields.
- [ ] Panel splitters resize; layout sane at 1280×800, 1440×900, 1920×1080.
- [ ] No console errors in View → Toggle Developer Tools during normal use.

### I. Safety and data
- [ ] Open a corrupted/renamed non-project file: clear error, no crash.
- [ ] Real DSLR Booth ZIPs are NOT importable yet (importer is a later phase): confirm nothing claims to import them.
- [ ] No client data appears in `git status`.

### J. Not built yet (expect absent)
DSLR Booth ZIP export (Phase 6B), font embedding, image palette extraction, badge builder, templates.

## 3. Automated suites (optional cross-check)

Built-app suites live in `research/editor-validation/` (see its README). Self-launching: `node research/editor-validation/validate-5d.js` (also `-5c`, `-5b`, `-5a`, `-4b`, `-4c`, `-4d`). `validate.js` needs the app running with the `WALKONE_DEV_*` variables and anti-occlusion flags (see README). Last recorded: 4:97, 4B:40, 4C:97, 5A:53, 5B:39, 5C:59, 5D:40, 6A:48 (`validate-6a.js`, needs python3 + Pillow).

## 4. Reporting issues
For each failure note: steps, expected vs actual, screenshot, OS/version, and whether it reproduces on a fresh `--user-data-dir`. Bring the list to the next session; it becomes the input for fixes before Phase 6.
