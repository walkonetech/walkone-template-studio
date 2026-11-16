# dslrBooth 7.48 — Runtime Interoperability Findings (external clean-room research)

> **Confirmed via external clean-room runtime research reported by the owner; not independently reproducible from repository fixtures.**
>
> Recorded 2026-11-16 (start of Phase 6A). This note holds only the high-level interoperability rules needed for later adapter work (Phase 6B/6C). It contains **no** proprietary code, no decompiled or copied implementation, no secrets, no embedded credentials and no raw evidence. It is a research note, not a decision (see [README.md](README.md)); rules are promoted into [../docs/DSLRBOOTH_COMPATIBILITY.md](../docs/DSLRBOOTH_COMPATIBILITY.md) and ADRs only when an adapter uses them.

## Question
How does dslrBooth behave at runtime for the template features Template Studio will export: native 2×6 strips, photo slots, images, text and printing vs sharing?

## Method (as reported by the owner)
- Target: the owner's authorized installation of **dslrBooth 7.48.0903.1** (Windows).
- Performed **outside this repository** with a separate tool ("Craft Anything") using local runtime and static analysis.
- Template Studio must not copy any external proprietary implementation; these findings are interoperability requirements only.
- None of this is reproducible from `tests/fixtures/dslrbooth/` alone; Phase 6C re-validates the exporter's output on the real Windows install.

## Findings

### Native 2×6 strip — Confirmed (external runtime)
- dslrBooth natively supports a logical 1:3 strip.
- For a qualifying native strip with `print_2_per_page=True` it produces two outputs:
  - `_1x`: one clean logical 2×6 strip;
  - `_2x`: the same finished strip duplicated side by side onto a 4×6 print sheet.
- Its Template Editor shows only the ONE logical strip.

### Printing vs sharing — Confirmed (live runtime)
| Path | Uses |
|---|---|
| Printing | `_2x` |
| Gallery / upload | `_1x` |
| Email | `_1x` |
| SMS | `_1x` |
| QR | `_1x` |
| LumaShare / local media listing | `_1x` |

**Implication (Proposed for 6B):** export native 2×6 by default rather than pre-composing the two-up sheet in Template Studio; keep a pre-composed 4×6 "compatibility" export available later.

### Photo elements — Confirmed (external runtime)
- Fill is centred Cover (UniformToFill).
- Rotation is clockwise and applied after the crop.
- Borders grow **outward** from the Photo box. (Template Studio draws its native frame **inside** the slot box, so 6B must convert.)
- PhotoNumber should stay within 1–12. (A DSLR Booth limit, checked by the 6B adapter, not by the vendor-neutral 6A preflight.)

### Image elements — Confirmed (external runtime)
- `KeepAspect=True` → fit (Uniform); `KeepAspect=False` → stretch (Fill).
- Transparent PNG overlays work.

### Text elements — Confirmed (external runtime)
- Newline characters create multiple lines; there is **no automatic word wrapping**; long text clips.
- `FontSize=0` auto-fits.
- Missing fonts silently fall back.

**Implication (Proposed for 6B):** rasterize Template Studio text when fidelity requires it (custom or possibly unavailable fonts, wrapping, advanced typography, effects). Simple single-line compatible text may stay native.

### Printer finishing — Needs Validation
- The physical 2-inch cut belongs to the printer / driver / PrintTicket configuration, **not** to the template.
- Template Studio must **not** add printer model, centre-cut setting, driver media or PrintTicket to `TemplateProject`. It may later offer setup guidance only.
- **Open (printer-dependent, paused until the DNP printer is available):**
  1. physical dye-sub output and the 2-inch centre cut;
  2. whether the local unauthenticated `/print` endpoint actually creates a physical print.

These two checks do not block Phase 6A or 6B; they may run in parallel with or before 6C.

## Implications for Template Studio (proposed follow-up, not decisions)
- **6A (done, vendor-neutral):** production PNGs, proof, layer package, preflight. Nothing DSLR-specific.
- **6B DSLR Booth 7.48 export adapter:** native 2×6 by default (`_1x` design; dslrBooth composes `_2x`), outward-border conversion, KeepAspect mapping, text native-vs-raster rule, PhotoNumber 1–12 check, version profile "7.48".
- **6C:** import Template Studio exports into the authorized Windows install and compare renders, printing and sharing.

## Status
reviewed (owner-reported). Promote individual rules into docs/DSLRBOOTH_COMPATIBILITY.md / an ADR when Phase 6B implements them.
