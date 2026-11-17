# Research Notes

This directory captures technical findings. **Research notes are not decisions.** A note becomes architecture only when recorded in [../docs/DECISIONS.md](../docs/DECISIONS.md); verified DSLR Booth facts get promoted into [../docs/DSLRBOOTH_COMPATIBILITY.md](../docs/DSLRBOOTH_COMPATIBILITY.md).

## Suggested topics
DSLR Booth XML · DSLR Booth ZIP structure · print dimensions · image rendering · Fabric vs Konva · Sharp · font handling · SVG rendering · Freepik/Magnific · Envato · printer considerations.

## Note format
One file per topic: `YYYY-MM-DD-topic.md` (or `topic.md`), containing:
- **Question**
- **Method** (what was inspected/tried, versions)
- **Findings**, each labeled: Confirmed / Assumption / Unknown / Needs Validation
- **Evidence** (fixture path, links, commands)
- **Implications** and proposed follow-up (not decisions)
- **Status:** draft | reviewed | promoted (with link to ADR/doc)

## Rules
- Don't invent findings; record what was observed.
- Reference fixtures by path; don't paste client-sensitive content.
- Record provider API/licensing claims with source links and dates.

## Notes in this folder
- [DSLRBOOTH_FIXTURE_ANALYSIS.md](DSLRBOOTH_FIXTURE_ANALYSIS.md) — the five real dslrBooth exports (format evidence).
- [DSLRBOOTH_748_RUNTIME_FINDINGS.md](DSLRBOOTH_748_RUNTIME_FINDINGS.md) — owner-reported dslrBooth 7.48 runtime behaviour.
- [CANVAS_LIBRARY_EVALUATION.md](CANVAS_LIBRARY_EVALUATION.md) — Konva vs Fabric (→ ADR-029).
- [REAL_TEMPLATE_VALIDATION.md](REAL_TEMPLATE_VALIDATION.md) — recreating a real template through the UI.
- [UI_UX_REVIEW.md](UI_UX_REVIEW.md) — UI review before the 4C redesign.
- [CANVA_UX_REFERENCE.md](CANVA_UX_REFERENCE.md) — Canva as the editor UX reference (patterns, not looks).
- [editor-validation/](editor-validation/README.md) — scripted built-app validation suites and their recorded results.
