# Native project samples (schema versions)

Stored `project.json` documents at earlier `TemplateProject` schema versions, used to prove that migrations keep old
projects working (policy: [../../../docs/DECISIONS.md](../../../docs/DECISIONS.md) ADR-060).

- `schema-v1/` — written by the `cb2f75d` build (the last build that only knew schema version 1), unmodified:
  `strip-2x6-600.json`, `photo-4x6-portrait-300.json`, `photo-6x4-landscape-600.json`. Synthetic content only (three
  photo slots, a rectangle and the text "JUNE 14 · 2027"; no assets, no client data).

Rules: never edit these files; a new schema version adds a new `schema-vN/` folder written by the last build of the
previous version, in the same change as its migration and tests (`src/domain/__tests__/schemaVersion.test.ts`).
