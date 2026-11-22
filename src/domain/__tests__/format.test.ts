import { describe, expect, it } from 'vitest'
import {
  MAX_FORMAT_PIXELS,
  PRINT_PRESET_IDS,
  builtInFormat,
  checkComposition,
  createProject,
  createProjectFromFormat,
  deserializeProject,
  displayNumber,
  formatComposition,
  formatDesignPrint,
  fromInches,
  getPixelSize,
  normalizeGridLayout,
  resolveCompositionCells,
  serializeProject,
  summarizeFormat,
  toInches,
  validateFormat,
  type FormatDefinition,
  type FormatSheet,
  type TemplateProject
} from '..'
import { TS, counterIds } from './helpers'

/** Phase 7B B5.5: format definitions, unit conversion, composition geometry, project creation, compatibility. */

const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 }

function fmt(over: Partial<FormatDefinition> = {}): FormatDefinition {
  return {
    name: 'Test format',
    width: 2,
    height: 3,
    dpi: 300,
    unit: 'in',
    arrangement: { kind: 'exact' },
    safeMarginMm: 3,
    cutGuides: true,
    ...over
  }
}

const sheet = (over: Partial<FormatSheet> = {}): FormatSheet => ({
  kind: 'repeat',
  sheetWidth: 4,
  sheetHeight: 6,
  columns: 2,
  rows: 2,
  columnGap: 0,
  rowGap: 0,
  margins: { ...NO_MARGINS },
  align: 'center',
  ...over
})

const make = (f: FormatDefinition): TemplateProject =>
  createProjectFromFormat(f, { name: 'P', now: TS, createId: counterIds('p') })

describe('unit conversion (canonical inches; 1 in = 25.4 mm)', () => {
  it('inches ↔ millimetres', () => {
    expect(toInches(25.4, 'mm', 300)).toBe(1)
    expect(fromInches(1, 'mm', 300)).toBe(25.4)
    expect(toInches(50, 'mm', 300)).toBeCloseTo(1.968503937, 9)
    expect(fromInches(2.25, 'mm', 300)).toBeCloseTo(57.15, 10)
    expect(fromInches(3.25, 'mm', 600)).toBeCloseTo(82.55, 10)
  })
  it('inches → pixels at 300 and 600 DPI (rounded half up only for raster sizes)', () => {
    expect(fromInches(2.25, 'px', 300)).toBe(675)
    expect(fromInches(3.25, 'px', 300)).toBe(975)
    expect(fromInches(2.25, 'px', 600)).toBe(1350)
    expect(fromInches(toInches(50, 'mm', 300), 'px', 300)).toBe(591) // 590.55 → 591
    expect(fromInches(toInches(70, 'mm', 300), 'px', 300)).toBe(827) // 826.77 → 827
  })
  it('pixels → physical when the DPI is known, and back without drift', () => {
    expect(toInches(1080, 'px', 300)).toBeCloseTo(3.6, 12)
    expect(toInches(1350, 'px', 300)).toBeCloseTo(4.5, 12)
    for (const px of [1, 7, 675, 1080, 1350, 4999, 29999])
      for (const dpi of [72, 300, 600, 1200])
        expect(fromInches(toInches(px, 'px', dpi), 'px', dpi)).toBe(px)
  })
  it('switching units repeatedly never changes the stored value (display only)', () => {
    for (const start of [2.25, 3.25, toInches(50, 'mm', 300), 1 / 3]) {
      let inches = start
      for (let i = 0; i < 50; i++) {
        // what a field shows in mm, typed back exactly, still yields the same physical size to display precision
        const mmShown = Number(displayNumber(fromInches(inches, 'mm', 300), 'mm'))
        expect(Math.abs(toInches(mmShown, 'mm', 300) - start)).toBeLessThan(0.005 / 25.4 + 1e-12)
        inches = start // the wizard keeps the canonical value; display never feeds back
      }
      expect(inches).toBe(start)
    }
  })
  it('display rounding: in 3 decimals, mm 2, px whole; never "-0"', () => {
    expect(displayNumber(2.25, 'in')).toBe('2.25')
    expect(displayNumber(1.9685039370078738, 'in')).toBe('1.969')
    expect(displayNumber(50.00000000000001, 'mm')).toBe('50')
    expect(displayNumber(57.15, 'mm')).toBe('57.15')
    expect(displayNumber(674.6, 'px')).toBe('675')
    expect(displayNumber(-0.0001, 'mm')).toBe('0')
  })
})

describe('format validation (plain language, no crash-size canvases)', () => {
  it('accepts sensible formats', () => {
    expect(validateFormat(fmt())).toEqual([])
    expect(validateFormat(fmt({ arrangement: sheet() }))).toEqual([])
  })
  it('rejects zero, negative, NaN and Infinity sizes', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const issues = validateFormat(fmt({ width: bad }))
      expect(issues.map((i) => i.field)).toContain('width')
    }
    expect(validateFormat(fmt({ height: 0 }))[0]?.message).toMatch(/greater than zero/)
    expect(validateFormat(fmt({ height: Number.NaN }))[0]?.message).toMatch(/Enter a number/)
  })
  it('rejects absurd sizes: over 100 in, over 30 000 px a side, or over the megapixel limit', () => {
    expect(validateFormat(fmt({ width: 101 }))[0]?.message).toMatch(/at most 100 in/)
    expect(validateFormat(fmt({ width: 60, height: 2, dpi: 600 }))[0]?.message).toMatch(/30,000 px/)
    // 26 × 26 in @ 300 DPI = 7800² px = 60.8 MP (allowed); 30 × 30 in = 81 MP (too big)
    expect(validateFormat(fmt({ width: 26, height: 26 }))).toEqual([])
    const big = validateFormat(fmt({ width: 30, height: 30 }))
    expect(big[0]?.message).toMatch(/megapixels/)
    expect(MAX_FORMAT_PIXELS).toBe(64_000_000)
  })
  it('rejects a resolution that is not a whole number from 1 to 4800', () => {
    for (const dpi of [0, -300, 300.5, 4801, Number.NaN])
      expect(validateFormat(fmt({ dpi })).map((i) => i.field)).toContain('dpi')
  })
  it('rejects invalid copies, gaps and margins', () => {
    expect(validateFormat(fmt({ arrangement: sheet({ columns: 0 }) }))[0]?.field).toBe('columns')
    expect(validateFormat(fmt({ arrangement: sheet({ rows: 9 }) }))[0]?.field).toBe('rows')
    expect(validateFormat(fmt({ arrangement: sheet({ rows: 1.5 }) }))[0]?.field).toBe('rows')
    expect(validateFormat(fmt({ arrangement: sheet({ columnGap: -0.1 }) }))[0]?.field).toBe(
      'columnGap'
    )
    expect(
      validateFormat(fmt({ arrangement: sheet({ margins: { ...NO_MARGINS, left: -1 } }) }))[0]
        ?.field
    ).toBe('margins')
  })
  it('D — a design too large for its sheet cannot be created (and is never scaled)', () => {
    const issues = validateFormat(
      fmt({ width: 3, height: 4, arrangement: sheet({ sheetWidth: 4, sheetHeight: 6 }) })
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]!.field).toBe('fit')
    expect(issues[0]!.message).toMatch(/4 copies need 6 in × 8 in, but the sheet has 4 in × 6 in/)
    expect(issues[0]!.message).toMatch(/never scaled/)
    // gaps and margins count too
    expect(validateFormat(fmt({ arrangement: sheet({ columnGap: 0.1 }) }))[0]?.field).toBe('fit')
    expect(
      validateFormat(fmt({ arrangement: sheet({ margins: { ...NO_MARGINS, top: 0.1 } }) }))[0]
        ?.message
    ).toMatch(/inside its margins/)
  })
  it('a safe margin must leave room on the design', () => {
    expect(validateFormat(fmt({ safeMarginMm: -1 }))[0]?.field).toBe('safeMargin')
    expect(validateFormat(fmt({ safeMarginMm: 51 }))[0]?.field).toBe('safeMargin')
    // 0.5 in side = 12.7 mm: 6.35 mm on both sides leaves nothing
    expect(validateFormat(fmt({ width: 0.5, height: 0.5, safeMarginMm: 6.35 }))[0]?.field).toBe(
      'safeMargin'
    )
    expect(validateFormat(fmt({ safeMarginMm: null }))).toEqual([])
  })
})

describe('composition geometry (exact size, repeat, gaps, margins, alignment)', () => {
  it('exact size: one design, one output of the same size', () => {
    const c = formatComposition(fmt())
    expect(c).toEqual({
      print: { width: 2, height: 3, unit: 'in', dpi: 300 },
      layout: { kind: 'single' }
    })
  })
  it('A — magnet insert 2 × 3 in @ 300 on 4 × 6, 2 × 2: 600 × 900 design, 1200 × 1800 sheet, 4 copies', () => {
    const p = make(fmt({ arrangement: sheet() }))
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 600, height: 900 })
    expect(getPixelSize(p.output.print)).toEqual({ width: 1200, height: 1800 })
    const cells = resolveCompositionCells(p.canvas.print, p.output)
    expect(cells.map((c) => [c.x, c.y, c.width, c.height])).toEqual([
      [0, 0, 600, 900],
      [600, 0, 600, 900],
      [0, 900, 600, 900],
      [600, 900, 600, 900]
    ])
    // a plain grid carries no optional fields: the same shape as before B5.5
    expect(p.output.layout).toEqual({ kind: 'grid', columns: 2, rows: 2, gap: 0 })
  })
  it('gaps between columns and rows are separate', () => {
    const p = make(
      fmt({
        width: 1.5,
        height: 2,
        arrangement: sheet({ columnGap: 0.25, rowGap: 0.5 })
      })
    )
    const cells = resolveCompositionCells(p.canvas.print, p.output)
    // block 450+75+450 = 975 wide in 1200 → x0 = 113 (rounded); 600+150+600 = 1350 tall in 1800 → y0 = 225
    expect(cells.map((c) => [c.x, c.y])).toEqual([
      [113, 225],
      [638, 225],
      [113, 975],
      [638, 975]
    ])
    expect(p.output.layout).toMatchObject({ gap: 0.25, rowGap: 0.5 })
    // copies never overlap
    for (const a of cells)
      for (const b of cells)
        if (a !== b)
          expect(
            a.x < b.x + b.width &&
              b.x < a.x + a.width &&
              a.y < b.y + b.height &&
              b.y < a.y + a.height
          ).toBe(false)
  })
  it('margins: centred inside the margins, or from the top-left margin', () => {
    const m = { top: 0.5, right: 0.25, bottom: 0.25, left: 0.5 }
    const centred = make(
      fmt({ width: 1.5, height: 2, arrangement: sheet({ kind: 'custom', margins: m }) })
    )
    const start = make(
      fmt({
        width: 1.5,
        height: 2,
        arrangement: sheet({ kind: 'custom', margins: m, align: 'start' })
      })
    )
    const c1 = resolveCompositionCells(centred.canvas.print, centred.output)
    const c2 = resolveCompositionCells(start.canvas.print, start.output)
    // area: x 150..1125 (975 px), y 150..1725 (1575 px); block 900 × 1200
    expect([c1[0]!.x, c1[0]!.y]).toEqual([
      150 + Math.round((975 - 900) / 2),
      150 + Math.round((1575 - 1200) / 2)
    ])
    expect([c2[0]!.x, c2[0]!.y]).toEqual([150, 150])
    expect(start.output.layout).toMatchObject({ margins: m, align: 'start' })
    expect(checkComposition(start.canvas.print, start.output)).toEqual([])
  })
  it('the domain refuses a composition that does not fit inside its margins', () => {
    const p = make(fmt({ arrangement: sheet() }))
    const bad = {
      ...p.output,
      layout: { ...p.output.layout, margins: { top: 0.1, right: 0, bottom: 0, left: 0 } }
    } as TemplateProject['output']
    expect(checkComposition(p.canvas.print, bad)[0]?.message).toMatch(/inside the margins/)
  })
  it('normalizeGridLayout drops defaults (so plain grids serialize as before)', () => {
    expect(
      normalizeGridLayout({
        kind: 'grid',
        columns: 2,
        rows: 1,
        gap: 0,
        rowGap: 0,
        margins: { ...NO_MARGINS },
        align: 'center'
      })
    ).toEqual({ kind: 'grid', columns: 2, rows: 1, gap: 0 })
  })
})

describe('the five synthetic format cases (B5.5 brief)', () => {
  it('B — keychain insert 50 × 70 mm @ 300, exact size', () => {
    const f = fmt({ unit: 'mm', width: toInches(50, 'mm', 300), height: toInches(70, 'mm', 300) })
    expect(validateFormat(f)).toEqual([])
    const p = make(f)
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 591, height: 827 })
    expect(p.output.layout).toEqual({ kind: 'single' })
    expect(summarizeFormat(f).design).toBe('50 × 70 mm')
  })
  it('C — square 3 × 3 in @ 300, exact size', () => {
    const f = fmt({ width: 3, height: 3 })
    const p = make(f)
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 900, height: 900 })
    expect(summarizeFormat(f).orientation).toBe('square')
  })
  it('E — pixel-only 1080 × 1350 px, no printer profile and no generic safe margin needed', () => {
    const f = fmt({
      unit: 'px',
      width: toInches(1080, 'px', 300),
      height: toInches(1350, 'px', 300),
      safeMarginMm: null
    })
    expect(validateFormat(f)).toEqual([])
    const p = make(f)
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 1080, height: 1350 })
    expect(p.canvas.safeMarginMm).toBeUndefined()
    expect(summarizeFormat(f).design).toBe('1080 × 1350 px')
  })
  it('summary for the review step', () => {
    const f = fmt({ width: 2.25, height: 3.25, arrangement: sheet({ columns: 1, rows: 1 }) })
    expect(summarizeFormat(f)).toMatchObject({
      design: '2.25 × 3.25 in',
      pixels: '675 × 975 px @ 300 DPI',
      output: '1 copy on a 4 × 6 in sheet',
      layout: '1 across × 1 down',
      safeMargin: '3 mm generic safe margin'
    })
    expect(summarizeFormat(fmt({ arrangement: sheet() })).output).toBe(
      '4 copies on a 4 × 6 in sheet'
    )
    expect(summarizeFormat(fmt({ safeMarginMm: null })).safeMargin).toBe('No generic safe margin')
  })
})

describe('built-in formats use the same model and create the same projects as before', () => {
  it('every preset: createProjectFromFormat(builtInFormat) === createProject(preset), byte for byte', () => {
    for (const id of PRINT_PRESET_IDS) {
      const a = createProject({ name: 'X', design: id, now: TS, createId: counterIds('p') })
      const b = createProjectFromFormat(builtInFormat(id), {
        name: 'X',
        now: TS,
        createId: counterIds('p')
      })
      expect(b).toEqual(a)
      expect(serializeProject(b)).toBe(serializeProject(a))
    }
  })
  it('built-ins carry no generic safe margin (no new persisted field on standard projects)', () => {
    for (const id of PRINT_PRESET_IDS) {
      const p = createProjectFromFormat(builtInFormat(id), { name: 'X', now: TS })
      expect('safeMarginMm' in p.canvas).toBe(false)
      expect(Object.keys(p.output.layout).sort()).toEqual(
        id.startsWith('strip-') ? ['columns', 'gap', 'kind', 'rows'] : ['kind']
      )
    }
  })
  it('design print keys keep the preset order (so saved files match)', () => {
    expect(Object.keys(formatDesignPrint(fmt()))).toEqual(['width', 'height', 'unit', 'dpi'])
  })
})

describe('persistence and backward compatibility (v1 files unchanged; custom layouts are v2, ADR-060)', () => {
  it('a custom project saves and reopens with its geometry, composition and safe margin', () => {
    const m = { top: 0.125, right: 0.125, bottom: 0.25, left: 0.125 }
    const p = make(
      fmt({
        width: 2.25,
        height: 3.25,
        arrangement: sheet({
          kind: 'custom',
          columnGap: 0.05,
          rowGap: 0.1,
          margins: m,
          align: 'start',
          columns: 1,
          rows: 1
        })
      })
    )
    const text = serializeProject(p)
    const back = deserializeProject(text)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.project).toEqual(p)
    expect(JSON.parse(text).schemaVersion).toBe(2)
    expect(back.project.schemaVersion).toBe(2)
    expect(back.project.canvas.safeMarginMm).toBe(3)
    expect(serializeProject(back.project)).toBe(text)
  })
  it('a pre-B5.5 project file (no new fields) opens and saves back byte-identically', () => {
    // Written exactly as Template Studio wrote a 2×6 strip before B5.5 (schema key order, two-space indent).
    const legacy = `${JSON.stringify(
      {
        format: 'walkone.template-project',
        schemaVersion: 1,
        id: 'legacy-1',
        metadata: { name: 'Legacy strip', createdAt: TS, updatedAt: TS },
        event: {},
        design: { styleTags: [] },
        canvas: {
          print: { width: 2, height: 6, unit: 'in', dpi: 600 },
          backgroundColor: { kind: 'literal', value: '#ffffff' }
        },
        output: {
          print: { width: 4, height: 6, unit: 'in', dpi: 600 },
          layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 }
        },
        palette: { colors: [] },
        layers: [],
        assets: [],
        export: { preferredExporterId: null, includePreview: true }
      },
      null,
      2
    )}\n`
    const r = deserializeProject(legacy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(serializeProject(r.project)).toBe(legacy)
    expect(
      resolveCompositionCells(r.project.canvas.print, r.project.output).map((c) => c.x)
    ).toEqual([0, 1200])
  })
  it('unknown fields are still rejected (the new fields are the only additions)', () => {
    const p = make(fmt())
    const raw = JSON.parse(serializeProject(p)) as Record<string, unknown>
    ;(raw['canvas'] as Record<string, unknown>)['bleedMm'] = 2
    expect(deserializeProject(JSON.stringify(raw)).ok).toBe(false)
  })
})
