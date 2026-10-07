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
- **Not built yet:** context menu, rulers, layer thumbnails, panel resizing, final visual design.
