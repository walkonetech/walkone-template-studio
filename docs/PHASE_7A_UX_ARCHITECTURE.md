# Phase 7A — Template Studio UX Architecture and Editor Refresh Audit

_Status: **planning document, complete for owner review (2026-11-19).** Nothing here is implemented. This is the authoritative UX architecture for the refresh. Phase 7B (editor/shell refresh) and Phase 7C (Design Guide) start only after the owner approves it. Decision record: ADR-054 (dual entry, Accepted). The layout proposals in this document are **Proposed** until the owner approves them, and the open decisions in §43 stay open._

**Labels used:** **Confirmed** = owner decision, or observed in the built app or in validation. **Proposed** = recommendation in this document. **Assumption** = not measured yet. **OPEN** = the owner decides.

**Inputs reviewed:**
- research/UI_UX_REVIEW.md (4C/4D) and research/CANVA_UX_REFERENCE.md;
- docs/UX_SPEC.md §0–§20 and the later sections, and docs/ROADMAP.md "GUI mockup rounds" (owner feedback; round 1–2 outcomes);
- PRODUCT_SPEC §0, PRODUCT_ECOSYSTEM §10–§12, DECISIONS ADR-035/038/041/044/046/049/052/053;
- research/PHASE_6C_RESULTS.md (Windows findings, W6), docs/CURRENT_STATE.md (known limits per phase);
- the owner's Output Profiles Windows-validation findings (7A brief);
- the current renderer code (`src/renderer/src/editor`, `ui/`, `styles/`, `src/editor/{commands,tools,layout}.ts`).

The round 1–2 mockups are a private owner artifact and were not available here. Their recorded decisions (ROADMAP, PRODUCT_SPEC §0) were used.

---

## 1. Executive summary

Template Studio has grown from a layer editor into a production tool:
- precise editing;
- sample photos and crop;
- fonts and the Event Palette;
- 2×6 strips with a derived two-up sheet;
- Print Preview;
- export to PNG and dslrBooth;
- dslrBooth import, including live text;
- Output Profiles and Safe Areas.

The Phase 4C shell (dark workspace, rail and drawer, Layers above Properties, status bar, one command model, token-driven styles, an accessible dialog shell) is a sound base and **survives**. What does not scale is how information is arranged around it:
- **Too much in one column.** The inspector, the Export dialog and the Output Profile dialog each grew one section per phase. On a 1426×779 laptop viewport, or 1920×1080 at 125 %, the important parts sit below the fold.
- **View state is scattered.** Sample photos, safe areas, overflow and snap are small icon toggles in the status bar. Design / Print Preview sits on the canvas. The output profile is a status chip. This is the "hidden modes" problem the owner reported in the first manual test.
- **Checks live in three places**, with three presentations: the Export dialog, the Output Profile dialog and the status-bar count. Vendor detail (ZIndex ties, units, sourceCompatibility) shows at the same level as beginner-relevant warnings.
- **The rail is mostly placeholders.** Only Design and Assets are live, and "Design" is a vague name for a drawer that holds add-element buttons, the background, the palette and the font inventory.
- **No theme architecture** for the approved Light/Dark setting. Evidence badges use one amber tone for four different meanings.

**The architecture in one paragraph (Proposed).**
- **Two ways in, one project (ADR-054).** A Start screen offers *Guided design* (Design Guide, 7C), *Blank design* (Full Editor), *Import dslrBooth template* and recent projects. The New Project format choice becomes step 1 of the Guide, so both paths start the same way and produce the same `TemplateProject`.
- **The editor keeps four regions:**
  - top bar: document-level actions;
  - left rail: labelled categories that open drawers;
  - canvas: with a **view bar** above the artboard that shows every view state in words;
  - right column: Properties and Layers. It stacks on tall screens and becomes tabs on short ones.
- **Status bar** keeps facts (size, zoom, save state, checks count).
- **Checks** become one model with one presentation: severity first, topic second, vendor detail behind "Details".
- **Dialogs** get one sizing and scrolling contract, with a pinned summary and a sticky footer, so no primary action is ever below the fold.
- **Tokens** become three layers (primitives → semantic → component), so Light mode in 7B is a token set rather than a rewrite.
- **Evidence** gets four visual tiers, each with an icon, a word and a tone, instead of seven amber badges.

---

## 2. Product UX principles

1. **One project, two ways in.** The Guide and the Editor read and write the same `TemplateProject`. There is no simple or advanced project and no conversion step.
2. **No hidden modes.** Anything that changes what the canvas shows or how input behaves has a visible, labelled state in words, next to the canvas. Examples: sample photos, safe areas, overflow, Print Preview, crop, text editing. (Confirmed, owner, round 1.)
3. **Labels before icons.** Icon-only controls are reserved for universally known actions (undo, redo, zoom, delete, visibility, lock). Every icon control still has an accessible name and a tooltip.
4. **The canvas is the hero.** Panels serve the canvas. The canvas keeps a minimum working area (§30) and panels collapse before it shrinks below that.
5. **Show consequences and give a path to fix them.** A warning names the layer, says what will happen, and offers *Select*, and *Fix* where one exists.
6. **Progressive disclosure by relevance, not by user type.** There is no beginner/expert switch. Rarely needed and vendor-specific information sits one click deeper (matrix in §8.3).
7. **Physical truth first.** Sizes, margins and cuts are shown in physical units (in / mm) alongside pixels. Printer facts carry their evidence.
8. **Calm, professional density.** Dense where experts work (inspector, layers). Generous where decisions are made (Start, Guide, Export). Never tiny: text at least 12 px and hit targets at least 24 px.
9. **Preserve semantics.** The refresh may move controls but never changes what they do (§40, "Must not change").
10. **Platform-correct.** Ctrl on Windows and ⌘ on macOS, from one source. Native file dialogs and native unsaved-changes prompts.

## 3. User types

| User | Needs | Primary path |
|---|---|---|
| Owner/operator (expert) | Speed, precision, keyboard, dslrBooth round trips, printer truth | Full Editor; Import dslrBooth |
| Internal designer | Creative control, typography, assets, palette, proofs | Full Editor (Guide for a fast start) |
| First-time / occasional staff | A finished, correct template without design skills | Design Guide → Review → Export |
| Booth staff (at the booth PC) | Check and export an existing template, swap words or colours | Recent → Open → small edits → Export |
| Event client (**never in the app**) | Look at a proof; approve or request changes | Proof file/link only (future) |

## 4. Existing UI strengths (keep)

- **One command model** (`editor/commands.ts`) drives menus, tooltips, shortcuts and enablement, so nothing drifts. Platform-aware shortcut labels are already correct on Windows (6C: "Ctrl+ shortcut labels", Pass).
- **The token-driven dark theme** is unit-tested for contrast (`designTokens.test.ts`). Changing it is a token change, not a component rewrite.
- **The accessible primitives** (`ui/`) are solid: Dialog (focus trap, Escape, restore), Menu/MenuBar, Tooltip with shortcut and hint, IconButton with a required label, Splitter (keyboard), PanelSection (aria-expanded), Segmented (radiogroup).
- **Layers panel quality:** tree semantics, inherited lock and hidden states, keyboard model, rename, drag reorder.
- **Inspector field behaviour:** draft-then-commit, Escape restores, inline errors, compact X/Y/W/H/R.
- **Canvas precision:** snapping including resize and same-size, Shift-constrained drag, Space-pan, zoom from 2 to 400 % around the pointer, nudge in design pixels.
- **Honest state:** Modified/Saved in words, a quiet autosave, a clear recovery dialog, "Not for printing" on the proof, a font-missing card with an explicit Replace.
- **Editor-only overlays never leak into output.** This covers overflow masks, cut lines, safe areas and sample photos (verified by suites).
- **Windows readiness:** crisp at 125 %, native dialogs, Explorer reveal, fonts enumerated (6C Stage 1).

## 5. Existing UI problems

| # | Problem | Evidence |
|---|---|---|
| P1 | **Inspector length.** A text layer shows 8 sections: Layer, Transform, Appearance, Text, Typeface, Size & spacing, Alignment & color, Text box. A photo slot shows 5–6. On short screens the frequently used controls are 1–2 scrolls down. | Code; W6 (align below the fold, patched locally); Windows "short-height inspector" |
| P2 | **Right column split is fixed.** Layers takes about 40 % even when the user is only editing properties. At 779 px tall the inspector gets about 400 px. | `layout.ts` LAYERS_SPLIT_DEFAULT 0.4 |
| P3 | **Export dialog is vertically crowded:** Files (2 groups) + Output profile row + Checks list + progress/error in one scrolling body. | Windows: profile row and Output checks below the fold at 1920×1080 / 125 % |
| P4 | **View state hidden in the status bar:** Snap, Overflow, Safe areas, Preview photos, Shuffle are 16 px icon toggles. | Owner first test (sample photos not understood); UX_SPEC §0 |
| P5 | **Checks are fragmented:** Export checks, Output Profile checks, status-bar warning count and font inventory each format items differently. Vendor notes sit next to beginner warnings. | Code (CheckList shared, but three hosts) |
| P6 | **Evidence badges** are mostly one amber treatment for Observed, Inferred and Provisional. Nominal and Unknown are not clearly different. Colour carries too much meaning. | Windows finding |
| P7 | **Developer copy in user UI:** the profile notes include "Source: research/PHASE_6C_RESULTS.md … update this file; no code change is needed". The provisional info sentence reads awkwardly ("comes from Windows 11 research laptop … (2026-11-17)"). | Windows finding; profile JSON |
| P8 | **Rail is mostly placeholders:** Templates and Photos are disabled. "Design" mixes add-elements, background, palette and font inventory. | `tools.ts` |
| P9 | **Mode indicators are inconsistent:** Design/Print Preview is a segmented control at the top left of the canvas; crop has its own bar; text editing has none; Safe areas has a legend chip under the artboard. | Code |
| P10 | **Welcome screen is plain and left-aligned.** It has no place for the Guide, templates or recovery status. | UI_UX_REVIEW §10 |
| P11 | **No theme architecture:** tokens are a single flat set. Konva colours are mirrored by hand in `canvasTheme.ts`. | ADR-035 |
| P12 | **Panel sizes are not persisted.** Very small windows are prevented rather than adapted. | UI_UX_REVIEW §10 |
| P13 | **Colour editing:** OS picker plus hex field. The palette is in the drawer, far from the colour field it feeds. | UX_SPEC §16 |
| P14 | **Safe Areas tooltip/title:** the status-bar toggle's tooltip and title don't say what the overlay is or that it never prints. | Windows finding |
| P15 | **Save is the primary button**, although autosave protects work. The outcome action (Export) is a ghost button. | TopBar.tsx; Canva reference |
| P16 | **Disabled placeholders and inert tools** are used to "establish layout". This is acceptable for a prototype, but it reads as unfinished. | UI_UX_REVIEW §11.5 |

---

## 6. Prior refresh review — what was found

Earlier UI/UX direction exists in six places. All six were read and classified in §7:
1. **Phase 4C/4D review** (research/UI_UX_REVIEW.md §10 "Remaining visual debt", §11 "Recommendations", §12 4D polish).
2. **Canva UX reference** (research/CANVA_UX_REFERENCE.md, owner direction 2026-11-16).
3. **UX_SPEC §0** "Next UI direction" (Design Guide + Canva-style Editor, no hidden modes, bigger icons, colour by kind, Light/Dark later, two hosts).
4. **ROADMAP "GUI mockup rounds"**: owner feedback from the first manual test, the round 1 hybrid, Guide v2 order, the round 2 decisions (who uses it, the automatic safe-area check, event themes, conditional steps), "Design ideas" and "Guide me".
5. **The original conceptual UX** (UX_SPEC §2–§18): home, wizard, gallery, editor workspace, asset browser, Badge Builder, palette, preview modes, preflight panel, responsive rules.
6. **Validation findings:** 6C W6 (align below the fold), the Windows Output Profiles findings (7A brief), and the per-phase known limits in CURRENT_STATE.

## 7. Carry forward / revise / retire matrix

| # | Prior item (source) | Class | Decision in 7A | Phase |
|---|---|---|---|---|
| 1 | Owner review of 4C screenshots, then a polish pass (4C §11.1) | ALREADY SOLVED | Done in 4D | — |
| 2 | Replace placeholder Export/Preview buttons (4C §11.5) | ALREADY SOLVED | Export (6A), Print Preview (5B) are real | — |
| 3 | Windows pass: Ctrl labels, DPI scaling (4C §11.4) | ALREADY SOLVED / REVISE | Labels and 125 % confirmed in 6C. Still to add: Alt-key menu access, Ctrl+Y redo, scrollbar styling, forced-colors (§31) | 7B P0/P2 |
| 4 | Persist panel sizes and drawer state (4C §10/§11.3; UX_SPEC §18) | CARRY FORWARD | Part of the responsive shell (§30) | 7B P0 |
| 5 | Very small windows prevented, not adapted (4C §10) | REVISE | Keep 1100×680 minimum; add width/height tiers (§30) | 7B P0 |
| 6 | Layer thumbnails (4C §10/§11.2) | CARRY FORWARD | Replace the type icon with a 24 px thumbnail and a kind colour edge | 7B P2 |
| 7 | Selection context menu (4C §10/§11.2) | CARRY FORWARD | Same commands as the contextual toolbar and Edit/Arrange menus | 7B P2 |
| 8 | On-canvas floating toolbar (4C §7, §10) / contextual toolbar in words (Canva ref §3) | CARRY FORWARD | Selection toolbar above the selection (§17) | 7B P1 |
| 9 | Stacking needs an extra click (4C §7) | REVISE | Arrange in the contextual toolbar and context menu; shortcuts unchanged | 7B P1/P2 |
| 10 | Disabled Templates/Photos/Assets placeholders (4C §3, §10) | RETIRE (pattern) | No disabled placeholder categories. A category appears when it works. "Photos" becomes a real drawer (photo slots + sample photos) | 7B P1 |
| 11 | Native `<select>` popups unthemed (4C §10) | DEFER | Keep native selects (free a11y). Custom popovers only where the content needs it (font, colour) | 7B P3 |
| 12 | OS colour picker unthemed (4C §10) | REVISE | In-app colour popover: Event Palette first, then document colours, then hex/picker (§22) | 7B P1 |
| 13 | Rulers; cursor coordinates (4C §10; UX_SPEC §5) | DEFER | Not needed for booth templates yet | Future |
| 14 | Light theme (4C §10; ROADMAP round 1 direction B; PRODUCT_SPEC §0) | CARRY FORWARD | Token architecture P0, Light set P1 (§33) | 7B |
| 15 | Keyboard-shortcut sheet (4C §10) | CARRY FORWARD | Help › Keyboard shortcuts, generated from the command model (replaces the Layer shortcuts dialog) | 7B P2 |
| 16 | Welcome deliberately plain, left-aligned (4C §10, 4D) | REVISE | Start hub (§10) | 7B P0 (structure), 7C (Guide card) |
| 17 | Brand mark placeholder (4C §2) | DEFER | Owner branding decision (§43 D12) | Future |
| 18 | Labelled rail icons (Canva ref §1; UX_SPEC §0) | CARRY FORWARD | Icon + label in the rail, always (§15) | 7B P1 |
| 19 | Panel per category with one big primary action and previews of results (Canva ref §2) | CARRY FORWARD | Drawer anatomy (§15) | 7B P1 |
| 20 | Per-page toolbar above the artboard (Canva ref §4) | REVISE | Becomes the **view bar** (mode + view toggles in words), not page actions (one artboard per project) | 7B P0 |
| 21 | Prominent Export top right (Canva ref §5; UX_SPEC §0) | CARRY FORWARD | Export becomes the primary button; Save stays visible with its state (§14, D1) | 7B P1 |
| 22 | Light, calm workspace (Canva ref §6) | REVISE | Delivered through the Light/Dark setting, not by changing the default | 7B P1 |
| 23 | Colour-coding by element kind, shared by rail/Layers/canvas (Canva ref; UX_SPEC §0; ROADMAP feedback) | CARRY FORWARD / REVISE | Kind colours in rail, Layers and inspector header. **Not** for canvas selection, which keeps the accent so status colours stay unambiguous (§34) | 7B P1 |
| 24 | "Much bigger icons" (ROADMAP feedback) | REVISE | Bigger where people choose (rail 22 px icon + label; drawer tiles; Start cards); compact 16 px in dense expert panels with names and tooltips | 7B P1 |
| 25 | "Hidden modes are confusing"; sample photos visible On/Off (ROADMAP feedback; UX_SPEC §0) | CARRY FORWARD | View bar (§17); slot vs sample distinction (§21) | 7B P0 |
| 26 | Hover help everywhere (ROADMAP feedback) | ALREADY SOLVED / REVISE | Tooltip system exists (5C). 7B audits coverage and adds keyboard-reachable help (§35) | 7B P2 |
| 27 | Clear separation of areas (ROADMAP feedback) | CARRY FORWARD | Surface hierarchy (§33–§34) | 7B P1 |
| 28 | "Design ideas" panel in the editor (UX_SPEC §0; ROADMAP) | DEFER | Needs event themes / recipes; the rail slot is reserved, not shown | 7C+ |
| 29 | "Guide me" button in the editor (ROADMAP) | CARRY FORWARD | Re-enter the Guide for its non-destructive steps (§38) | 7C |
| 30 | Design Guide v2 order and conditional steps (PRODUCT_SPEC §0; ROADMAP) | CARRY FORWARD | Architecture in §38; build in 7C | 7C |
| 31 | Event themes (save a design's choices as a preset) (ROADMAP round 2) | DEFER | Start-screen "Start from a theme" appears when themes exist (§10) | Future (after 7C) |
| 32 | Original wizard: Event Setup → Format → Design → Layout → … (UX_SPEC §3) | SUPERSEDED | By Design Guide v2 (format first) | — |
| 33 | Template gallery with filters (UX_SPEC §4) | DEFER | Needs a template/theme library | Future |
| 34 | Asset browser tabs Project / Library (UX_SPEC §7) | REVISE | Uploads drawer with scopes *This project · Library · Company* (§16) | Future (library) |
| 35 | Badge Builder (UX_SPEC §8) | DEFER | Not in 7B/7C | Future |
| 36 | Palette: saved palettes, extract from logo (UX_SPEC §9) | DEFER | Guide colours step may suggest palettes from a logo later | Future |
| 37 | Preview modes "Without placeholders" / "Final print preview" (UX_SPEC §10) | REVISE | Covered by sample photos Off + Print Preview; "as exported" preview = Proof preview (§37) | 7B (labels) |
| 38 | Preflight panel with Select/Fix (UX_SPEC §11) | CARRY FORWARD | Checks panel (§25). Select in 7B; Fix actions later | 7B P0 (Select), future (Fix) |
| 39 | Safe-area check with fixes (ROADMAP round 2) | ALREADY SOLVED (check) / CARRY FORWARD (fixes) | v1 shipped (ADR-053); fixes ("Move inside safe area") later | Future |
| 40 | Command palette (UX_SPEC §15) | DEFER | Ctrl/⌘+K; built on the command model | 7B P3 |
| 41 | Layer package in Export (6A) | RETIRE | Already withdrawn (ADR-041 §8); stays out of the UI | — |
| 42 | Project rail of file commands (pre-4C) | RETIRE | Already replaced by menus + Start screen | — |
| 43 | Align row below the fold (6C W6) | ALREADY SOLVED (locally) / REVISE | Generalised by the inspector IA (§19) | 7B P0 |
| 44 | Output Profile Windows findings (fold, badges, dev note, copy, Safe Areas tooltip) | CARRY FORWARD | Solved structurally in §23–§26, not patched one by one | 7B P0 |
| 45 | Recovery dialog (4B/4D) | ALREADY SOLVED | Keep; adopt dialog contract v2 | 7B P0 (contract) |
| 46 | Native unsaved-changes prompts (ADR-034) | ALREADY SOLVED | Keep native | — |
| 47 | Two hosts, one UI; Booth opens the editor with event context (UX_SPEC §0; ADR-049) | CARRY FORWARD | Shell regions are host-agnostic; the Start hub is standalone-only (§39) | Future |
| 48 | Phase 17 "UX polish / onboarding" (historical roadmap) | REVISE | Onboarding = Start hub "Learn" + empty states + Guide, not a tour | 7B P2 / 7C |
| 49 | Selects stay native (ADR-035) | CARRY FORWARD | Unchanged | — |
| 50 | Drag into / out of groups (Phase 4 limits) | DEFER | Not UX-architecture blocking | Future |

---

## 8. Information architecture

### 8.1 Top-level surfaces
```
Start (standalone only)
├─ Guided design ─────────► Design Guide (7C) ──► Review ──► Editor (optional) ──► Export
├─ Blank design ──────────► New Project (format) ──► Editor
├─ Import dslrBooth… ─────► Import dialog ──► Editor
├─ Open… / Recent ────────► Editor
└─ (later) Start from a theme / template

Editor
├─ Top bar ........ document: menus, title + save state, undo/redo, Checks, Save, Export
├─ Left rail ...... add & source things: Elements, Text, Photos, Uploads, Colors, (Brand), (Themes)
├─ Canvas ......... view bar (mode + view toggles) · artboard · selection toolbar · temporary-mode banner
├─ Right column ... Properties (selection or project) · Layers
└─ Status bar ..... facts: size/DPI · save/recovery · checks count · output profile · zoom

Dialogs / sheets: New Project, Import, Export, Output Profile, Settings, Recovery, Shortcuts
```

### 8.2 Where each concept lives (single home + quick access)

| Concept | Home | Quick access |
|---|---|---|
| Format / DPI / composition | Properties › Project (no selection) | Status bar (read-only facts) |
| Event Palette | Colors drawer | Every colour popover (§22) |
| Background colour/image | Colors drawer › Background | Properties › Project |
| Fonts used in project | Text drawer › Fonts in this project | Font picker, Checks |
| Sample photos | Photos drawer | View bar toggle, photo slot inspector "Preview" box |
| Output profile | Settings › Printing (default) + Output Profile dialog | Status-bar chip, Export summary, view-bar Safe areas menu |
| Checks (preflight) | Checks panel | Top-bar Checks button, status count, Export summary |
| dslrBooth compatibility notes | Checks › Details; Properties › "Compatibility" (collapsed) | — |

### 8.3 Visibility matrix (beginner vs power user)

| Tier | Rule | Examples |
|---|---|---|
| **Always visible** | Needed in most sessions | Title + save state, Undo/Redo, Export, Checks count, Design/Print Preview (strip projects), Sample photos and Safe areas toggles, zoom, rail labels, selected layer's essentials |
| **Progressively disclosed** | One click, shown with a summary | Transform details, frame styling, spacing/line height, text box behaviour, opacity, palette linking, the profile's per-value evidence |
| **Advanced** | Inside "More…" sections or Details disclosures; remembered open per user | Rotation by number, exact selection bounds, letter spacing, distribute, fixed/linked colour internals, photo fit Stretch, ZIndex tie notes, dslrBooth unit flags, driver page size, `sourceCompatibility` details |
| **Hidden until relevant** | Appears only when it applies | Font-unavailable card, Print Preview switch (multi-copy projects only), Safe areas toggle (when a profile is selected; otherwise "Choose a printer…" link), autosave issue badge, import notes on imported layers, crop bar |
| **Design Guide only** | Belongs to the creation flow | Event type, style choice, layout suggestions, monogram generator, "how many photos" wizard |
| **Full Editor only** | Direct manipulation | Layers tree, transform handles, align/distribute, grouping, arrange, snapping |

---

## 9. Navigation model

- **Start ⇄ Editor:** opening or creating a project enters the Editor. File › Close returns to Start (native unsaved prompt). One window, one project (unchanged).
- **Start → Guide → Editor:** the Guide is a full-window flow over the same project (§38). "Open in editor" goes to the Editor at any step. "Guide me" in the Editor returns to the Guide's non-destructive steps.
- **Within the Editor:**
  - the rail opens drawers (one at a time);
  - selection drives Properties;
  - the view bar holds view state;
  - dialogs are modal and used only for decisions or tasks (export, import, profile, settings);
  - panels (Checks) are non-modal.
- **Regions by keyboard:** F6 / Shift+F6 cycles top bar → rail/drawer → canvas → right column → status bar (Proposed, §35).
- **Back stack:** none beyond undo. Dialogs restore focus to their opener.

---

## 10. Welcome / Start screen

**Purpose:** begin or resume work quickly. Teach the two ways in without a tour.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◧ WalkOne Template Studio                                    ⚙ Settings  ?   │
│                                                                              │
│  Start something new                                                         │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐           │
│  │ ✦ Guided design   │ │ ▢ Blank design    │ │ ⇪ Import          │           │
│  │ Answer a few      │ │ Choose a size and │ │ dslrBooth template│           │
│  │ questions; get a  │ │ design it your    │ │ (.zip) → editable │           │
│  │ finished template │ │ way               │ │ project           │           │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘           │
│  [ Open project… ]                                                           │
│                                                                              │
│  ⚠ Unsaved work from a previous session — [Review]        (only when present)│
│                                                                              │
│  Recent                                              [Search recent…]        │
│  [thumb] Smith Wedding · 2×6 strip · Edited 2 h ago                          │
│  [thumb] Acme Gala · 4×6 portrait · Yesterday     (File not found — disabled) │
│                                                                              │
│  Learn: What is a photo slot? · Strips print two per sheet · Safe areas      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Primary actions:** the three creation cards. Open is secondary. Recent is the main list for returning users.
- **Guided design card:** shown only once the Guide exists (7C). In 7B the row has two cards, Blank and Import (no disabled placeholder; matrix #10).
- **Start from a theme / template:** a fourth card **only when** event themes or templates exist (future).
- **Recovery:** the recovery dialog still opens on launch (ADR-034). When the user picks "Decide later", a quiet banner stays on Start.
- **Recent:** thumbnails (rendered at save, P2) with name, format, relative time, and a missing-file state. Search appears above 8 items. Approval status later (§37).
- **Learn row:** links to short in-app help pages (static content, P2). Not a tour.
- **Settings and help** are reachable here (App settings without a project, §29).

## 11. New Project flow

**Recommended architecture (Proposed):** *Create New → choose the path first (Start cards) → a shared Format step.*

- **Blank design** opens the New Project sheet: name; **format as visual cards** (2×6 strip · 4×6 portrait · 6×4 landscape, each drawn to scale with "prints two per sheet" for strips); resolution (300 / 600, with px shown); a short printer note for strips. Create → Editor.
- **Guided design** starts the Guide, whose **step 1 is the same Format component**, so the two paths share one format UI and one set of words.
- **Import dslrBooth** goes to the Import dialog (§27).
- **Start from template/theme** (future): a gallery sheet, then Format is implied by the theme.

Why not a single "Create New" dialog with four quick choices? It would duplicate the Start cards and add a click for the most common path (Blank). Within the editor, File › New… opens a small chooser with the same three cards, so the paths are identical from Start and from the editor.

## 12. Design Guide entry

- **Entries:** Start "Guided design"; File › New… chooser; later "Guide me" in the editor (§38) and "Start from a theme".
- **The Guide owns the window** (not a dialog). It has a left step list, a centre question, a right live preview, and a bottom bar with Back, Next and "Open in editor".
- **Exit:** Close returns to Start if nothing was created yet. Once a project exists (after the Format step), Close behaves like closing a project (saved or unsaved prompt), since the Guide edits a real project.

## 13. Full Editor layout

**Roomy tier** (≥ 1600 × 900 CSS px):
```
┌ top bar ───────────────────────────────────────────────────────────────────────────────┐
│ ◧ File Edit Arrange View Help │  Smith Wedding ● Saved  │ ↶ ↷ │ ⚠ Checks 3 │ Save │[Export]│
├──────┬──────────────┬──────────────────────────────────────────┬───────────────────────┤
│ ▣    │ Elements     │ [Design | Print Preview]  Sample photos ◉ │ PROPERTIES            │
│Elem. │ ──────────── │   Safe areas ◉ · Overflow: Show           │ ┌ T  Title text  👁 🔒 ⋯ │
│ T    │ [+ Photo slot]│                                          │ │ Essentials           │
│Text  │ [+ Text]     │        ┌───────────── selection toolbar ┐ │ │ Font · Size · Color   │
│ ▦    │ Shapes ▭ ◯ ─ │        │ Font ▾  48  ■  ≡  Arrange  ⋯  │ │ │ Align  ⟸ ⟺ ⟹         │
│Photos│              │        └────────────────────────────────┘ │ ▸ Position & size      │
│ ⇪    │              │              ┌───────────┐                │ ▸ Spacing & box        │
│Upload│              │              │  artboard │                │ ▸ Appearance           │
│ ◐    │              │              │           │                │ ─────────────────────  │
│Colors│              │              └───────────┘                │ LAYERS            ⌄    │
│      │              │                                           │  T Title text          │
│      │              │                                           │  ▦ Photo 1  #1         │
├──────┴──────────────┴──────────────────────────────────────────┴───────────────────────┤
│ 2×6 strip · 600 DPI · 1200×3600 px │ Recovery copy 12:04 │ ⚠ 3 │ Output: DS-RX1 · Prov. │ − 32% + Fit 100% │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Compact tier** (height < 860 or width < 1440, e.g. 1426×779): the drawer overlays the canvas, and the right column uses tabs.
```
┌ top bar (same) ─────────────────────────────────────────────────────────┐
├──────┬─────────────────────────────────────────────┬────────────────────┤
│ rail │ [Design|Print Preview] Sample photos ◉ Safe…│ [Properties|Layers] │
│      │   ┌ drawer overlays canvas ┐                │ T Title text  ⋯     │
│      │   │ …                      │   artboard     │ Essentials          │
│      │   └────────────────────────┘                │ ▸ Position & size   │
├──────┴─────────────────────────────────────────────┴────────────────────┤
│ 2×6 · 600 DPI │ ⚠ 3 │ Output ▾ │ − 32% + Fit                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## 14. Top bar

| Element | Visibility | Notes |
|---|---|---|
| Brand mark + menus **File · Edit · Arrange · View · Help** | Always | "Align" becomes **Arrange** (align, distribute, stacking order, group). **Help** is new: Keyboard shortcuts, Learn pages, About. Alt+letter opens menus on Windows |
| Document title + state (Saved / Modified / Autosave issue) | Always | Click title → rename (P2). Later: proof/approval chip (§37) |
| Undo / Redo | Always | Icon buttons with tooltips and shortcuts |
| **Checks** button with count and severity icon | Always (with a project) | Opens the Checks panel (§25). Replaces the separate "N safe-area warnings" phrasing in the status chip |
| Save | Always | Secondary button showing state ("Save", disabled with ✓ when saved). ⌘/Ctrl+S |
| **Export** | Always | **Primary** button (D1). ⌘/Ctrl+E |
| Mode (Design / Print Preview) | Not in top bar | Lives in the view bar next to what it changes |
| Output Profile | Not in top bar | Status chip + Export summary + Settings |

The menu set stays complete (every command reachable by menu and keyboard). The top bar shows only high-frequency actions and outcomes.

## 15. Left rail / drawers

**Rail (Proposed, 72 px):** icon (22 px) **plus a label below**, always. Active state uses accent + edge bar + `aria-pressed`. Order and content:

| Rail item | Drawer content | Today |
|---|---|---|
| **Elements** | Big "+ Photo slot", "+ Text"; Shapes (rect, ellipse, line) as tiles; later graphics | Design drawer, top |
| **Text** | "+ Add text" primary; text presets shown **as rendered previews** (Heading/Subheading/Body); Fonts in this project (moved from Design); later the font library (ADR-044) | Text presets live in the inspector; inventory in Design |
| **Photos** | "+ Photo slot"; slot count and numbering summary ("3 slots: #1 #2 #3"); **Sample photos** On/Off, Shuffle, Reset, Choose photo…; later photo layout presets (1 / 2 / 3 / 4 slots) | Status bar + inspector |
| **Uploads** | Current Assets drawer, renamed; later scopes *This project · Library · Company* (§16) | Assets |
| **Colors** | Event Palette; Background (colour/image) | Design drawer |
| (**Brand**) | Company logo/colours/fonts (Company Profile) | Future, only when it exists |
| (**Themes**) | Event themes / Design ideas | Future, only when it exists |

**Drawers remain the right pattern** (Canva-proven, keeps the canvas visible). Rules:
- Drawer anatomy: title → optional search → **one primary action** → previews/tiles → secondary lists → empty-state help.
- Clicking the active rail item again closes the drawer. Escape closes the drawer and returns focus to the rail.
- **Roomy tier:** the drawer docks and pushes the canvas. **Compact tier:** the drawer floats over the canvas and closes after an "add" action (pin icon keeps it open).
- Drawer open/closed and the last tool are persisted per user (UI state, never in the project).
- No disabled placeholder categories.

## 16. Assets

Architecture (library not implemented in 7B):
- **Scopes:** *This project* (today's project assets) · *Library* (reusable across projects, future, ADR-046) · *Company* (from Company Profile: logos in light/dark, brand graphics; future).
- **Library model (future):** folders (owner wants project folders), tags, search, kinds (logo, background, overlay, frame art, badge, graphic), usage, licence/source note. Adding a library asset to a project **copies** it into the project (portability, ADR-036).
- **Cards:** thumbnail on a checkerboard, name, size/type, "Used by N" (click → select those layers), role suggestion. Actions: Add, Set as background, Replace on selected, Remove (refused while used, with reason).
- **Drag and drop** onto the canvas or the drawer, as today.
- **Empty states** explain drag-and-drop and supported formats.

## 17. Canvas / modes

**Mode hierarchy (Proposed):**
1. **Workspace mode** (what document view): **Design** | **Print Preview**. Only for projects with several copies per sheet. Print Preview is read-only and shows a banner: "Print Preview — read only. Edit in Design." Double-clicking a copy switches to Design with that layer selected (P2).
2. **View overlays** (non-modal toggles, never saved, never printed). Each is a **labelled toggle in the view bar**:
   - Sample photos On/Off (+ Shuffle in its menu);
   - Safe areas On/Off (with a menu: profile name, legend, "Change printer…"; without a profile: "Choose a printer…");
   - Overflow Show/Clip.
   Snap stays in the status bar: it changes behaviour, not what is shown.
3. **Temporary edit modes** (modal, Esc exits, banner at the top of the canvas): **Editing text**, **Repositioning photo N** (existing CropBar, restyled as the shared banner), future group isolation.

**View bar** (thin strip above the artboard, left-aligned): mode switch, then the overlay toggles as text pills with state words ("Sample photos: On"). This solves the hidden-mode problem and the Safe Areas tooltip finding: the control has a visible label, and its tooltip explains "Editor-only guide: never printed or exported".

**Selection toolbar** (P1, Canva pattern, in words): floats above the selection, flips below near the top edge, and never covers the selection. Content per kind:
- **Text:** Font ▾ · Size · Colour · Align · Arrange ▾ · ⋯
- **Photo slot:** Photo # · Reposition · Frame ▾ · Arrange ▾ · ⋯
- **Image:** Role ▾ · Replace… · Arrange ▾ · ⋯
- **Multi-selection:** Align ▾ · Distribute ▾ · Group
It only exposes existing commands, so it adds no new behaviour. It can be hidden in Settings for experts.

**Safe areas, cut lines, overflow:** unchanged semantics (ADR-053, ADR-038). Visual refresh only (§24).

**Selection and handles:** keep the 4D quiet outline, corner-only handles for ratio-locked photo slots, rotation handle. Kind colour is **not** used for selection.

**Zoom/pan:** unchanged. Zoom field becomes editable (type 150 ↵, P2).

## 18. Layers

**Decision (Proposed):** Layers stays **always available but not always visible**.
- **Roomy tier:** stacked under Properties. The splitter is persisted, and a collapse chevron shrinks Layers to its header.
- **Compact tier:** a tab beside Properties. ⌘/Ctrl+Shift+L (proposed) toggles it.

Row content:
- kind chip (colour + icon; thumbnail later, P2);
- name;
- badges: **#N** for photo slots (prominent, since it's the booth's shot order), image role (Logo/Badge/…), ⚠ for a safe-area or other check on this layer (P1), ⓘ for import notes;
- visibility and lock (visible on hover, kept visible when active).
Multi-selection, keyboard model and drag reorder are unchanged. PhotoNumber also shows on the canvas placeholder (exists).

## 19. Properties / Inspector (high priority)

**Problem:** a long single column of 5–8 equal-weight sections. **Proposed information architecture** for every layer type:

```
┌ Sticky header ────────────────────────────┐
│ [kind chip] Name (editable)   👁 🔒  ⋯      │  ⋯ = Duplicate, Delete, Arrange, Copy style (later)
├ Essentials (always open, no header) ──────┤  the 3–6 controls most edits need, for this kind
├ ▸ Position & size   "X 120 Y 80 · 400×120" ┤  collapsed headers show a one-line summary
├ ▸ <Kind-specific advanced>  "summary"      ┤
├ ▸ Appearance        "Opacity 100%"         ┤
├ ▸ Preview only (not saved)                 ┤  photo slots only, visually distinct box
└ ▸ Compatibility     "Imported from dslrBooth: 2 notes" ┘  only when relevant, collapsed
```

**Essentials per kind:**

| Kind | Essentials | Moves to sections |
|---|---|---|
| Text | Content (multi-line) · Font (picker) · Weight/style · Size · Colour (palette-aware) · Align | Spacing & box (line height, letter spacing, box W/H, fit height, overflow behaviour when ADR-052 is decided); text presets move to the Text drawer |
| Photo slot | Photo number · Fit (Cover/Contain) · Frame (None/Solid + colour) | Frame details (thickness, corner radius); Preview only box (sample, shuffle, choose photo, Reposition) |
| Image | Role · Fit · Print quality readout (effective DPI badge) | Replace…, Original size, Set as background; source file facts |
| Shape | Fill · Stroke colour + width | Corner radius |
| Group | Name, child count | Bounds (read-only) |
| Multi-selection | **Align and distribute** (first, W6) · Selection X/Y | Shared visible/locked/opacity |
| Nothing selected | **Project:** name, format card (size/DPI/sheet/copies), background, output profile line, printer guidance | — |

Rules:
- Collapsed state is **remembered per section per kind** (UI state).
- **Short-height behaviour:** when the column is under about 520 px, non-essential sections start collapsed. Essentials never scroll under the sticky header.
- Section headers are sticky while their content scrolls (P2).
- A "Pin section" option (P3) keeps a chosen section open.
- No information is removed: everything currently in the inspector stays reachable within one click.

## 20. Typography

**Current:** good font picker (search, preview in face, not-installed tag, "Use 'name'"), honest missing-font card with Replace on layer / all. Problems: 5 sections; presets in the inspector; spacing controls compete with essentials.

**Proposed:**
- Essentials hold family, weight, size, colour and align. The same controls appear in the selection toolbar.
- The **Font picker** becomes a popover anchored to the field, with recently used and project fonts at the top. Categories arrive with the bundled library (ADR-044, OPEN).
- **Missing font:** keep the card, but show it at the top of Essentials as an inline banner (warning tone + icon + text). Checks list it under Fonts.
- **Palette link:** the colour control shows a chain icon and the palette name ("Accent") when linked (§22).
- **Imported dslrBooth notes** (Auto size approximated, Bold Italic → Italic, drop shadow not drawn, over-long line) appear in the layer's **Compatibility** section and in Checks › Details. They never show in Essentials.

**Text overflow — UX recommendation for ADR-052 (still OPEN; no schema change in 7A).** One control, "When text is longer than its box", in *Spacing & box*, as a select with a live preview line:

| Option | Behaviour | Needs | When to recommend |
|---|---|---|---|
| **Wrap to new lines** (today's default) | Word wrap inside box width; may spill below | Nothing (current) | Paragraphs, editor default |
| **Grow box to fit** (Auto height) | Wrap; box height follows content | Persisted flag (today "Fit height to content" is a one-time action) | Guide-generated text blocks |
| **Shrink text to fit** | Keeps one or more lines within the box by reducing size down to a minimum | Persisted mode + min size | Names/titles in the Guide (lengths vary per event) |
| **Keep on one line, cut at box edge** (Clip) | No wrap; clipped to the box, as dslrBooth does | ADR-052 `overflow: 'clip'` | Default for imported dslrBooth live text |
| No wrap, no clip | Single line spills sideways | — | **Not recommended**: spills past the box and into safe areas |

Whatever is chosen, a canvas cue (a small "text continues" marker at the box edge) and a Checks warning flag clipped or spilling text. Recommended priority for the owner: **Clip** (dslrBooth parity) and **Shrink to fit** (Guide) first.

## 21. Photo slots

**Make "photo slot" vs "sample photo" unmistakable:**
- A **photo slot** is part of the template: the hole the booth fills. Canvas: kind-coloured dashed outline + big "1" + "Photo slot" label when samples are off. Inspector header: "Photo slot #1".
- A **sample photo** is preview only. When samples are on, each slot shows a small "Sample" tag (it exists as "#n"; reword to "Sample · #1"). The view bar says "Sample photos: On". The inspector groups sample controls in a **"Preview only — not saved, not exported"** box with a dashed border and an eye icon.
- **Reposition** (crop) is preview-only today (ADR-038). Its banner says so: "Repositioning the sample photo — the booth places each guest photo with Cover."
- **PhotoNumber:** prominent in the Layers row, selection toolbar and canvas. Repeated numbers are allowed and shown as "#1 (×2)" in the Photos drawer summary.
- **Frame:** None/Solid + colour in Essentials; thickness and radius below.
- **Ratio lock:** unchanged (corner handles only). The W/H fields show a lock icon with a tooltip saying why ("Photo slots keep their shape; duplicate to make another size").
- **Cover/contain:** in Essentials; Stretch only under advanced (ignores crop).
- **Rotation:** under Position & size.

## 22. Event Palette

- **Home:** the **Colors** drawer: palette rows (swatch, name, hex, "Used by N" → click selects those layers), Add role/custom, "Add basic colors" when empty, Background below.
- **Everywhere a colour is edited:** a **colour popover** replaces swatch + hex + OS picker as the first step:
  - Event palette swatches (named) first;
  - then "In this design" (fixed colours in use);
  - then hex + picker (OS picker kept as the last resort).
  - Picking a palette swatch **links** the colour (chain icon). "Use fixed color" detaches.
- **Global recolour:** editing a palette colour recolours all linked layers (unchanged). The drawer row shows "Updates N layers" before you commit the hex.
- **Removing a used colour** stays refused, with the reason and "Select the N layers".
- **Guide:** the Colors step writes palette entries (real project data), so editor recolouring after the Guide just works.

## 23. Output Profiles

**Audit of v1:** the model is right (outside the project, evidence on every value). Presentation problems: the details list is long and flat, the badges are mostly amber, a developer note and an awkward sentence show, and it duplicates the check list.

**Proposed:**
- **Where profiles are chosen:**
  - **Settings › Printing** sets the *default* profile on this computer (today's behaviour, renamed);
  - the **status-bar chip** is the quick switch: menu with No profile / profiles / "Profile details…".
  - Per-project profiles stay out of scope (schema, ADR-053 §4).
- **Profile dialog** layout:
  1. Header: profile name + confidence tier chip.
  2. **Summary card:** "Keep important content 3 mm from edges and the cut (provisional). Trim about 1.6–1.8 mm (estimated). Cut trim unknown." plus a single "How sure are we?" line with counts per tier ("4 observed · 3 estimated · 4 unknown · 0 measured").
  3. **Setup steps** (numbered).
  4. Details disclosure: values grouped as **Measured & verified / Observed / Estimated / Reference / Unknown**, each value with its precise level label.
  5. Notes for users only.
- **Evidence tiers** (shared with WalkOne Booth; colour never alone):

| Tier | Levels | Icon | Tone | Word |
|---|---|---|---|---|
| Verified | owner-measured, verified-production | ✓ check-circle | success (green) | "Measured" / "Verified on booth" |
| Observed | observed-test-laptop | 👁 eye | info (neutral blue) | "Observed (test laptop)" |
| Estimated | inferred, provisional | ≈ approx / tilde | warning outline (amber border, no fill) | "Estimated" / "Provisional" |
| Reference | nominal | ruler | neutral | "Nominal (paper size)" |
| Unknown | unknown | ? dashed circle | muted, dashed border | "Not measured yet" |

  Each chip has a tooltip with the full hint (exists: `EVIDENCE_HINTS`). The overall confidence uses the same tier chip.
- **Copy fixes (in 7B, as part of this layout):**
  - Remove the "Source: research/… update this file" note from the bundled profile's user-visible `notes`. Maintainer guidance moves to docs or a non-displayed field (profile data change, not `TemplateProject`).
  - Provisional info, proposed copy: **"Safe areas for DNP DS-RX1 are provisional: they come from tests on a research laptop and have not been measured on a print yet."**
  - "Awaiting readout" → **"Not measured yet"**.
- **The project's checks are not repeated inside the dialog.** A single line "This project: 2 items need attention — Open Checks" links to the Checks panel filtered to Printer & cut.

## 24. Safe Areas

- **Toggle location:** the view-bar pill "Safe areas: On" with its menu (profile, legend, change). The status-bar duplicate is removed. View › Safe areas stays.
- **Status visibility:**
  - status chip "Output: DS-RX1 · Provisional" (state + tier icon);
  - the Checks count includes safe-area warnings;
  - Layers rows show ⚠ on flagged layers.
- **Legend:** moves from the chip under the artboard into the pill's menu (always reachable, no canvas clutter). A one-line legend appears under the artboard **only the first time** safe areas are shown, dismissible ("Hatched = may be trimmed (estimated) · Dashed line = keep important content inside · Red outline = needs attention").
- **Visual language:** hatch for the expected trim; dashed teal for keep-safe; dashed red outline for flagged; long-dash for cut lines with a label. All overlay strokes get a 1 px contrasting halo so they read on any artwork in either theme.
- **Beginners vs power users:**
  - Beginners see safe areas **on by default** once a profile exists, and the Guide's Review step shows them.
  - Power users can hide them, and the setting is remembered.
  - Without a profile, the pill reads "Safe areas: choose a printer…".
- **Design vs Print Preview:** unchanged semantics: one logical strip vs the sheet with both copies and the cut (ADR-053 §5).

## 25. Preflight (unified Checks)

**One model, one presentation.** All sources map into one item shape: project validity, assets, fonts, DPI, palette, dslrBooth, Output Profile and Safe Areas. Codes and rules are unchanged; this is presentation only.

**Severity** (what it means for the user, always icon + word + tone):

| Severity | Meaning | Blocks export? |
|---|---|---|
| **Error** | Output would be invalid (missing image, invalid composition, dslrBooth: no photo slots / #>12) | Yes, for the affected output |
| **Warning** — "Needs attention" | Likely visible problem (content in trim, missing font, low-res image, text overflow) | No |
| **Info** — "Good to know" | Context (provisional profile, rasterized text, hidden layers) | No |

**Topic** (second grouping): Design · Photos · Text & fonts · Images · Printer & cut (Output) · dslrBooth.

**Advanced detail:** every item has a one-line title + one plain sentence. Technical detail goes behind **Details** (ZIndex ties, unit flags, driver page size, sourceCompatibility keys, pixel coordinates). A "Show technical details" setting expands them by default for power users.

**Item anatomy:**
```
⚠ Needs attention · Printer & cut
"Title text" is 0.8 mm from the cut          [Select] [Fix…(future)]
About 1.6 mm may be trimmed there. Keep it 3 mm away.   ▸ Details
```

**Hosts:**
- **Checks panel** (non-modal, right side, opened from the top-bar Checks button or status count): filters by severity/topic; *Select* selects the layer and scrolls the canvas to it.
- **Export:** a pinned summary ("0 errors · 3 warnings · 2 notes — Review") with errors auto-expanded (§26).
- **Output Profile dialog:** a link only (§23).
- **Guide Review step:** the same list, filtered to errors and warnings.

**Noise control:**
- Info items are collapsed under a count by default.
- Identical items are merged ("3 texts are close to the cut").
- "No profile selected" is said once, in the profile line, not as an item (already done in v1).

## 26. Export

**Proposed structure:** one dialog following the dialog contract (§29), size L, with a **pinned summary header** and a **sticky footer**. The body scrolls with visible scroll shadows.

```
┌ Export ─────────────────────────────────────────────────────────┐
│ Ready to export 2 files · ⚠ 3 warnings · Output: DS-RX1 (Prov.) ▾│  ← pinned summary
├─────────────────────────────────────────────────────────────────┤
│ For dslrBooth                                                    │
│  ☑ dslrBooth template · 2×6 strip        Smith Wedding.zip       │
│  ☐ dslrBooth template · 4×6 sheet        Smith Wedding 4x6.zip   │
│ Images                                                           │
│  ☐ Print sheet PNG · ☐ Design PNG · ☐ Client proof (Not for printing) │
│ ▸ Checks (3 warnings, 2 notes)            errors auto-expand here │
├─────────────────────────────────────────────────────────────────┤
│ Folder: ~/Exports/Smith ▾          [Cancel]          [Export…]  │  ← sticky footer
└─────────────────────────────────────────────────────────────────┘
```

- **Output Profile** moves into the pinned summary as a compact line with a menu (fixes "below the fold"). Output checks are counted in the summary and listed in Checks under *Printer & cut*.
- **Presets** (P2): "For dslrBooth" (default for strips), "Print files", "Client proof" as quick selections above the list.
- **Destination** shows in the footer once chosen, and is remembered for the run (and per project later).
- **Overwrite:** unchanged (Replace / Keep both / Cancel step).
- **Done step:** the file list with *Show in Finder/Explorer*. Later: "Send proof…" (§37).
- **Width:** at ≥ 1280 px the dialog may use two columns (files | checks). Below that, one column. The footer is always visible.

## 27. dslrBooth Import

**Keep:** preview beside the facts, the strip-vs-sheet choice with "Recommended", "What to know", clear failure state.

**Proposed:**
- "What to know" splits into **For you** (beginner-relevant: "2 fonts are not installed — the text keeps its font name", "Imported text can be edited") and **Details** (collapsed: ZIndex ties, Auto size approximation, unit flags, unknown elements kept in compatibility data).
- **Two-up detection** stays a plain-language choice, each option with a small drawing (one strip ×2 vs the whole sheet).
- **After import:**
  - imported layers carry ⓘ in Layers;
  - their notes appear in the inspector's Compatibility section;
  - Checks › dslrBooth lists them.
  - A one-time banner: "Imported from dslrBooth — 3 things to review · Open Checks".
- **Font warnings** use the same missing-font component as the inspector and Checks.

## 28. Status bar

| Keep | Move / change | Remove |
|---|---|---|
| Format · DPI · pixel size (Design vs sheet in Print Preview) | Sample photos, Safe areas, Overflow, Shuffle → **view bar** | Duplicate safe-area toggle |
| Save/recovery note (quiet) | Output chip → compact "Output: DS-RX1 · ≈Prov." with the quick-switch menu | Text "N safe-area warnings" (folded into Checks count) |
| **Checks count** (⚠ 3), click → Checks panel | Zoom % becomes an editable field (P2) | |
| Snap toggle (behaviour) | Selection info ("2 layers") stays left of the zoom | |
| Zoom − % + Fit 100% | | |

At the compact tier the status bar drops selection info and pixel size (still in Properties › Project). Zoom and Checks never drop.

## 29. Dialog system

**Contract v2 (applies to every renderer dialog):**
- **Sizes:** S 420 px (confirmations), M 560 px (New Project, Import), L 720 px (Export, Output Profile, Settings). Width is `min(size, 100vw − 32px)`.
- **Height:** `max-height: calc(100vh − 48px)`. Title and description are pinned. **The footer is always visible.** The body scrolls with top and bottom shadows when overflowing. An optional **pinned summary** row sits under the title (Export).
- **Actions:** primary on the right (macOS and Windows alike, consistent in-app), Cancel to its left. Destructive actions are separated and red, and need a confirm step. Escape = Cancel (unless working). Enter = primary when focus isn't in a multi-line field.
- **Focus:** first field or autofocus primary; Tab trap; focus restored to the opener (exists).
- **Content:** short description (one sentence), plain language, no internal names or paths.
- **Long tasks** show progress inline, and the dialog can't be dismissed while writing (exists).

**Inventory:**

| Dialog | Size | Notes |
|---|---|---|
| New Project | M | Format cards (shared with Guide step 1) |
| Recovery | M | Unchanged behaviour |
| Import dslrBooth | L | For you / Details split |
| Export | L | Pinned summary, sticky footer |
| Output Profile | L | Summary card + tiered details |
| **Settings** (new) | L, sidebar sections | **Appearance** (Dark / Light / Match system), **UI scale** (90–125 %), **Printing** (default output profile, show safe areas by default), **Editor** (selection toolbar on/off, show technical details, units mm/in), later **Company** (§36) |
| Keyboard shortcuts | M | Generated from the command model, searchable; replaces "Layer shortcuts" |
| Native unsaved prompt | OS | Unchanged (ADR-034) |

## 30. Responsive strategy

**Viewports to design for** (CSS px; Windows 125 % divides physical pixels by 1.25):

| Target | Approx. viewport | Tier |
|---|---|---|
| 1920×1080 @100 % (maximized, title bar + taskbar) | ≈ 1920 × 1000 (Assumption) | Roomy |
| 1920×1080 @125 % | ≈ 1536 × 800 (Assumption) | Standard width, **compact height** |
| Laptop (observed) | 1426 × 779 | **Compact** |
| 1440-wide Mac | 1440 × 800–860 | Standard / compact height |
| Minimum window | 1100 × 680 | Compact (floor) |

**Tiers** (width and height evaluated independently):

| Condition | Behaviour |
|---|---|
| Width ≥ 1600 | Drawer docks; right column 320–360 px |
| 1280 ≤ width < 1600 | Drawer **overlays**; right column 300 px |
| Width < 1280 | Drawer overlays; right column 280 px; status bar condensed; view-bar pills icon + short label |
| Height ≥ 860 | Properties and Layers stacked (resizable split) |
| Height < 860 | Properties \| Layers **tabs**; non-essential sections start collapsed |
| Height < 720 | Selection toolbar compact (icons + tooltips); dialogs use full height minus 24 px |

**Invariants:**
- The canvas viewport never drops below 520 × 400 (extends the existing `MIN_WORKSPACE`).
- No primary action sits below a fold without a scroll shadow.
- Panel sizes, tabs and collapsed sections persist per user.
- Tiers come from a pure, unit-tested function (like `layout.ts`).
- The 4D layout sweep in `validate-4d.js` gains a height sweep.

## 31. Windows considerations

- **Title bar:** keep the native title bar (drag regions, snap layouts, accessibility). The in-app menu bar stays, since Windows has no native menu by design (ADR-035).
- **Menus:** Alt shows access-key underlines; **Alt+F/E/A/V/H** opens menus; F10 focuses the menu bar (P0).
- **Shortcuts:** all labels from one source (exists). Add **Ctrl+Y** as a redo alias (Windows convention). Shortcut sheet shows Ctrl. Never show ⌘ on Windows (6C confirmed).
- **Scaling:** test at 100/125/150 %. Hairlines use 1 device pixel (`0.5px` fallbacks avoided). Icons are crisp at fractional scales (lucide strokes 1.5–1.75).
- **Fonts:** the UI font stack leads with system UI (Segoe UI Variable / Segoe UI on Windows, SF on macOS). Design fonts are unaffected. Missing fonts follow the existing warnings.
- **Scrollbars:** Windows shows wide classic scrollbars; style them thin with tokens (`scrollbar-width`, `::-webkit-scrollbar`), keeping visible tracks for discoverability.
- **High contrast:** support `forced-colors: active` (borders become visible; overlays use system colours where possible).
- **Words:** "Show in Explorer" (exists), "Folder", Windows-style path display is never needed (paths aren't shown).
- **Dialogs:** native file pickers. Button order stays consistent in-app (documented choice).

## 32. macOS considerations

- Native title bar with traffic lights (kept). The app menu holds Quit, Edit (Cut/Copy/Paste) and Window (ADR-035).
- ⌘ labels and the Option key. Trackpad pinch-zoom (exists) and two-finger pan (exists via wheel).
- Retina: 1 px hairlines at 2× are crisp. Check that tokens don't rely on 0.5 px.
- "Show in Finder". Reduced motion and increased contrast (`prefers-contrast`) respected.

## 33. Light/Dark strategy (implementation in 7B)

**Token layers:**
1. **Primitives:** neutral ramp (0–1000), accent ramp, status ramps (green, amber, red, blue), kind hues, overlay hues. No component uses these directly.
2. **Semantic tokens** (themed):
   - surfaces: `--surface-app`, `--surface-panel`, `--surface-raised`, `--surface-overlay`, `--surface-canvas`, `--surface-input`;
   - text: `--text-primary`, `--text-secondary`, `--text-label`, `--text-muted`, `--text-disabled`;
   - borders: `--border-subtle`, `--border-strong`;
   - accent: `--accent`, `--accent-hover`, `--accent-pressed`, `--accent-subtle`, `--focus-ring`;
   - status: `--status-{error,warning,success,info}-{fg,bg,border}`;
   - kinds: `--kind-{photo,text,image,shape,group}`;
   - overlays: `--overlay-{safe,trim,flag,cut,guide,selection}` + `--overlay-halo`.
3. **Component tokens** (where needed): button, input, chip and badge heights and paddings.

**Mechanism:** `:root[data-theme="dark"|"light"]`, set from Settings (Dark / Light / Match system; **default Dark**, D3). Konva reads semantic tokens at runtime through one `getCanvasTheme()` that subscribes to theme changes, replacing hand-mirrored constants.

**Surface hierarchy:**
- **Dark:** canvas surround darkest, panels a step lighter, raised/floating lighter again.
- **Light:** the canvas surround is a soft neutral grey (so the white artboard still floats), panels are white, raised surfaces are white with shadows.
- The **artboard is never themed** (it is the user's design).

**Overlay colours** (safe/trim/flag/cut/guides) are drawn over arbitrary artwork. They use a contrasting halo stroke in both themes, and their hue stays constant across themes so meaning doesn't shift.

**Contrast requirements (extend `designTokens.test.ts` to both themes):**
- text ≥ 4.5:1 on its surface;
- large text and UI components and states ≥ 3:1;
- focus ring ≥ 3:1 against adjacent colours;
- status foregrounds ≥ 4.5:1 on their own backgrounds;
- disabled text is exempt but should stay ≥ 3:1 where it conveys information (4D's faint token);
- no type below 12 px.

## 34. Design system

| Area | Recommendation |
|---|---|
| Type scale | 11 (caps labels only, ≥ 600 weight) · 12 (meta, labels, status) · 13 (body, controls) · 14 (panel titles, document title) · 16 (dialog titles) · 20 (section headings on Start/Guide) · 28 (Start/Guide display). System UI font, tabular numerals in numeric fields |
| Spacing | 4-pt base: 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 |
| Radii | 4 (inputs, chips) · 6 (buttons, cards) · 10 (dialogs, drawers, popovers) · full (pills, toggles) |
| Borders | 1 px subtle dividers. Strong borders only for inputs and focus. No double borders between adjacent panels |
| Elevation | 0 docked panels · 1 cards and hover · 2 popovers, menus, the floating drawer and the selection toolbar · 3 dialogs. Shadows tuned per theme |
| Panels | Header 36 px (title 12–13 semibold + actions); section header 32 px with chevron + summary; body padding 12 |
| Buttons | Primary (one per region) · Secondary · Ghost · Danger. Heights 28 (sm) / 32 (md) / 40 (lg, Start and Guide). Icon + label preferred |
| Icon buttons | 28 × 28 hit area minimum (icon 16); 24 only inside dense lists with row-level alternatives. Always a label/tooltip |
| Inputs | 28 px height in panels, 32 in dialogs; unit suffix inside (px, mm, %); inline error under the field |
| Tabs | Underline style for panel tabs (Properties \| Layers); `role=tablist`, arrow keys |
| Segmented | For 2–4 exclusive options (Design/Print Preview, align, fit) |
| Toggle pills | View-bar toggles: label + state word, `aria-pressed` |
| Tooltips | Title + shortcut + one-line hint (exists); never the only place for essential info |
| Chips | Kind chips (colour + icon), filter chips, profile chip |
| Badges | Status badge = icon + word + tone; evidence tiers (§23); counts |
| Banners | Inline (in panels), canvas mode banner, Start banner. Tone + icon + text + action |
| Dialogs | Contract v2 (§29) |
| Empty states | Icon + one sentence + one primary action (exists as EmptyState) |
| Kind colours | Five distinct hues not used by status or overlays: photo, text, image, shape, group. Exact values chosen in 7B with contrast tests (D8) |

## 35. Accessibility

- **Keyboard:**
  - every action reachable by keyboard;
  - F6 region cycling;
  - Alt menu access on Windows;
  - Escape closes the innermost layer (popover → drawer → mode → selection);
  - the shortcut sheet lists everything;
  - a command palette later.
- **Focus:** one visible ring style (exists). It is never removed. Focus is moved deliberately when panels open and returned when they close.
- **Contrast:** §33 requirements, tested in both themes. State is never conveyed by colour alone (icons + words; evidence tiers; Modified word).
- **Names:** every icon control has an accessible name (enforced by `IconButton`). View-bar pills expose `aria-pressed`. Checks items expose severity in text. Canvas changes announce through a polite live region ("Photo slot 2 selected", "Safe areas on").
- **Targets:** ≥ 24 × 24 CSS px everywhere (WCAG 2.2 2.5.8), 28 px preferred for toolbars, 40 px for Start/Guide choices.
- **Scaling:** a **UI scale** setting (90–125 %) separate from canvas zoom. Layouts tested at 125 % OS scale × 110 % UI scale.
- **Tooltips:** keyboard-focusable, dismissible with Escape, never essential-only; the same text is available in the help sheet.
- **Motion:** respect reduced motion (exists).
- **Not verified yet:** VoiceOver / Narrator passes and Windows High Contrast are planned as 7B checks (P2).

## 36. Company Profile — future integration

- **Separate from `TemplateProject`** (ADR-049, ADR-046): company name, logos (light/dark), brand colours, preferred fonts, contacts (website, phone), preferred assets, **default Output Profile**, branding defaults (position top/bottom).
- **UX:**
  - **Settings › Company** (first-run prompt from Start, skippable);
  - a **Brand** rail item when a profile exists (company logo/colours/fonts as tiles);
  - the Guide's "Company branding" step pre-fills from it;
  - the colour popover shows "Company colours" after the Event Palette.
- **In projects:** placing a company logo copies it into the project as a normal image asset (portable, no live link) **unless** the owner approves linked "company elements" (schema change, D6).
- WalkOne Booth will read the same profile (shared storage, an open question in PRODUCT_ECOSYSTEM §17).

## 37. Proof / approval — future integration

- **Today:** Proof PNG (sample photos, "Not for printing", `-proof` name; not watermarked).
- **Future flow:** Designer → **Client proof** (export) → **Send for approval** (mail hand-off or service, undecided, ADR-046) → client **Approves / Requests changes** (outside the app) → **approved revision** becomes immutable. Further edits create a new draft revision.
- **Where status appears in Template Studio:**
  - a chip next to the document title ("Proof sent · v3", "Approved v3 · locked", "Changes requested");
  - the Recent list on Start;
  - the Export done step ("Send proof…");
  - the Checks panel (info: "Editing an approved revision creates v4").
- **Client-safe labelling:** proof images carry a visible "PROOF — not for printing" band (optional watermark, a later decision), event name and revision id. Never internal notes or paths.
- Clients **never** enter the editor.

## 38. Design Guide architecture (preparation for 7C)

**Principle:** the Guide is a sequence of **project-editing steps** with a friendlier UI. It never has its own project format.

**Steps** (v2 order, conditional):
Format → Event type → Style → Colors → Photos → Logo → Wording → Company branding → Layout → Review.

| Step | Writes to `TemplateProject` (real fields) | Suggestion / preset only (not persisted in the project) | Company Profile default |
|---|---|---|---|
| Format | Size, DPI, composition (via existing presets) | — | Default output profile (preference) |
| Event type | — (no field today) | Drives the style, palette, wording and layout suggestions | — |
| Style | Resulting layers, fonts, background asset | Style id | Preferred fonts |
| Colors | **Event Palette** entries + linked colours | Suggested palette sets | Brand colours as an option |
| Photos | Photo slot layers (count, shape, size), photo numbers | Layout pattern id | — |
| Logo | Image layer (role Logo) + asset, or monogram text | Monogram style | — |
| Wording | Text layers (content, font, size) | Length-fit hints (needs ADR-052 for shrink-to-fit) | — |
| Company branding | Image/text layers (role Logo / text) copied from the profile | Position choice | Logo, website line |
| Layout | Layer positions (pure layout generator inside the safe area) | Layout id | — |
| Review | Nothing new: shows Checks + Safe areas + Print Preview | — | — |

**Mechanics:**
- **Project created at step 1** (Format) as a normal new project. Autosave and recovery protect the Guide from that point. Each later step applies **one undoable mutation batch** (one history entry per step), using existing store mutations. There is no parallel model.
- **Guide record** (answers, style/layout ids, step reached) is stored as **app-local UI state keyed by the project's id**, like the output-profile preference. It is not saved in the project (D5: storing it in the project needs a schema decision). Without it, the project is still complete and editable; only "return to the Guide with my answers" is lost.
- **Progress model:**
  - a left step list (done ✓ / current / upcoming; conditional steps appear when they apply, never as disabled rows);
  - Back/Next;
  - optional steps show "Skip";
  - Next is always enabled once required answers exist.
- **Back behaviour:** going back and changing an answer re-applies the downstream steps that depend on it. If the user edited those layers in the editor in the meantime, the Guide asks first ("Replace the layout? Your manual changes to positions will be lost" → undoable).
- **Live preview:** a read-only canvas using the **same renderer** (DesignCanvas / Print Preview, safe areas on), updating per answer. No separate preview renderer.
- **Switching to the Full Editor:** "Open in editor" at any step. The project is already real, so nothing is converted.
- **Returning to the Guide ("Guide me"):** offers the **non-destructive steps** (Colors, Wording, Logo, Company branding), which edit existing palette/text/image layers in place. Structural steps (Format, Photos, Layout) are offered with an explicit "rebuild" warning, or not at all for projects not created by the Guide (D5/D11).
- **Done:** the Review step offers *Export* (opens Export with the dslrBooth preset for strips), *Client proof*, *Open in editor*.

**Shared primitives 7B must provide for 7C:** Format cards component, dialog/flow layout contract, colour popover with palette, Checks list component, read-only canvas host, kind chips, large choice cards.

## 39. WalkOne Booth shared design-system considerations

- **Shared:**
  - tokens (primitives + semantic, both themes);
  - `ui/` primitives (Button, IconButton, Tooltip, Menu, Dialog, Tabs, Segmented, Toggle pill, Badge, Banner, EmptyState, Checks list);
  - evidence tier chips (Output Profiles are shared);
  - status semantics;
  - kind colours (if Booth shows template layers);
  - the accessibility contract.
  - Future package: `shared-ui` (PRODUCT_ECOSYSTEM §5, conceptual; no repo restructure without approval).
- **Not shared:** information architecture. Template Studio is a creative workspace (canvas-centred, panels, drawers). WalkOne Booth is an operations app: event lists, readiness, health dashboards, larger touch-friendly targets, status-dense layouts.
- **Booth hosting the editor:** the Start hub is replaced by Booth's event context. The editor regions, dialogs and Checks are the same. A host-provided "Return to event" action sits at the left of the top bar. Event context (name, date, client, format, output profile, branding) pre-fills the Guide and skips answered steps (UX_SPEC §0).
- **Design the primitives density-agnostic** with a `data-density="comfortable|compact"` switch, so Booth can use comfortable sizes without forking components.

## 40. Phase 7B implementation scope

**Goal:** implement the editor and shell architecture above, with no change to document semantics.

**Must not change** (each guarded by existing unit tests and built-app suites):
- `TemplateProject` schema and `.boothproject`;
- Output Profile separation (ADR-053);
- Safe Areas editor-only behaviour;
- DesignCanvas / OutputComposition;
- 2×6 single-strip authoring and the derived non-editable two-up copy;
- production render fidelity;
- dslrBooth export/import and C1 live-text import;
- autosave/recovery;
- keyboard precision behaviour (nudge, Shift-drag, snapping, zoom shortcuts);
- the command model as the single source of shortcuts.

**Suite compatibility:** built-app suites select by ids and test ids (`#output-status`, `export-output-profile`, `#export-start`, `#doc-name`, …). 7B either keeps these hooks on the moved controls or updates the suites in the same change. Every suite must stay green at each commit.

**Ordered 7B backlog** (P0 structural → P3 future):

| # | Pri | Item | Depends on | Notes |
|---|---|---|---|---|
| B1 | P0 | **Mockup checkpoint**: wireframes of Start, editor (roomy + compact), inspector, Export, Checks, Output Profile for owner sign-off | 7A approval | Owner process requires mockups first (D10) |
| B2 | P0 | **Token architecture**: primitives → semantic → component; Konva `getCanvasTheme()` from tokens; dark values unchanged visually; contrast tests per theme | — | Enables Light (B12) |
| B3 | P0 | **Dialog contract v2** (sizes, max-height, pinned summary, sticky footer, scroll shadows) applied to all renderer dialogs | B2 | Fixes the Export fold structurally |
| B4 | P0 | **Responsive shell tiers** (pure `layoutTier()`), drawer dock/overlay, right column stacked/tabs, persisted panel sizes, tabs and collapsed sections, min canvas viewport | B2 | Height sweep added to `validate-4d` |
| B5 | P0 | **Inspector IA**: sticky header, Essentials per kind, collapsible sections with summaries, Preview-only box for photo slots, Compatibility section | B4 | No field behaviour changes |
| B6 | P0 | **View bar**: Design/Print Preview + labelled pills (Sample photos, Safe areas, Overflow); remove the status-bar duplicates; mode banner component (text edit, reposition) | B2 | Solves hidden modes + Safe Areas tooltip |
| B7 | P0 | **Unified Checks**: presentation model over existing preflight/safe-area/import items (severity → topic, Details), Checks panel with Select, top-bar Checks button, status count | B3 | Rules and codes unchanged |
| B8 | P0 | **Export restructure**: pinned summary incl. Output profile line, Checks collapsed (errors expanded), sticky footer with folder | B3, B7 | Windows fold finding |
| B9 | P0 | **Evidence tiers + Output Profile dialog**: summary card, tiered details, copy fixes, dev note removed from profile notes (profile data only) | B2, B3, B7 | Windows badge/copy findings |
| B10 | P0 | **Windows conventions**: Alt menu access, F10, Ctrl+Y alias, shortcut audit, scrollbar styling | — | Ctrl/⌘ from the command model |
| B11 | P0 | **Start hub structure** (cards: Blank, Import; Open; recents; recovery banner; Learn row placeholder hidden until content) + **New Project format cards** (shared component) | B3 | Guide card added in 7C |
| B12 | P1 | **Light theme** + Settings › Appearance (Dark default) | B2, B13 | |
| B13 | P1 | **Settings dialog** (Appearance, UI scale, Printing default profile, Editor options) | B3 | Output profile default moves here; chip stays |
| B14 | P1 | **Labelled rail** + drawers Elements / Text / Photos / Uploads / Colors; text presets as previews; Fonts in this project → Text; palette + background → Colors | B4 | No disabled placeholders |
| B15 | P1 | **Kind colours** in rail, Layers chips, inspector header | B2 | Not on canvas selection |
| B16 | P1 | **Colour popover** with Event Palette first, link/detach | B2 | |
| B17 | P1 | **Selection toolbar** (existing commands only), Settings toggle | B5, B6 | |
| B18 | P1 | **Top bar**: Arrange + Help menus, Export primary / Save secondary (D1), Checks button | B7 | |
| B19 | P1 | **Layers markers**: ⚠ per flagged layer, ⓘ import notes, prominent #N | B7 | |
| B20 | P1 | **Photo slot vs sample** visuals (canvas labels, "Sample · #1", reposition banner copy) | B5, B6 | |
| B21 | P1 | **Import dialog**: For you / Details split, layout drawings, post-import banner | B3, B7 | |
| B22 | P2 | Layer thumbnails; context menu; keyboard-shortcut sheet (Help) | B14, B18 | |
| B23 | P2 | Editable zoom field; title rename from top bar; recent thumbnails + search; Learn pages | — | |
| B24 | P2 | Accessibility passes: F6 regions, live-region announcements, VoiceOver/Narrator, forced-colors | B4–B6 | |
| B25 | P2 | Export presets; remember destination per project (UI state) | B8 | |
| B26 | P2 | Motion and empty-state polish; tooltip coverage audit | — | |
| B27 | P3 | Command palette; pinned inspector sections; sticky section headers | B5 | |
| B28 | P3 | Fix actions from Checks (e.g. "Move inside safe area"); custom select popovers | B7 | Needs per-fix design |
| B29 | P3 | Rulers, drag into groups, custom output profiles UI | — | Separate approvals |

## 41. Phase 7C Design Guide scope

| # | Pri | Item | Depends on |
|---|---|---|---|
| G1 | P0 | Owner content inputs: event-type list (exists in PRODUCT_SPEC §0), styles per event, palette sets, wording defaults; licence-safe art/fonts for styles | Owner; ADR-044 for fonts |
| G2 | P0 | Guide shell: full-window flow, step list, Back/Next/Skip, Open in editor, Close rules | 7B B3, B11 |
| G3 | P0 | Format step = shared Format cards; creates the project (autosave/recovery from here) | 7B B11 |
| G4 | P0 | Step engine: conditional steps from answers; one undoable batch per step via existing mutations | — |
| G5 | P0 | Live preview host: read-only DesignCanvas / Print Preview with safe areas | 7B B6 |
| G6 | P0 | Pure generators (domain-side, unit-tested): photo layout in the safe area, text placement, palette application | ADR-053 zones |
| G7 | P1 | Steps: Event type, Style, Colors (palette), Photos, Logo (upload / monogram / none), Wording, Layout, Review (Checks + Print Preview) | G2–G6 |
| G8 | P1 | Company branding step (skipped when no Company Profile exists) | Company Profile phase |
| G9 | P1 | "Guide me" from the editor for non-destructive steps; guide record as app-local state (D5) | G4 |
| G10 | P1 | Start "Guided design" card; File › New… chooser | 7B B11 |
| G11 | P2 | Shrink-to-fit names/titles | ADR-052 decision |
| G12 | P3 | Event themes (save choices as a preset), "Design ideas" panel | Themes scoping |

7C uses 7B primitives. It must not change the editor or add a parallel project format.

## 42. Deferred items

- Asset library (folders, tags, company/event assets).
- Template gallery / event themes / Design Recipes / Badge Builder.
- Bundled font library (ADR-044).
- Company Profile (ADR-046).
- Proof sending and approval states.
- Fix actions from checks.
- Custom output profiles and a profile editor.
- Per-project profile reference (schema).
- Rulers; drag into/out of groups; copy/paste across projects.
- Native-select theming.
- Brand mark / identity.
- Command palette (P3).
- iPad/tablet layout (ADR-043).
- WalkOne Booth operations UI (not approved).

## 43. Open decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Top bar primary: **Export** (Save secondary with state) vs keep **Save** primary | Export primary; autosave + recovery already protect work, and the outcome action matters most |
| D2 | Right column on short screens: **tabs (Properties \| Layers) below 860 px height** vs always stacked | Adaptive tabs (revises ADR-035 item 4 for short screens only) |
| D3 | Default appearance: **Dark** (with Light and Match system) vs Light default | Dark default; Light available in 7B |
| D4 | Rail categories and names: Elements · Text · Photos · Uploads · Colors (+ Brand, Themes later) | As proposed |
| D5 | Where Guide answers live: app-local record keyed by project id (no schema) vs a project field (schema change) | App-local for 7C; revisit with event themes |
| D6 | Company elements: copied into projects vs linked "company elements" | Copy (no schema) until Company Profile is scoped |
| D7 | **ADR-052** text overflow (still OPEN): which modes, and Clip for imported text | Clip + Shrink-to-fit first; Auto height persistent later; each needs schema approval |
| D8 | Element kind colours: specific hues; never on canvas selection | Approve the principle; hues reviewed in the B1 mockups |
| D9 | Selection toolbar in 7B (P1) or later | 7B P1, hideable |
| D10 | Mockup checkpoint (B1) before coding 7B | Yes, short round on the wireframes in this document |
| D11 | "Guide me" on projects not created by the Guide: non-destructive steps only | Yes |
| D12 | Brand identity (mark, name styling) for the app | Defer; placeholder stays |
| D13 | Button order: in-app consistent (primary right) on both OSes | Yes |
| D14 | UI scale setting (90–125 %) | Yes, in Settings |

---

## Appendix A — Screen / surface inventory

| Surface | Purpose | Primary action | Secondary | Current pain points | Recommended structure | Phase |
|---|---|---|---|---|---|---|
| Welcome | Start or resume | New project | Open, Import, recents | Plain, no Guide slot, no recovery banner | Start hub (§10) | 7B (structure), 7C (Guide card) |
| New Project dialog | Name + format | Create | Cancel | Radios, not visual; separate from Guide | Format cards shared with Guide step 1 (§11) | 7B |
| Recovery dialog | Recover unsaved work | Recover | Discard, Decide later | Fine | Contract v2; Start banner after Decide later | 7B |
| Top bar | Document actions | Save (today) | Undo/Redo, Export, menus | Save primary, Export ghost; no Checks; Align menu name | §14 | 7B |
| Menus | Full command access | — | — | No Help; no Alt access on Windows | File · Edit · Arrange · View · Help | 7B |
| Tool rail | Choose a tool category | — | — | Placeholders; unlabeled meaning of "Design" | Labelled categories (§15) | 7B |
| Design drawer | Add elements, background, palette, fonts | Add layer | — | Mixed purposes, long | Split into Elements / Text / Colors | 7B |
| Assets drawer | Project images | Import files… | Add, Background, Remove | Name; no scopes | Uploads drawer; scopes later | 7B / future |
| Canvas (Design) | Edit | Direct manipulation | — | Mode switch alone at top left; legend chip under artboard | View bar, selection toolbar, mode banners (§17) | 7B |
| Canvas (Print Preview) | See the sheet | — | Zoom | Read-only state not explicit | Banner + "Edit in Design" | 7B |
| Reposition (crop) | Move sample in slot | Done | Reset, Cancel | Preview-only nature unclear | Shared mode banner with explanation | 7B |
| Text edit overlay | Type in place | Enter | Esc | No mode indicator | Mode banner | 7B |
| Layers panel | Structure, order, visibility | Select | Rename, reorder, lock, hide | Fixed share of column; no check markers | Adaptive (§18), markers, thumbnails | 7B |
| Properties (none) | Project facts | — | Background, printer guidance | Fine; profile line missing | Project card + output line | 7B |
| Properties (text) | Edit text | — | — | 8 sections, long | Essentials + sections (§19–20) | 7B |
| Properties (photo) | Edit slot | — | Samples | Slot vs sample mixed | Essentials + Preview-only box (§21) | 7B |
| Properties (image) | Role, fit, quality | — | Replace, Background | OK; long | Essentials + sections | 7B |
| Properties (shape/group/multi) | Edit | — | Align | W6 patched locally | Essentials-first rule | 7B |
| Font picker | Choose a family | Choose | Search, show more | Fine; anchored in a long column | Popover; recent/project first | 7B |
| Fonts in this project | Fix missing fonts | Replace… | — | In Design drawer | Text drawer + Checks | 7B |
| Event palette | Event colours | Add | Rename, remove, link | Far from colour fields | Colors drawer + colour popover | 7B |
| Status bar | Facts + view toggles | — | Zoom | Hidden modes as icons; duplicate safe-area toggle | Facts only + Checks + Output chip (§28) | 7B |
| Output Profile dialog | Choose and understand the printer profile | Done | Toggle, details | Long flat list; amber badges; dev note; awkward copy | Summary + tiers + link to Checks (§23) | 7B |
| Export dialog | Write files | Export… | Folder, conflict, reveal | Crowded; profile/checks below fold at 125 % | Pinned summary + sticky footer (§26) | 7B |
| Import dslrBooth dialog | Turn ZIP into project | Import | Choose another | Vendor notes mixed with essentials | For you / Details (§27) | 7B |
| Layer shortcuts dialog | Help | Close | — | Narrow scope | Help › Keyboard shortcuts | 7B P2 |
| Native unsaved prompt | Protect work | Save | Don't Save, Cancel | — | Unchanged | — |
| Autosave issue badge | Warn | — | — | Fine | Keep | — |
| Settings | (absent) | — | — | Profile choice and appearance have no home | New Settings dialog (§29) | 7B P1 |
| Checks panel | (absent) | Select | Filter | Checks fragmented | New (§25) | 7B P0 |
| Design Guide | (absent) | Next | Back, Skip, Open in editor | — | §38 | 7C |

## Appendix B — User-flow maps

**Flow A — Experienced user (blank)**
`Start` → **Blank design** → New Project (name, *2×6 strip* card, 600 DPI) → **Editor** (Elements drawer docked on roomy, overlaid on compact) → add photo slots, text, upload art → selection toolbar and Essentials for edits → view bar *Safe areas: On* → top-bar **Checks (2)** → panel → *Select* → fix → **Export** (pinned summary "0 errors · 0 warnings · Output: DS-RX1") → folder → done → Show in Explorer.

**Flow B — Guided user**
`Start` → **Guided design** → Format (2×6) → Event type (Wedding) → Style → Colors (palette) → Photos (3, portrait) → Logo (monogram) → Wording (names, date) → Company branding (from profile; skipped if none) → Layout → **Review** (live preview with safe areas, Checks: errors and warnings only, Print Preview) → *Export* (dslrBooth preset) **or** *Open in editor* (same project) → Checks → Export.

**Flow C — Existing dslrBooth template**
`Start` → **Import dslrBooth…** → file picker → Import dialog (preview + facts; *One 2×6 strip, printed two per sheet — Recommended* vs *Sheet as is*; **For you** notes; Details collapsed) → **Import** → Editor with banner "Imported — 3 things to review" → **Checks › dslrBooth / Text & fonts** (missing font → Replace…, over-long line → overflow setting when ADR-052 lands) → edit → **Export** (dslrBooth template · 2×6 strip).

**Flow D — Existing project**
`Start` → **Recent** (thumbnail, status) → open → Editor restores last panel layout → small edits (words via Text essentials, colours via palette) → **Export** → *Client proof* (and later *Send proof…*) or dslrBooth template.

**Flow E — Printer-aware (Output profile → Safe areas → resolve → Print Preview → Export)**
Status chip **Output: none ▾** → choose *DNP DS-RX1* (or Settings › Printing default) → view bar **Safe areas: On** (first-time legend) → Layers ⚠ markers + **Checks (Printer & cut: 2)** → *Select* → move text inside the teal line (warning clears live) → **Print Preview** (both copies, cut line) → **Export** (summary: "Output: DS-RX1 · Provisional · 0 safe-area warnings").

## Appendix C — Windows validation findings → where they are solved

| Finding (Output Profiles Windows validation) | Solved by |
|---|---|
| Output Profile row/checks below the fold in Export at 1920×1080 / 125 % | §26 pinned summary + §29 sticky footer (B3, B8) |
| Evidence badges need stronger distinction | §23 evidence tiers (B9) |
| Developer-facing source note in profile details | §23 copy fixes: removed from user notes (B9) |
| Copy cleanup in provisional-profile wording | §23 proposed sentence (B9) |
| Safe Areas tooltip/title behaviour | §17/§24 labelled view-bar pill + tooltip that explains "editor-only, never printed" (B6) |
| Short-height inspector | §19 Essentials + collapsed summaries; §30 height tiers (B4, B5) |
| Native Windows Ctrl shortcuts | §31 Alt menus, Ctrl+Y, shortcut audit (B10) |
