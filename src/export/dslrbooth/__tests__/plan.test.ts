import { describe, expect, it } from 'vitest'
import { literalColor, type Layer, type TemplateProject } from '@domain'
import { makeProject, photo, shape, text } from '../../../editor/__tests__/helpers'
import {
  buildDslrTemplate,
  intBox,
  isNativeStrip,
  mainVariant,
  planDslrTemplate,
  wholeDegrees,
  type DslrPlan
} from '../plan'
import { dslrOutputs } from '../outputs'
import { runDslrPreflight } from '../preflight'
import { verifyDslrPackage } from '../container'
import { encodeTemplateXml, parseTemplateXml, writeTemplateXml } from '../templateXml'

const slot = (id: string, n: number, y: number, over: Partial<Layer> = {}): Layer =>
  photo(id, n, { x: 30, y, width: 540, height: 360, frame: { style: 'none' }, ...over })

const strip = (layers: Layer[]): TemplateProject => ({
  ...makeProject(layers, 'strip-2x6-300'),
  canvas: { ...makeProject([], 'strip-2x6-300').canvas, backgroundColor: literalColor('#f8f3ea') }
})

const shapeOf = (plan: DslrPlan): string[] =>
  plan.items.map((it) =>
    it.kind === 'photo'
      ? `photo:${it.photo.photoNumber}`
      : `${it.image.path}[${[
          ...it.image.maskIds.map((i) => `mask:${i}`),
          ...it.image.frameIds.map((i) => `frame:${i}`),
          ...it.image.leafIds
        ].join(',')}]`
  )

describe('variants', () => {
  it('a 2×6 strip on a 4×6 two-up is a native strip; a 4×6 postcard is single', () => {
    const s = strip([])
    expect(isNativeStrip(s)).toBe(true)
    expect(mainVariant(s)).toBe('strip')
    expect(mainVariant(makeProject([]))).toBe('single')
  })

  it('offers the strip and the 4×6 sheet for a strip, one template otherwise', () => {
    const outs = dslrOutputs({
      ...strip([]),
      metadata: { ...strip([]).metadata, name: 'Sam & Alex' }
    })
    expect(outs.map((o) => [o.kind, o.fileName, o.width, o.height, o.defaultSelected])).toEqual([
      ['dslrbooth', 'Sam & Alex.zip', 600, 1800, true],
      ['dslrbooth-4x6', 'Sam & Alex 4x6.zip', 1200, 1800, false]
    ])
    expect(dslrOutputs(makeProject([])).map((o) => o.kind)).toEqual(['dslrbooth'])
  })
})

describe('planDslrTemplate', () => {
  it('splits by stacking order: base behind the photos, one image above them', () => {
    const p = strip([
      shape('bg-art', 0, { x: 0, y: 0, width: 600, height: 1800 }),
      slot('p1', 1, 40),
      slot('p2', 2, 420),
      slot('p3', 3, 800),
      text('names', 4, { x: 30, y: 1300, width: 540, height: 100 })
    ])
    const plan = planDslrTemplate(p, 'strip')
    expect(shapeOf(plan)).toEqual([
      'background.png[bg-art]',
      'photo:1',
      'photo:2',
      'photo:3',
      'artwork-1.png[names]'
    ])
    expect(plan.canvas).toEqual({ width: 600, height: 1800, dpi: 300 })
  })

  it('draws frames and rounded-corner masks into the image right above the photos', () => {
    const p = strip([
      slot('p1', 1, 40, {
        frame: { style: 'solid', thickness: 8, color: literalColor('#b08d57') }
      }),
      slot('p2', 2, 420, { cornerRadius: 24 }),
      text('names', 3, { x: 30, y: 1300, width: 540, height: 100 })
    ])
    const plan = planDslrTemplate(p, 'strip')
    expect(shapeOf(plan)).toEqual([
      'background.png[]',
      'photo:1',
      'photo:2',
      'artwork-1.png[mask:p2,frame:p1,names]'
    ])
    expect(plan.under.p2).toEqual([])
  })

  it('starts a new image when a photo overlaps one whose frame is still pending, keeping the stack exact', () => {
    const framed = {
      frame: { style: 'solid' as const, thickness: 8, color: literalColor('#000000') }
    }
    const p = strip([slot('p1', 1, 40, framed), slot('p2', 2, 200, framed)])
    expect(shapeOf(planDslrTemplate(p, 'strip'))).toEqual([
      'background.png[]',
      'photo:1',
      'artwork-1.png[frame:p1]',
      'photo:2',
      'artwork-2.png[frame:p2]'
    ])
  })

  it('keeps artwork stacked BETWEEN photos between them', () => {
    const p = strip([
      slot('p1', 1, 40),
      shape('ribbon', 1, { x: 0, y: 380, width: 600, height: 60 }),
      slot('p2', 2, 420)
    ])
    expect(shapeOf(planDslrTemplate(p, 'strip'))).toEqual([
      'background.png[]',
      'photo:1',
      'artwork-1.png[ribbon]',
      'photo:2'
    ])
  })

  it('masks show what lies beneath the slot', () => {
    const p = strip([
      shape('a', 0, { x: 0, y: 0, width: 600, height: 900 }),
      slot('p1', 1, 40),
      shape('b', 2, { x: 0, y: 0, width: 600, height: 50 }),
      slot('p2', 3, 420, { cornerRadius: 30 })
    ])
    const plan = planDslrTemplate(p, 'strip')
    expect(plan.under.p2).toEqual(['a', 'b'])
  })

  it('ignores hidden layers', () => {
    const p = strip([slot('p1', 1, 40), shape('hidden', 1, { visible: false })])
    expect(shapeOf(planDslrTemplate(p, 'strip'))).toEqual(['background.png[]', 'photo:1'])
  })

  it('rounds photo boxes inward when a frame or mask covers the edge, to the nearest pixel otherwise', () => {
    expect(intBox(30.4, 40.6, 539.2, 360.2, true)).toEqual({
      left: 31,
      top: 41,
      width: 538,
      height: 359
    })
    expect(intBox(30.4, 40.6, 539.2, 360.2, false)).toEqual({
      left: 30,
      top: 41,
      width: 540,
      height: 360
    })
    expect(intBox(30, 40, 540, 360, true)).toEqual({ left: 30, top: 40, width: 540, height: 360 })
  })

  it('normalizes rotation to whole clockwise degrees', () => {
    expect([0, -3, 359.6, 180, -180, 190, 2.4].map(wholeDegrees)).toEqual([
      0, -3, 0, 180, 180, -170, 2
    ])
  })

  it('the 4×6 sheet places every photo once per copy, with the same PhotoNumber', () => {
    const p = strip([slot('p1', 1, 40), slot('p2', 2, 420)])
    const plan = planDslrTemplate(p, 'sheet')
    expect(plan.canvas).toEqual({ width: 1200, height: 1800, dpi: 300 })
    expect(plan.copies.map((c) => c.left)).toEqual([0, 600])
    const t = buildDslrTemplate(p, plan, { name: 'T 4x6', now: new Date(2026, 10, 16, 9, 0, 0) })
    expect(t.root.print2PerPage).toBe(false)
    expect(
      t.elements
        .filter((e) => e.type === 'Photo')
        .map((e) => `${e.name}@${e.left},${e.top}#${e.zIndex}`)
    ).toEqual([
      'Photo 1@30,40#1',
      'Photo 1 Copy@630,40#2',
      'Photo 2@30,420#3',
      'Photo 2 Copy@630,420#4'
    ])
  })
})

describe('buildDslrTemplate', () => {
  it('writes the root as observed, with unique ascending ZIndex in stacking order', () => {
    const p = strip([shape('bg', 0), slot('p1', 1, 40, { rotation: -3 }), text('t', 2)])
    const plan = planDslrTemplate(p, 'strip')
    const t = buildDslrTemplate(p, plan, {
      name: 'Sam & Alex',
      now: new Date(2026, 10, 16, 14, 5, 9)
    })
    expect(t.root).toMatchObject({
      name: 'Sam & Alex',
      width: 600,
      height: 1800,
      dimensions: 0,
      resolution: 300,
      backgroundColor: '#FFF8F3EA',
      print2PerPage: true,
      lastSavedDate: '11/16/2026 14:05:09',
      originalDevice: 'WalkOneTemplateStudio'
    })
    expect(t.root.id).toMatch(/^[A-Za-z0-9]{25}$/)
    expect(t.elements.map((e) => `${e.type}:${e.name}:${e.zIndex}`)).toEqual([
      'Image:Background:0',
      'Photo:Photo 1:1',
      'Image:Artwork:2'
    ])
    expect(t.elements[1]).toMatchObject({
      rotation: -3,
      left: 30,
      top: 40,
      width: 540,
      height: 360
    })
    expect(t.elements[0]).toMatchObject({
      left: 0,
      top: 0,
      width: 600,
      height: 1800,
      imagePath: 'background.png'
    })
  })

  it('produces a package the container verifier accepts', () => {
    const p = strip([shape('bg', 0), slot('p1', 1, 40), text('t', 2)])
    const plan = planDslrTemplate(p, 'strip')
    const t = buildDslrTemplate(p, plan, { name: 'X', now: new Date(2026, 0, 1) })
    const xml = encodeTemplateXml(writeTemplateXml(t))
    const entries = [
      { path: 'template.xml', data: xml },
      { path: 'preview.png', data: new Uint8Array([1]) },
      ...t.elements.flatMap((e) =>
        e.type === 'Image' ? [{ path: e.imagePath, data: new Uint8Array([1]) }] : []
      )
    ]
    expect(verifyDslrPackage(entries).elements).toHaveLength(3)
    expect(parseTemplateXml(xml).root.print_2_per_page).toBe('True')
  })
})

describe('runDslrPreflight', () => {
  const codes = (p: TemplateProject): string[] =>
    runDslrPreflight(p).items.map((i) => `${i.severity}:${i.code}`)

  it('blocks a template without photo slots (ADR-045)', () => {
    const r = runDslrPreflight(strip([shape('bg', 0)]))
    expect(r.canExport).toBe(false)
    expect(r.items.map((i) => i.code)).toContain('dslr-no-photo-slots')
  })

  it('blocks photo numbers above 12, allows repeats', () => {
    expect(codes(strip([slot('a', 13, 40)]))).toContain('error:dslr-photo-number-range')
    expect(runDslrPreflight(strip([slot('a', 1, 40), slot('b', 1, 420)])).canExport).toBe(true)
  })

  it('warns about fit, opacity; notes rotation, flattening and the native strip', () => {
    const c = codes(strip([slot('a', 1, 40, { fit: 'contain', opacity: 0.5, rotation: 2.5 })]))
    expect(c).toEqual([
      'warning:dslr-photo-fit',
      'warning:dslr-photo-opacity',
      'info:dslr-photo-rotation',
      'info:dslr-flattened',
      'info:dslr-two-up'
    ])
  })

  it('warns about an untested resolution', () => {
    const p = makeProject([slot('a', 1, 40)])
    const odd = { ...p, canvas: { ...p.canvas, print: { ...p.canvas.print, dpi: 450 } } }
    expect(codes(odd)).toContain('warning:dslr-resolution')
  })
})
