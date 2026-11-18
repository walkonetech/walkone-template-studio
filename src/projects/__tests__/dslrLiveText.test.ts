import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadProject, type Layer, type TextLayer } from '../../domain'
import { buildDslrTemplate, mainVariant, planDslrTemplate } from '../../export/dslrbooth/plan'
import { writeTemplateXml } from '../../export/dslrbooth/templateXml'
import { analyzeDslrPackage } from '../dslrImport'

/**
 * dslrBooth 7.48 live text → editable text layers (6C C1), against the synthetic fixture made in dslrBooth's own editor
 * on the Windows test laptop (made-up text only; machine name sanitized). Fixture table:
 * tests/fixtures/dslrbooth/synthetic/README.md.
 */
const FIXTURE = join(__dirname, '../../../tests/fixtures/dslrbooth/synthetic/live-text-fixture.zip')

const load = async (): Promise<Awaited<ReturnType<typeof analyzeDslrPackage>>['result']> =>
  (await analyzeDslrPackage(FIXTURE)).result

const texts = (layers: Layer[]): TextLayer[] =>
  layers.filter((l): l is TextLayer => l.type === 'text')
const byContent = (layers: Layer[], content: string): TextLayer => {
  const t = texts(layers).filter((l) => l.content === content)
  expect(t).toHaveLength(1)
  return t[0] as TextLayer
}

describe('dslrBooth live-text fixture (6C C1)', () => {
  it('imports all 16 texts as editable text layers, plus 2 photo slots and the picture', async () => {
    const r = await load()
    expect(r.layout).toBe('as-is')
    expect(r.project.layers.map((l) => l.type).filter((t) => t !== 'text')).toEqual([
      'photo',
      'photo',
      'image'
    ])
    expect(texts(r.project.layers)).toHaveLength(16)
    expect(r.project.sourceCompatibility?.dslrbooth?.unmapped).toBeUndefined()
    expect(r.items.map((i) => i.code)).not.toContain('unknown-element')
    expect(() => loadProject(JSON.parse(JSON.stringify(r.project)))).not.toThrow()
  })

  it('keeps text exactly, including special characters (T12) and the no-line-break result (T10)', async () => {
    const { project } = await load()
    byContent(project.layers, `Tom & Jerry's "Party" 50% / 2026 <ok>`)
    byContent(project.layers, 'LINE ONELINE TWO')
    byContent(
      project.layers,
      'THIS IS A VERY LONG SINGLE LINE THAT SHOULD SHOW WHETHER DSLRBOOTH WRAPS OR CLIPS THE TEXT'
    )
  })

  it('maps weight and italic from FontWeight (T1–T4, T14A)', async () => {
    const { project } = await load()
    const style = (c: string): [number, string] => {
      const l = byContent(project.layers, c)
      return [l.fontWeight, l.fontStyle]
    }
    expect(style('REGULAR TEXT 2026')).toEqual([400, 'normal'])
    expect(style('BOLD TEXT')).toEqual([700, 'normal'])
    expect(style('ITALIC TEXT')).toEqual([400, 'italic'])
    // dslrBooth draws its "Bold Italic" as Italic only (observed in its editor, preview.png and session): imported as printed.
    expect(style('BOLD ITALIC')).toEqual([400, 'italic'])
    expect(style('TEXT ABOVE PHOTO')).toEqual([700, 'normal'])
  })

  it('maps alignment 0/1/2, colour, rotation and the explicit size (em in canvas px)', async () => {
    const { project } = await load()
    const l = (c: string): TextLayer => byContent(project.layers, c)
    expect(l('REGULAR TEXT 2026').align).toBe('left')
    expect(l('CENTERED RED').align).toBe('center')
    expect(l('RIGHT ALIGNED').align).toBe('right')
    expect(l('CENTERED RED').fill).toEqual({ kind: 'literal', value: '#e01010' })
    expect(l('RIGHT ALIGNED').fill).toEqual({ kind: 'literal', value: '#000000' })
    expect(l('ROTATED 15').rotation).toBe(15)
    expect(l('REGULAR TEXT 2026').rotation).toBe(0)
    for (const t of texts(project.layers).filter((t) => t.content !== 'AUTO'))
      expect(t.fontSize).toBe(48)
  })

  it('keeps a font that is not installed by name (T9 Segoe UI) and lists the fonts used', async () => {
    const r = await load()
    expect(byContent(r.project.layers, 'SEGOE UI TEST').fontFamily).toBe('Segoe UI')
    expect(r.items.find((i) => i.code === 'text-fonts')?.message).toMatch(/Arial, Segoe UI/)
  })

  it('keeps each box: position and height exact; width exact or slightly wider without moving the text', async () => {
    const { project } = await load()
    const box = (c: string): number[] => {
      const t = byContent(project.layers, c)
      return [t.x, t.y, t.width, t.height]
    }
    // Wide boxes (W typed by hand) are untouched.
    expect(box('CENTERED RED')).toEqual([100, 1240, 1000, 55])
    expect(box('RIGHT ALIGNED')).toEqual([100, 1350, 1000, 55])
    expect(box('ROTATED 15')).toEqual([100, 1500, 1000, 55])
    expect(box('DROP SHADOW TEST')).toEqual([100, 3430, 1000, 55])
    // A box dslrBooth fitted to its line may grow to the right (left aligned), never shrink or move.
    const [x, y, w, h] = box('REGULAR TEXT 2026')
    expect([x, y, h]).toEqual([100, 800, 55])
    expect(w).toBeGreaterThanOrEqual(486)
    expect(w).toBeLessThan(486 * 1.1)
    // The line is vertically centred in the dslrBooth box.
    expect(byContent(project.layers, 'REGULAR TEXT 2026').lineHeight).toBeCloseTo(55 / 48, 3)
  })

  it('“Auto” size (FontSize 0, T11A/B) becomes the largest normal size that fits, with a warning', async () => {
    const r = await load()
    const autos = texts(r.project.layers).filter((t) => t.content === 'AUTO')
    expect(autos).toHaveLength(2)
    const wide = autos.find((t) => t.width === 1000) as TextLayer
    const narrow = autos.find((t) => t.width === 250) as TextLayer
    expect(wide.fontSize).toBe(135) // 0.9 × the 150 px box height
    expect(narrow.fontSize).toBeLessThan(wide.fontSize) // limited by the 250 px width
    expect(narrow.fontSize).toBeGreaterThan(70)
    for (const t of autos) {
      expect([t.x, t.height]).toEqual([100, 150])
      expect(t.lineHeight * t.fontSize).toBeCloseTo(150, 1)
    }
    const w = r.items.find((i) => i.code === 'text-auto-size')
    expect(w?.severity).toBe('warning')
    expect(w?.message).toMatch(/2 texts/)
    const compat = r.project.sourceCompatibility?.dslrbooth?.layers?.[wide.id]
    expect(compat).toMatchObject({ element: 'Text', attributes: { FontSize: '0' } })
  })

  it('a line wider than its box (T13) keeps its box and content, with an overflow warning', async () => {
    const r = await load()
    const t = byContent(
      r.project.layers,
      'THIS IS A VERY LONG SINGLE LINE THAT SHOULD SHOW WHETHER DSLRBOOTH WRAPS OR CLIPS THE TEXT'
    )
    expect([t.x, t.y, t.width, t.height]).toEqual([100, 2360, 400, 55])
    expect(r.items.find((i) => i.code === 'text-overflow')?.message).toMatch(/“THIS IS A VERY/)
  })

  it('stacks text with photos and pictures as dslrBooth does (T14A over Photo 2, T14B under the picture)', async () => {
    const { project } = await load()
    const order = project.layers.map((l) => (l.type === 'text' ? l.content : l.name))
    const at = (n: string): number => order.indexOf(n)
    expect(order[0]).toBe('REGULAR TEXT 2026')
    expect(order[order.length - 1]).toBe('DROP SHADOW TEST')
    expect(at('TEXT ABOVE PHOTO')).toBeGreaterThan(at('Photo 2'))
    expect(at('TEXT BELOW ART')).toBeLessThan(at('art-block'))
    expect(at('TEXT BELOW ART')).toBeGreaterThan(at('TEXT ABOVE PHOTO'))
  })

  it('reports the drop shadow (T15) and no longer warns that text will be missing', async () => {
    const r = await load()
    const codes = r.items.map((i) => i.code)
    expect(r.items.find((i) => i.code === 'text-bold-italic')?.message).toMatch(
      /“BOLD ITALIC”.*Italic only/
    )
    const bi = byContent(r.project.layers, 'BOLD ITALIC')
    expect(r.project.sourceCompatibility?.dslrbooth?.layers?.[bi.id]).toMatchObject({
      attributes: { FontWeight: 'Bold Italic' }
    })
    expect(codes).toContain('shadow')
    const live = r.items.find((i) => i.code === 'live-text')
    expect(live?.severity).toBe('info')
    expect(live?.message).toMatch(/16 live text elements .*editable text/)
    expect(live?.message).not.toMatch(/missing/)
    expect(codes).toContain('original-device')
    const shadowed = byContent(r.project.layers, 'DROP SHADOW TEST')
    expect(r.project.sourceCompatibility?.dslrbooth?.layers?.[shadowed.id]).toMatchObject({
      element: 'Text',
      attributes: { ShadowEnabled: 'True', ShadowDepth: '10' }
    })
  })

  it('exports back with every text drawn into the artwork (6B policy): no text is dropped, none is native', async () => {
    const { project } = await load()
    const plan = planDslrTemplate(project, mainVariant(project))
    const drawn = new Set(plan.items.flatMap((i) => (i.kind === 'image' ? i.image.leafIds : [])))
    for (const t of texts(project.layers)) expect(drawn.has(t.id)).toBe(true)
    const xml = writeTemplateXml(
      buildDslrTemplate(project, plan, { name: 'Round trip', now: new Date(0) })
    )
    expect(xml).not.toContain('<Text')
    expect(xml).toContain('print_2_per_page="True"')
  })
})
