# DSLR Booth Fixtures

Real DSLR Booth / LumaSoft template exports used as compatibility evidence. Strategy: [../../../docs/TESTING_STRATEGY.md](../../../docs/TESTING_STRATEGY.md). Findings: [../../../research/DSLRBOOTH_FIXTURE_ANALYSIS.md](../../../research/DSLRBOOTH_FIXTURE_ANALYSIS.md).

## Layout
- `source/` — **immutable** original production exports (ZIPs). Never modify, rename, re-save, recompress, or delete files here. Never use it as a working directory.
- `expected/` — *(future, not created yet)* human-reviewed expected normalized representations used by tests.
- `generated/` — *(future, not created yet)* outputs written by automated compatibility tests. Should be git-ignored.

## Rules
- Source fixtures are **private repository data**. Do not upload or publish them anywhere (public repos, gists, paste sites, online XML viewers, external storage).
- They contain event/client-specific creative assets and may include licensed third-party artwork and machine/client names. Respect privacy and licensing.
- Tests and tools must read from copies or extract into an OS temp directory or an ignored work directory, never into `source/`.
- Do not commit extracted duplicates unless there is a documented reason.
- Integrity: SHA-256 of each source ZIP is recorded in the research analysis; a change to a file here is a change to the evidence.
