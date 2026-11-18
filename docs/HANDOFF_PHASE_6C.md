# Phase 6C handoff — WalkOne Template Studio (2026-11-17)

> Paste-ready status for planning Phase 6C (ChatGPT) and running it on the test laptop (Craft Anything). Kept in the repo at `docs/HANDOFF_PHASE_6C.md`; the full picture is in `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, `docs/PRODUCT_SPEC.md` §0 and, for the long-term product direction, `docs/PRODUCT_ECOSYSTEM.md` (ADR-049).

## What the project is
WalkOne Template Studio is an internal desktop app (Electron + React + TypeScript) for a photo booth company. Its job is to build print templates (2×6 photo strips and 4×6 prints) for LumaSoft **dslrBooth 7.48** on Windows. Photo slots are a real layer type; artwork and text are layers. The project's own file format is `.boothproject`, which is vendor-neutral. dslrBooth support lives only in an import/export adapter.

**Long-term direction (owner-approved, planning only):** Template Studio stays a standalone app and will also become the full-capability template editor inside **WalkOne Booth**, a future Windows-first booth platform that replaces dslrBooth. One shared editor, never two. dslrBooth compatibility is the migration path, later a legacy adapter. WalkOne Booth work has **not** started and is not approved; Phase 6C is about Template Studio + dslrBooth + the DNP printer only.

## Results are in (2026-11-17)
**Stage 1 ran on the Windows test laptop and the Mac-side fixes are done.** Results: `research/PHASE_6C_RESULTS.md` (observed findings only, ADR-050). Still open with the owner: read the measurement print (Test 16), the manual `/print` check (Test 18), and the booth PC's own printer settings. The live-text sample arrived and C1 is implemented (2026-11-18, ADR-051). Craft Anything's Windows re-test of `5f7c26a` found it partial (no text lost; three follow-ups); the follow-ups were addressed in the stabilization pass, and **C1 is implemented — pending Windows revalidation**. The rest of this handoff is the original plan, kept for reference.

## Where things stood before 6C
Phases 0–6B and 6D are complete. All of it was developed and tested on macOS only. **Windows has never been tested.**

| Phase | What it delivered | Status |
|---|---|---|
| 4–5D | Canvas editor: layers, photo slots, text, shapes, images, sample photos and crop, fonts, event palette, strip layout with two-up print preview, autosave and crash recovery | Done |
| 6A | Export of print / design / proof PNGs with checks before export | Done |
| 6B | **Export to a dslrBooth template ZIP.** The default is a native 2×6 strip with `print_2_per_page="True"`. A 4×6 sheet with both copies placed is the fallback. Photo slots stay native; artwork and text are flattened into PNGs. | Done; **not yet loaded into real dslrBooth** |
| 6D | **Import from a dslrBooth template ZIP** into an editable project. A 4×6 sheet holding two copied strips becomes one 2×6 strip printed two-up, or can be kept as is. | Done; checked against 5 real templates |
| **6C** | **Real-booth validation on Windows with the DNP printer** | **Next, not started** |

Quality on macOS: 876 unit tests pass, and the scripted suites that drive the built app pass. Importing the five real templates and exporting them again puts every photo slot exactly where it was. Each import, rendered as-is, matches dslrBooth's own `preview.png` as closely as an independent rebuild from the XML does.

## Hardware now available
The owner has installed the **DNP dye-sub photo booth printer** on a **Windows test laptop with dslrBooth installed** (confirmed by the owner, 2026-11-17). Phase 6C runs there. First step: note the exact dslrBooth version (Help/About). The format work targets **7.48**; if the laptop runs a different version, record it and test anyway, because differences are findings.

## Goal of Phase 6C
Prove on a real Windows machine that:
1. Template Studio runs on Windows;
2. dslrBooth 7.48 accepts the templates Template Studio exports;
3. they print correctly on the DNP printer, including the 2-inch cut.

## How to get the app onto the Windows laptop
- The source is in the owner's **private GitHub repo** (branch `main`, pushed 2026-11-17, including Phase 6D and this handoff). Access needs the owner's GitHub account.
- On Windows: install Node.js 24 LTS and Git, clone the repo, then run `npm install`, `npm run build` and `npm start`. There is no installer yet; packaging is planned for later.
- `npm test` should pass on Windows too. Record any failure exactly.
- The five real dslrBooth templates used as test data are **private client files**. They are not in the repo and must not be uploaded anywhere. On the laptop, use templates the owner exports from their own dslrBooth.

## Phase 6C test plan (each step: pass / fail plus notes and photos of prints)

**A. App on Windows**
1. The app starts. New project, Save, close, reopen and autosave/recovery work.
2. File dialogs, "Show in Explorer" after export, and fonts all behave correctly. Text renders like on the Mac.
3. Run `npm test` and note the result.

**B. Export → dslrBooth**
4. Make a 2×6 strip with 3 photo slots, including one slot with a frame, one with rounded corners and one rotated. Add text and artwork. Export **dslrBooth template · 2×6 strip** and **· 4×6 sheet**.
5. Import both ZIPs into dslrBooth 7.48. Check that they import, open in dslrBooth's editor, show the photo slots in the right places, and that the preview looks right.
6. Run a photo session with each. For the native strip, check the `_1x` output (one strip, used for sharing) and the `_2x` output (two strips on the 4×6 sheet, used for printing).
7. Check the stacking and exact edges: frames sit above photos, rounded corners mask the photo, nothing leaks past the frame.
8. Check the rotated slot: the photo is rotated about the slot's centre, clockwise.
9. Export the same project again and re-import it into dslrBooth. Does dslrBooth treat it as the same template (same `Id`), replace it, or duplicate it?
10. Test a 4×6 postcard (portrait and landscape) at both 300 and 600 DPI.

**C. Printing on the DNP printer**
11. Print the strip template two-up on 4×6 with the 2-inch cut enabled in the printer/driver settings. Check that the cut falls between the strips and that nothing important is cut off.
12. Print the 4×6 sheet version the same way.
13. Test whether dslrBooth's local `/print` endpoint actually produces a physical print.
14. Note the exact printer and driver settings used: media, cut option, borderless. **These belong in the printer setup, never in the template.**

**D. Import ← dslrBooth**
15. Export 2–3 of the owner's existing templates from dslrBooth and import them into Template Studio (**Import from dslrBooth…**). Compare with dslrBooth: positions, layers, the strip-or-sheet choice.
16. Export those imported projects back to dslrBooth and import them there. Compare prints of the original and the round-tripped template.

## Open questions 6C should answer (currently "needs validation")
- Does dslrBooth accept `print_2_per_page="True"` with `Dimensions="0"` on a native 2×6 canvas? Only 4×6 canvases have been seen in real files.
- Is the photo rotation pivot the slot's centre?
- How does dslrBooth handle an equal template `Id` on re-import?
- Is `preview.png` required, or does dslrBooth regenerate it?
- What is the physical 2-inch cut behaviour, and does the `/print` endpoint work?
- How does the Windows look compare with the Mac: fonts, anti-aliasing, dialogs?

## Product direction to keep in mind (owner-approved, after 6C)
- Users are the operator's team; **event clients never use the app**; the main client approves a proof.
- Two ways in: a heavily guided **Design Guide** for first-timers (print size first → event type → style → colours → photos → logo → words → company branding → layout → done; conditional steps) and a **Canva-style Editor** for power users.
- Required: an automatic **safe-area / 2-inch-cut check**. Planned: event theme presets, bundled font library, company profile, asset library with folders, client approval (a simple yes/no by email first; proof links with comments and approved event revisions later, mechanism undecided), Light/Dark mode, installer. Long term (ADR-049, docs/PRODUCT_ECOSYSTEM.md): Template Studio stays a standalone app and also becomes the full-capability editor inside **WalkOne Booth**, a future Windows-first platform replacing dslrBooth; one shared editor, never two. WalkOne Booth work is not approved yet; 6C's printer and safe-area measurements will feed its future Output Profiles.
- 6C findings about the 2-inch cut, fonts and Windows rendering feed directly into the safe-area check and the redesign.

## Notes for Craft Anything (the tool that runs 6C on the laptop)
Craft Anything (github.com/storytold/craft-anything) studies how software works with inspection tools and can have a coding agent build a version of it; it has a **Clean room** mode (only what a user can see: windows, outputs, files it writes) and a **Deep** mode (reads the program's code). It produced the earlier dslrBooth 7.48 runtime findings (research/DSLRBOOTH_748_RUNTIME_FINDINGS.md, dslrBooth 7.48.0903.1). For 6C:
- **Study and check only — no Build.** 6C needs observations and evidence, not a rebuild. Don't start a "Recreate dslrBooth" or "Recreate Template Studio" project.
- **Use Clean room for dslrBooth.** Every 6C question is about observable behaviour: what dslrBooth accepts on import, what it shows, which output files it writes (`_1x`/`_2x`), what prints. Template Studio must never copy dslrBooth's code, assets or branding (project rule), and dslrBooth's licence terms on reverse engineering have not been reviewed.
- **Template Studio's repo is the owner's own** and may be inspected freely. But no agent may edit it, commit to it or push from it during 6C: keep Craft Anything's project folder separate, and report problems instead of fixing them. Code changes are made on the Mac by Claude Code from the pass/fail list.
- **Installing Template Studio:** prefer `npm ci` (exact versions from the lockfile). Approve npm for this project only; don't choose "always allow" broadly.
- **Privacy:** questions and screenshots may go to an AI provider. Use test templates made for 6C, or the owner's own templates with their OK; keep client artwork and photos out of AI requests where possible.
- **People do the physical parts:** photo sessions, printing, cutting and judging prints. Craft Anything records the evidence (versions, file names and sizes, screenshots, the settings used).
- **Return format:** the numbered pass/fail list for steps 1–16, each with evidence and a confidence level (Confirmed / Likely / Unknown), the exact dslrBooth version, and anything unexpected.

## Rules for whoever runs 6C
- Report results honestly. Record failures with exact messages and screenshots or photos.
- Don't change the project file format or add printer settings to templates.
- Keep client templates and photos private: no uploads, no commits.
- Send findings back to the owner as a numbered pass/fail list with notes. The Mac-side developer (Claude Code) will update the docs and fix issues from that list.
