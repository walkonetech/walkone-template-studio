# Phase 6C results — Windows, dslrBooth 7.48, DNP printer (Stage 1)

_Recorded 2026-11-17 from the Craft Anything 6C reports run on the owner's Windows test laptop. Research note, not a decision._

## What this note records
**Recording rule (owner decision, ADR-050):** only what was **observed**. That means what dslrBooth did when it was run, what it showed, the files it wrote, what was printed or spooled, and what Template Studio did. The reports also contain conclusions drawn from reading dslrBooth's program code ("IL", "XAML/BAML", "Static"). Those are **left out** of this repository and treated as unverified until a runtime test confirms them. The research evidence log, which holds values embedded in dslrBooth's program files, stays on the laptop and never enters this repository. Client templates were used only from a private temporary folder on the laptop; no client names, artwork or photos are recorded here.

## Environment (B: research laptop with the DNP added, not the booth PC)
| Item | Value |
|---|---|
| OS | Windows 11 Pro (build 26200), 64-bit; screen 1920×1080 at 125 % scaling |
| Tools | Node 24.13.1, npm 11.6.0, Git 2.51 |
| dslrBooth | 7.48.0903.1, **trial licence** (outputs carry the demo watermark); update to 7.49 offered and declined |
| Printer | **DNP DS-RX1**, driver 1.1.1.0 (x64), USB |
| Template Studio | commit `3a39f23`, built from source and run unmodified |

Hardware results hold for this laptop. **The production booth PC's printer settings are not verified.**

## Results
| # | Test | Result |
|---|---|---|
| 1 | Launch | Pass (default Electron icon in the title bar) |
| 2 | New / Save / Save As / close / reopen / autosave / recovery | Pass (4B suite 40/40; non-ASCII paths with `&` work) |
| 3 | Windows dialogs, Show in Explorer, file names | Pass (Save and Export cleaned names differently, W5) |
| 4 | Automated tests | Pass with notes: typecheck, lint, build pass; format check fails on CRLF checkout (W1); 1 unit test assumed `/` (W2); Electron appeared not to install (W3; re-test: Electron 44 downloads its binary on first use, nothing to fix) |
| 5 | UI and rendering at 125 % | Pass: crisp text, smooth canvas edges, Ctrl+ shortcut labels |
| 6 | Native 2×6 dslrBooth export | Pass |
| 7 | 4×6 sheet export | Pass |
| 8 | Import of both into dslrBooth | **Pass**: right paper, dpi, two-up switch, layers and slot boxes |
| 9 | Re-import of the same ZIP | Recorded: dslrBooth **always makes a copy** ("… Copy1") with a new Id; it never replaces |
| 10 | Is `preview.png` needed? | **No**: imports and runs without it, but the template picker thumbnail is blank |
| 11 | `_1x` / `_2x` outputs | Pass: `_1x` is one strip, `_2x` is two equal strips side by side, no gutter |
| 12 | dslrBooth session vs Template Studio design | **Pass**: outside the photo slots mean difference 1.2/255 (anti-aliasing and the trial watermark only) |
| 13 | Border direction | dslrBooth's photo border grows **outward** (Template Studio bakes frames into artwork, so unaffected) |
| 14 | Rotation | Photo rotates **clockwise about the slot centre** |
| 15–16 | Physical print / safe area | Partial: printed; **owner readout of the measurement print pending** |
| 17 | 4×6 print | Not tested (not needed) |
| 18 | `/print` web endpoint | Not tested: **owner manual check pending** |
| 19 | Import from dslrBooth (4 owner templates) | Pass, except live text (C1) |
| 20 | Imported render vs dslrBooth preview | Pass outside text boxes; **live text missing** (C1) |
| 21 | Round trip dslrBooth → Template Studio → dslrBooth | Partial: photo boxes and root settings exact; **live text lost** (C1); inches setting became pixels (C2) |
| 22 | Fonts on Windows | Pass: 198 families found; missing fonts (Helvetica, Poppins, Didot, Bickham Script Pro) get a warning and the name is kept |
| 23 | Text baked into exports | Pass: dslrBooth needs no fonts |

## Format questions now answered (observed)
- dslrBooth 7.48 **accepts** Template Studio's native 2×6: `Dimensions="0"`, `print_2_per_page="True"`, 1:3 canvas (1200×3600 at 600 dpi). It switches "Print 2 per page" on and runs live sessions from it.
- For a non-1:3 canvas (4×6) the "Print 2 per page" switch is hidden.
- `Dimensions` is the unit dslrBooth's editor shows sizes in: a template with `1` showed inches ("View Dimension In"). Geometry is always in pixels.
- On import dslrBooth renames image layers to their file names, adds `IsVisible`, rewrites `OriginalDevice`, keeps `IsLegacy="True"` and saves the template at once. Session JPGs are tagged 96 dpi, but the pixel sizes are right.
- Photo fit in a session matches **centred cover**.
- Real templates made in dslrBooth's own editor can contain **live `<Text>` elements**. None of the five fixtures in this repository has one.

## Printer observation (first Output Profile input; DS-RX1, this laptop)
- dslrBooth sends the `_2x` sheet as **one borderless page**, 156.1 × 105.0 mm.
- The **2-inch cut is a printer-driver setting** (`CUT_2INCH` in the print settings dslrBooth saved), not a template or dslrBooth option. Other saved settings: print margin off, 300 × 300 dpi, luster finish.
- Predicted trim: about 1.8 mm at the top and bottom and 1.6 mm at the outer long edge. **Interim guidance: keep critical content at least 3 mm from strip edges and the centre cut** until the measurement print is read.

## Security observation (dslrBooth, not Template Studio)
Observed at runtime: dslrBooth's built-in web server listens on the local network (port 1500), and its file list and full-resolution photo downloads need **no password**. Anyone on the same network as the booth can list and download guests' photos. Operational advice until checked further: run the booth on a private network, not shared or guest Wi-Fi. Whether `/print` prints without a password is **not tested** (owner check pending).

## Defects and Template Studio fixes
| Id | Issue | Status (2026-11-17) |
|---|---|---|
| C1 | dslrBooth live `<Text>` dropped on import, lost on round trip; the import note wrongly said text was "already flattened" | **Implemented (2026-11-18), pending the Windows/dslrBooth round-trip re-test:** live text imports as editable text layers (ADR-051), built against the synthetic fixture below; the import suite checks each text box on its own |
| C2 | `Dimensions` 1 (inches) came back as 0 (pixels) | **Fixed**: the imported unit is kept on export |
| C3 | Re-import always creates a copy | Workflow documented (USER_WORKFLOWS) |
| C4 | No `preview.png` gives a blank thumbnail | No change: Template Studio always writes one |
| W1 | Format check fails on Windows (CRLF checkout) | **Fixed**: `.gitattributes` forces LF |
| W2 | One unit test assumed `/` | **Fixed** |
| W3 | Electron install step seemed not to complete | **Not a defect** (Windows re-test of `cfcc9cf`): Electron 44 has no install step; `npm ci` completes and the binary downloads on first use. Noted in MANUAL_TEST_GUIDE |
| W4 | Default Electron icon | Open: needs a WalkOne icon file from the owner |
| W5 | Save and Export cleaned names differently | **Fixed**: one rule |
| W6 | Align row below the fold on short windows | **Fixed** for several selected layers: Align and distribute moved to the top |
| W7 | Zoom anchor drift below one screen pixel | Not a bug; suite tolerance corrected |
| — | App-driving suites assumed macOS (⌘, Didot, Helvetica, `python3`, `osascript`) | **Fixed**: platform-aware |

## Still open (owner)
1. Read the measurement print (Test 16): for each strip, the smallest mark still visible at the top, bottom, outer edge and cut edge; whether it was cut automatically; whether the cut is on the seam; whether both strips are identical.
2. The one manual `/print` check (Test 18).
3. The production booth PC's own print settings (this run was on the research laptop).
4. ~~One real dslrBooth template with made-up live text~~: supplied 2026-11-18 (below).
5. Craft Anything: the C1 round-trip re-test in dslrBooth (synthetic fixture and owner templates A and D).

## Windows re-test of `cfcc9cf` (2026-11-17)
Craft Anything re-ran the checks on the same laptop: the post-6C fixes are **validated on Windows**. One suite portability gap remained: 4C's "Cmd-click extends selection" step sent a Meta-click; Windows correctly uses Ctrl-click (Ctrl-click selected two layers, Meta-click correctly did not), and a follow-on multi-selection check failed with it. The suite now uses the platform modifier (`h.MOD_BIT`). W3 was clarified: Electron 44 has no install step, `npm ci` completes, and the binary downloads on first use.


## Live-text fixture (2026-11-18, C1)
Craft Anything made a synthetic template **only with dslrBooth 7.48's visible editor** on the same laptop (made-up text, a script-drawn picture, synthetic photos; no print made). It is committed as `tests/fixtures/dslrbooth/synthetic/live-text-fixture.zip` with the laptop name removed from `OriginalDevice`; the unedited export, the session output (trial watermark), the editor screenshots and the manifest stay outside the repository. Fixture table: `tests/fixtures/dslrbooth/synthetic/README.md`.

**Observed in dslrBooth:**
- Text controls: X/Y/W/H, Keep aspect ratio, Rotate, a single-line Text box, Color (hex/RGB, no alpha), Font, Weight (the font's style names), Size (Auto, or fixed 8–96), alignment (left/centre/right; centre default), Drop Shadow. No opacity, stroke, vertical alignment, spacing, wrapping or line-break control, so the planned "semi-transparent" text (T8) could not be made.
- `FontWeight` holds the style name; `IsBold`/`IsItalic` stay `False`. **"Bold Italic" is drawn as Italic only**: in the editor, in `preview.png` and in the live session (Arial).
- `TextHorizontalAlignment` 0/1/2 = left/centre/right. `FontColor` `#AARRGGBB`. `Rotation` only written when non-zero; clockwise.
- Choosing a fixed Size resizes the box to the text at that moment (Arial 48 → 55 px high). Arial 48 capitals are 35 px tall on the 600-dpi canvas: **consistent with Size = em size in canvas pixels; inferred, not proven.**
- `FontSize="0"` is **Auto**: the text is stretched unevenly to fill the box (same 97 px capital height in a 1000- and a 250-px-wide box of 150 px height; widths 984 and 246 px).
- Enter inserts nothing (`LINE ONE`⏎`LINE TWO` → `LINE ONELINE TWO`); a pasted second line is dropped. A line wider than its box is cut off at the box edge.
- Stacking follows the layer order: text over a photo slot and under a picture as placed. Special characters kept, XML-escaped.

**Template Studio on the Mac (built app, `validate-import.js` step 10):** all 16 texts import as editable layers; every text box outside the photo slots shows its text; fixed-size Arial text matches dslrBooth's `preview.png` inside its box (ink 0.98–1.12 ×, mean difference 1.7–12.7 of 255); Segoe UI (not on the Mac) keeps its name and shows the normal missing-font warning; an edited text appears in the exported artwork and the export has no native `<Text>`. Known, reported differences: Auto size (uniform letters), the over-long line wraps instead of being cut off, the drop shadow is not drawn.
