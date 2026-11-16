import { describe, expect, it } from 'vitest'
import { paletteColor, type AssetReference, type Layer, type TemplateProject } from '@domain'
import { photoNumberGaps, runExportPreflight } from '../exportPreflight'
import { makeProject, photo, shape, text } from './helpers'

const fonts = { catalog: { status: 'ready' as const, families: ['Georgia'] } }
const codes = (p: TemplateProject, env: Parameters<typeof runExportPreflight>[1] = { fonts }) =>
  runExportPreflight(p, env).items.map((i) => `${i.severity}:${i.code}`)

const asset = (id: string, w = 2400, h = 3600): AssetReference => ({
  id,
  filename: `${id}.png`,
  mediaType: 'image/png',
  path: `assets/${id}.png`,
  pixelWidth: w,
  pixelHeight: h,
  source: { kind: 'upload' }
})
const image = (id: string, assetId: string, over: Partial<Layer> = {}): Layer =>
  ({
    id,
    type: 'image',
    name: id,
    x: 0,
    y: 0,
    width: 2400,
    height: 3600,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    visible: true,
    locked: false,
    assetId,
    role: 'overlay',
    fit: 'stretch',
    ...over
  }) as Layer

describe('photoNumberGaps', () => {
  it('lists numbers skipped below the highest', () => {
    expect(photoNumberGaps([1, 3, 3, 5])).toEqual([2, 4])
    expect(photoNumberGaps([1, 1, 2])).toEqual([])
    expect(photoNumberGaps([])).toEqual([])
  })
})

describe('runExportPreflight', () => {
  it('a clean design has no items and can export', () => {
    const r = runExportPreflight(makeProject([photo('p1', 1), photo('p2', 2), text('t', 3)]), {
      fonts
    })
    expect(r).toMatchObject({ items: [], errors: 0, canExport: true })
  })
  it('repeated photo numbers are valid and never reported', () => {
    expect(
      codes(
        makeProject([photo('a', 1), photo('b', 1), photo('c', 2), photo('d', 2, { zIndex: 9 })])
      )
    ).toEqual([])
  })
  it('a gap in photo numbers is informational only', () => {
    expect(codes(makeProject([photo('a', 1), photo('c', 3)]))).toEqual(['info:photo-number-gap'])
  })
  it('does not apply DSLR Booth limits (photo number above 12 is fine here)', () => {
    const p = makeProject(
      Array.from({ length: 13 }, (_, i) => photo(`p${i}`, i + 1, { y: 10, height: 10 }))
    )
    expect(codes(p)).toEqual([])
  })
  it('an invalid photo number is an error (defensive: the schema already forbids it)', () => {
    const r = runExportPreflight(makeProject([photo('a', 0 as number)]), { fonts })
    expect(r.items[0]).toMatchObject({ severity: 'error', code: 'photo-number-invalid' })
    expect(r.canExport).toBe(false)
  })
  it('no visible photo slot is a warning', () => {
    expect(codes(makeProject([shape('s', 0), photo('p', 1, { visible: false })]))).toEqual([
      'warning:no-photo-slots',
      'info:hidden-layers'
    ])
  })
  it('an image whose asset is not in the project is an error', () => {
    const p = makeProject([photo('p', 1), image('i', 'gone')])
    expect(codes(p)).toContain('error:asset-missing')
    expect(runExportPreflight(p, { fonts }).canExport).toBe(false)
  })
  it('an image that could not be loaded is an error', () => {
    const p = { ...makeProject([photo('p', 1), image('i', 'a1')]), assets: [asset('a1')] }
    expect(codes(p, { fonts, unreadableAssetIds: ['a1'] })).toContain('error:asset-unreadable')
    expect(codes(p, { fonts })).not.toContain('error:asset-unreadable')
  })
  it('a broken palette reference is an error (it would print magenta)', () => {
    const p = makeProject([
      photo('p', 1),
      text('t', 2, { fill: paletteColor('deleted') } as Partial<Layer>)
    ])
    const r = runExportPreflight(p, { fonts })
    expect(r.items[0]).toMatchObject({ severity: 'error', code: 'palette-broken', layerIds: ['t'] })
  })
  it('missing fonts warn; undeterminable fonts are noted; hidden text is ignored', () => {
    const unknownEnv = { fonts: { catalog: { status: 'unavailable' as const, families: [] } } }
    const p = makeProject([
      photo('p', 1),
      text('t', 2, { fontFamily: 'Great Vibes' }),
      text('h', 3, { fontFamily: 'Hidden Font', visible: false })
    ])
    expect(codes(p)).toEqual(['warning:font-missing', 'info:hidden-layers'])
    expect(codes(p, unknownEnv)).toContain('info:font-unknown')
    expect(runExportPreflight(p, { fonts }).items[0]?.message).toContain('Great Vibes')
  })
  it('judges image resolution as placed', () => {
    const p = {
      ...makeProject([photo('p', 1), image('low', 'small'), image('soft', 'mid')]),
      assets: [asset('small', 480, 720), asset('mid', 900, 1350)]
    }
    expect(codes(p)).toEqual(['warning:image-low-resolution', 'info:image-soft-resolution'])
  })
  it('reports artwork past the edge (clipped), entirely outside, and photo slots past the edge', () => {
    const p = makeProject([
      photo('p', 1, { x: -50 }),
      shape('clip', 1, { x: 2300, y: 100, width: 300, height: 100 }),
      shape('gone', 2, { x: 5000, y: 100, width: 300, height: 100 })
    ])
    expect(codes(p)).toEqual([
      'warning:photo-slot-outside',
      'warning:artwork-off-canvas',
      'info:artwork-clipped'
    ])
  })
  it('sorts errors first, then warnings, then notes', () => {
    const p = makeProject([image('i', 'gone'), photo('p', 1, { visible: false })])
    const sev = runExportPreflight(p, { fonts }).items.map((i) => i.severity)
    expect(sev).toEqual(
      [...sev].sort(
        (a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b)
      )
    )
  })
  it('an invalid print layout is an error', () => {
    const base = makeProject([photo('p', 1)], 'strip-2x6-300')
    const p = { ...base, output: { ...base.output, print: { ...base.output.print, width: 3 } } }
    expect(codes(p)).toContain('error:composition-invalid')
  })
})
