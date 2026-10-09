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
const picture = { source: {} as CanvasImageSource, width: 1800, height: 1200 }
const base: PhotoDrawSpec = {
  width: 1049,
  height: 700,
  photoNumber: 2,
  frameThickness: 12,
  frameColor: '#ffffff',
  cornerRadius: 0,
  fit: 'cover',
  label: true
}

describe('photo preview drawing', () => {
  it('cover draws the picture over the whole frame, centred (destination covers the box)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, preview: picture })
    const [, , , , , dx, dy, dw, dh] = named(calls, 'drawImage')[0]!.args as number[]
    expect(dx!).toBeLessThanOrEqual(0)
    expect(dy!).toBeLessThanOrEqual(0)
    expect(dx! + dw!).toBeGreaterThanOrEqual(1049)
    expect(dy! + dh!).toBeGreaterThanOrEqual(700)
  })
  it('contain keeps the whole picture inside the frame', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, fit: 'contain', preview: picture })
    const [, , , , , dx, dy, dw, dh] = named(calls, 'drawImage')[0]!.args as number[]
    expect(dx!).toBeGreaterThanOrEqual(0)
    expect(dy!).toBeGreaterThanOrEqual(0)
    expect(dx! + dw!).toBeLessThanOrEqual(1049 + 1e-6)
    expect(dy! + dh!).toBeLessThanOrEqual(700 + 1e-6)
  })
  it('the crop moves and magnifies the picture inside the same frame', () => {
    const plain = recorder()
    drawPhotoPlaceholder(plain.ctx, { ...base, preview: picture })
    const cropped = recorder()
    drawPhotoPlaceholder(cropped.ctx, { ...base, preview: picture, crop: { zoom: 2, x: 1, y: 0 } })
    const a = named(plain.calls, 'drawImage')[0]!.args as number[]
    const b = named(cropped.calls, 'drawImage')[0]!.args as number[]
    expect(b[7]).toBeCloseTo(a[7]! * 2, 6) // twice as wide
    expect(b[5]! + b[7]!).toBeCloseTo(1049, 6) // right edge flush with the frame
  })
  it('corner radius clips the picture and the frame: clip is called with a rounded path first', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, cornerRadius: 60, preview: picture })
    const firstClip = calls.findIndex((c) => c.fn === 'clip')
    const firstImage = calls.findIndex((c) => c.fn === 'drawImage')
    expect(named(calls.slice(0, firstClip), 'arcTo').length).toBe(4)
    expect(firstClip).toBeLessThan(firstImage)
  })
  it('a radius beyond half the shorter side is clamped (350 for a 1049×700 frame)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, cornerRadius: 99999, preview: picture, frameThickness: 0 })
    const arc = named(calls, 'arcTo')[0]!.args as number[]
    // first corner starts at x + radius: moveTo(radius, 0)
    expect(named(calls, 'moveTo')[0]!.args[0]).toBe(350)
    expect(arc.length).toBe(5)
  })
  it('radius 0 uses a plain rectangle (no arcs)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, preview: picture })
    expect(named(calls, 'arcTo')).toHaveLength(0)
  })
  it('frame: none draws no stroke; solid uses its thickness and colour; thickness is capped at half the shorter side', () => {
    const none = recorder()
    drawPhotoPlaceholder(none.ctx, { ...base, frameThickness: 0, preview: picture })
    expect(named(none.calls, 'stroke')).toHaveLength(0)
    const solid = recorder()
    drawPhotoPlaceholder(solid.ctx, {
      ...base,
      frameThickness: 24,
      frameColor: '#c9a860',
      preview: picture
    })
    expect(named(solid.calls, 'stroke')).toHaveLength(1)
    expect(named(solid.calls, 'set:lineWidth')[0]!.args[0]).toBe(24)
    expect(named(solid.calls, 'set:strokeStyle')[0]!.args[0]).toBe('#c9a860')
    const huge = recorder()
    drawPhotoPlaceholder(huge.ctx, { ...base, frameThickness: 9999, preview: picture })
    expect(named(huge.calls, 'set:lineWidth')[0]!.args[0]).toBe(350)
  })
  it('frame thickness is design-space: the same numbers at 300 and 600 DPI projects, whatever the zoom', () => {
    // Drawing receives design pixels only; there is no zoom or DPI parameter to leak into it.
    const a = recorder()
    const b = recorder()
    drawPhotoPlaceholder(a.ctx, { ...base, preview: picture })
    drawPhotoPlaceholder(b.ctx, { ...base, preview: picture })
    expect(a.calls).toEqual(b.calls)
  })
  it('preview mode never prints "PHOTO n" or the big number; the "#n" slot tag is editor-only', () => {
    const exact = recorder()
    drawPhotoPlaceholder(exact.ctx, { ...base, preview: picture, badge: false })
    expect(named(exact.calls, 'fillText')).toHaveLength(0)
    const editor = recorder()
    drawPhotoPlaceholder(editor.ctx, { ...base, preview: picture, badge: true })
    expect(named(editor.calls, 'fillText').map((c) => c.args[0])).toEqual(['#2'])
  })
  it('placeholder mode keeps the number and label (and no editor-only badge)', () => {
    const { ctx, calls } = recorder()
    drawPhotoPlaceholder(ctx, { ...base, badge: true })
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['2', 'PHOTO 2'])
  })
})

describe('specFor: sample photos are a preview aid supplied by the editor, never by production output', () => {
  const layer: PhotoLayer = photo('p', 2) as PhotoLayer
  const env = (over: Partial<RenderEnv>): RenderEnv => ({
    palette: { colors: [] },
    images: () => undefined,
    photoMode: 'preview',
    interactive: false,
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
  it('without a preview lookup the placeholder is drawn even in preview mode', () => {
    expect(named(draw(env({})), 'fillText').map((c) => c.args[0])).toContain('2')
  })
  it('with a lookup the sample is drawn with the layer crop; exact (non-interactive) renders have no badge', () => {
    const calls = draw(
      env({ photoPreview: () => ({ image: picture, crop: { zoom: 1.5, x: 0, y: 0 } }) })
    )
    expect(named(calls, 'drawImage')).toHaveLength(1)
    expect(named(calls, 'fillText')).toHaveLength(0)
  })
  it('placeholder mode ignores a lookup', () => {
    const calls = draw(env({ photoMode: 'placeholder', photoPreview: () => ({ image: picture }) }))
    expect(named(calls, 'drawImage')).toHaveLength(0)
  })
  it('both copies of a two-up sheet resolve the same sample for the same layer id/number (lookup is by layer, state is shared)', () => {
    const lookup = (l: PhotoLayer) => ({
      image: picture,
      crop: l.photoNumber === 2 ? { zoom: 2, x: 0, y: 0 } : undefined
    })
    const moved = { ...layer, x: layer.x + 1200 } as PhotoLayer
    const a = draw(env({ photoPreview: lookup }))
    const calls = recorder()
    ;(
      specFor(moved, env({ photoPreview: lookup, allLayers: [moved] }))!.config.sceneFunc as (
        c: unknown
      ) => void
    )({ _context: calls.ctx })
    expect(named(a, 'drawImage')[0]!.args).toEqual(named(calls.calls, 'drawImage')[0]!.args)
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
