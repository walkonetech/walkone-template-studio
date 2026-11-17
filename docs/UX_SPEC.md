# UX Specification

Sections 1–18 are the original **Proposed** conceptual UX (pre-build); sections 19+ describe what is **implemented**. The **next UI direction** (owner-approved, mockups first) is in §0. Workflows: [USER_WORKFLOWS.md](USER_WORKFLOWS.md). Requirements: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## 0. Next UI direction (owner, 2026-11-16) — Design Guide + Canva-style Editor
- **Start screen** offers both ways in: **Design Guide** (guided) and **Editor** (blank or from a theme), plus Open, Import from dslrBooth and recent projects.
- **Design Guide:** one question per screen with a live preview, conditional steps (see PRODUCT_SPEC §0 for the v2 order); ends with a finished template (export, client proof, fine-tune in the editor).
- **Editor (Canva as UX reference, [../research/CANVA_UX_REFERENCE.md](../research/CANVA_UX_REFERENCE.md)):** left rail with **text-labelled** icons (Photos, Text, Elements, Uploads, Background, Colours, Layers), a panel per category with one big primary action and previews of results; a **contextual toolbar in words** above the canvas (e.g. Frame, Reposition photo, Photo number, Sample photos On/Off); prominent **Export** top right; a "Design ideas" panel and a "Guide me" button.
- **No hidden modes:** anything that changes what the canvas shows (sample photos, crop) has a visible labelled On/Off state. **Much bigger icons, hover help everywhere, colour coding by element kind** (photo slots / text / artwork / canvas) shared by rail, Layers and canvas; clear separation of areas.
- **Safe-area overlay:** visible 2-inch cut and safe lines on strips; live warnings with fixes.
- **Appearance:** Light/Dark setting later (round 1 direction B).
- Round 1–2 mockups were reviewed by the owner (private artifact); more rounds precede the build, which is scheduled after Phase 6C.
- **Two hosts, one UI (ADR-049):** the same Template Studio UI runs standalone and inside WalkOne Booth (future). Inside the booth it opens from an event with the event's context prefilled (name, date, client, venue, format, output profile, company branding, palette) and returns to Event Setup when saved; the Design Guide skips questions the event already answers. Booth-only screens (Event Readiness, Booth Health, sharing/SMS setup) belong to WalkOne Booth, not Template Studio. See [PRODUCT_ECOSYSTEM.md](PRODUCT_ECOSYSTEM.md).

## 1. UX principles
Fast for a single expert operator; readable (no tiny type, no needlessly dense controls); keyboard-friendly; never lose work; show consequences (live preview); explain problems with a path to fix; stay focused on booth templates.

## 2. Home / dashboard
- Primary actions: **New Project**, **Open…**, **Import DSLR Booth ZIP** (implemented: New project, Open project…, Import from dslrBooth…).
- Recent projects grid/list: thumbnail, name, event, format, last modified; missing-file indicator.
- Quick start: recent templates, favorite recipes.
- Empty state: friendly prompt to create first project or import a ZIP.

```
+------------------------------------------------------------+
| WalkOne Template Studio                                    |
| [ New Project ] [ Open ] [ Import DSLR Booth ZIP ]         |
| Recent                                                     |
| [thumb] Smith Wedding   4x6 P  2h ago                      |
| [thumb] Acme Gala       2x6    Yesterday                   |
+------------------------------------------------------------+
```

## 3. New project flow / wizard
Steps: Event Setup → Print Format → Design Direction → Layout → Assets → Customize → Preview → Validate → Export (the global workflow). The wizard covers the first four or five; later steps happen in the editor. Every step is skippable with defaults and re-editable. Step 1 collects event fields; Step 2 picks format/orientation/DPI with computed pixel size shown; Step 3 picks style tags, palette, and freeform brief; Step 4 picks template or recipe or blank layout with photo count.

```
Event Setup > Print Format > Design > Layout > Create
 Format: (•) 4x6 portrait ( ) 4x6 landscape ( ) 2x6 strip ( ) 2-up strip
 DPI:    (•) 300 ( ) 600 ( ) Custom      -> 1200 x 1800 px
```

## 4. Template gallery
Visual grid with filters (event type, format, orientation, photo count, style, color, favorites, recently used), search, live thumbnails rendered with the project's event info and palette. Empty state: "No templates match — clear filters or start blank."

## 5. Editor workspace
```
+--------------------------------------------------------------+
| File  Edit  View | Undo Redo | Zoom 50% | Preview | Export   |
+----------+----------------------------------+----------------+
| Templates|                                  | Layers         |
| Layouts  |            CANVAS                |  Photo 1       |
| Assets   |        (print canvas)            |  Text: Title   |
| Uploads  |                                  |  Background    |
| Text     |                                  +----------------+
| Graphics |                                  | Properties     |
| Badges   |                                  |  X Y W H Rot   |
+----------+----------------------------------+----------------+
| 1200x1800 px · 4x6 in @300DPI · 100% · Preflight: 0E 2W       |
+--------------------------------------------------------------+
```
- **Canvas:** print canvas centered, pasteboard around it, rulers, guides, safe area, optional bleed, zoom/pan, selection handles, smart guides.
- **Left toolbar:** content sources and tools; collapsible panels.
- **Right area:** Layers (reorder, lock, hide, rename, group) and contextual Properties (photo number, frame, text, palette-role colors).
- **Status bar:** pixel size, physical size/DPI, zoom, cursor coordinates, preflight summary, save state.

## 6. Dialogs
New project, open/save, import ZIP (with import report), export (format choices), asset import (category/tags/license note), palette editor, confirm destructive actions, preflight report. Dialogs have clear primary action, Escape to cancel, and no jargon.

## 7. Asset browser
Tabs: Project / Library. Grid with search, category and tag filters, favorite, last used, source/license note. Drag onto canvas; "Save to Library" on project assets. Empty state explains drag-and-drop import and manual download fallback for external providers.

## 8. Badge Builder
Pick style → bound fields prefilled from event info → edit text/colors via palette roles → preview on canvas → place as parameterized BadgeGroup. Editing a bound field in project info updates all badges unless overridden.

## 9. Palette editing
Role-based swatches (Primary, Secondary, Accent, Background, Text, extras); picker + HEX input; saved palettes; extract from logo; changes preview instantly on canvas. Indicator showing which layers reference which role.

## 10. Preview modes
Edit view; **Sample photos** (on/off, shuffle, replace one); **Without placeholders**; **Final print preview** (flattened render as exported). Preview should use the same render pipeline as export (deterministic).

## 11. Preflight
Panel listing Errors (block export) and Warnings (allow with confirmation), each with description, affected layer, and "Select"/"Fix" action. Run on demand and before export.

## 12. Export workflow
**Implemented (Phase 6A, vendor-neutral):** one Export dialog (⌘E): file list with names and sizes (Print sheet / Design / Proof — the layer package was withdrawn after 6A, ADR-041 §8; proof badged "Not for printing"), Checks (preflight summary + items; errors disable Export…), main-owned folder picker, progress, conflict step (Replace / Keep both / Cancel), done step with per-file "Show in Finder/Explorer". DSLR Booth ZIP arrives as another target in 6B. Original plan: Choose target: DSLR Booth ZIP, layer package, flattened PNG, native project. Preflight runs; show summary; choose destination; progress; success with "Reveal in Finder/Explorer." Failures show which step failed and what remains.

## 13. Errors, warnings, empty states
- Errors: what failed, why, what to do; no raw stack traces by default (details expandable).
- Import warnings: itemized list of unsupported/unknown properties; saved with the project (nothing silently dropped).
- Empty states: no projects, no assets, no photo placeholders ("Add a photo placeholder to begin"), no search results.

## 14. Unsaved state & confirmations
Title shows dirty indicator; autosave to recovery location (status: Saved / Modified / Recovery copy saved / Autosave issue); native confirm on every close path with unsaved changes (Save / Don't Save / Cancel); crash-recovery dialog on next launch (temporary functional UI from Phase 4B: `role=dialog`, `aria-modal`, labelled, keyboard operable, Escape = decide later, state never conveyed by color alone; Phase 4C restyles it); confirm deleting library assets in use.

## 15. Keyboard workflows
Proposed defaults (platform-adjusted Cmd/Ctrl): Undo/Redo, Copy/Paste/Duplicate, Delete, arrow nudge (Shift = larger), Save, Zoom in/out/fit, Group/Ungroup, bring forward/back, lock/hide, Space-drag pan, Tab through layers, Escape to deselect. Command palette is **Future Research**.

## 16. Accessibility
Sufficient contrast; visible focus; full keyboard reachability of panels and dialogs; don't rely on color alone for error/warning; scalable UI text; reduced-motion respect; screen reader labels for controls (canvas objects themselves are limited — **Needs Validation** how far to go).

## 17. Typography & readability
Minimum comfortable UI text size (e.g., not below ~12–13px equivalent; **Proposed**); clear hierarchy; adequate spacing; avoid dense icon-only toolbars without labels/tooltips.

## 18. Responsive desktop-window behavior
Minimum window size defined later; panels collapsible and resizable; canvas gets priority; panels collapse to icons on narrow windows; layout persists per user; HiDPI/Retina aware; works on macOS and Windows with platform conventions.

## 19. Phase 4 editor layout and layer management (implemented)
```
┌ toolbar: project name • Modified/Saved · Save · Undo/Redo · Add layer… · Duplicate · Delete · Group · Ungroup ┐
├ project rail ┬──────────── canvas ────────────┬ Layers (tree) ──────────┤
│ New/Open/    │  workspace + print area +      │  filter · stack buttons │
│ Save As/     │  selection handles             ├ Properties inspector ───┤
│ Recent       │                                │  Layer · Position/size  │
├──────────────┴────────────────────────────────┴ type-specific sections ─┤
└ status: 4×6 Portrait • 600 DPI • 2400×3600 px · selection · zoom/fit/100% · Snap · Preview photos ┘
```
- **Layers panel:** top = front. Rows show an icon plus a text type label (screen-reader and tooltip), the name, a small badge (photo number or image role), a visibility button and a lock button. Groups indent their children and have an expand/collapse chevron (editor state only). Hidden or locked *by a parent group* is shown dimmed and described in the button label, distinct from the layer's own flag. Rows are `role=treeitem` with `aria-selected`; the list is a tree with `aria-activedescendant`.
- **Keyboard (panel focused):** Up/Down/Home/End move, Shift extends, Left/Right collapse/expand or go to parent, Enter/F2 renames, L toggles lock, V toggles visibility, Delete deletes. Canvas shortcuts (Delete, arrows, Cmd/Ctrl+D/G/Z/S, Cmd/Ctrl+[ and ]) do not fire while typing in a field; arrow keys navigate the panel instead of nudging when focus is inside it.
- **Rename:** double-click the name (or Enter/F2); Enter commits, Escape cancels, blur commits, empty names are rejected with a message; duplicate names are allowed.
- **Reorder:** drag a row onto the upper or lower half of a sibling (drop line shown); a different group shows a blocked cursor and a message. Stacking buttons: bring to front/forward, send backward/to back.
- **Properties:** shared (name, visible, locked, X/Y/width/height in design pixels, rotation °, opacity %), then Photo (photo number — repeats allowed, fit, corner radius, frame), Image (role, fit, read-only asset filename/pixels/type; never a path), Text (content, font, size, weight, style, align, line height, letter spacing, color), Shape (type, fill, stroke, width, corner radius), Group (derived read-only bounds only). Multi-selection shows only common controls (visible, locked, opacity, duplicate, group, delete). Nothing selected shows a project summary.
- **Numeric fields:** typing never commits partial values; Enter/blur commits; Escape restores; invalid input shows an inline alert and keeps the old value; negative X/Y and decimals are accepted; width/height must be positive.
- **Color field:** hex text plus a native picker for literal colors; a palette-linked color is shown as such and only changes through the explicit "Use fixed color" button.
- **Not built yet:** context menu, rulers, layer thumbnails, final visual design (Phase 4C delivered a first design system; see §20).

## 20. Phase 4C — redesigned editor (implemented)
Full rationale, measurements and remaining debt: [../research/UI_UX_REVIEW.md](../research/UI_UX_REVIEW.md); decision record: ADR-035.
- **No project:** a welcome screen (New project, Open project…, recent-project cards with relative time, "File not found" for missing files). No rail, side panels or canvas exist in this state.
- **Top bar:** File / Edit / View menus; project name with a Modified/Saved dot (and an "Autosave issue" badge only when autosave is failing); Undo/Redo icons; primary **Save**; disabled Export placeholder.
- **Left:** 64 px tool rail (Design live; Templates, Photos, Assets visibly disabled) and a 224 px drawer for the active tool (collapsed by default below 1360 px wide).
- **Right:** Layers above Properties, each with collapsible/resizable regions; width and split resizable by mouse and keyboard (UI-only, never marks the project Modified).
- **Layers rows:** type icon, name, photo-number/role badge, hover-revealed visibility and lock toggles (kept visible when hidden/locked, warning color), selected row highlight with an edge bar, inherited-state dimming; header actions Add, Duplicate, Group, Ungroup, Arrange, Delete, Layer shortcuts.
- **Properties:** collapsible sections (Layer, Transform, Appearance, type-specific). Transform uses compact X|Y, W|H, R cells; opacity is a slider plus an exact field; color is swatch + hex + picker button (palette links shown with "Use fixed color").
- **Status bar:** format/DPI/pixels, selection, quiet recovery-copy time while Modified, Snap and Preview-photos toggles, zoom `− % + Fit 100%`.
- **Dialogs:** New project, Recovery ("We found unsaved work from a previous session" — Recover / Discard (confirm) / Decide later), Layer shortcuts; one accessible shell. Native unsaved-changes prompts remain native.
- **Shortcuts (menus and tooltips show them):** ⌘N, ⌘O, ⌘S, ⇧⌘S, ⌘Z, ⇧⌘Z, ⌘D, ⌘G, ⇧⌘G, ⌘0 fit, ⌘1 100%, ⌘= / ⌘− zoom, ⌫ delete, ⌘] / ⌘[ stacking (Ctrl on Windows).
- **Window:** minimum 1100×680, default 1360×860.

## 13. Project assets (Phase 5A, implemented)
- **Assets tool** (rail, enabled) opens a drawer: **Import files…** (native picker, multi-select), a one-line format hint, then **Project assets (n)** as cards: thumbnail (checkerboard behind transparent art), file name, `W×H · TYPE`, and "Used by N layers" / "Not used". Card actions: **Add** (to canvas), **Background**, **Remove** (refuses with an explanation while used). Double-click a card, or drag it onto the canvas, to add it. Absolute paths are never shown.
- **Drag and drop (exact behaviour):** image files dropped **on the canvas** are imported *and* added as ImageLayers centred on the drop point (design coordinates, correct at any zoom/pan; several files are offset 48 px each); files dropped **on the Assets drawer** are imported into the project only (no layer). Non-image files are ignored with a message. Dropping elsewhere does nothing (the window never navigates).
- **Design tool → Background:** canvas colour (existing colour field) and the background image (fit: Fill/cover, Fit inside/contain, Original size; Change…, Remove). Background images are locked by default; unlock in the Layers panel to adjust.
- **Image inspector:** Role (Background, Overlay, Frame art, Badge, Logo, Graphic), fit, asset file name, source px, displayed px and inches, **print quality** (effective DPI with Good for print ≥300 / Check quality 150–299 / Low resolution <150; vectors: "sharp at any size"), and Set as background · Original size · Replace image… (this layer only).
- **Preview photos** (status bar) is disabled with an explanatory label until sample photos exist (Phase 5C).

## 14. Photo strips and print composition (Phase 5B, implemented)
- **New project:** name, **Print type** (4×6 Photo | 2×6 Photo Strip), Orientation (4×6 only), Resolution (300 | 600 DPI) and an info box: for strips "Design one 2×6 strip. Template Studio will place two identical copies on the 4×6 print sheet. Printer finishing: configure DSLR Booth and your printer for the 2-inch center cut." plus design and sheet sizes in pixels. Terms: Design size, Print sheet, Copies per sheet, Print Preview, 2-up, Center cut.
- **Design | Print Preview** radiogroup (top-left of the workspace; Arrow keys switch; only for projects with several copies per sheet; ordinary 4×6 projects show no switch). Design edits the single strip; Print Preview shows the 4×6 sheet with every copy, a dashed cut line labelled "2-inch cut", "Copy 1/2" chips, read-only. Switching never marks the project Modified. View menu has the same two commands.
- **Status bar:** Design "2×6 Strip • 600 DPI • Design 1200×3600 px"; Print Preview "4×6 Output • 2-up • 2400×3600 px". Properties → Project shows Design size, Print sheet, Copies per sheet and the printer guidance.
- **Selection position:** a multi-selection shows Selection position X/Y (exact, moves everything together; W/H shown, not editable) ; a group's X/Y moves the group. **Align and distribute** (Properties and the new Align menu): align left / horizontal centers / right / top / vertical centers / bottom to the selection or the canvas, distribute horizontally/vertically (three or more layers).
- **Arrow keys** nudge 1 design px (Shift 10) regardless of zoom.

## 15. Photo preview, precision canvas and tooltips (Phase 5C, implemented)
- **Artboard vs workspace.** The artboard is the white page; the surrounding dark area is workspace. **Show overflow** (default, status bar button and View menu) keeps artwork that extends past the artboard visible (slightly dimmed by an editor-only mask) and fully selectable/transformable. **Clipped view** (same control, label changes) shows only the printable artboard. Neither is document state: no Modified, no history, no output change. Exact renders, Print Preview and every two-up copy always clip to the artboard/cell.
- **Zoom (2%–400%).** Status bar: Zoom out, current %, Zoom in, Fit, 100% (also View menu, ⌘/Ctrl + `+`, `−`, `0`, `1`). Ctrl/Cmd + wheel (and trackpad pinch) zooms about the pointer, plain wheel pans. Works in Design and Print Preview. Zoom/pan never touch the project.
- **Space pan.** Hold Space and drag: hand cursor, pans, restores on release. Ignored while typing (inputs, selects, text editing) and when a focused button would otherwise be activated unless the pointer is over the workspace.
- **Resize snapping (Canva-style).** While dragging a resize handle (Snap on), the moving edge snaps to the canvas edges/centre and other objects' edges/centres, or so the box gets the same width/height as another object; pink dimension bars mark every object sharing that size. Ratio-locked corner handles snap the closest axis and keep the opposite corner fixed. Skipped for rotated boxes and Alt/Option centred scaling.
- **Shift-constrained drag.** While dragging one layer, a multi-selection or a group, hold Shift: movement locks to the dominant axis once the pointer has travelled 6 screen pixels (below that nothing moves, so jitter cannot flip axes); the lock holds until Shift is released (then movement is free; Shift again re-decides). Snapping runs after the lock and can only adjust the free axis. No clamping (works past the artboard). One gesture is one undo step. Arrow = 1 design px, Shift+Arrow = 10 (unchanged). Shift-pressing an already selected layer toggles its selection only if released without dragging.
- **Cursors:** move over editable layers, hand for Space-pan, move in Reposition mode, resize/rotate on handles. State is also shown with labels/pressed states, not cursor alone.
- **Tooltips.** One system (`ui/Tooltip`): title + shortcut + one-sentence hint, after a 450 ms hover or on keyboard focus. Command tooltips derive hint and shortcut from the command model; other controls use `editor/tooltips.ts`. Coverage: top bar, tool rail (including disabled tools), Layers actions, status bar (snap, overflow, preview, shuffle, zoom, Fit, 100%), align/distribute, photo tools.
- **Preview Photos** (status bar, View menu, Photo properties): OFF shows numbered placeholders (layout engineering); ON shows sample pictures by PhotoNumber with a small editor-only "#n" tag; never in exact renders. **Sample photo** section: choose built-in sample, Shuffle, Reset samples, **Choose photo…** (a picture from your computer, session-only preview, not saved or added to Project Assets). Fit: Cover, Contain (Stretch ignores crop). **Reposition…** (or double-click a photo): drag the picture inside its fixed frame, zoom 1–4× with the bar, Reset position, **Done**/Enter keeps, Escape cancels. Frame: None/Solid, colour, thickness, corner radius (both capped at half the shorter side; design pixels, DPI-independent); shadows are not available yet.

## 16. Typography and Event Palette (Phase 5D, implemented)
- **Typography inspector (text layer):** *Text* (content, style preset), *Typeface* (font picker, weight, style), *Size & spacing*, *Alignment & color* (Left/Center/Right radio buttons with labels; Fixed or Palette colour), *Text box* (width, height, **Fit height to content**).
- **Font picker:** a combobox: click or Tab in to open, type to search (case-insensitive substring), ↑/↓ move, Enter chooses, Esc closes without changing anything; rows are drawn in their own typeface, 60 at a time with "Show more"; generic families are listed; an uninstalled current font stays in the list tagged "not installed"; a name that matches nothing is offered as "Use “name”" so any family can be requested. If installed fonts cannot be listed the list says so and offers common fonts plus the project's own.
- **Missing font:** under the picker, "Not installed here: showing a fallback"; a "Font unavailable" card repeats the requested name, explains that a fallback is displayed and the project still asks for it, and offers **Replace with…** with **Replace on this layer** and **Replace all uses (n)**. Nothing is replaced automatically. The state is text and an icon, not colour alone.
- **Fonts in this project** (Design drawer): "N fonts used, M missing", each font in its own typeface with ✓ / ⚠ / ? and its use count; missing ones have **Replace…**.
- **Event palette** (Design drawer): one row per colour (swatch, name, "Used by N"/"Not used", remove, hex field + picker; custom colours also have a Name field); "Add basic colors" when the palette is empty; an Add control (role or custom). Removing a used colour is refused with the reason.
- **Linking:** every colour field has a "Fixed color" ↔ "Palette: Name (#hex)" chooser; a linked field says "Linked to **Accent** (#c6a45d)", lets you pick another entry, and has **Use fixed color**. Applies to text colour, shape fill and stroke, photo frame colour and the canvas background (not to images).
- **Tooltips:** Fit height to content, Use palette color, Use fixed color, Replace all uses, Remove color.

### Photo placeholders keep their shape (Phase 5D follow-up, Confirmed owner request)
A photo placeholder's aspect ratio is locked on the canvas: only the four corner handles are shown and they scale uniformly (side handles are hidden). A selection that includes a photo also scales uniformly from the corners. The Width and Height fields in the inspector keep the ratio as well (editing one updates the other). Changing a photo's shape is therefore not possible in the editor; add or duplicate a photo to get a different shape. No schema change.

## 17. Export and import dialogs (Phases 6A, 6B, 6D, implemented)
- **Export (⌘E):** files grouped **For dslrBooth** (template · 2×6 strip ticked; template · 4×6 sheet for strips) and **Images** (Print, Design, Proof "Not for printing"); a Checks list (errors block, warnings allow, notes inform; dslrBooth-only checks tagged); folder picker, Replace / Keep both on conflicts, Show in Finder/Explorer.
- **Import dslrBooth template:** dslrBooth's own preview beside the facts (template name, size and DPI, photos per session, pictures); for two-strip sheets a choice **One 2×6 strip, printed two per sheet** (Recommended when the copies match) / **The 4×6 sheet exactly as it is**; "What to know" notes for the chosen layout; Cancel / Choose another… / Import. A ZIP that is not a template shows "This template could not be imported" with the reason and Choose another….
