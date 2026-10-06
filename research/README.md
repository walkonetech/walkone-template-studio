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
