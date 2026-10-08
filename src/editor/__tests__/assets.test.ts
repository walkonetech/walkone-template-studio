import { describe, expect, it } from 'vitest'
import {
  DPI_CAUTION_MIN,
  DPI_HEALTHY_MIN,
  assetUsage,
  checkProjectIntegrity,
  effectiveResolution,
  getPixelSize,
  sortedSiblings,
  type AssetReference,
  type ImageLayer,
  type Layer,
  type TemplateProject
} from '@domain'
import { resolveView, screenToDesign, toManual, zoomAt } from '@canvas/viewport/viewport'
import {
  AssetInUseError,
  addAssetLayer,
  addAssets,
  makeLayerBackground,
  removeAsset,
  replaceLayerAsset,
  setAssetAsBackground,
  setCanvasBackgroundColor,
  setImageOriginalSize
} from '../assetMutations'
import {
  INITIAL_RASTER_MAX_FRACTION,
  centerOn,
  createImageLayer,
  dropPointToDesign,
  initialImageSize,
  layerNameFromFilename
} from '../imagePlacement'
import { createEditorStore } from '../store'
import { fakePorts, makeProject, photo, shape, text } from './helpers'

const asset = (
  id: string,
  w: number,
  h: number,
  over: Partial<AssetReference> = {}
): AssetReference => ({
  id,
  filename: `${id}.png`,
  mediaType: 'image/png',
  path: `assets/${id}.png`,
  pixelWidth: w,
  pixelHeight: h,
  hasAlpha: true,
  byteSize: 1000,
  sha256: id.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a'),
  source: { kind: 'upload' },
  ...over
})

const base = (): TemplateProject => makeProject([photo('p1', 1), text('t1', 2)]) // 4x6 @600 → 2400×3600
const imageLayers = (p: TemplateProject): ImageLayer[] =>
  p.layers.filter((l): l is ImageLayer => l.type === 'image')

describe('effective resolution (source px per physical inch)', () => {
  const dpi = 600
  it('computes the documented examples', () => {
    // 1200×1800 shown 2×3 in (= 1200×1800 design px at 600 dpi) → 600 dpi
    const a = asset('a', 1200, 1800)
    expect(effectiveResolution(a, { width: 1200, height: 1800 }, dpi, 'stretch')?.dpi).toBeCloseTo(
      600,
      6
    )
    // the same pixels shown 4×6 in (2400×3600) → 300 dpi
    const r = effectiveResolution(a, { width: 2400, height: 3600 }, dpi, 'contain')
    expect(r?.dpi).toBeCloseTo(300, 6)
    expect(r?.status).toBe('healthy')
  })
  it('classifies 300+ healthy, 150–299 caution, below 150 low (boundaries inclusive at the lower edge)', () => {
    const a = asset('a', 1000, 1000)
    const at = (target: number) =>
      effectiveResolution(
        a,
        { width: (1000 * dpi) / target, height: (1000 * dpi) / target },
        dpi,
        'stretch'
      )
    expect(at(300)?.status).toBe('healthy')
    expect(at(299)?.status).toBe('caution')
    expect(at(DPI_CAUTION_MIN)?.status).toBe('caution')
    expect(at(149)?.status).toBe('low')
    expect(DPI_HEALTHY_MIN).toBe(300)
  })
  it('judges cover by the scale actually used and stretch by the worst axis', () => {
    const a = asset('a', 1000, 500)
    // cover into 1000×1000 at 600 dpi: scale = max(1, 2) = 2 → 300 dpi
    expect(effectiveResolution(a, { width: 1000, height: 1000 }, dpi, 'cover')?.dpi).toBeCloseTo(
      300,
      6
    )
    // contain: scale = min(1, 2) = 1 → 600 dpi
    expect(effectiveResolution(a, { width: 1000, height: 1000 }, dpi, 'contain')?.dpi).toBeCloseTo(
      600,
      6
    )
    const s = effectiveResolution(a, { width: 1000, height: 1000 }, dpi, 'stretch')
    expect(s?.dpiX).toBeCloseTo(600, 6)
    expect(s?.dpiY).toBeCloseTo(300, 6)
    expect(s?.dpi).toBeCloseTo(300, 6)
  })
  it('has no figure for vectors, unknown sizes or empty boxes', () => {
    expect(
      effectiveResolution(
        asset('v', 10, 10, { mediaType: 'image/svg+xml' }),
        { width: 5, height: 5 },
        dpi,
        'cover'
      )
    ).toBeNull()
    expect(
      effectiveResolution({ mediaType: 'image/png' }, { width: 5, height: 5 }, dpi, 'cover')
    ).toBeNull()
    expect(
      effectiveResolution(asset('a', 10, 10), { width: 0, height: 5 }, dpi, 'cover')
    ).toBeNull()
  })
})

describe('initial size and placement', () => {
  const design = { width: 2400, height: 3600 }
  it('keeps native pixels when they fit comfortably and never upscales a raster', () => {
    expect(initialImageSize(asset('a', 800, 600), design)).toEqual({ width: 800, height: 600 })
    expect(initialImageSize(asset('a', 10, 10), design)).toEqual({ width: 10, height: 10 })
  })
  it('scales large images down proportionally to 80% of the artboard', () => {
    const big = initialImageSize(asset('a', 6000, 4000), design)
    expect(big.width).toBe(Math.round(2400 * INITIAL_RASTER_MAX_FRACTION))
    expect(big.width / big.height).toBeCloseTo(1.5, 2)
    const tall = initialImageSize(asset('a', 3000, 9000), design)
    expect(tall.height).toBe(Math.round(3600 * INITIAL_RASTER_MAX_FRACTION))
  })
  it('fits vectors to half the artboard (they stay sharp), up or down', () => {
    const v = (w: number, h: number) => asset('v', w, h, { mediaType: 'image/svg+xml' })
    expect(initialImageSize(v(100, 100), design)).toEqual({ width: 1200, height: 1200 })
    expect(initialImageSize(v(8000, 4000), design)).toEqual({ width: 1200, height: 600 })
  })
  it('centres on the artboard by default and on a drop point when given, pulled onto the artboard', () => {
    expect(centerOn({ width: 400, height: 200 }, null, design)).toEqual({ x: 1000, y: 1700 })
    expect(centerOn({ width: 400, height: 200 }, { x: 600, y: 900 }, design)).toEqual({
      x: 400,
      y: 800
    })
    expect(centerOn({ width: 400, height: 200 }, { x: -500, y: 99999 }, design)).toEqual({
      x: -200,
      y: 3500
    })
  })
  it('creates a unique, selectable-ready ImageLayer that references the asset', () => {
    const p = addAssets(base(), [asset('rose', 500, 400, { filename: 'rose.png' })])
    const l1 = createImageLayer(p, p.assets[0]!, { createLayerId: () => 'L1' })
    expect(l1).toMatchObject({
      id: 'L1',
      type: 'image',
      assetId: 'rose',
      name: 'rose',
      role: 'graphic',
      width: 500,
      height: 400,
      visible: true,
      locked: false
    })
    const r = addAssetLayer(p, 'rose', { x: 1200, y: 1800 }, { createId: () => 'L2' })
    expect(r.layerId).toBe('L2')
    const again = addAssetLayer(r.project, 'rose', null, { createId: () => 'L3' })
    expect(imageLayers(again.project).map((l) => l.name)).toEqual(['rose', 'rose 2'])
    expect(checkProjectIntegrity(again.project)).toEqual([])
  })
  it('derives a layer name from the file name without changing the asset', () => {
    expect(layerNameFromFilename('Rose Petals.final.png')).toBe('Rose Petals.final')
    expect(layerNameFromFilename('.png')).toBe('Image')
  })
})

describe('drop point → design coordinates', () => {
  const design = getPixelSize(base().canvas.print)
  const rect = { left: 260, top: 40 } // stage container offset inside the window
  const viewport = { width: 900, height: 700 }

  it('is correct at fit zoom', () => {
    const view = resolveView({ mode: 'fit' }, design, viewport)
    const inner = { x: view.offsetX + 100 * view.scale, y: view.offsetY + 300 * view.scale }
    const p = dropPointToDesign(view, { x: rect.left + inner.x, y: rect.top + inner.y }, rect)
    expect(p.x).toBeCloseTo(100, 6)
    expect(p.y).toBeCloseTo(300, 6)
  })
  it('is correct at 25%, 100% and 400% with panning', () => {
    for (const scale of [0.25, 1, 4]) {
      const view = toManual({ scale, offsetX: -137.5, offsetY: 62.25 })
      const resolved = resolveView(view, design, viewport)
      const want = { x: 1234, y: 2345 }
      const screen = { x: want.x * scale + resolved.offsetX, y: want.y * scale + resolved.offsetY }
      const got = dropPointToDesign(
        resolved,
        { x: rect.left + screen.x, y: rect.top + screen.y },
        rect
      )
      expect(got.x).toBeCloseTo(want.x, 6)
      expect(got.y).toBeCloseTo(want.y, 6)
    }
  })
  it('is independent of how the view got there (zoom-at-pointer then drop)', () => {
    const fit = resolveView({ mode: 'fit' }, design, viewport)
    const zoomed = zoomAt(fit, 3, { x: 300, y: 250 })
    const want = screenToDesign(zoomed, 410, 333)
    const got = dropPointToDesign(zoomed, { x: rect.left + 410, y: rect.top + 333 }, rect)
    expect(got).toEqual(want)
  })
})

describe('asset records and usage', () => {
  it('addAssets is idempotent by id and refreshes updatedAt only when something changed', () => {
    const p0 = base()
    const p1 = addAssets(p0, [asset('a', 10, 10)], { now: '2026-02-02T00:00:00.000Z' })
    expect(p1.assets).toHaveLength(1)
    expect(p1.metadata.updatedAt).toBe('2026-02-02T00:00:00.000Z')
    expect(addAssets(p1, [asset('a', 10, 10)])).toBe(p1)
  })
  it('rejects a malformed asset record', () => {
    expect(() => addAssets(base(), [asset('a', 10, 10, { path: '../x.png' })])).toThrow()
  })
  it('many layers share one asset; the asset exists once', () => {
    let p = addAssets(base(), [asset('rose', 300, 300)])
    for (let i = 0; i < 3; i++)
      p = addAssetLayer(p, 'rose', null, { createId: () => `rose-${i}` }).project
    expect(p.assets).toHaveLength(1)
    expect(assetUsage(p, 'rose')).toMatchObject({ total: 3 })
    // each layer has independent geometry/opacity/z
    const [a, b] = imageLayers(p)
    expect(a?.zIndex).not.toBe(b?.zIndex)
  })
  it('removal of a used asset is refused with an explanation; an unused one is removed', () => {
    let p = addAssets(base(), [asset('rose', 300, 300), asset('spare', 10, 10)])
    p = addAssetLayer(p, 'rose', null, { createId: () => 'r1' }).project
    p = addAssetLayer(p, 'rose', null, { createId: () => 'r2' }).project
    expect(() => removeAsset(p, 'rose')).toThrow(AssetInUseError)
    expect(() => removeAsset(p, 'rose')).toThrow(/2 layers/)
    const q = removeAsset(p, 'spare')
    expect(q.assets.map((a) => a.id)).toEqual(['rose'])
    expect(checkProjectIntegrity(q)).toEqual([])
    expect(removeAsset(q, 'nonexistent')).toBe(q)
  })
  it('photo sample references also count as use', () => {
    const p = addAssets(makeProject([photo('p1', 1, { sampleAssetId: 's' })]), [asset('s', 10, 10)])
    expect(() => removeAsset(p, 's')).toThrow(AssetInUseError)
  })
})

describe('Set as Background', () => {
  const withAsset = (): TemplateProject =>
    addAssets(base(), [asset('marble', 6000, 4000), asset('other', 100, 100)])

  it('creates one locked background ImageLayer filling the artboard at the very back', () => {
    const r = setAssetAsBackground(withAsset(), 'marble', 'cover', { createId: () => 'bg' })
    const bg = r.project.layers.find((l) => l.id === 'bg') as ImageLayer
    expect(bg).toMatchObject({
      type: 'image',
      role: 'background',
      assetId: 'marble',
      x: 0,
      y: 0,
      width: 2400,
      height: 3600,
      fit: 'cover',
      locked: true,
      visible: true,
      name: 'Background',
      rotation: 0
    })
    const order = sortedSiblings(r.project.layers, undefined).map((l) => l.id)
    expect(order[0]).toBe('bg') // behind all content
    expect(order).toHaveLength(3)
    expect(checkProjectIntegrity(r.project)).toEqual([])
  })
  it('supports Fit inside (contain) and Original size', () => {
    const contain = setAssetAsBackground(withAsset(), 'marble', 'contain', { createId: () => 'bg' })
    expect(contain.project.layers.find((l) => l.id === 'bg')).toMatchObject({
      fit: 'contain',
      width: 2400,
      height: 3600
    })
    const original = setAssetAsBackground(withAsset(), 'marble', 'original', {
      createId: () => 'bg'
    })
    expect(original.project.layers.find((l) => l.id === 'bg')).toMatchObject({
      width: 6000,
      height: 4000,
      x: -1800,
      y: -200
    })
  })
  it('keeps ONE background: setting another replaces the asset on the same layer', () => {
    const first = setAssetAsBackground(withAsset(), 'marble', 'cover', { createId: () => 'bg' })
    const second = setAssetAsBackground(first.project, 'other', 'cover', {
      createId: () => 'never'
    })
    expect(second.layerId).toBe('bg')
    expect(imageLayers(second.project).filter((l) => l.role === 'background')).toHaveLength(1)
    expect((second.project.layers.find((l) => l.id === 'bg') as ImageLayer).assetId).toBe('other')
    expect(second.project.layers).toHaveLength(first.project.layers.length)
  })
  it('turns an existing image layer into the background (fills, locks, back) without a new layer', () => {
    let p = withAsset()
    p = addAssetLayer(p, 'marble', { x: 500, y: 500 }, { createId: () => 'img' }).project
    const q = makeLayerBackground(p, 'img', 'cover')
    expect(q.layers).toHaveLength(p.layers.length)
    expect(q.layers.find((l) => l.id === 'img')).toMatchObject({
      role: 'background',
      x: 0,
      y: 0,
      width: 2400,
      height: 3600,
      locked: true
    })
    expect(sortedSiblings(q.layers, undefined)[0]?.id).toBe('img')
  })
  it('stays behind content added later', () => {
    const r = setAssetAsBackground(withAsset(), 'marble', 'cover', { createId: () => 'bg' })
    const withNew = addAssetLayer(r.project, 'other', null, { createId: () => 'top' }).project
    const order = sortedSiblings(withNew.layers, undefined).map((l) => l.id)
    expect(order[0]).toBe('bg')
    expect(order[order.length - 1]).toBe('top')
  })
  it('refuses assets that are not in the project and layers that are not images', () => {
    expect(() => setAssetAsBackground(base(), 'nope', 'cover')).toThrow()
    expect(() => makeLayerBackground(base(), 't1', 'cover')).toThrow(/image/)
  })
})

describe('replace asset (per layer) and original size', () => {
  it('replaces only the chosen layer’s asset; other layers keep theirs; geometry unchanged', () => {
    let p = addAssets(base(), [asset('a', 300, 300)])
    p = addAssetLayer(p, 'a', null, { createId: () => 'l1' }).project
    p = addAssetLayer(p, 'a', null, { createId: () => 'l2' }).project
    const q = replaceLayerAsset(p, 'l1', asset('b', 900, 600))
    const [l1, l2] = [
      q.layers.find((l) => l.id === 'l1'),
      q.layers.find((l) => l.id === 'l2')
    ] as ImageLayer[]
    expect(l1?.assetId).toBe('b')
    expect(l2?.assetId).toBe('a')
    expect(l1?.width).toBe((p.layers.find((l) => l.id === 'l1') as ImageLayer).width)
    expect(q.assets.map((x) => x.id)).toEqual(['a', 'b'])
    expect(checkProjectIntegrity(q)).toEqual([])
    expect(() => replaceLayerAsset(p, 't1', asset('b', 1, 1))).toThrow()
  })
  it('Original size sets source pixels and keeps the centre', () => {
    let p = addAssets(base(), [asset('a', 400, 200)])
    p = addAssetLayer(p, 'a', { x: 1000, y: 1000 }, { createId: () => 'l1' }).project
    const resized = updateTo(p, 'l1', { width: 100, height: 50 })
    const cx = (resized.layers.find((l) => l.id === 'l1') as ImageLayer).x + 50
    const q = setImageOriginalSize(resized, 'l1')
    const l = q.layers.find((x) => x.id === 'l1') as ImageLayer
    expect([l.width, l.height]).toEqual([400, 200])
    expect(l.x + 200).toBeCloseTo(cx, 0)
  })
})

function updateTo(p: TemplateProject, id: string, patch: Partial<ImageLayer>): TemplateProject {
  return { ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }
}

describe('canvas background colour', () => {
  it('sets a literal colour, and is a no-op when unchanged', () => {
    const p = base()
    const q = setCanvasBackgroundColor(p, { kind: 'literal', value: '#f4efe6' })
    expect(q.canvas.backgroundColor).toEqual({ kind: 'literal', value: '#f4efe6' })
    expect(setCanvasBackgroundColor(q, { kind: 'literal', value: '#f4efe6' })).toBe(q)
  })
})

describe('editor store: imports, undo/redo, autosave', () => {
  async function setup() {
    const ports = fakePorts(base())
    let n = 0
    const store = createEditorStore({
      ports,
      createId: () => `id-${++n}`,
      autosave: { debounceMs: 0, maxWaitMs: 0 }
    })
    await store.getState().createProject({ name: 'X', preset: 'photo-4x6-portrait-600' })
    const result = (...as: AssetReference[]) => ({
      imported: as.map((a) => ({ asset: a, deduplicated: false })),
      failures: []
    })
    return { ports, store, s: () => store.getState(), result }
  }

  it('import + add to canvas is ONE undo step: asset and layer appear together, selected, Modified', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 500, 400)))
    const before = s().project
    const out = await s().importAssetsFromDialog({ kind: 'canvas', at: { x: 1200, y: 1800 } })
    expect(out).toMatchObject({ status: 'ok', assetIds: ['rose'] })
    expect(s().project?.assets).toHaveLength(1)
    const layer = imageLayers(s().project!)[0]!
    expect(s().selectedIds).toEqual([layer.id])
    expect(layer).toMatchObject({ x: 950, y: 1600, width: 500, height: 400 })
    expect(s().history.past).toHaveLength(1)
    expect(s().project).not.toBe(s().savedProject)
    s().undo()
    expect(s().project?.assets).toHaveLength(0)
    expect(s().project?.layers).toEqual(before!.layers)
    s().redo()
    expect(s().project?.assets).toHaveLength(1)
    expect(imageLayers(s().project!)).toHaveLength(1)
  })

  it('library-only import adds the asset (undoable) but no layer', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('a', 10, 10)))
    await s().importAssetsFromDialog({ kind: 'library' })
    expect(s().project?.assets).toHaveLength(1)
    expect(imageLayers(s().project!)).toHaveLength(0)
    expect(s().history.past).toHaveLength(1)
    s().undo()
    expect(s().project?.assets).toHaveLength(0)
  })

  it('cancelling the picker changes nothing', async () => {
    const { s } = await setup()
    expect(await s().importAssetsFromDialog({ kind: 'library' })).toEqual({ status: 'cancelled' })
    expect(s().history.past).toHaveLength(0)
  })

  it('reused (deduplicated) content adds no second record and says so; no history entry when nothing changes', async () => {
    const { ports, s, result } = await setup()
    const a = asset('a', 10, 10)
    ports.importQueue.push(result(a))
    await s().importAssetsFromDialog({ kind: 'library' })
    ports.importQueue.push({ imported: [{ asset: a, deduplicated: true }], failures: [] })
    const out = await s().importAssetsFromDialog({ kind: 'library' })
    expect(out).toMatchObject({ status: 'ok', reused: 1 })
    expect(s().project?.assets).toHaveLength(1)
    expect(s().history.past).toHaveLength(1)
    expect(s().lastMessage).toMatch(/already in the project/)
  })

  it('dedup after undo: the same asset id comes back and is re-added', async () => {
    const { ports, s, result } = await setup()
    const a = asset('a', 10, 10)
    ports.importQueue.push(result(a))
    await s().importAssetsFromDialog({ kind: 'library' })
    s().undo()
    ports.importQueue.push({ imported: [{ asset: a, deduplicated: true }], failures: [] })
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    expect(s().project?.assets.map((x) => x.id)).toEqual(['a'])
    expect(imageLayers(s().project!)).toHaveLength(1)
  })

  it('per-file failures are reported without losing the files that worked', async () => {
    const { ports, s } = await setup()
    ports.importQueue.push({
      imported: [{ asset: asset('ok', 10, 10), deduplicated: false }],
      failures: [
        {
          filename: 'bad.svg',
          error: { code: 'unsafe-svg', message: 'This SVG was not imported.' }
        }
      ]
    })
    const out = await s().importDroppedFiles([{ name: 'x', data: new Uint8Array(1) }], {
      kind: 'library'
    })
    expect(out).toMatchObject({ status: 'ok', failed: 1 })
    expect(s().lastMessage).toContain('bad.svg')
    expect(s().project?.assets).toHaveLength(1)
  })

  it('an all-failed import is an error and leaves the project untouched', async () => {
    const { ports, s } = await setup()
    ports.importQueue.push({
      imported: [],
      failures: [
        { filename: 'a.pdf', error: { code: 'unsupported-format', message: 'Not supported.' } }
      ]
    })
    const before = s().project
    const out = await s().importDroppedFiles([{ name: 'a.pdf', data: new Uint8Array(1) }], {
      kind: 'canvas',
      at: null
    })
    expect(out.status).toBe('error')
    expect(s().project).toBe(before)
  })

  it('background placement import: one step, background at the back, locked', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('marble', 6000, 4000)))
    await s().importAssetsFromDialog({ kind: 'background', mode: 'cover' })
    const bg = imageLayers(s().project!)[0]!
    expect(bg).toMatchObject({ role: 'background', locked: true, width: 2400, height: 3600 })
    expect(s().history.past).toHaveLength(1)
  })

  it('replace placement swaps only that layer’s asset in one step', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('a', 100, 100)))
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    const id = imageLayers(s().project!)[0]!.id
    ports.importQueue.push(result(asset('b', 200, 200)))
    await s().importAssetsFromDialog({ kind: 'replace', layerId: id })
    expect(imageLayers(s().project!)[0]?.assetId).toBe('b')
    expect(s().project?.assets.map((x) => x.id)).toEqual(['a', 'b'])
    expect(s().history.past).toHaveLength(2)
    s().undo()
    expect(imageLayers(s().project!)[0]?.assetId).toBe('a')
  })

  it('adding the same asset twice makes two layers over one asset; each is its own undo step', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 200, 200)))
    await s().importAssetsFromDialog({ kind: 'library' })
    expect(s().addAssetToCanvas('rose')).toBe(true)
    expect(s().addAssetToCanvas('rose', { x: 100, y: 100 })).toBe(true)
    expect(s().project?.assets).toHaveLength(1)
    expect(imageLayers(s().project!)).toHaveLength(2)
    expect(s().history.past).toHaveLength(3)
  })

  it('removeAsset is refused while in use (message, no history) and allowed after the layers are gone', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 200, 200)))
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    const past = s().history.past.length
    expect(s().removeAsset('rose')).toBe(false)
    expect(s().lastMessage).toMatch(/used by 1 layer/)
    expect(s().history.past).toHaveLength(past)
    s().deleteSelection()
    expect(s().removeAsset('rose')).toBe(true)
    expect(s().project?.assets).toHaveLength(0)
    s().undo()
    expect(s().project?.assets).toHaveLength(1)
  })

  it('layer rename never touches the asset file name', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 200, 200, { filename: 'rose-petals.png' })))
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    const id = imageLayers(s().project!)[0]!.id
    s().renameLayer(id, 'Left petals')
    expect(s().project?.assets[0]?.filename).toBe('rose-petals.png')
  })

  it('role changes and background colour are single undoable edits', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 200, 200)))
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    const id = imageLayers(s().project!)[0]!.id
    expect(s().editLayers([id], { role: 'overlay' })).toBe(true)
    expect(imageLayers(s().project!)[0]?.role).toBe('overlay')
    s().setCanvasBackgroundColor({ kind: 'literal', value: '#eeeeee' })
    expect(s().project?.canvas.backgroundColor).toEqual({ kind: 'literal', value: '#eeeeee' })
    s().undo()
    expect(s().project?.canvas.backgroundColor).toEqual({ kind: 'literal', value: '#ffffff' })
    s().undo()
    expect(imageLayers(s().project!)[0]?.role).toBe('graphic')
  })

  it('autosave runs after an import so the working session records the asset', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('rose', 200, 200)))
    await s().importAssetsFromDialog({ kind: 'canvas', at: null })
    await s().flushRecovery()
    const last = ports.workingCopies[ports.workingCopies.length - 1]
    expect(last?.assets.map((a) => a.id)).toEqual(['rose'])
    expect(imageLayers(last!)).toHaveLength(1)
  })

  it('an import that finishes after the project was closed is dropped', async () => {
    const { ports, s, result } = await setup()
    let finish: (v: ReturnType<typeof result>) => void = () => undefined
    ports.importAssets = () =>
      new Promise((resolve) => {
        finish = (value) => resolve({ status: 'ok', value })
      })
    const pending = s().importAssetsFromDialog({ kind: 'canvas', at: null })
    await s().closeProject()
    finish(result(asset('rose', 200, 200)))
    const out = await pending
    expect(out.status).toBe('error')
    expect(s().project).toBeNull()
  })

  it('removeBackgroundImage deletes the locked background layer', async () => {
    const { ports, s, result } = await setup()
    ports.importQueue.push(result(asset('marble', 600, 400)))
    await s().importAssetsFromDialog({ kind: 'background', mode: 'cover' })
    expect(s().removeBackgroundImage()).toBe(true)
    expect(imageLayers(s().project!)).toHaveLength(0)
    expect(s().project?.assets).toHaveLength(1)
  })
})

describe('layer ordering keeps content in front of the background after other edits', () => {
  it('shape/text/photo order is untouched by setting a background', () => {
    const p = addAssets(makeProject([shape('s', 0), photo('p', 1), text('t', 2)]), [
      asset('bg', 100, 100)
    ])
    const r = setAssetAsBackground(p, 'bg', 'cover', { createId: () => 'B' })
    expect(sortedSiblings(r.project.layers, undefined).map((l) => l.id)).toEqual([
      'B',
      's',
      'p',
      't'
    ])
  })
})
