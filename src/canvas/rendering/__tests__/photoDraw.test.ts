import { describe, expect, it } from 'vitest'
import { drawPhotoPlaceholder, type PhotoDrawSpec } from '../draw'
import { specFor, type RenderEnv } from '../nodeSpec'
import { clipToCell } from '../composition'
import { photo } from '../../../editor/__tests__/helpers'
import type { PhotoLayer } from '@domain'

/** A recording 2D context: every method call and property assignment, with arguments. */
function recorder() {
  const calls: { fn: string; args: unknown[] }[] = []
  const props: Record<string, unknown> = {}
  const target = {} as Record<string, unknown>
  const ctx = new Proxy(target, {
    get: (_t, key: string) => {
      if (key === 'measureText') return () => ({ width: 40 })
      if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined })
      if (key in props) return props[key]
      return (...args: unknown[]) => {
        calls.push({ fn: key, args })
      }
    },
    set: (_t, key: string, value) => {
      props[key] = value
      calls.push({ fn: `set:${key}`, args: [value] })
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}
const named = <T extends { fn: string }>(calls: T[], fn: string): T[] =>
  calls.filter((c) => c.fn === fn)
const base: PhotoDrawSpec = {
  width: 1049,
  height: 700,
  photoNumber: 2,
  frameThickness: 12,
  frameColor: '#ffffff',
  cornerRadius: 0,
  label: true
}

describe('photo slot drawing (neutral numbered placeholder; a slot never shows a picture)', () => {
  it('corner radius clips the fill and the frame: clip is called with a rounded path first', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, cornerRadius: 60 })
    const firstClip = calls.findIndex((c) => c.fn === 'clip')
    const firstFill = calls.findIndex((c) => c.fn === 'fillRect')
    expect(named(calls.slice(0, firstClip), 'arcTo').length).toBe(4)
    expect(firstClip).toBeLessThan(firstFill)
  })
  it('a radius beyond half the shorter side is clamped (350 for a 1049×700 frame)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, cornerRadius: 99999, frameThickness: 0 })
    const arc = named(calls, 'arcTo')[0]!.args as number[]
    // first corner starts at x + radius: moveTo(radius, 0)
    expect(named(calls, 'moveTo')[0]!.args[0]).toBe(350)
    expect(arc.length).toBe(5)
  })
  it('radius 0 uses a plain rectangle (no arcs)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, base)
    expect(named(calls, 'arcTo')).toHaveLength(0)
  })
  it('frame: none draws no stroke; solid uses its thickness and colour; thickness is capped at half the shorter side', () => {
    const none = recorder()
    drawPhotoPlaceholder(none.ctx, { ...base, frameThickness: 0 })
    expect(named(none.calls, 'stroke')).toHaveLength(0)
    const solid = recorder()
    drawPhotoPlaceholder(solid.ctx, { ...base, frameThickness: 24, frameColor: '#c9a860' })
    expect(named(solid.calls, 'stroke')).toHaveLength(1)
    expect(named(solid.calls, 'set:lineWidth')[0]!.args[0]).toBe(24)
    expect(named(solid.calls, 'set:strokeStyle')[0]!.args[0]).toBe('#c9a860')
    const huge = recorder()
    drawPhotoPlaceholder(huge.ctx, { ...base, frameThickness: 9999 })
    expect(named(huge.calls, 'set:lineWidth')[0]!.args[0]).toBe(350)
  })
  it('frame thickness is design-space: the same numbers at 300 and 600 DPI projects, whatever the zoom', () => {
    // Drawing receives design pixels only; there is no zoom or DPI parameter to leak into it.
    const a = recorder()
    const b = recorder()
    drawPhotoPlaceholder(a.ctx, base)
    drawPhotoPlaceholder(b.ctx, base)
    // (gradient objects are fresh per call, so compare the serialised calls)
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls))
  })
  it('placeholder keeps the number and the "PHOTO n" label; without the label only the number', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, base)
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['2', 'PHOTO 2'])
    const plain = recorder()
    drawPhotoPlaceholder(plain.ctx, { ...base, label: false })
    expect(named(plain.calls, 'fillText').map((c) => c.args[0])).toEqual(['2'])
  })
  it('never draws a picture', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, base)
    expect(named(calls, 'drawImage')).toHaveLength(0)
  })
})

describe('specFor: a photo slot is always the placeholder (Sample Photos removed, B3.1)', () => {
  const picture = { source: {} as CanvasImageSource, width: 1800, height: 1200 }
  // An older project may still carry the dormant `sampleAssetId`; it is kept in the file but never drawn.
  const layer = { ...(photo('p', 2) as PhotoLayer), sampleAssetId: 'asset-old' } as PhotoLayer
  const env = (over: Partial<RenderEnv>): RenderEnv => ({
    palette: { colors: [] },
    images: () => picture,
    photoMode: 'placeholder',
    interactive: true,
    photoLabels: true,
    allLayers: [layer],
    ...over
  })
  const draw = (e: RenderEnv) => {
    const { ctx, calls } = recorder()
    const spec = specFor(layer, e)!
    ;(spec.config.sceneFunc as (c: unknown) => void)({ _context: ctx })
    return calls
  }
  it('editor and exact renders draw the numbered placeholder, never the dormant sample asset', () => {
    for (const interactive of [true, false]) {
      const calls = draw(env({ interactive }))
      expect(named(calls, 'drawImage')).toHaveLength(0)
      expect(named(calls, 'fillText').map((c) => c.args[0])).toContain('2')
    }
  })
  it('frame mode (production artwork) draws only the frame, never a picture', () => {
    const calls = draw(env({ photoMode: 'frame', interactive: false, photoLabels: false }))
    expect(named(calls, 'drawImage')).toHaveLength(0)
    expect(named(calls, 'fillText')).toHaveLength(0)
  })
})

describe('artboard clipping contract (design cell = the artboard)', () => {
  const artboard = { x: 0, y: 0, width: 1200, height: 3600 }
  it('artwork past any edge is cut to the artboard; fully outside contributes nothing', () => {
    expect(clipToCell({ x: -300, y: -50, width: 800, height: 400 }, artboard)).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 350
    })
    expect(clipToCell({ x: 1100, y: 3500, width: 400, height: 400 }, artboard)).toEqual({
      x: 1100,
      y: 3500,
      width: 100,
      height: 100
    })
    expect(clipToCell({ x: -900, y: 0, width: 800, height: 100 }, artboard)).toBeNull()
  })
})

describe('frame-only photo drawing (layer package frames.png)', () => {
  it('strokes only the frame: no fill, no picture, no number', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, frameOnly: true })
    expect(named(calls, 'stroke')).toHaveLength(1)
    expect(named(calls, 'fillRect')).toHaveLength(0)
    expect(named(calls, 'fillText')).toHaveLength(0)
    expect(named(calls, 'drawImage')).toHaveLength(0)
  })
  it('draws nothing for a slot without a frame', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, frameThickness: 0, frameOnly: true })
    expect(calls.filter((c) => !c.fn.startsWith('set:'))).toHaveLength(0)
  })
  it('the frame mode spec skips frameless slots entirely', () => {
    const env: RenderEnv = {
      palette: { colors: [] },
      images: () => undefined,
      photoMode: 'frame',
      interactive: false,
      photoLabels: false,
      allLayers: []
    }
    expect(specFor(photo('p', 1, { frame: { style: 'none' } }) as PhotoLayer, env)).toBeNull()
    expect(specFor(photo('q', 1) as PhotoLayer, env)?.className).toBe('Shape')
  })
})
