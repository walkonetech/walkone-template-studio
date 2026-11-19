# Phase 7B · B1 — Editor refresh mockup review

_Status: **awaiting owner review** (2026-11-19). Design-only. No production code, schema, `.boothproject`, renderer, export, import, Output Profile, Safe Area, preflight, autosave, recovery, keyboard or test change._

**Mockups:** [`design/phase-7b-b1/index.html`](../design/phase-7b-b1/index.html). It is a standalone page: open it in any browser. It has no app imports or app state and is not wired into the app. Rendered PNGs of every mockup are in [`design/phase-7b-b1/png/`](../design/phase-7b-b1/png/).
**Architecture source:** [PHASE_7A_UX_ARCHITECTURE.md](PHASE_7A_UX_ARCHITECTURE.md). B1 shows that architecture and does not restate it. Section references (§) below point to it.

All sample content is fictional: Ava & Theo Wedding, Northfield Holiday Party and the other names. Sample photos are abstract drawings.

## 1. Working decisions applied (owner brief for B1)

| # | Applied as |
|---|---|
| D1 | **Export** is the primary top-bar button. Save is secondary and greyed out while the project is saved. |
| D2 | Properties \| Layers become **tabs** below 860 px of window height and are stacked above it. |
| D3 | **Dark** is the default. Light and Match system are designed (mockups 11, 12). |
| D4 | The rail reads **Elements · Text · Photos · Uploads · Colors**. No better label emerged, so there is no alternative. |
| D5 | Guide answers that are only recommendations stay on this computer. Not shown (7C). |
| D6 | Logos are copied into the project. Not shown (Company Profile is future work). |
| D8 | Kind colours are subtle: chips, icons and Layers only. **Never used for selection.** |
| D9 | Contextual selection toolbar in words (mockups 3, 4, 5, 11); it can be hidden in Settings. |
| D10 | This checkpoint. |
| D11 | "Guide me" is non-destructive. Not shown (7C). |
| D12 | Neutral placeholder mark and the name "Template Studio". |
| D13 | Primary action on the right in every dialog, on both operating systems. |
| D14 | UI scale 90 / 100 / 110 / 125 % in Settings › Appearance. |
| ADR-052 | Still **OPEN**. The control "When text is longer than its box" is drawn in mockup 3, tagged "ADR-052 · not in 7B". There is no schema change. |

**DS-RX1 physical status (owner brief):**
- The latest DNP test print is treated as a practical **pass**: no visible cut or spacing discrepancy, no white gutter, both strips match, and automatic two-strip cutting works.
- No exact trim distances are claimed, and the **3 mm** keep-safe guidance stays.
- Mockup 9 shows this as *Observed*, not *Verified*.
- The environment used remains the research/printer environment, not the production booth PC.
- The bundled profile data is **unchanged** (see V8).

## 2. Visual direction

- **Feel:** a polished, professional creative tool. It aims to be as easy to start in as Canva and as precise as Figma, with a disciplined desktop structure.
- **Colour:** quiet, cool-neutral chrome so the artwork is the brightest thing on screen. One indigo accent is used for selection, focus and the primary action. Status colours mean status only.
- **Words before icons:**
  - rail labels;
  - view-bar state words ("Safe areas: On");
  - toolbar verbs ("Reposition", "Duplicate").
- **Every state uses an icon and a word, not only a colour:** Saved / Modified, severity, evidence tier, toggle state.
- **Avoided:** glass effects, gradients in the chrome, pill-shaped everything, coloured borders everywhere, oversized mobile controls.

## 3. Design system shown

**Tokens.** There are three layers (§33):
1. **Primitives:** neutral ramp, indigo, status ramps, kind hues, overlay hues.
2. **Semantic tokens per theme:** `--surface-{canvas,app,panel,raised,overlay,input}`, `--text-{primary,secondary,label,muted,disabled}`, `--border-{subtle,·,strong}`, `--accent*`, `--focus-ring`, `--selection`, `--status-{error,warning,success,info}-{fg,bg,border}`, `--kind-{photo,text,image,shape,group}`, `--overlay-{safe,trim,flag,cut,guide,halo}`.
3. **Components** use only the semantic tokens.

The mockup CSS defines these tokens and swaps `.t-dark` / `.t-light`, which is a working proof of the structure.

**Typography:**
- Inter for the interface (proposed bundled; see V1), with tabular numerals in every numeric field.
- Size scale and use:

| Size | Used for |
|---|---|
| 11 | caps labels, counts |
| 12 | labels, helper text, badges, check details |
| 13 | body, property values, controls |
| 14 | document title, drawer titles |
| 16 | dialog titles |
| 20 | section headings |
| 28 | Start display |

**Spacing and density:**
- 4-pt scale.
- Control heights: 28 px in panels, 32 in dialogs, 40 on Start.
- Chrome heights: top bar 44, view bar 40, panel header 34, section header 34, layer row 30, status bar 28.
- Radii: 4–6 for controls, 8 for cards, 10 for dialogs, drawers and popovers.

**Element kinds (D8):**

| Kind | Colour |
|---|---|
| Photo slot | orchid |
| Text | lime |
| Image | violet |
| Shape | slate |
| Group | grey |

These hues avoid the status hues (red, amber, green, blue), the accent (indigo) and the overlays (teal, orange, red, white, pink).

**Evidence tiers (§23):**

| Tier | Icon | Treatment |
|---|---|---|
| Verified | ✓ | filled green |
| Observed | eye | tinted blue |
| Estimated | ≈ | amber outline, no fill |
| Reference | ruler | neutral |
| Unknown | dashed "?" | dashed outline |

**Interaction states shown:**
- hover, selected, active and disabled;
- focus (2 px ring);
- warning and error inputs;
- a locked field;
- Saved, Modified and "Autosave paused";
- collapsed and expanded sections;
- layer rows at rest, on hover, selected and with a warning;
- view-bar toggles on and off.

## 4. Mockups

| # | Screen | Size · theme | Before → after |
|---|---|---|---|
| 1 | Start screen | 1426×779 · Dark | Plain Welcome screen → three creation cards (Guided tagged *Phase 7C*), Open, recovered-work banner, Recent with thumbnails and a missing-file state, Learn row |
| 2 | Full Editor, default | 1920×1000 · Dark | Save primary, hidden status-bar modes, mixed Design drawer → Export primary, labelled rail, view bar, project card in Properties, Layers stacked, facts-only status bar |
| 3 | Text selected | 1920×1000 · Dark | Up to 8 equal sections → pinned header + 6 essentials + summarised sections; selection toolbar; presets moved to the Text drawer |
| 4 | Photo slot selected | 1920×1000 · Dark | Slot and sample confused → "Sample · #n" tag, empty-slot look, essentials (number, fit, frame), dashed "Preview only" box, Photos drawer |
| 5 | Short-height Windows | 1426×779 · Dark | Properties under the status bar → floating drawer, Properties \| Layers tabs, collapsed sections with scroll cue, Alt access keys, Ctrl tooltips |
| 6 | Print Preview + safe areas | 1920×1000 · Dark | Legend chip under the artboard → read-only banner, both copies with labelled cut, hatch + keep-safe + flag, legend in the Safe areas menu |
| 7 | Checks panel | 1920×1000 · Dark | Checks scattered in four places → one panel: severity → topic, merged repeats, Select, Details, "Fix" drawn as *Later* |
| 8 | Export | 1426×779 · Dark | Profile row and checks below the fold → pinned summary "3 files · 1 needs attention · Printer: DNP DS-RX1", grouped deliverables, collapsed Checks, sticky footer |
| 9 | Printer profile | 1426×779 · Dark | Long flat list, amber badges, dev note → summary card, test-print result, guidance vs printer setup, setup steps, evidence by tier |
| 10 | dslrBooth import | 1426×779 · Dark | Mixed notes → detected format, picture choice with Recommended, "For you", Compatibility details closed |
| 11 | Light theme | 1920×1000 · Light | (new) Text selected, Colors drawer with the Event Palette, colour popover, safe areas on |
| 12 | Settings | 1426×779 · Dark + Light | (new) Appearance; Printing + Editor. Settings are for this computer and never stored in a project |

**Mockup 1 · Start screen.** In the 7B build the Guided card stays hidden until 7C (the 7A rule); it is drawn only for review.

**Mockup 4 · Photo slot selected.** The mixed state (one slot without a sample) only demonstrates the empty-slot look.

**Mockup 7 · Checks panel.**
- The panel opens in the drawer slot, so Properties stays visible while you fix the selected layer.
- The items are illustrative and cover every severity and topic:
  - a missing image (Error);
  - the date near the edge, a missing font merged across 3 texts, and a low-resolution background (Needs attention);
  - dslrBooth text exported as part of the picture, and provisional safe areas (Good to know).

**Mockup 8 · Export.**
- The semantic layer package is not in this dialog.
- The footer stays visible at 779 px of height without scrolling.

**Mockup 9 · Printer profile.** It shows no developer notes and no repository paths.

**Mockup 11 · Light theme.** The artboard and overlay hues are identical to Dark.

## 5. Responsive behaviour

The tiers and rules come from §30:

| Condition | Behaviour | Shown in |
|---|---|---|
| Width ≥ 1600 | The drawer docks and pushes the canvas. Right column is 340 px | 2, 3, 4, 6, 7, 11 |
| 1280–1599 | The drawer floats over the canvas, with a pin to keep it open. Right column is 300 px | 5 |
| Width < 1280 | Right column 280 px. View-bar toggles shorten. Status bar condensed | rule |
| Height ≥ 860 | Properties sits above Layers with a resizable split | 2–4, 6, 7, 11 |
| Height < 860 | Tabs. Secondary sections start collapsed | 5 |
| Height < 720 | Compact selection toolbar. Dialogs use the full height minus 24 px | rule |
| Any size | Canvas at least 520 × 400. Dialog summaries and footers always visible. Export always in the top bar | 5, 8–10, 12 |

At 1426×779 the canvas area measures 1054 × 671 px, and the full 2×6 strip shows at 16 % zoom.

## 6. Windows, macOS and accessibility

**Windows:**
- Ctrl shortcut labels, with **Ctrl+Y** as an extra redo shortcut.
- Alt underlines menu access keys; Alt+F/E/A/V/H opens a menu and F10 focuses the menu bar.
- "Show in Explorer".
- Thin scrollbars that keep a visible track.

**macOS:**
- ⌘ labels and the native app menu (ADR-035).
- The same in-app dialog button order as Windows (D13).

**F6 region order:**
1. top bar;
2. rail;
3. the open drawer or the Checks panel;
4. view bar;
5. canvas;
6. Properties | Layers;
7. status bar.

**Escape order:** popover → drawer → mode → selection.

**Accessibility shown:**
- a 2 px focus ring;
- targets of at least 24 px (28 px for toolbars and the rail);
- no state shown by colour alone;
- no interface text below 11 px.

Screen-reader work stays in B24.

## 7. Open design decisions (new in B1)

| # | Question | Shown / recommended |
|---|---|---|
| V1 | Interface font | Bundled **Inter** (identical on Mac and Windows, strong numerals). Alternative: system UI font (7A §31) |
| V2 | Kind colour hues (D8) | Orchid · lime · violet · slate · grey |
| V3 | Guided design card before 7C | Hidden in the 7B build; tagged card only in mockups |
| V4 | Selection toolbar content | Verb + font, size and colour (text) or photo number (slot), Arrange, Duplicate; Delete under More |
| V5 | Where the Checks panel opens | Left, in the drawer slot |
| V6 | Trim hatch colour | Orange; alternative neutral grey |
| V7 | Floating drawer after an add | Closes unless pinned |
| V8 | Record the visual DNP print pass in the profile data | As *Observed*. This is a data-only change and needs separate approval; it is not done in B1 |
| V9 | Learn row on Start | Keep; fill when help pages exist (P2) |
| V10 | Drawer width | 264 px docked (today 224) |

Smaller questions, one per mockup, are on the page next to each screen.

## 8. Owner review checklist

Approve or amend each item. This approves the **visual direction only**, not implementation.

1. Start screen structure (1)
2. Top-bar hierarchy (2)
3. Rail structure (2–5)
4. Canvas-state bar (2, 6)
5. Properties hierarchy (3, 4)
6. Properties | Layers short-screen tabs (5)
7. Selection toolbar (3, 4)
8. Checks panel (7)
9. Export dialog (8)
10. Output Profile dialog (9)
11. dslrBooth Import simplification (10)
12. Settings architecture (12)
13. Dark-theme direction (all)
14. Light-theme direction (11, 12)
15. Spacing and density (view at 1:1)
16. Typography (design system; V1)
17. Element-kind colours (design system, 3, 4; V2)
18. Responsive behaviour (5, §5 above)

**After sign-off:** B2 (token architecture) is the first implementation item (§40). Nothing in 7B is built before your approval.
