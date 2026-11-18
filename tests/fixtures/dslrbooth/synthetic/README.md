# Synthetic dslrBooth fixtures (committed)

Made only for testing, with made-up content: **no client names, artwork, photos or event data**. Unlike `../source/`, these files may be committed.

## `live-text-fixture.zip` — dslrBooth 7.48 live text (Phase 6C, C1)
Made on 2026-11-18 by Craft Anything on the Windows test laptop, **only with dslrBooth 7.48.0903.1's visible template editor** (trial licence), then exported with dslrBooth's own Print Layout → Export. Template Studio's live-text import is built and tested against it (`src/projects/__tests__/dslrLiveText.test.ts`, import suite step 10).

**Sanitized:** the only change from dslrBooth's export is the root attribute `OriginalDevice`, which held the laptop's computer name and now reads `SANITIZED`. The XML is otherwise byte-identical (BOM, CRLF, attribute order). `preview.png` (dslrBooth's own render, no watermark) and `art-block.png` (a teal and yellow block drawn by a script for this fixture) are unchanged. The unedited original, the session output (`_1x`/`_2x`, with the trial watermark), the editor screenshots and the full manifest are kept **outside the repository** as evidence; they show the laptop name.

Canvas 2×6, 1200 × 3600 px at 600 dpi, `Dimensions="0"`, Print 2 per page on, background `#FFF4EEDC`. Two photo slots (Photo 1 at 100/100, Photo 2 at 100/2720, both 1000×667) and one picture (`art-block`, 550/2450, 400×150).

| Id | Text | Settings in dslrBooth (Arial, Size 48, Left, black unless noted) |
|---|---|---|
| T1 | `REGULAR TEXT 2026` | Weight Regular; Size 48 shrank the box to 486×55 |
| T2 | `BOLD TEXT` | Weight Bold (`FontWeight="Bold"`, `IsBold="False"`) |
| T3 | `ITALIC TEXT` | Weight Italic |
| T4 | `BOLD ITALIC` | Weight Bold Italic. **dslrBooth draws it as Italic only** (editor, preview and session) |
| T5 | `CENTERED RED` | Center (`1`), colour `#FFE01010`, box 1000 wide |
| T6 | `RIGHT ALIGNED` | Right (`2`), box 1000 wide |
| T7 | `ROTATED 15` | Center, `Rotation="15"` (clockwise) |
| T8 | (not created) | dslrBooth has no text opacity or alpha control |
| T9 | `SEGOE UI TEST` | Font Segoe UI (box 315×63) |
| T10 | `LINE ONELINE TWO` | Typed `LINE ONE`, Enter, `LINE TWO`: Enter inserts nothing |
| T11A / T11B | `AUTO` | Size Auto (`FontSize="0"`), boxes 1000×150 and 250×150; stored Center |
| T12 | `Tom & Jerry's "Party" 50% / 2026 <ok>` | Special characters, XML-escaped |
| T13 | `THIS IS A VERY LONG SINGLE LINE …` | Box 400 wide: dslrBooth cuts the line off at the box edge |
| T14A | `TEXT ABOVE PHOTO` | Bold, Center, stacked above Photo 2 |
| T14B | `TEXT BELOW ART` | Stacked below `art-block`, which covers its right part |
| T15 | `DROP SHADOW TEST` | Drop Shadow on (defaults: `#FF000000`, −45°, depth 10, radius 20) |

Original export SHA-256 (evidence copy): `b9fea2a1cd1f913d2f79f30bad97661d770b64200d3e847c5531aeb1d9190c37`. Sanitized ZIP: see `git log` for this file.
