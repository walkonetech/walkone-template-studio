import { describe, expect, it } from 'vitest'
import {
  createProject,
  createProjectFromFormat,
  literalColor,
  toInches,
  type FormatDefinition,
  type Layer,
  type TemplateProject
} from '@domain'
import {
  cutLineLabel,
  cutLines,
  hasDerivedCopies,
  marginBox,
  planOutput
} from '@canvas/rendering/composition'
import { buildChecks } from '@editor/checks'
import { describeWorkspace } from '@editor/describe'
import { firstUseSelection } from '@editor/exportCards'
import { exportOutputs } from '@editor/exportPlan'
import { runExportPreflight } from '@editor/exportPreflight'
import {
  DNP_DS_RX1_PROFILE_ID,
  checkSafeAreas,
  findOutputProfile,
  type OutputProfile
} from '@output'
import { dslrSupport } from '../dslrbooth/compat'
import { dslrOutputs } from '../dslrbooth/outputs'
import { mainVariant } from '../dslrbooth/plan'
import { formatCheckItems, isCustomFormat } from '../formatChecks'

/**
 * Phase 7B B5.5: custom formats through output, Print Preview geometry, Checks and the dslrBooth gate. Synthetic
 * formats only (no client data). Geometry is checked against the mathematically expected values.
 */

const T0 = '2026-01-01T00:00:00.000Z'
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 }
const fonts = { fonts: { isAvailable: () => true, installedFamilies: () => [] } } as never

const base: FormatDefinition = {
  name: 'F',
  width: 2,
  height: 3,
  dpi: 300,
  unit: 'in',
  arrangement: { kind: 'exact' },
  safeMarginMm: 3,
  cutGuides: true
}
const repeat = (over: Record<string, unknown> = {}): FormatDefinition['arrangement'] =>
  ({
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
  }) as FormatDefinition['arrangement']
const make = (f: Partial<FormatDefinition>): TemplateProject =>
  createProjectFromFormat({ ...base, ...f }, { name: 'Custom', now: T0 })

const magnet = (): TemplateProject => make({ arrangement: repeat() })
const insert = (): TemplateProject => make({ width: 2.25, height: 3.25 })
const keychain = (): TemplateProject =>
  make({ unit: 'mm', width: toInches(50, 'mm', 300), height: toInches(70, 'mm', 300) })
const preset = (id: Parameters<typeof createProject>[0]['design']): TemplateProject =>
  createProject({ name: 'Std', design: id, now: T0 })

const common = { rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0 }
const text = (id: string, x: number, y: number): Layer =>
  ({
    ...common,
    id,
    type: 'text',
    name: id,
    x,
    y,
    width: 300,
    height: 60,
    content: 'Hello',
    fontFamily: 'Georgia',
    fontSize: 40,
    fontWeight: 400,
    fontStyle: 'normal',
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    fill: literalColor('#000000')
  }) as Layer

describe('custom output geometry (Print Preview / Print PNG plan)', () => {
  it('A — magnet 2×2 on 4×6: the sheet plan holds four copies at exact design size', () => {
    const plan = planOutput(magnet())
    expect([plan.width, plan.height]).toEqual([1200, 1800])
    expect(plan.copies.map((c) => [c.cell.x, c.cell.y, c.cell.width, c.cell.height])).toEqual([
      [0, 0, 600, 900],
      [600, 0, 600, 900],
      [0, 900, 600, 900],
      [600, 900, 600, 900]
    ])
    expect(plan.composed).toBe(true)
    expect(hasDerivedCopies(magnet())).toBe(true)
  })
  it('exact size: no separate sheet (Design is the print)', () => {
    expect(hasDerivedCopies(insert())).toBe(false)
    expect(planOutput(insert()).copies).toHaveLength(1)
  })
  it('one copy on a larger sheet still gets a Print Preview and a sheet-sized print', () => {
    const p = make({ arrangement: repeat({ columns: 1, rows: 1 }) })
    expect(hasDerivedCopies(p)).toBe(true)
    const plan = planOutput(p)
    expect(plan.copies[0]!.cell).toMatchObject({ x: 300, y: 450, width: 600, height: 900 })
  })
  it('cut guides: shared lines between touching copies; each edge when there is a gap or margin', () => {
    expect(cutLines(magnet())).toEqual([
      { axis: 'x', at: 600 },
      { axis: 'y', at: 900 }
    ])
    const gapped = make({
      width: 1.5,
      height: 2,
      arrangement: repeat({ columnGap: 0.25, rowGap: 0.25 })
    })
    // block 975 × 1275 in 1200 × 1800 → x0 113, y0 263
    expect(cutLines(gapped)).toEqual([
      { axis: 'x', at: 113 },
      { axis: 'x', at: 563 },
      { axis: 'x', at: 638 },
      { axis: 'x', at: 1088 },
      { axis: 'y', at: 263 },
      { axis: 'y', at: 863 },
      { axis: 'y', at: 938 },
      { axis: 'y', at: 1538 }
    ])
    expect(cutLines(insert())).toEqual([])
    // the 2×6 strip keeps its single 2-inch centre cut
    expect(cutLines(preset('strip-2x6-600'))).toEqual([{ axis: 'x', at: 1200 }])
  })
  it('labels: "2-inch cut" only for the 2×6 strip; a 2 in wide custom design gets "Cut line"', () => {
    expect(cutLineLabel(preset('strip-2x6-600'))).toBe('2-inch cut')
    expect(cutLineLabel(magnet())).toBe('Cut line')
  })
  it('status bar: a single copy on a larger sheet shows the sheet in Print Preview', () => {
    const one = make({ arrangement: repeat({ columns: 1, rows: 1 }) })
    expect(describeWorkspace(one, 'preview')).toBe('4×6 Output • 1-up • 1200×1800 px')
    expect(describeWorkspace(magnet(), 'preview')).toBe('4×6 Output • 4-up • 1200×1800 px')
    expect(describeWorkspace(insert(), 'design')).toBe('2.25×3.25 Portrait • 300 DPI • 675×975 px')
  })
  it('margin box only when the layout has margins', () => {
    expect(marginBox(magnet())).toBeNull()
    const m = make({
      width: 1.5,
      height: 2,
      arrangement: repeat({
        kind: 'custom',
        margins: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 }
      })
    })
    expect(marginBox(m)).toEqual({ x: 75, y: 75, width: 1050, height: 1650 })
  })
})

describe('generic export outputs for custom formats', () => {
  it('magnet sheet: Print sheet PNG 1200×1800, Design PNG 600×900, Proof PNG; dslrBooth template on the 4×6 sheet', () => {
    const p = magnet()
    const outs = exportOutputs(p)
    expect(outs.map((o) => [o.kind, o.width, o.height])).toEqual([
      ['print', 1200, 1800],
      ['design', 600, 900],
      ['proof', 1200, 1800]
    ])
    expect(outs[0]!.description).toMatch(/4 copies/)
    expect(mainVariant(p)).toBe('sheet')
    expect(dslrSupport(p)).toEqual({ supported: true })
    expect(dslrOutputs(p).map((o) => [o.kind, o.width, o.height])).toEqual([
      ['dslrbooth', 1200, 1800]
    ])
  })
  it('exact-size custom: Print PNG + Proof PNG at the design size; no dslrBooth template (untested size)', () => {
    const p = insert()
    expect(exportOutputs(p).map((o) => [o.kind, o.width, o.height])).toEqual([
      ['print', 675, 975],
      ['proof', 675, 975]
    ])
    const s = dslrSupport(p)
    expect(s.supported).toBe(false)
    if (!s.supported) expect(s.reason).toMatch(/2\.25×3\.25 in, which has not been tested/)
    expect(dslrOutputs(p)).toEqual([])
    // with no booth output, the print files are selected on first use instead
    expect(firstUseSelection([...dslrOutputs(p), ...exportOutputs(p)])).toEqual(['print'])
  })
  it('keychain 50 × 70 mm: 591 × 827 px exact size', () => {
    expect(exportOutputs(keychain())[0]).toMatchObject({ kind: 'print', width: 591, height: 827 })
  })
  it('standard formats keep their dslrBooth outputs exactly as before', () => {
    expect(dslrOutputs(preset('strip-2x6-600')).map((o) => o.kind)).toEqual([
      'dslrbooth',
      'dslrbooth-4x6'
    ])
    expect(dslrOutputs(preset('photo-4x6-portrait-300')).map((o) => o.kind)).toEqual(['dslrbooth'])
    expect(dslrOutputs(preset('photo-4x6-landscape-600')).map((o) => o.kind)).toEqual(['dslrbooth'])
    expect(
      firstUseSelection([
        ...dslrOutputs(preset('strip-2x6-600')),
        ...exportOutputs(preset('strip-2x6-600'))
      ])
    ).toEqual(['dslrbooth'])
  })
  it('a template imported from dslrBooth keeps its dslrBooth export whatever its size', () => {
    const p = {
      ...insert(),
      sourceCompatibility: { dslrbooth: { project: {} } }
    } as unknown as TemplateProject
    expect(dslrSupport(p)).toEqual({ supported: true })
  })
})

describe('Checks for custom formats (one Checks model; never an error for PNG-only work)', () => {
  it('standard projects get no format notes', () => {
    for (const id of [
      'strip-2x6-600',
      'photo-4x6-portrait-300',
      'photo-4x6-landscape-600'
    ] as const) {
      expect(isCustomFormat(preset(id))).toBe(false)
      expect(formatCheckItems(preset(id), { hasOutputProfile: false })).toEqual([])
    }
  })
  it('custom format: Good to know notes for the format, no printer profile and no dslrBooth template', () => {
    const items = formatCheckItems(insert(), { hasOutputProfile: false })
    expect(items.map((i) => [i.code, i.severity])).toEqual([
      ['format-custom', 'info'],
      ['format-no-printer', 'info'],
      ['format-dslr-unsupported', 'info']
    ])
    expect(items[0]!.message).toMatch(
      /2\.25×3\.25 in design \(675×975 px @ 300 DPI\), printed at exactly this size/
    )
    const model = buildChecks(items)
    expect([model.errors, model.warnings, model.infos]).toEqual([0, 0, 3])
    expect(model.groups[0]!.cards.map((c) => [c.topic, c.title])).toEqual([
      ['Format', 'Custom format'],
      ['Format', 'No printer profile needed for PNG files'],
      ['Format', 'No dslrBooth template for this size']
    ])
  })
  it('the magnet sheet is described with its copies; dslrBooth is available so no dslrBooth note', () => {
    const items = formatCheckItems(magnet(), { hasOutputProfile: true })
    expect(items.map((i) => i.code)).toEqual(['format-custom'])
    expect(items[0]!.message).toMatch(/4 copies on a 4×6 in sheet \(2 across × 2 down\)/)
  })
  it('a valid custom project passes the export preflight (composition fits)', () => {
    for (const p of [magnet(), insert(), keychain()])
      expect(
        runExportPreflight(p, fonts).items.filter((i) => i.code === 'composition-invalid')
      ).toEqual([])
  })
})

describe('generic design safe margin (not printer evidence; a matching printer profile wins)', () => {
  const near = (): TemplateProject => ({
    ...insert(),
    layers: [text('t1', 10, 400), text('t2', 200, 400)]
  })
  it('flags critical content inside the generic margin, in plain words', () => {
    const r = checkSafeAreas(near(), null)
    expect(r.generic?.marginMm).toBe(3)
    const items = r.items.filter((i) => i.code.startsWith('safe-margin-'))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      code: 'safe-margin-generic',
      severity: 'warning',
      layerIds: ['t1']
    })
    expect(items[0]!.message).toMatch(/0\.8 mm from the design edge \(left side\)/)
    expect(items[0]!.message).toMatch(
      /generic safe margin is 3 mm.*not a measurement of your printer/
    )
    expect(r.flagged.map((f) => f.layerId)).toEqual(['t1'])
    expect(buildChecks(items).groups[0]!.cards[0]!.title).toBe('Text “Hello” is close to the edge')
  })
  it('everything clear → a Good to know note', () => {
    const p = { ...insert(), layers: [text('t2', 200, 400)] }
    expect(checkSafeAreas(p, null).items.map((i) => i.code)).toContain('safe-margin-generic-clear')
  })
  it('no generic margin → no generic checks (every pre-B5.5 project)', () => {
    const p = { ...preset('photo-4x6-portrait-300'), layers: [text('t1', 1, 1)] }
    const r = checkSafeAreas(p, null)
    expect(r.generic).toBeNull()
    expect(r.items.map((i) => i.code)).toEqual(['output-profile-none'])
  })
  it('a matching printer profile supersedes the generic margin', () => {
    const profile = findOutputProfile(DNP_DS_RX1_PROFILE_ID) as OutputProfile
    const p = { ...magnet(), layers: [text('t1', 10, 400)] }
    const r = checkSafeAreas(p, profile)
    expect(r.resolution.status).toBe('ok')
    expect(r.generic).toBeNull()
    expect(r.items.some((i) => i.code.startsWith('safe-margin-'))).toBe(false)
  })
  it('a profile for another sheet does not hide the generic margin', () => {
    const profile = findOutputProfile(DNP_DS_RX1_PROFILE_ID) as OutputProfile
    const r = checkSafeAreas(near(), profile)
    expect(r.resolution.status).toBe('mismatch')
    expect(r.items.map((i) => i.code)).toEqual(['output-profile-mismatch', 'safe-margin-generic'])
  })
})
