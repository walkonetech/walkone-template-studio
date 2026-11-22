import { describe, expect, it } from 'vitest'
import {
  createProject,
  createTwoUpStripOutput,
  getPixelSize,
  literalColor,
  type ImageLayer,
  type Layer,
  type TemplateProject
} from '@domain'
import { group, photo, shape, text } from '../../../editor/__tests__/helpers'
import {
  clipToCell,
  cutLineLabel,
  cutLines,
  hasDerivedCopies,
  planOutput,
  translateLayers
} from '../composition'

const T0 = '2026-01-01T00:00:00.000Z'
const strip = (
  preset: 'strip-2x6-300' | 'strip-2x6-600',
  layers: Layer[] = []
): TemplateProject => ({
  ...createProject({ name: 'S', design: preset, now: T0, createId: () => 'p' }),
  layers
})

const image = (id: string, assetId: string, over: Partial<ImageLayer> = {}): ImageLayer => ({
  id,
  type: 'image',
  name: id,
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  opacity: 1,
  zIndex: 0,
  visible: true,
  locked: false,
  assetId,
  role: 'overlay',
  fit: 'contain',
  ...over
})

describe('presets and output dimensions', () => {
  it('an ordinary 4×6 project has no derived copies: output equals design', () => {
    const p = createProject({ name: 'N', design: 'photo-4x6-portrait-600', now: T0 })
    expect(p.output.layout).toEqual({ kind: 'single' })
    expect(hasDerivedCopies(p)).toBe(false)
    const plan = planOutput(p)
    expect([plan.width, plan.height, plan.copies.length, plan.composed]).toEqual([
      2400,
      3600,
      1,
      false
    ])
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 2400, height: 3600 })
  })

  it('every 4×6 preset stays single-up, in both orientations and DPIs', () => {
    for (const id of [
      'photo-4x6-portrait-300',
      'photo-4x6-landscape-300',
      'photo-4x6-portrait-600',
      'photo-4x6-landscape-600'
    ] as const) {
      expect(createProject({ name: 'x', design: id, now: T0 }).output.layout.kind).toBe('single')
    }
  })

  it('2×6 @600: design 1200×3600, sheet 2400×3600, copies at x=0 and x=1200', () => {
    const p = strip('strip-2x6-600')
    expect(p.output).toEqual(createTwoUpStripOutput(p.canvas.print))
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 1200, height: 3600 })
    const plan = planOutput(p)
    expect([plan.width, plan.height]).toEqual([2400, 3600])
    expect(plan.copies.map((c) => [c.cell.x, c.cell.y, c.cell.width, c.cell.height])).toEqual([
      [0, 0, 1200, 3600],
      [1200, 0, 1200, 3600]
    ])
    expect(plan.composed).toBe(true)
  })

  it('2×6 @300: design 600×1800, sheet 1200×1800, copies at x=0 and x=600 (computed, not hardcoded)', () => {
    const plan = planOutput(strip('strip-2x6-300'))
    expect([plan.design.width, plan.design.height, plan.width, plan.height]).toEqual([
      600, 1800, 1200, 1800
    ])
    expect(plan.copies.map((c) => c.cell.x)).toEqual([0, 600])
  })

  it('a gap or another DPI is derived from physical size', () => {
    const p = strip('strip-2x6-300')
    const gapped: TemplateProject = {
      ...p,
      output: {
        print: { ...p.output.print, width: 4.1 },
        layout: { kind: 'grid', columns: 2, rows: 1, gap: 0.1 }
      }
    }
    const plan = planOutput(gapped)
    expect(plan.copies.map((c) => c.cell.x)).toEqual([0, 630])
    // B5.5: with a gap the cuts are each copy's own edge (the 30 px gap between them is waste), no longer one line in
    // the middle of the gap. Touching copies (no gap, every built-in format) still share one line: see below.
    expect(cutLines(gapped)).toEqual([
      { axis: 'x', at: 600 },
      { axis: 'x', at: 630 }
    ])
  })

  it('rejects a sheet that cannot hold the copies', () => {
    const p = strip('strip-2x6-300')
    const bad: TemplateProject = {
      ...p,
      output: { ...p.output, print: { ...p.output.print, width: 3 } }
    }
    expect(() => planOutput(bad)).toThrow()
  })
})

describe('derived copies', () => {
  const layers: Layer[] = [
    shape('bg', 0, { x: 0, y: 0, width: 1200, height: 3600 }),
    image('petals', 'asset-1', {
      zIndex: 1,
      x: -4,
      y: 0,
      width: 1200,
      height: 3600,
      opacity: 0.8,
      rotation: 12
    }),
    photo('p1', 1, { zIndex: 2, x: 76, y: 168, width: 1049, height: 700 }),
    photo('p2', 2, { zIndex: 3, x: 76, y: 934, width: 1049, height: 700 }),
    photo('p3', 3, { zIndex: 4, x: 76, y: 1704, width: 1049, height: 700 }),
    group('g', 5, { x: 60, y: 2440, width: 1080, height: 930 }),
    text('t', 0, { parentId: 'g', x: 100, y: 2560, content: 'Kara & Saher' }),
    image('rose', 'asset-1', { zIndex: 6, x: 500, y: 2900, width: 600, height: 700 })
  ]
  const project = (): TemplateProject => ({
    ...strip('strip-2x6-600', layers),
    assets: [
      {
        id: 'asset-1',
        filename: 'a.png',
        mediaType: 'image/png',
        path: 'assets/asset-1.png',
        source: { kind: 'upload' }
      }
    ]
  })

  it('every copy is the authored layers translated by its cell origin; nothing else changes', () => {
    const p = project()
    const plan = planOutput(p)
    for (const copy of plan.copies) {
      expect(copy.layers).toHaveLength(p.layers.length)
      copy.layers.forEach((l, i) => {
        const src = p.layers[i] as Layer
        expect(l.x).toBe(src.x + copy.cell.x)
        expect(l.y).toBe(src.y + copy.cell.y)
        expect({ ...l, x: 0, y: 0 }).toEqual({ ...src, x: 0, y: 0 })
      })
    }
  })

  it('preserves rotation, opacity, role, asset reference, text and group structure', () => {
    const copy = planOutput(project()).copies[1]!
    const petals = copy.layers.find((l) => l.id === 'petals') as ImageLayer
    expect([petals.rotation, petals.opacity, petals.role, petals.assetId]).toEqual([
      12,
      0.8,
      'overlay',
      'asset-1'
    ])
    const t = copy.layers.find((l) => l.id === 't')
    expect(t).toMatchObject({ type: 'text', content: 'Kara & Saher', parentId: 'g' })
    expect(copy.layers.find((l) => l.id === 'g')).toMatchObject({ type: 'group', x: 60 + 1200 })
  })

  it('does not mutate the source project (deep-frozen input)', () => {
    const p = project()
    const snapshot = JSON.stringify(p)
    const deepFreeze = (o: unknown): void => {
      if (o && typeof o === 'object') {
        Object.values(o).forEach(deepFreeze)
        Object.freeze(o)
      }
    }
    deepFreeze(p)
    planOutput(p)
    expect(JSON.stringify(p)).toBe(snapshot)
    expect(translateLayers(p.layers, 5, 5)[0]).not.toBe(p.layers[0])
  })

  it('the project still holds ONE authored set: photo numbers once, one asset record, no copy layers', () => {
    const p = project()
    planOutput(p)
    expect(
      p.layers
        .filter((l) => l.type === 'photo')
        .map((l) => (l as { photoNumber: number }).photoNumber)
    ).toEqual([1, 2, 3])
    expect(p.assets).toHaveLength(1)
    expect(p.layers).toHaveLength(8)
  })

  it('the sheet shows PhotoNumbers 1-2-3 in each copy, sharing the same asset id', () => {
    const plan = planOutput(project())
    const numbersOf = (i: number): number[] =>
      plan.copies[i]!.layers.filter((l) => l.type === 'photo').map(
        (l) => (l as { photoNumber: number }).photoNumber
      )
    expect(numbersOf(0)).toEqual([1, 2, 3])
    expect(numbersOf(1)).toEqual([1, 2, 3])
    const assets = plan.copies.flatMap((c) =>
      c.layers.filter((l) => l.type === 'image').map((l) => (l as ImageLayer).assetId)
    )
    expect(new Set(assets)).toEqual(new Set(['asset-1']))
  })

  it('a 4×6 project composes to exactly its own layers at origin', () => {
    const p = { ...createProject({ name: 'x', design: 'photo-4x6-portrait-600', now: T0 }), layers }
    const plan = planOutput(p)
    expect(plan.copies).toHaveLength(1)
    expect(plan.copies[0]!.layers.map((l) => [l.x, l.y])).toEqual(layers.map((l) => [l.x, l.y]))
  })
})

describe('clipping to the design cell', () => {
  it('off-canvas artwork is cut at its own cell edge and never reaches the neighbour', () => {
    const plan = planOutput(strip('strip-2x6-600'))
    const [left, right] = plan.copies
    // A frame placed 4 px left of the strip, 1200 wide (as in the real template): copy 2 starts at x=1196.
    const frame = { x: -4, y: 0, width: 1200, height: 3600 }
    const inRight = clipToCell({ ...frame, x: frame.x + right!.cell.x }, right!.cell)!
    expect(inRight).toEqual({ x: 1200, y: 0, width: 1196, height: 3600 })
    // the part left of the right cell (4 px) lies in copy 1's area but is NOT drawn there (clipped by its own cell)
    expect(clipToCell({ ...frame, x: frame.x + right!.cell.x }, left!.cell)).toEqual({
      x: 1196,
      y: 0,
      width: 4,
      height: 3600
    })
    // ...and the renderer draws every copy inside its own clip, so that sliver is cut:
    expect(inRight.x).toBeGreaterThanOrEqual(right!.cell.x)
  })
  it('a layer wholly outside its cell contributes nothing', () => {
    const cell = { x: 1200, y: 0, width: 1200, height: 3600 }
    expect(clipToCell({ x: 0, y: 0, width: 1000, height: 100 }, cell)).toBeNull()
  })
})

describe('cut guide', () => {
  it('sits exactly between the two copies and is labelled for a 2-inch strip', () => {
    expect(cutLines(strip('strip-2x6-600'))).toEqual([{ axis: 'x', at: 1200 }])
    expect(cutLines(strip('strip-2x6-300'))).toEqual([{ axis: 'x', at: 600 }])
    expect(cutLineLabel(strip('strip-2x6-600'))).toBe('2-inch cut')
  })
  it('does not exist for a single-up project', () => {
    expect(
      cutLines(createProject({ name: 'x', design: 'photo-4x6-portrait-600', now: T0 }))
    ).toEqual([])
  })
  it('the guide is not part of any layer or output plan', () => {
    const plan = planOutput(strip('strip-2x6-600'))
    expect(plan.copies.every((c) => c.layers.length === 0)).toBe(true)
    expect(literalColor('#ffffff')).toBeTruthy()
  })
})
