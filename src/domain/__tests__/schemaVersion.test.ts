import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  PRINT_PRESET_IDS,
  createProject,
  createProjectFromFormat,
  builtInFormat,
  deserializeProject,
  fileSchemaVersion,
  getPixelSize,
  loadProject,
  resolveCompositionCells,
  serializeProject,
  type FormatDefinition,
  type TemplateProject
} from '..'
import { TS, counterIds } from './helpers'

/**
 * ADR-060 schema-version policy. `schemaVersion` in a file = the oldest version whose readers can parse it; writers
 * stamp the lowest version that represents the content; in memory a project is at CURRENT_SCHEMA_VERSION.
 * v1 → v2 (B5.5) only re-labels: v2 adds optional fields whose absence keeps the v1 meaning.
 */

const FIXTURES = join(__dirname, '../../../tests/fixtures/projects/schema-v1')
/** Written by the cb2f75d build (last v1-only build), synthetic content, unmodified. */
const V1_SAMPLES = [
  { file: 'strip-2x6-600.json', design: [1200, 3600], sheet: [2400, 3600], cells: [0, 1200] },
  { file: 'photo-4x6-portrait-300.json', design: [1200, 1800], sheet: [1200, 1800], cells: [0] },
  { file: 'photo-6x4-landscape-600.json', design: [3600, 2400], sheet: [3600, 2400], cells: [0] }
] as const

const readSample = (file: string): string => readFileSync(join(FIXTURES, file), 'utf8')

function load(text: string): TemplateProject {
  const r = deserializeProject(text)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.project
}

const magnet: FormatDefinition = {
  name: 'Magnet',
  width: 2,
  height: 3,
  dpi: 300,
  unit: 'in',
  arrangement: {
    kind: 'repeat',
    sheetWidth: 4,
    sheetHeight: 6,
    columns: 2,
    rows: 2,
    columnGap: 0,
    rowGap: 0,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    align: 'center'
  },
  safeMarginMm: 3,
  cutGuides: true
}
const make = (f: FormatDefinition): TemplateProject =>
  createProjectFromFormat(f, { name: 'P', now: TS, createId: counterIds('p') })

describe('schema version policy (ADR-060)', () => {
  it('this build reads and writes up to version 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2)
  })

  describe('stored v1 samples (written by the last v1-only build)', () => {
    for (const s of V1_SAMPLES) {
      it(`${s.file}: opens, migrates to v2 in memory, same geometry, saves back byte-identically as v1`, () => {
        const text = readSample(s.file)
        expect(JSON.parse(text).schemaVersion).toBe(1)
        const p = load(text)
        expect(p.schemaVersion).toBe(2)
        expect(getPixelSize(p.canvas.print)).toEqual({ width: s.design[0], height: s.design[1] })
        expect(getPixelSize(p.output.print)).toEqual({ width: s.sheet[0], height: s.sheet[1] })
        expect(resolveCompositionCells(p.canvas.print, p.output).map((c) => c.x)).toEqual([
          ...s.cells
        ])
        expect(fileSchemaVersion(p)).toBe(1)
        expect(serializeProject(p)).toBe(text)
      })
    }
    it('the migration only re-labels: every other value is untouched', () => {
      for (const s of V1_SAMPLES) {
        const raw = JSON.parse(readSample(s.file)) as Record<string, unknown>
        const p = load(readSample(s.file))
        expect({ ...p, schemaVersion: 1 }).toEqual(raw)
      }
    })
  })

  it('built-in formats still create projects written as v1 (identical to before B5.5)', () => {
    for (const id of PRINT_PRESET_IDS) {
      const p = createProject({ name: 'P', design: id, now: TS, createId: counterIds('p') })
      expect(fileSchemaVersion(p)).toBe(1)
      expect(JSON.parse(serializeProject(p)).schemaVersion).toBe(1)
      expect(serializeProject(make(builtInFormat(id)))).toBe(serializeProject(p))
    }
  })

  it('each v2 field on its own makes the file v2', () => {
    const base = createProject({
      name: 'P',
      design: 'photo-4x6-portrait-300',
      now: TS,
      createId: counterIds('p')
    })
    const grid = { kind: 'grid' as const, columns: 2, rows: 2, gap: 0 }
    const sheet = { print: { width: 4, height: 6, unit: 'in' as const, dpi: 300 }, layout: grid }
    const small = { width: 2, height: 3, unit: 'in' as const, dpi: 300 }
    const on = (over: Partial<typeof grid> & Record<string, unknown>): TemplateProject => ({
      ...base,
      canvas: { ...base.canvas, print: small },
      output: { ...sheet, layout: { ...grid, ...over } }
    })
    expect(fileSchemaVersion(on({}))).toBe(1)
    expect(fileSchemaVersion(on({ rowGap: 0 }))).toBe(2)
    expect(fileSchemaVersion(on({ margins: { top: 0, right: 0, bottom: 0, left: 0 } }))).toBe(2)
    expect(fileSchemaVersion(on({ align: 'center' }))).toBe(2)
    expect(fileSchemaVersion({ ...base, canvas: { ...base.canvas, safeMarginMm: 3 } })).toBe(2)
    expect(fileSchemaVersion({ ...base, canvas: { ...base.canvas, safeMarginMm: 0 } })).toBe(2)
  })

  it('a custom-format project is written as v2 and reopens with all its geometry, composition and safe margin', () => {
    const p = make({
      ...magnet,
      width: 1.75,
      height: 2.5,
      arrangement: {
        ...magnet.arrangement,
        kind: 'custom',
        columnGap: 0.1,
        rowGap: 0.2,
        margins: { top: 0.25, right: 0.125, bottom: 0.25, left: 0.125 },
        align: 'start'
      } as FormatDefinition['arrangement']
    })
    const text = serializeProject(p)
    expect(JSON.parse(text).schemaVersion).toBe(2)
    const back = load(text)
    expect(back).toEqual(p)
    expect(back.output.layout).toMatchObject({ rowGap: 0.2, align: 'start' })
    expect(back.canvas.safeMarginMm).toBe(3)
    expect(serializeProject(back)).toBe(text)
  })

  it('a 2 × 2 repeat with only the generic safe margin is v2; with no safe margin and default spacing it is v1', () => {
    expect(JSON.parse(serializeProject(make(magnet))).schemaVersion).toBe(2)
    expect(
      JSON.parse(serializeProject(make({ ...magnet, safeMarginMm: null }))).schemaVersion
    ).toBe(1)
  })

  it('a file marked v1 that uses v2 fields is refused (it was not written by Template Studio)', () => {
    const raw = JSON.parse(serializeProject(make(magnet))) as Record<string, unknown>
    const r = loadProject({ ...raw, schemaVersion: 1 })
    expect(r).toMatchObject({ ok: false, errors: [{ code: 'schema-version-mismatch' }] })
  })

  it('a newer (future) version fails safely with "Update the app"', () => {
    const raw = JSON.parse(serializeProject(make(magnet))) as Record<string, unknown>
    for (const v of [3, 99]) {
      const r = loadProject({ ...raw, schemaVersion: v })
      expect(r).toMatchObject({ ok: false, errors: [{ code: 'unsupported-schema-version' }] })
      if (!r.ok) expect(r.errors[0]?.message).toMatch(/Update the app/)
    }
    expect(loadProject({ ...raw, schemaVersion: 1.5 })).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid-schema-version' }]
    })
  })

  it('unknown fields are still rejected at v2', () => {
    const raw = JSON.parse(serializeProject(make(magnet))) as Record<string, unknown>
    ;(raw['canvas'] as Record<string, unknown>)['bleedMm'] = 2
    expect(deserializeProject(JSON.stringify(raw)).ok).toBe(false)
  })

  it('a v2-labelled file that uses no v2 field opens and is written back as v1 (lowest version wins)', () => {
    const text = readSample('strip-2x6-600.json')
    const raw = JSON.parse(text) as Record<string, unknown>
    const p = load(JSON.stringify({ ...raw, schemaVersion: 2 }))
    expect(serializeProject(p)).toBe(text)
  })
})
