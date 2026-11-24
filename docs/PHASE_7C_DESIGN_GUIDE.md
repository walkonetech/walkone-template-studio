# Phase 7C — Design Guide: architecture decision memo

_Status: **implemented and owner visual review APPROVED (2026-11-24); committed and pushed; Craft Anything Windows validation next.** Baseline `85296d9` (B6 closed, Mac + Windows validated). Decision record: ADR-067 (**Accepted**). Owner decisions confirmed as built: card name "Design Guide"; strip photo block centred above the text; colour sets Classic / Blush / Garden / Midnight / Bold; text under the photos; Cancel keeps answers until quit (Start over clears); history starts empty after Finish (no "Undo Design Guide"); Start-screen card only. Release hardening, ADR-066 (fonts) and ADR-052 (text overflow) are not started._

## 1. What it is

A short guided path from "I need a photo booth template" to "I have a clean, editable starting design", for operators who do not want to start in the full editor. It is **a creation path, not a second editor**: it produces an ordinary `TemplateProject` through the normal create path and the editor's own mutations, then hands it to the Full Editor. Copy stays operator-oriented ("Choose your print size", "How many photos?", …); internal words (TemplateProject, OutputComposition, schema) never appear.

This narrows the 7A §38 plan (event type, style, logo, company branding, layout as separate steps, "Guide me" re-entry) to the five steps the 7C brief asks for. The other 7A steps stay future work.

## 2. Step sequence (exact)

| # | Step (title) | Asks | Writes to the project (at hand-off) |
|---|---|---|---|
| 1 | Size — "Choose your print size" | Project name; 2×6 Strip / 4×6 Portrait / 6×4 Landscape / Custom size; Resolution 300/600 (built-ins) | Through the normal create path: the built-in format (`builtInFormat`) or the custom `FormatDefinition` (size, DPI, OutputComposition, generic safe margin). No Output Profile. |
| 2 | Photos — "How many photos?" | 1–4; a starting layout (two per count); photo shape Auto / Portrait / Landscape / Square | Normal `PhotoLayer`s from the editor's own `createNewLayer('photo')`, numbered 1…n, placed and sized |
| 3 | Colors — "Choose your colors" | A starting colour set (Classic, Blush, Garden, Midnight, Bold) or own Background / Accent / Text; photo frame None/Thin/Thick, frame colour Accent/White, corners Square/Rounded | Event Palette entries Background, Accent, Text (`addPaletteColor`); canvas background linked to Background; frames linked to Accent (or white); corner radius |
| 4 | Text — "Add event text" | Event name, Date, Message (each on/off + text); font (installed common fonts only); bold event name; alignment | One normal `TextLayer` per filled-in line (`createNewLayer('text')`), text colour linked to the palette Text colour |
| 5 | Review — "Review your design" | — (summary: size, prints, photos, colours, text, safe margin, printer profile) | — ; **Finish** opens the editor |

Back / Next move between steps; the step list shows done / current (`aria-current="step"`). **Open in editor** is in the footer on steps 2–4 (and Finish on Review). No 10–15 step wizard; Skip is not needed because every step has usable defaults.

## 3. Where Guide state lives

`guideStore` (renderer, zustand): `open`, `step`, `answers`, `error`. **UI state of this run only** — never in the project, history, autosave, Modified state or the recents. The answers are a plain `GuideAnswers` object (`src/editor/designGuide.ts`). Nothing is persisted, so there is no schema question.

- Cancel / Escape before Finish returns to Start (no project exists, so there is nothing to save or discard) and **keeps the answers until the app quits**: reopening resumes at the same step, and **Start over** clears them. Finish clears them.

## 4. When the real project is created

**When the operator leaves for the editor** (Open in editor or Finish) — not at step 1. Until then the Guide only holds answers and shows a preview. Reasons: Cancel needs no unsaved-changes prompt or recovery copy for a project the operator never saw; recovery/autosave protect the project from the moment it exists, exactly as for New project; and there is one creation path (`createProject({ name, format })` → main process → `createProjectFromFormat`, the same call New project and Custom size use).

## 5. How Guide changes are applied / why Back–Next never duplicates

The design is a **pure function of the answers**: `applyGuide(emptyProject, answers)` takes a freshly created, empty project of the chosen format and applies, in order, `addPaletteColor` ×3 → `setCanvasBackgroundColor` → `createNewLayer('photo')` + `addLayer` per slot → `createNewLayer('text')` + `addLayer` per line. It is never applied twice to the same project: the preview recomputes it from an empty project on every change, and the hand-off applies it once to the newly created project. So going Back, changing an answer and coming forward can never leave stale or duplicate layers (unit-tested; built-app check 5).

The live preview draws that preview project with **the export renderer** (`renderProjectToCanvas` / `renderOutputToCanvas`, numbered placeholders) — there is no separate Guide renderer. Multi-copy formats offer Design / Print sheet.

## 6. Undo / history

At hand-off the answers are applied as **one** `commit`, then history is cleared: the Guide's result is the project's starting point, just as an empty canvas is for a blank design. Undo never takes the Guide apart field by field, and never strips the design back to an empty canvas. Every edit after that is normal history. The project is new and unsaved (Modified), so closing asks to save as usual.

## 7. Open in editor

Available from Photos, Colors and Text (and Finish on Review). It applies the answers so far (a turned-on but empty text line simply makes no layer), opens the normal editor, focuses the canvas region and shows "Your design is ready…". Nothing is converted or flattened: every slot, text and palette colour is a normal, editable object. A custom size's cut-guide preference is applied as the Custom Size wizard does. No getting-started tips (the design is not blank).

## 8. Custom Format reuse

"Custom size" on step 1 opens **the B5.5 Custom Size wizard itself** (same component, same validation, same My formats saving) on top of the Guide, with `purpose: 'guide'`: its last button reads **Use this size**, it has no project-name field (the Guide names the project), and it hands the `FormatDefinition` back to the Guide instead of creating a project. Saved **My formats** are offered on the same step. No second format model, no simplified copy of B5.5.

## 9. Photo layouts and slot geometry (exact presets)

| Photos | Layouts offered (first = recommended for tall designs) | Recommended |
|---|---|---|
| 1 | Large; Centered (78 % of Large) | Large |
| 2 | Stacked; Side by side | strips/portrait → Stacked; landscape → Side by side |
| 3 | Stacked; One large, two small (below on tall designs, beside on wide ones) | narrow strips → Stacked; otherwise One large, two small |
| 4 | Grid (2×2); Stacked | narrow strips → Stacked; otherwise Grid |

Geometry (design pixels, whole numbers):
- Margin from the design edge: 6 % of the short side, and at least the generic safe margin + 2 % when the format has one (slots never touch the safe margin).
- Gap between photos: 4 % of the short side.
- When any text line is turned on, the bottom 20 % of the inner area is the text band; the photos use the rest. With every line off, photos use the whole inner area.
- **Slot shape is a camera shape, never the design's proportions:** 3:2 landscape, 2:3 portrait or 1:1 square. Auto picks portrait or landscape per row from the space available; the choice is geometry only (`width > height` = landscape) — **no orientation property is stored**.
- Each row is as wide as the area allows; if the rows are too tall together they are all scaled down; the block is centred.
- These are **starting arrangements only**: nothing keeps them; every slot is a normal layer that moves and resizes freely. The Feature Lab "Format-Aware Photo Slot Defaults & Orientation" concept is **not** promoted and the Full Editor's Add photo is unchanged.

## 10. Text and fonts (current architecture only)

- Lines: Event name (scale 1), Date and Message (0.42 of it), line height 1.2, stacked and centred in the text band. The event-name size follows the band height; a line wider than the band starts smaller so it fits on one line (measured with the canvas font stack). This is a starting size only — nothing keeps fitting it; ADR-052 stays OPEN and the normal overflow Checks apply.
- Fonts offered: the common cross-platform families (`COMMON_FAMILIES`) **that are installed on this computer** (installed list, or a probe when it cannot be listed), plus Arial (the B5 new-text default). No missing font can be chosen; the missing-font warning is unchanged and still authoritative when a project moves to a computer without the font.
- dslrBooth exports rasterise text (ADR-047/051), so the booth PC needs no project fonts; no booth-PC font check is added. `.boothproject` still stores family names only (no embedding). ADR-066 (Google Fonts library, fonts travelling with the project) stays OPEN; the Guide works with it later without depending on it.

## 11. Accessibility model (B6 from day one)

Labelled modal dialog (title = step question, description "Design Guide · Step n of 5"); step list with `aria-current="step"`; one polite announcement per step change; focus moves to the step's chosen option (or first field; the Review summary on Review, so a second Enter cannot finish); every choice group is a `radiogroup` with arrow keys (shared `onRadioGroupKeyDown`); every field has a visible label; an empty turned-on line marks its field `aria-invalid` with the reason as its description; a disabled Next is described by "Fix n things to continue."; Escape closes; focus returns to the Start card; Tab is trapped in the Guide (and in the Custom Size wizard above it). High Contrast: chosen cards, counts and the current step use Highlight/HighlightText (existing `cf-*` rules + the My formats pressed state); layout drawings use Canvas/CanvasText; colour swatches keep the operator's colours with a system border. Reduced motion, Light/Dark and Compact come from the shared tokens.

## 12. Re-entry

**Not supported in 7C (one-way Guide → Editor).** Once the editor has changed the design, reconstructing the Guide's intent is ambiguous. Re-entering ("Guide me") stays a possible future feature (7A §38, D5/D11).

## 13. Schema

**No schema change.** The Guide writes only existing fields (palette, canvas background, layers) through existing mutations. A Guide-made standard design saves as schemaVersion 1 and a custom size with a safe margin as 2 — exactly as the same format made without the Guide (ADR-060). No Guide metadata, no event metadata, no "created with Guide" flag, no recents badge.

## 14. Output

Exports go through the existing pipeline unchanged; there is no Guide export path. Finish opens the editor (Checks, Print Preview, fine-tuning, then Export). Validated: the Guide design and the same design built by hand in the editor produce the same project content and the same Design / Print / Proof pixels and an equivalent dslrBooth package (see TESTING_STRATEGY §9s for the one transparent-artwork note).

## 15. Files

- `src/editor/designGuide.ts` — steps, answers, layouts, `applyGuide`, issues, summary (pure; unit-tested).
- `src/renderer/src/editor/DesignGuide.tsx` — the Guide window, preview, hand-off (`finishGuide`).
- `src/renderer/src/editor/guideStore.ts` — Guide UI state.
- `src/renderer/src/editor/CustomFormatDialog.tsx`, `layoutStore.ts` — `purpose: 'guide'`.
- `src/renderer/src/editor/Welcome.tsx` — the Design Guide card. `EditorScreen.tsx`, `debugHooks.ts` — mounting and test hooks.
- `src/renderer/src/styles/shell.css`, `a11y.css` — Guide styles and High Contrast rules.
- Tests: `src/editor/__tests__/designGuide.test.ts` (40); `research/editor-validation/validate-7c-guide.js` (built app).
