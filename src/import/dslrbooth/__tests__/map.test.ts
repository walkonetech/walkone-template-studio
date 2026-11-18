import { describe, expect, it } from 'vitest'
import { loadProject, type ImageLayer, type Layer, type PhotoLayer, type TextLayer } from '@domain'
import { makeProject, photo, T0 } from '../../../editor/__tests__/helpers'
import { buildDslrTemplate, mainVariant, planDslrTemplate } from '../../../export/dslrbooth/plan'
import { encodeTemplateXml, writeTemplateXml } from '../../../export/dslrbooth/templateXml'
import { mapDslrTemplate, referencedEntries, resolveEntry, type DslrImageFacts } from '../map'
import { DslrImportError } from '../template'
import { detectTwoUp } from '../twoUp'

// ---- helpers --------------------------------------------------------------------------------------------------------

const ROOT = {
  Name: 'Test Template',
  Width: '1200',
  Height: '1800',
  Dimensions: '0',
  Resolution: '300',
  BackgroundColor: '#FF211F1F',
  print_2_per_page: 'False',
  PrintToSecondaryPrinter: 'False',
  LastSavedDate: '07/27/2023 22:26:37',
  Id: 'abcdefghijklmnopqrstuvwxy',
  IsLegacy: 'True',
  OriginalDevice: 'SOME-PC'
}
const SHADOW = {
  Opacity: '100',
  ShadowEnabled: 'False',
  ShadowColor: '#FF000000',
  ShadowDepth: '10',
  ShadowRadius: '20',
  ShadowDirection: '-45'
}
type Attrs = Record<string, string | number>
const attrs = (a: Attrs): string =>
  Object.entries(a)
    .map(([k, v]) => `${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join(' ')
const image = (
  name: string,
  file: string,
  box: [number, number, number, number],
  z: number,
  more: Attrs = {}
): string =>
  `<Image ${attrs({ Name: name, ...SHADOW, Width: box[2], Height: box[3], Top: box[1], Left: box[0], ImagePath: file, KeepAspect: 'True', Thickness: 0, StrokeColor: '#FF000000', ZIndex: z, ...more })} />`
const slot = (
  n: number,
  box: [number, number, number, number],
  z: number,
  more: Attrs = {}
): string =>
  `<Photo ${attrs({ Name: `Photo ${n}`, ...SHADOW, Width: box[2], Height: box[3], Top: box[1], Left: box[0], ImagePath: '', KeepAspect: 'True', Thickness: 0, StrokeColor: '#FF000000', PhotoNumber: n, ZIndex: z, ...more })} />`
const xml = (elements: string[], root: Attrs = {}): Uint8Array =>
  new TextEncoder().encode(
    `\ufeff<?xml version="1.0" encoding="UTF-8"?>\r\n<Template ${attrs({ ...ROOT, ...root })}>\r\n  <Elements>\r\n    ${elements.join('\r\n    ')}\r\n  </Elements>\r\n</Template>`
  )
const facts = (sha: string, w = 100, h = 100): DslrImageFacts => ({
  ok: true,
  mediaType: 'image/png',
  extension: 'png',
  pixelWidth: w,
  pixelHeight: h,
  hasAlpha: true,
  byteSize: 1000,
  sha256: sha.padEnd(64, '0')
})
let n = 0
const ids = (): (() => string) => {
  n = 0
  return () => `id-${++n}`
}
const run = (
  templateXml: Uint8Array,
  files: Record<string, DslrImageFacts> = {},
  opts: { layout?: 'as-is' | 'strip'; extra?: string[] } = {}
) =>
  mapDslrTemplate(
    {
      fileName: 'Test Template.zip',
      entryNames: ['template.xml', 'preview.png', ...Object.keys(files), ...(opts.extra ?? [])],
      templateXml,
      images: new Map(Object.entries(files))
    },
    { now: T0, createId: ids(), ...(opts.layout ? { layout: opts.layout } : {}) }
  )
const codes = (r: { items: { code: string }[] }): string[] => r.items.map((i) => i.code)
const valid = (p: unknown): void => {
  const v = loadProject(JSON.parse(JSON.stringify(p)))
  expect(v.ok ? 'ok' : JSON.stringify(v.errors)).toBe('ok')
}

// ---- tests ----------------------------------------------------------------------------------------------------------

describe('mapDslrTemplate: canvas, layers, stacking', () => {
  const tpl = xml([
    // listed in descending ZIndex, like every real file
    image('top', 'over.png', [0, 0, 1200, 1800], 3, {
      Opacity: '50',
      Rotation: '0',
      IsLocked: 'True'
    }),
    slot(2, [100, 900, 1000, 600], 2, { Rotation: '-3' }),
    slot(1, [100, 100, 1000, 600], 1, { IsVisible: 'False' }),
    image('bg', 'bg.png', [-4, 0, 1210, 1800], 0, { KeepAspect: 'False' })
  ])
  const r = run(tpl, { 'over.png': facts('a'), 'bg.png': facts('b') })

  it('derives the physical size from pixels and Resolution and keeps the colour', () => {
    expect(r.project.canvas.print).toEqual({ width: 4, height: 6, unit: 'in', dpi: 300 })
    expect(r.project.output.layout.kind).toBe('single')
    expect(r.project.canvas.backgroundColor).toEqual({ kind: 'literal', value: '#211f1f' })
    expect(r.project.metadata.name).toBe('Test Template')
    expect(r.summary).toMatchObject({
      widthIn: 4,
      heightIn: 6,
      dpi: 300,
      photoSlots: 2,
      photoCount: 2,
      images: 2,
      hasPreview: true
    })
    valid(r.project)
  })

  it('maps elements in ZIndex order (back to front) with their own settings', () => {
    const [bg, p1, p2, top] = r.project.layers as [ImageLayer, PhotoLayer, PhotoLayer, ImageLayer]
    expect(r.project.layers.map((l) => l.zIndex)).toEqual([0, 1, 2, 3])
    expect(bg).toMatchObject({
      type: 'image',
      name: 'bg',
      x: -4,
      y: 0,
      width: 1210,
      height: 1800,
      fit: 'stretch',
      role: 'background'
    })
    expect(p1).toMatchObject({
      type: 'photo',
      photoNumber: 1,
      x: 100,
      y: 100,
      width: 1000,
      height: 600,
      visible: false,
      fit: 'cover',
      frame: { style: 'none' },
      cornerRadius: 0
    })
    expect(p2).toMatchObject({ photoNumber: 2, rotation: -3, visible: true, locked: false })
    expect(top).toMatchObject({
      type: 'image',
      opacity: 0.5,
      locked: true,
      fit: 'contain',
      role: 'overlay'
    })
    expect(codes(r)).toEqual(
      expect.arrayContaining(['locked', 'hidden', 'original-device', 'flattened-artwork'])
    )
  })

  it('records the template’s own values for the dslrBooth adapter, without the machine name', () => {
    const c = r.project.sourceCompatibility?.dslrbooth
    expect(c?.adapterVersion).toBe('7.48-import-2')
    expect(c?.importedAt).toBe(T0)
    const root = (c?.project as { rootAttributes: Record<string, string> }).rootAttributes
    expect(root.Id).toBe('abcdefghijklmnopqrstuvwxy')
    expect(root.Dimensions).toBe('0')
    expect(root.OriginalDevice).toBeUndefined()
    expect(JSON.stringify(r.project)).not.toContain('SOME-PC')
    expect(c?.layers).toBeUndefined() // nothing unknown on any element
  })

  it('one asset per distinct picture; file name kept for display, stored under its id', () => {
    expect(r.assets.map((a) => a.entry)).toEqual(['bg.png', 'over.png'])
    expect(r.project.assets[0]).toMatchObject({
      filename: 'bg.png',
      path: `assets/${r.project.assets[0]?.id}.png`,
      source: { kind: 'import', label: 'dslrBooth template' }
    })
  })
})

describe('mapDslrTemplate: problems are reported, never silently dropped', () => {
  it('a missing picture is left out with a warning and kept verbatim in the import notes', () => {
    const r = run(xml([image('gone', 'gone.png', [0, 0, 10, 10], 1), slot(1, [0, 0, 10, 10], 0)]))
    expect(codes(r)).toContain('missing-image')
    expect(r.project.layers.map((l) => l.type)).toEqual(['photo'])
    expect(JSON.stringify(r.project.sourceCompatibility?.dslrbooth?.unmapped)).toContain('gone.png')
    valid(r.project)
  })

  it('matches a picture ignoring case (Windows), with a note', () => {
    const r = run(xml([image('a', 'Logo.PNG', [0, 0, 10, 10], 1), slot(1, [0, 0, 10, 10], 0)]), {
      'logo.png': facts('a')
    })
    expect(r.project.layers.map((l) => l.type)).toEqual(['photo', 'image'])
    expect(codes(r)).toContain('image-name-case')
  })

  it('an unreadable picture is left out with its reason', () => {
    const r = run(xml([image('a', 'x.png', [0, 0, 10, 10], 1), slot(1, [0, 0, 10, 10], 0)]), {
      'x.png': { ok: false, message: 'That image could not be decoded' }
    })
    expect(r.items.find((i) => i.code === 'unreadable-image')?.message).toContain(
      'could not be decoded'
    )
  })

  it('identical pictures under two names become one asset', () => {
    const r = run(
      xml([
        image('a', 'a.png', [0, 0, 10, 10], 2),
        image('b', 'b.png', [0, 0, 10, 10], 1),
        slot(1, [0, 0, 10, 10], 0)
      ]),
      { 'a.png': facts('same'), 'b.png': facts('same') }
    )
    expect(r.project.assets).toHaveLength(1)
    const imgs = r.project.layers.filter((l): l is ImageLayer => l.type === 'image')
    expect(new Set(imgs.map((l) => l.assetId)).size).toBe(1)
  })

  it('unknown elements and attributes are kept and reported', () => {
    const r = run(
      xml([`<Sticker Name="t" Content="Hello" />`, slot(1, [0, 0, 10, 10], 0, { Corner: '12' })])
    )
    expect(codes(r)).toEqual(expect.arrayContaining(['unknown-element', 'unknown-attributes']))
    const c = r.project.sourceCompatibility?.dslrbooth
    expect(JSON.stringify(c?.unmapped)).toContain('Hello')
    const photoId = r.project.layers[0]?.id as string
    expect(c?.layers?.[photoId]).toEqual({ element: 'Photo', attributes: { Corner: '12' } })
    valid(r.project)
  })

  // Edge cases around live <Text> (6C C1). Attribute set and defaults as in dslrBooth 7.48's own export
  // (tests/fixtures/dslrbooth/synthetic/live-text-fixture.zip, covered end to end in projects/__tests__).
  const text = (
    content: string,
    box: [number, number, number, number],
    z: number,
    more: Attrs = {}
  ): string =>
    `<Text ${attrs({ Name: content, ...SHADOW, Text: content, FontName: 'Arial', FontWeight: 'Regular', Width: box[2], Height: box[3], Top: box[1], Left: box[0], FontColor: '#FF000000', KeepAspect: 'False', IsBold: 'False', IsItalic: 'False', FontSize: 48, TextHorizontalAlignment: 0, ZIndex: z, ...more })} />`
  const textLayers = (r: ReturnType<typeof run>): TextLayer[] =>
    r.project.layers.filter((l): l is TextLayer => l.type === 'text')

  it('live <Text> becomes an editable text layer; no “will be missing” warning (6C C1)', () => {
    const r = run(xml([slot(1, [0, 0, 600, 400], 0), text('Sam & Alex', [100, 500, 600, 55], 1)]))
    expect(codes(r)).not.toContain('unknown-element')
    const note = r.items.find((i) => i.code === 'live-text')
    expect(note?.severity).toBe('info')
    expect(note?.message).toMatch(/1 live text element .*editable text \(“Sam & Alex”\)/)
    expect(note?.message).not.toMatch(/missing/)
    expect(textLayers(r)[0]).toMatchObject({
      content: 'Sam & Alex',
      fontFamily: 'Arial',
      x: 100,
      width: 600
    })
    expect(r.project.sourceCompatibility?.dslrbooth?.unmapped).toBeUndefined()
    expect(r.items.find((i) => i.code === 'flattened-artwork')?.message).toMatch(
      /live text is editable/
    )
    valid(r.project)
  })

  it('legacy IsBold / IsItalic flags are honoured; style names map to weight and italic', () => {
    const r = run(
      xml([
        slot(1, [0, 0, 600, 400], 0),
        text('A', [0, 500, 600, 55], 1, { IsBold: 'True', IsItalic: 'True' }),
        text('B', [0, 600, 600, 55], 2, { FontWeight: 'Semi Bold Oblique' }),
        text('C', [0, 700, 600, 55], 3, { FontWeight: 'Black' }),
        text('D', [0, 800, 600, 55], 4, { FontWeight: 'Bold Italic' })
      ])
    )
    expect(textLayers(r).map((l) => [l.content, l.fontWeight, l.fontStyle])).toEqual([
      ['A', 700, 'italic'],
      ['B', 600, 'italic'],
      ['C', 900, 'normal'],
      ['D', 400, 'italic'] // dslrBooth prints its "Bold Italic" as Italic (observed)
    ])
    expect(codes(r)).toContain('text-bold-italic')
  })

  it('a condensed style, an unknown style word, alignment and colour are imported with specific warnings', () => {
    const r = run(
      xml([
        slot(1, [0, 0, 600, 400], 0),
        text('Narrow', [0, 500, 600, 55], 1, { FontWeight: 'Bold Condensed' }),
        text('Odd', [0, 600, 600, 55], 2, { FontWeight: 'Wobbly', TextHorizontalAlignment: 7 }),
        text('Hue', [0, 700, 600, 55], 3, { FontColor: 'teal' })
      ])
    )
    expect(codes(r)).toEqual(
      expect.arrayContaining(['text-font-stretch', 'text-weight', 'text-align', 'text-color'])
    )
    const [narrow, odd, hue] = textLayers(r)
    expect(narrow).toMatchObject({ fontWeight: 700, content: 'Narrow' })
    expect(odd).toMatchObject({ fontWeight: 400, align: 'center' })
    expect(hue?.fill).toEqual({ kind: 'literal', value: '#000000' })
    expect(r.items.find((i) => i.code === 'text-weight')?.message).toContain('“Wobbly”')
    valid(r.project)
  })

  it('a FontColor with alpha keeps its transparency', () => {
    const r = run(
      xml([
        slot(1, [0, 0, 600, 400], 0),
        text('Faded', [0, 500, 600, 55], 1, { FontColor: '#80E01010' })
      ])
    )
    expect(textLayers(r)[0]?.fill).toEqual({ kind: 'literal', value: '#e0101080' })
  })

  it('a line break (only possible by editing the XML) is kept, with a note', () => {
    const r = run(
      xml(
        [slot(1, [0, 0, 600, 400], 0), text('LINE ONE&#10;LINE TWO', [0, 500, 600, 110], 1)].map(
          (x) => x.replaceAll('&amp;#10;', '&#10;')
        )
      )
    )
    expect(textLayers(r)[0]?.content).toBe('LINE ONE\nLINE TWO')
    expect(textLayers(r)[0]?.lineHeight).toBe(1.15)
    expect(codes(r)).toContain('text-line-breaks')
  })

  it('a slightly too narrow, rotated, left-aligned box grows without moving the text start', () => {
    // 'REGULAR TEXT 2026' at 48 px ≈ 488 px in Arial/Helvetica, dslrBooth stored a 486 px box.
    const r = run(
      xml([
        slot(1, [0, 0, 600, 400], 0),
        text('REGULAR TEXT 2026', [100, 800, 486, 55], 1, { Rotation: 90 })
      ])
    )
    const l = textLayers(r)[0] as TextLayer
    expect(l.width).toBeGreaterThan(486)
    expect(codes(r)).toContain('text-box-widened')
    // Rotated 90° clockwise, the left edge is at the top: the box's top (local left) end must stay put.
    const localLeftEnd = (x: number, y: number, w: number, h: number): [number, number] => [
      x + w / 2,
      y + h / 2 - w / 2
    ]
    expect(localLeftEnd(l.x, l.y, l.width, l.height)[1]).toBeCloseTo(
      localLeftEnd(100, 800, 486, 55)[1],
      1
    )
    expect(l.rotation).toBe(90)
  })

  it('two strips with the same text side by side still import as one strip', () => {
    const r = run(
      xml([
        slot(1, [50, 100, 500, 400], 0),
        slot(1, [650, 100, 500, 400], 1),
        text('Sam & Alex', [50, 1500, 500, 55], 2, { TextHorizontalAlignment: 1 }),
        text('Sam & Alex', [650, 1500, 500, 55], 3, { TextHorizontalAlignment: 1 })
      ])
    )
    expect(r.recommendedLayout).toBe('strip')
    expect(textLayers(r)).toHaveLength(1)
  })

  it('without live text the note still says text arrived flattened', () => {
    const r = run(xml([slot(1, [0, 0, 10, 10], 0)]))
    expect(codes(r)).not.toContain('live-text')
    expect(r.items.find((i) => i.code === 'flattened-artwork')?.message).toMatch(
      /already flattened/
    )
  })

  it('the dslrBooth editor unit (Dimensions) survives import → export (6C C2)', () => {
    const unit = (root: Record<string, string>): number => {
      const r = run(xml([slot(1, [0, 0, 600, 400], 0)], root))
      const project = r.project
      return buildDslrTemplate(project, planDslrTemplate(project, mainVariant(project)), {
        name: 'x',
        now: new Date(2026, 0, 1)
      }).root.dimensions
    }
    expect(unit({ Dimensions: '1' })).toBe(1)
    expect(unit({ Dimensions: '2' })).toBe(2)
    expect(unit({ Dimensions: '0' })).toBe(0)
    expect(unit({ Dimensions: '7' })).toBe(0)
  })

  it('an enabled shadow is reported (not drawn) and its settings kept', () => {
    const r = run(xml([slot(1, [0, 0, 10, 10], 0, { ShadowEnabled: 'True', ShadowDepth: '7' })]))
    expect(codes(r)).toContain('shadow')
    const id = r.project.layers[0]?.id as string
    expect(r.project.sourceCompatibility?.dslrbooth?.layers?.[id]?.attributes).toMatchObject({
      ShadowEnabled: 'True',
      ShadowDepth: '7'
    })
  })

  it('a photo border grows the slot outward into a frame of the same colour', () => {
    const r = run(
      xml([slot(1, [100, 100, 400, 300], 0, { Thickness: '10', StrokeColor: '#FFFF0000' })])
    )
    expect(r.project.layers[0]).toMatchObject({
      x: 90,
      y: 90,
      width: 420,
      height: 320,
      frame: { style: 'solid', thickness: 10, color: { kind: 'literal', value: '#ff0000' } }
    })
    expect(codes(r)).toContain('photo-border')
  })

  it('photo numbers: invalid ones are skipped, high ones and no slots warned', () => {
    const r = run(xml([slot(0, [0, 0, 10, 10], 1), slot(13, [0, 0, 10, 10], 0)]))
    expect(codes(r)).toEqual(expect.arrayContaining(['photo-number', 'photo-number-range']))
    expect(run(xml([])).items.map((i) => i.code)).toContain('no-photo-slots')
  })

  it('unused files are listed; template.xml and preview.png are not "unused"', () => {
    const r = run(xml([slot(1, [0, 0, 10, 10], 0)]), {}, { extra: ['notes.txt'] })
    expect(r.items.find((i) => i.code === 'unused-files')?.message).toContain('notes.txt')
    expect(r.items.find((i) => i.code === 'unused-files')?.message).not.toContain('preview')
  })

  it('missing ZIndex goes to the back; a bad colour falls back to white', () => {
    const r = run(
      xml(
        [
          slot(1, [0, 0, 10, 10], 5),
          `<Photo Name="loose" Width="5" Height="5" Top="0" Left="0" PhotoNumber="2" />`
        ],
        { BackgroundColor: 'red' }
      )
    )
    expect((r.project.layers[0] as PhotoLayer).photoNumber).toBe(2)
    expect(r.project.canvas.backgroundColor).toEqual({ kind: 'literal', value: '#ffffff' })
    expect(codes(r)).toEqual(expect.arrayContaining(['z-index', 'background-color']))
  })

  it.each([
    ['not a template', new TextEncoder().encode('<Project/>')],
    ['no size', xml([], { Width: 'x' })],
    ['no resolution', xml([], { Resolution: '0' })],
    ['too large', xml([], { Width: '40000' })],
    ['not XML', new TextEncoder().encode('PK\u0003\u0004')]
  ])('refuses a file that is %s', (_l, bytes) => {
    expect(() => run(bytes)).toThrow(DslrImportError)
  })
})

describe('two strips side by side', () => {
  // A 4×6 @300 sheet holding two 2×6 strips; the right copies are placed by hand, a few pixels off.
  const sheet = (rightBgRotation = '0'): Uint8Array =>
    xml([
      image('frame Copy', 'frame.png', [600, 0, 600, 1800], 5),
      image('frame', 'frame.png', [0, 0, 600, 1800], 4),
      slot(1, [37, 84, 524, 350], 3),
      slot(1, [631, 84, 524, 350], 2, { Name: 'Photo 1 Copy' }),
      image('bg', 'bg.png', [-2, 0, 600, 1800], 1),
      image('bg Copy', 'bg.png', [597, 0, 600, 1800], 0, { Rotation: rightBgRotation })
    ])
  const files = { 'frame.png': facts('f'), 'bg.png': facts('b') }

  it('are detected and imported as ONE strip printed two-up by default', () => {
    const r = run(sheet(), files)
    expect(r.recommendedLayout).toBe('strip')
    expect(r.layout).toBe('strip')
    expect(r.twoUp).toEqual({ stripWidthIn: 2, stripHeightIn: 6, differences: [], crossing: 0 })
    expect(r.project.canvas.print).toEqual({ width: 2, height: 6, unit: 'in', dpi: 300 })
    expect(r.project.output).toEqual({
      print: { width: 4, height: 6, unit: 'in', dpi: 300 },
      layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 }
    })
    expect(r.project.layers.map((l) => l.name)).toEqual(['bg', 'Photo 1', 'frame'])
    expect(JSON.stringify(r.project.sourceCompatibility?.dslrbooth?.unmapped)).toContain(
      'right-strip-copy'
    )
    expect(codes(r)).toContain('two-up')
    // the copy's photo slot sat 6 px off: said, not silently evened out
    expect(r.items.find((i) => i.code === 'two-up-offset')?.message).toMatch(/up to 6 px/)
    valid(r.project)
  })

  it('can still be imported exactly as the sheet', () => {
    const r = run(sheet(), files, { layout: 'as-is' })
    expect(r.layout).toBe('as-is')
    expect(r.project.layers).toHaveLength(6)
    expect(codes(r)).toContain('two-up-sheet')
  })

  it('differences between the strips are listed and make "as is" the default', () => {
    const r = run(sheet('180'), files)
    expect(r.recommendedLayout).toBe('as-is')
    expect(r.twoUp?.differences[0]).toMatch(/rotated 180°/)
    const s = run(sheet('180'), files, { layout: 'strip' })
    expect(s.items.find((i) => i.code === 'two-up-difference')?.message).toMatch(
      /Only the left strip/
    )
  })

  it('±180° count as the same rotation', () => {
    const t = run(
      xml([
        slot(1, [0, 0, 500, 300], 1, { Rotation: '-180' }),
        slot(1, [600, 0, 500, 300], 0, { Rotation: '180' })
      ]),
      {}
    )
    expect(t.twoUp?.differences).toEqual([])
  })

  it('“print 2 per page” on a landscape design is reported, printed once', () => {
    const r = run(
      xml([slot(1, [0, 0, 10, 10], 0)], { Width: '1800', Height: '1200', print_2_per_page: 'True' })
    )
    expect(r.project.output.layout.kind).toBe('single')
    expect(codes(r)).toContain('print-2-per-page-unsupported')
  })

  it('a strip layout is refused for a design that is not two strips', () => {
    expect(() => run(xml([slot(1, [0, 0, 10, 10], 0)]), {}, { layout: 'strip' })).toThrow(
      DslrImportError
    )
  })

  it('is not detected when a copy is missing, moved too far, or a landscape sheet', () => {
    const base = {
      kind: 'photo',
      index: 0,
      name: '',
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      photoNumber: 1,
      imagePath: '',
      keepAspect: true,
      thickness: 0,
      strokeColor: null,
      shadowEnabled: false,
      extra: {},
      attributes: {}
    } as const
    const el = (x: number) => ({ ...base, x, y: 0, width: 500, height: 300 })
    expect(detectTwoUp([el(0)], 1200, 1800)).toBeNull()
    expect(detectTwoUp([el(0), el(700)], 1200, 1800)).toBeNull() // 100 px off (tolerance 24)
    expect(detectTwoUp([el(0), el(600)], 1200, 600)).toBeNull() // landscape: halves are not strips
    expect(detectTwoUp([el(0), el(610)], 1200, 1800)).not.toBeNull()
  })
})

describe('helpers', () => {
  it('resolveEntry: exact, case-insensitive, then by file name', () => {
    const names = ['a.png', 'Logo.png', 'deep/x.png']
    expect(resolveEntry('a.png', names)).toEqual({ entry: 'a.png', exact: true })
    expect(resolveEntry('logo.PNG', names)).toEqual({ entry: 'Logo.png', exact: false })
    expect(resolveEntry('C:\\x\\A.png', names)).toEqual({ entry: 'a.png', exact: false })
    expect(resolveEntry('', names)).toBeNull()
  })

  it('referencedEntries lists each picture once', () => {
    const t = xml([
      image('a', 'a.png', [0, 0, 1, 1], 2),
      image('a2', 'a.png', [0, 0, 1, 1], 1),
      image('m', 'missing.png', [0, 0, 1, 1], 0)
    ])
    expect(referencedEntries(t, ['a.png', 'template.xml'])).toEqual(['a.png'])
  })
})

describe('round trip with the 6B exporter', () => {
  it('photo slots exported by Template Studio import back to the same boxes and numbers', () => {
    const layers: Layer[] = [
      photo('p1', 1, {
        x: 30,
        y: 40,
        width: 540,
        height: 360,
        rotation: 0,
        frame: { style: 'none' }
      }),
      photo('p2', 2, {
        x: 30,
        y: 440,
        width: 540,
        height: 360,
        rotation: 5,
        frame: { style: 'none' }
      }),
      photo('p3', 3, { x: 30, y: 840, width: 540, height: 360, frame: { style: 'none' } })
    ]
    const project = makeProject(layers, 'strip-2x6-300')
    const plan = planDslrTemplate(project, mainVariant(project))
    const tpl = buildDslrTemplate(project, plan, {
      name: 'Round Trip',
      now: new Date(2026, 0, 2, 3, 4, 5)
    })
    const files = Object.fromEntries(
      tpl.elements.flatMap((e, i) =>
        e.type === 'Image' ? [[e.imagePath, facts(`img${i}`, 600, 1800)]] : []
      )
    )
    const r = run(encodeTemplateXml(writeTemplateXml(tpl)), files)
    const photos = r.project.layers.filter((l): l is PhotoLayer => l.type === 'photo')
    expect(photos.map((p) => [p.photoNumber, p.x, p.y, p.width, p.height, p.rotation])).toEqual([
      [1, 30, 40, 540, 360, 0],
      [2, 30, 440, 540, 360, 5],
      [3, 30, 840, 540, 360, 0]
    ])
    expect(r.project.canvas.print).toEqual({ width: 2, height: 6, unit: 'in', dpi: 300 })
    // print_2_per_page="True" comes back as the same two-up 4×6 output the project had
    expect(r.project.output).toEqual(project.output)
    expect(codes(r)).toContain('print-2-per-page')
    expect(r.items.some((i) => i.severity === 'warning')).toBe(false)
    // ...and importing then exporting again gives the same photo boxes.
    const again = planDslrTemplate(r.project, mainVariant(r.project))
    const boxes = (p: typeof plan) =>
      p.items.flatMap((i) => (i.kind === 'photo' ? [i.photo.boxes] : []))
    expect(boxes(again)).toEqual(boxes(plan))
  })
})
