# UI/UX Review — Phase 4C (editor redesign and design system)

**Status:** draft for owner review. Everything below is an engineering observation. The visual direction is **not final**: it was reviewed by the implementing assistant from screenshots of the built macOS app (see §9), not by a human designer or the product owner.

## 1. Previous state (end of Phase 4B)

- Default browser controls everywhere (buttons, selects, checkboxes, color input) on a light/white page with a mid-gray canvas; `color-scheme: light dark` made the look depend on the OS.
- A permanent 210 px "Project" rail spent its space on file commands used a few times per session (New, Open, Save As, Close, New Sample, format select, recents) while the tools that are used constantly had no home.
- The top toolbar gave Save, Undo, Redo, Add layer, Duplicate, Delete, Group and Ungroup identical text buttons: no hierarchy, no icons, no tooltips.
- Layers header carried a select, four glyph buttons (⤒ ↑ ↓ ⤓), a filter, a help `<details>`, and the inspector was one long form of full-width "label : control" rows.
- Healthy autosave was verbose in the status bar; recovery was an unstyled box; the empty state was a paragraph of developer prose; keyboard focus styling had never been verified.

## 2. Visual direction

Dark-neutral creative workspace with one restrained accent (blue-violet `#7b8cff`). Canvas surround is the darkest surface, panels one step lighter, floating UI (menus, dialogs) lighter again. The artboard floats via a soft drop shadow and a hairline edge (editor-only Konva nodes on a separate layer; the exact-size render and any future export never include them — verified by the 2400×3600 render check). Accent is reserved for the primary action (Save), selection, focus and the active tool. Warning amber is used for Modified, hidden/locked layer state and autosave issues. Motion is limited to a 110 ms hover/popover fade and a chevron rotation; `prefers-reduced-motion` disables it.

Original identity: a small split-tile brand mark (accent + coral) and the working name only; no WalkOne Entertainment branding inside the editor.

## 3. Layout decisions

| Area | Decision | Why |
|---|---|---|
| File commands | Moved to an in-app **File / Edit / View** menu bar and the welcome screen | Infrequent; one identical implementation on macOS and Windows; native menu stays minimal (ADR-035) |
| Left side | 64 px **icon rail + contextual 224 px drawer**. Only *Design* (add photo placeholder / text / shapes) is live; Templates, Photos, Assets are visibly disabled with "later phase" tooltips | Establishes the future tool architecture without implying unfinished features work. The drawer starts collapsed below 1360 px wide so the canvas keeps its room |
| Top bar | Menus · project name + Modified/Saved dot (+ Autosave-issue badge only when needed) · Undo/Redo icons · **Save** (primary) · Export (disabled) | Clear hierarchy: one primary action, history is compact |
| Right side | **Layers above Properties**, both always visible, each resizable (width: mouse + keyboard; split: mouse + keyboard) | Choosing a layer and editing it is one flow; tabs would hide one half. Option C (resizable split) chosen over A/B. Neither pane drops below ~150 px at the minimum window size (scripted check) |
| Duplicate / Group / Ungroup / Arrange / Delete | Icon actions in the Layers header + Edit menu + shortcuts; not in the top bar | Contextual to layers |
| Status bar | Format/DPI/pixels · selection · (quiet) recovery-copy time only while Modified · Snap and Preview-photos toggles · zoom `− 21% + Fit 100%` | Low noise; healthy autosave is silent |
| macOS chrome | Native title bar kept; content background matches the app so there is no white flash | A custom title bar is risky (drag regions, Windows parity) and buys little now |

Minimum window size is **1100×680**; default 1360×860.

## 4. Component system

Plain React + CSS variables (no UI framework). `src/renderer/src/ui/`: Button, IconButton (label required: accessible name + tooltip + shortcut), Tooltip (portal, 450 ms delay, never carries essential-only info), Menu/MenuBar/MenuButton (role=menu, arrow/Home/End/Escape, hover switching), Dialog shell (focus in, Tab trap, Escape, focus restore), Segmented (radiogroup; built, not yet used in a screen), PanelSection (collapsible, `aria-expanded`), Splitter (role=separator, keyboard), EmptyState. Inputs, selects, checkboxes and sliders are styled classes (`ui-input`, `ui-select`, `ui-check`, `ui-range`). **Selects stay native `<select>`, styled**: full keyboard and screen-reader behaviour for free; the dropdown popup itself remains OS-drawn. Tabs and Badge-as-component were not needed (stacked layout; badge is a class).

## 5. Design tokens

`src/renderer/src/styles/tokens.css`: surfaces (app, panel, elevated, input, canvas surround), text (primary/secondary/muted/disabled), dividers/borders, accent/hover/pressed/selected/focus, warning/error/success, typography scale (app title 13, project title 14, panel/section headings 12, body 13, label/meta/status/tooltip 12, display 26), spacing 4·6·8·12·16·20·24, radii 4·6·10, popover/dialog shadows, control heights, motion. Unit-tested (`designTokens.test.ts`): WCAG AA text contrast on every surface, focus ring ≥ 3:1, no type below 12 px, spacing/radius scale. That test found a real defect (muted text 4.33:1 on elevated surfaces) which was fixed. Konva needs JS colors: `canvasTheme.ts` mirrors accent/guide. One theme ships; a second theme means redefining the variables.

## 6. Workflow changes

- Launch is now a **welcome screen** (New project, Open project…, recent projects as cards with "Opened 3 hours ago"; missing files flagged "File not found" and disabled; no paths shown). *New sample project* appears only in a `#debug` session.
- **New project** is a dialog (name + format with readable labels) instead of a bare rail button with raw preset ids.
- Shortcuts shown in menus/tooltips are all wired and tested: ⌘N, ⌘O, ⌘S, ⇧⌘S, ⌘Z, ⇧⌘Z, ⌘D, ⌘G, ⇧⌘G, ⌘0 fit, ⌘1 100%, ⌘= / ⌘− zoom, ⌫ delete, ⌘]/⌘[ stacking. **Bug found and fixed:** arrow keys on a focused splitter also nudged the selected layer.
- Group opacity stays unexposed (a regression introduced mid-phase by the new Appearance section was caught by the Phase 4 regression script and fixed).
- Layer-panel keyboard help moved from permanent panel text into a *Layer shortcuts* dialog.

## 7. Workflow audit (interaction counts)

Counts are clicks/gestures excluding typing, from a fresh state; "before" is the Phase 4B UI.

| Task | Before | Now | Notes |
|---|---|---|---|
| Create project | 2 (format select + New) | 2 (New → Create; or ⌘N, Enter) | Now also names the project |
| Open project | 1 + native dialog | 1 (button, ⌘O or File ▸ Open) | |
| Open recent | 1 (small list) | 1 (card) | |
| Save | 1 | 1 (Save, ⌘S) | |
| Rename layer | 2 + typing (double-click, Enter) | same (also F2, or inspector name) | |
| Change photo number | 3 (select, click field, type, Enter) | same | |
| Change color | 3 (+ native picker alternative) | 3 (select, hex field, Enter); swatch + picker button secondary | |
| Duplicate layer | 2 | 2 (select, icon or ⌘D) | |
| Hide layer | 1 (always-visible eye) | 1, but the eye is revealed on hover/selection; **hidden layers keep it visible** | Minor discoverability cost |
| Reorder | 1 drag, or select + 1 stacking click | 1 drag, or select + **2** (Arrange menu) or ⌘]/⌘[ | One extra click for stacking: accepted to free header space |
| Edit event text | double-click on canvas + type + Enter | same; inspector Content as alternative | |
| Zoom to fit | 1 | 1 (Fit) or ⌘0 | |

Friction still present: no on-canvas selection toolbar; stacking is a menu; `Export`/`Preview` are inert placeholders; layer rows cannot be dragged into groups.

## 8. Accessibility decisions

Preserved: accessible names on every control, labelled inputs (compact transform fields keep a full sr-only name such as "Width (px)" beside the visible "W"), `aria-selected` tree rows, inline `role=alert` errors. Added/verified: one focus ring for every keyboard-focused control (outline for buttons/menu items, border+ring for inputs); menus (`menubar`/`menu`/`menuitemcheckbox`), dialogs (`aria-modal`, labelled, Tab trap, Escape, focus restore); `aria-pressed` on Snap/Preview/rail; state is never color-only (Modified has the word, hidden/locked have icons and `aria-pressed`, selected rows have an edge bar, tooltips only repeat names); reduced-motion respected; global shortcuts do not fire inside inputs, menus, dialogs, radio groups or separators. The scripted Tab traversal visited ≥ 25 distinct controls and every one showed a ring. Not verified: a real screen reader (VoiceOver), Windows High Contrast, OS text scaling.

## 9. Visual validation performed

Scripted (automation, `validate-4c.js`, 97 checks; Phase 4 regression 97/97; Phase 4B 40/40) plus screenshots captured at 1100×680, 1280×800, 1440×900 and 1920×1080, and the welcome, new-project, editor, text/photo selection, multi-selection, focus-ring, recovery, discard-confirm and autosave-issue states. The assistant looked at the screenshots and made fixes (rail label clipping, rail width, project-summary wrapping, muted text contrast), but **a subjective design judgement has not been made by a person** and the redesign should be treated as an engineering first pass until the owner reviews it on a real display. Screenshots live in `research/editor-validation/shots/` (git-ignored, not committed).

## 10. Remaining visual debt

- Native `<select>` popups, the OS color picker and the macOS title bar are not themed.
- No layer thumbnails (rows reserve a type-icon slot; thumbnails can replace it), no context menu, no on-canvas floating toolbar, no rulers.
- Disabled Templates/Photos/Assets/Export controls are placeholders; wording/behaviour will change when those features land.
- No light theme, no persisted panel sizes, no user-facing keyboard-shortcut sheet beyond the layer-panel dialog.
- The welcome screen is deliberately plain (no template dashboard); the brand mark is a placeholder.
- Panel sizes are not persisted; very small windows (< 1100 px) are prevented rather than adapted.

## 11. Recommendations

1. Owner review of the screenshots on a real display, then a small polish pass (type scale, icon weights, the welcome layout).
2. Add layer thumbnails and a selection context menu when the asset phase gives images worth previewing.
3. Persist panel sizes and drawer state with the recents store.
4. Consider a Windows pass (menu bar, shortcuts shown as Ctrl, DPI scaling) before any Windows build.
5. Replace the placeholder Export/Preview buttons with real ones in their phases rather than leaving inert controls long-term.

## 12. Phase 4D — focused polish (after owner screenshot review)

The approved direction was kept; only observed rough edges were changed.

| Item | Change |
|---|---|
| Label contrast | New `--c-text-label` (`#aaadba`) for field labels, the X/Y/W/H/R tags, derived values and hints: readable (≥ 4.5:1 on every panel surface) but still dimmer than secondary text and brighter than muted text. Token test asserts the ordering |
| Disabled tools | New `--c-text-faint` (`#7f8392`, ≈ 4.5:1 on the app surface) replaces the near-invisible disabled color; icons at 85%; cursor, `aria-disabled` and "later phase" tooltips unchanged |
| Selection | Konva bounding outline is now 1 px at 55% accent; handles and the rotation handle are unchanged (same size, color and hit area) |
| Recovery | Single candidate: footer reads `Discard  ·····  Decide later  [Recover]` (Recover primary and autofocused, Discard quiet and apart, one decision row). Confirming swaps the same row to a note, `Keep` and a red `Confirm discard (cannot be undone)`. Several candidates keep a Discard/Recover pair per item and a single `Decide later` in the footer |
| Layers header | Grouped with hairline dividers: **Add** (accent-tinted) · Duplicate Group Ungroup · Arrange Delete (red hover) · shortcuts (muted). Add and Arrange now have tooltips ("Add layer", "Arrange: stacking order"). No new commands or labels |
| Welcome | Logo 40→56 px, title 26→34 px, subtitle 16 px, wider column (720), top offset scales with window height. Still plain and calm |
| Focus | Reviewed in screenshots: buttons, icon buttons, menu items, list, inputs, selects, checkboxes, slider, splitter. Slider thumb gets a ring in addition to the outline; splitter shows the accent bar in addition to the outline; scripted check still requires a visible ring on every Tab stop |
| Hover/active | Added `:active` states and fast fades for rail, drawer items, menu items; hovered selected rows brighten slightly |
| Slider | Filled accent track (`--pct`), 4 px track on a stronger border color, 16 px thumb with panel-colored rim, hover and focus rings; behavior unchanged |
| Splitters | Hairline at rest; accent bar (70%) on hover/focus |
| Selects, color control, status bar | Reviewed; no change needed (native selects kept; swatch/hex/picker alignment fine; status bar balanced at 1100–1920) |
| Window shrink | **Observed:** shrinking to the minimum with the tool drawer open left the canvas at 491 px. The drawer now auto-collapses when the canvas would drop below 520 px (never reopens by itself); pure rule is unit-tested |

**What was and was not tested.** Automation cannot send real keystrokes or drag the window frame in this environment (macOS refuses System Events keystrokes and window scripting for the app: "not allowed to send keystrokes (1002)", "Can't get bounds of window 1"). Therefore **not performed:** physical Cmd+Z / Cmd+Shift+Z on a keyboard, the red close button, dragging the frame, a physical Cmd+Q keypress. Cmd+Q-equivalent quit (Apple event) and CDP key events were exercised in earlier suites. A continuous layout sweep (21 sizes, 1100→1920 wide) was done by emulating the renderer viewport, which runs the same layout code but is not frame dragging: no overflow, clipping, collisions or panes under 150 px; fit zoom grew monotonically.

Remaining visual issues: native select popups and the OS color picker are unthemed; the welcome column is left-aligned in a wide empty window by design; the Layers header is dense at the 280 px minimum sidebar (everything fits, tooltips carry names); Windows and real-display review still outstanding.
