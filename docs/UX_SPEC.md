# UX Specification

All content is **Proposed** conceptual UX; no visual code exists. Wireframes are ASCII and illustrative only. Workflows: [USER_WORKFLOWS.md](USER_WORKFLOWS.md). Requirements: [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

## 1. UX principles
Fast for a single expert operator; readable (no tiny type, no needlessly dense controls); keyboard-friendly; never lose work; show consequences (live preview); explain problems with a path to fix; stay focused on booth templates.

## 2. Home / dashboard
- Primary actions: **New Project**, **Open…**, **Import DSLR Booth ZIP**.
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
Choose target: DSLR Booth ZIP, layer package, flattened PNG, native project. Preflight runs; show summary; choose destination; progress; success with "Reveal in Finder/Explorer." Failures show which step failed and what remains.

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
