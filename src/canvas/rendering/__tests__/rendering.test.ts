import { describe, expect, it, vi } from 'vitest'
import { getPixelSize } from '@domain'
import type { Layer } from '@domain'
import { group, makeProject, photo, scene, shape, text } from '../../../editor/__tests__/helpers'
import { drawFittedImage, drawPhotoPlaceholder, fitRect } from '../draw'
import { resolveColor, MISSING_COLOR } from '../color'
import { fontStyleOf, specFor, type RenderEnv } from '../nodeSpec'
import { missingAssetIds, planRender } from '../plan'
import { ImageCache, imageKey } from '../../assets/imageCache'

const env = (layers: readonly Layer[], over: Partial<RenderEnv> = {}): RenderEnv => ({
  palette: { colors: [] },
  images: () => undefined,
  photoMode: 'placeholder',
  interactive: true,
  photoLabels: true,
  allLayers: layers,
  ...over
})

describe('fitRect', () => {
  const src = { width: 1600, height: 900 }
  it('cover fills the box and crops the long side, centered', () => {
    const r = fitRect(src, { width: 1900, height: 880 }, 'cover')
    expect(r.sw / r.sh).toBeCloseTo(1900 / 880, 9)
    expect(r.sx).toBeCloseTo(0, 9)
    expect(r.sy * 2 + r.sh).toBeCloseTo(900, 9)
    expect([r.dx, r.dy, r.dw, r.dh]).toEqual([0, 0, 1900, 880])
  })
  it('contain letterboxes the whole image', () => {
    const r = fitRect(src, { width: 1000, height: 1000 }, 'contain')
    expect([r.sx, r.sy, r.sw, r.sh]).toEqual([0, 0, 1600, 900])
    expect(r.dw).toBe(1000)
    expect(r.dy).toBeCloseTo((1000 - 562.5) / 2, 9)
  })
  it('stretch ignores aspect', () => {
    const r = fitRect(src, { width: 300, height: 700 }, 'stretch')
    expect([r.dw, r.dh]).toEqual([300, 700])
  })
})

const fakeCtx = () => {
  const calls: string[] = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_t, prop: string) => {
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => undefined })
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.map((a) => (typeof a === 'string' ? a : typeof a)).join(',')})`)
      }
    },
    set: (_t, prop: string, value: unknown) => {
      calls.push(`${prop}=${String(value)}`)
      return true
    }
  }
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls }
}

describe('drawPhotoPlaceholder', () => {
  const spec = {
    width: 1900,
    height: 800,
    photoNumber: 2,
    frameThickness: 12,
    frameColor: '#ffffff',
    cornerRadius: 0,
    fit: 'cover' as const,
    label: true
  }
  it('draws the number and optional label in placeholder mode', () => {
    const { ctx, calls } = fakeCtx()
    drawPhotoPlaceholder(ctx, spec)
    expect(calls).toContain('fillText(2,number,number)')
    expect(calls.some((c) => c.startsWith('fillText(PHOTO 2'))).toBe(true)
  })
  it('omits the label when labels are off', () => {
    const { ctx, calls } = fakeCtx()
    drawPhotoPlaceholder(ctx, { ...spec, label: false })
    expect(calls.some((c) => c.startsWith('fillText(PHOTO'))).toBe(false)
  })
  it('preview mode draws the picture instead of the placeholder number', () => {
    const { ctx, calls } = fakeCtx()
    drawPhotoPlaceholder(ctx, {
      ...spec,
      preview: { source: {} as CanvasImageSource, width: 100, height: 100 }
    })
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(true)
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(false)
  })
  it('draws a frame only when thickness > 0', () => {
    const a = fakeCtx()
    drawPhotoPlaceholder(a.ctx, { ...spec, frameThickness: 0 })
    expect(a.calls).not.toContain('stroke()')
    const b = fakeCtx()
    drawPhotoPlaceholder(b.ctx, spec)
    expect(b.calls).toContain('stroke()')
  })
})

describe('drawFittedImage', () => {
  it('marks a missing image visibly instead of drawing nothing', () => {
    const { ctx, calls } = fakeCtx()
    drawFittedImage(ctx, undefined, 100, 100, 'cover')
    expect(calls.some((c) => c.startsWith('strokeRect'))).toBe(true)
    expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false)
  })
})

describe('colors', () => {
  it('resolves literal and palette colors, and flags a dangling palette reference', () => {
    const palette = {
      colors: [{ id: 'c1', role: 'accent' as const, name: 'Gold', value: '#b08d57' }]
    }
    expect(resolveColor(palette, { kind: 'literal', value: '#112233' })).toBe('#112233')
    expect(resolveColor(palette, { kind: 'palette', paletteColorId: 'c1' })).toBe('#b08d57')
    expect(resolveColor(palette, { kind: 'palette', paletteColorId: 'nope' })).toBe(MISSING_COLOR)
  })
})

describe('specFor (shared by editor and offscreen render)', () => {
  const layers = scene().layers
  const find = (id: string): Layer => layers.find((l) => l.id === id) as Layer

  it('uses a box-center origin so rotation matches the domain', () => {
    const p = find('photo-1')
    const s = specFor({ ...p, rotation: 3 } as Layer, env(layers))
    expect(s?.config).toMatchObject({
      x: p.x + p.width / 2,
      y: p.y + p.height / 2,
      offsetX: p.width / 2,
      offsetY: p.height / 2,
      rotation: 3
    })
  })

  it('renders a photo as one Shape with identity preserved (id, not photoNumber)', () => {
    const s = specFor(find('photo-2'), env(layers))
    expect(s?.className).toBe('Shape')
    expect(s?.config.id).toBe('photo-2')
  })

  it('does not draw hidden layers', () => {
    expect(specFor({ ...find('photo-1'), visible: false } as Layer, env(layers))).toBeNull()
  })

  it('locked layers render but neither listen nor drag', () => {
    const locked = { ...find('photo-1'), locked: true } as Layer
    const s = specFor(locked, env([locked]))
    expect(s?.config).toMatchObject({ listening: false, draggable: false })
  })

  it('children of a group are not independently draggable', () => {
    const s = specFor(find('g-a'), env(layers), true)
    expect(s?.config.draggable).toBe(false)
    expect(specFor(find('g'), env(layers))?.config.draggable).toBe(true)
  })

  it('offscreen nodes are inert', () => {
    const s = specFor(find('photo-1'), env(layers, { interactive: false }))
    expect(s?.config).toMatchObject({ listening: false, draggable: false })
  })

  it('text maps all supported properties and hides while being edited', () => {
    const t = find('title')
    const s = specFor(t, env(layers))
    expect(s?.className).toBe('Text')
    expect(s?.config).toMatchObject({
      text: 'Hello',
      // requested family first, then the predictable fallback stack (the project keeps just 'Georgia')
      fontFamily: 'Georgia, Helvetica, Arial, sans-serif',
      fontSize: 150,
      align: 'center',
      lineHeight: 1.1,
      letterSpacing: 0,
      fill: '#222222',
      width: 2000,
      fontStyle: '700',
      visible: true
    })
    expect(specFor(t, env(layers, { editingTextId: 'title' }))?.config.visible).toBe(false)
    expect(fontStyleOf({ fontStyle: 'italic', fontWeight: 400 })).toBe('italic 400')
  })

  it('shapes: rectangle, ellipse and line', () => {
    const r = specFor(find('bg-bar'), env(layers))
    expect(r?.className).toBe('Rect')
    const e = specFor({ ...find('bg-bar'), shape: 'ellipse' } as Layer, env(layers))
    expect(e?.className).toBe('Ellipse')
    expect(e?.config).toMatchObject({ radiusX: 150, radiusY: 100, offsetX: 0 })
    const l = specFor({ ...find('bg-bar'), shape: 'line', height: 0 } as Layer, env(layers))
    expect(l?.className).toBe('Line')
    expect(l?.config.points).toEqual([0, 0, 300, 0])
  })

  it('image layers are one Shape regardless of semantic role', () => {
    for (const role of ['background', 'overlay', 'frame', 'badge', 'logo', 'graphic'] as const) {
      const img = {
        ...shape('i', 0),
        type: 'image',
        assetId: 'a',
        role,
        fit: 'cover'
      } as unknown as Layer
      expect(specFor(img, env([img]))?.className).toBe('Shape')
    }
  })

  it('photo preview mode asks for the sample image only for layers that have one', () => {
    const lookup = vi.fn(() => undefined)
    specFor(
      { ...find('photo-1'), sampleAssetId: 'sample' } as Layer,
      env(layers, { photoMode: 'preview', images: lookup })
    )
    expect(lookup).toHaveBeenCalledWith('sample')
    lookup.mockClear()
    specFor(find('photo-1'), env(layers, { photoMode: 'preview', images: lookup }))
    expect(lookup).not.toHaveBeenCalled()
    specFor(
      { ...find('photo-1'), sampleAssetId: 'sample' } as Layer,
      env(layers, { photoMode: 'placeholder', images: lookup })
    )
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('planRender (exact output independent of viewport)', () => {
  it('defaults to the exact logical design size: 4x6 @600 = 2400x3600', () => {
    const p = planRender(scene())
    expect(getPixelSize(scene().canvas.print)).toEqual({ width: 2400, height: 3600 })
    expect([p.width, p.height]).toEqual([2400, 3600])
    expect([p.scaleX, p.scaleY]).toEqual([1, 1])
  })

  it('supports other exact sizes and rejects non-integers', () => {
    const p = planRender(scene(), { width: 1200, height: 1800 })
    expect([p.width, p.height, p.scaleX]).toEqual([1200, 1800, 0.5])
    expect(() => planRender(scene(), { width: 100.5, height: 10 })).toThrow(RangeError)
  })

  it('a 2x6 @600 design renders at 1200x3600', () => {
    const p = planRender(makeProject([], 'strip-2x6-600'))
    expect([p.width, p.height]).toEqual([1200, 3600])
  })

  it('contains only visible printable layers in paint order, groups depth-first', () => {
    const base = scene()
    const project = {
      ...base,
      layers: base.layers.map((l) => (l.id === 'photo-2' ? ({ ...l, visible: false } as Layer) : l))
    }
    const ids = planRender(project).layers.map((l) => l.id)
    expect(ids).toEqual(['bg-bar', 'photo-1', 'photo-3', 'title', 'g', 'g-a', 'g-b'])
  })

  it('omits photo placeholders on request and hides children of hidden groups', () => {
    const base = scene()
    expect(planRender(base, { photos: 'omit' }).layers.some((l) => l.type === 'photo')).toBe(false)
    const hiddenGroup = {
      ...base,
      layers: base.layers.map((l) => (l.id === 'g' ? ({ ...l, visible: false } as Layer) : l))
    }
    expect(planRender(hiddenGroup).layers.some((l) => l.id === 'g-a')).toBe(false)
  })

  it('has no editor-only content: the plan is only project layers', () => {
    const ids = new Set(scene().layers.map((l) => l.id))
    expect(planRender(scene()).layers.every((l) => ids.has(l.id))).toBe(true)
  })

  it('does not depend on text/photo identity helpers (smoke)', () => {
    expect(planRender(makeProject([text('t', 0), photo('p', 1)])).layers).toHaveLength(2)
    expect(group('g', 0).type).toBe('group')
  })
})

describe('missingAssetIds', () => {
  it('lists unresolved image assets (and optionally photo samples)', () => {
    const img = {
      ...shape('i', 0),
      type: 'image',
      assetId: 'a1',
      role: 'graphic',
      fit: 'cover'
    } as unknown as Layer
    const p = { ...photo('p', 1), sampleAssetId: 's1' } as Layer
    expect(missingAssetIds([img, p], () => undefined)).toEqual(['a1'])
    expect(missingAssetIds([img, p], () => undefined, true).sort()).toEqual(['a1', 's1'])
    expect(
      missingAssetIds(
        [img, p],
        () => ({ source: {} as CanvasImageSource, width: 1, height: 1 }),
        true
      )
    ).toEqual([])
  })
})

describe('ImageCache', () => {
  const fake = (): {
    image: { source: CanvasImageSource; width: number; height: number; dispose: () => void }
  } => ({
    image: { source: {} as CanvasImageSource, width: 10, height: 10, dispose: vi.fn() }
  })

  it('de-duplicates loads, notifies subscribers, and serves ready images', async () => {
    const loader = vi.fn(async () => fake().image)
    const cache = new ImageCache(loader)
    const listener = vi.fn()
    cache.subscribe(listener)
    const key = imageKey('s', 'a')
    expect(cache.get(key)).toBeUndefined()
    expect(cache.get(key)).toBeUndefined() // still loading: no second load
    await cache.ensure([key])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.get(key)?.width).toBe(10)
    expect(listener).toHaveBeenCalled()
    expect(cache.status(key)).toBe('ready')
  })

  it('records failures without throwing and never retries silently', async () => {
    const loader = vi.fn(async () => {
      throw new Error('boom')
    })
    const cache = new ImageCache(loader)
    await cache.ensure(['k'])
    expect(cache.status('k')).toBe('error')
    expect(cache.errorOf('k')).toBe('boom')
    cache.get('k')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('clear(prefix) disposes only matching entries', async () => {
    const a = fake().image
    const b = fake().image
    const cache = new ImageCache(async (k) => (k.startsWith('one:') ? a : b))
    await cache.ensure(['one:x', 'two:y'])
    cache.clear('one:')
    expect(a.dispose).toHaveBeenCalled()
    expect(b.dispose).not.toHaveBeenCalled()
    expect(cache.status('one:x')).toBe('unknown')
    expect(cache.status('two:y')).toBe('ready')
  })

  it('drops a result that finishes after its key was cleared', async () => {
    let resolve: (v: ReturnType<typeof fake>['image']) => void = () => undefined
    const img = fake().image
    const cache = new ImageCache(() => new Promise((r) => (resolve = r)))
    const p = cache.ensure(['k'])
    cache.clear()
    resolve(img)
    await p
    expect(img.dispose).toHaveBeenCalled()
    expect(cache.status('k')).toBe('unknown')
  })
})
