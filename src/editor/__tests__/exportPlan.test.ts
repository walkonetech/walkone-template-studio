import { describe, expect, it } from 'vitest'
import { literalColor, type Layer } from '@domain'
import {
  buildPackageManifest,
  classifyLayerPackage,
  describeSize,
  exportOutputs,
  layerPackageOutput,
  packageFiles,
  packageReadme,
  printableLeaves
} from '../exportPlan'
import { isSafeExportFileName } from '@export/naming'
import { group, makeProject, photo, shape, text } from './helpers'

const env = { catalog: { status: 'ready' as const, families: ['Georgia'] } }

describe('exportOutputs', () => {
  it('a 2×6 strip offers the 4×6 sheet and the single strip separately', () => {
    const p = {
      ...makeProject([], 'strip-2x6-300'),
      metadata: { ...makeProject().metadata, name: 'Chaney Wedding' }
    }
    const outs = exportOutputs(p)
    expect(outs.map((o) => o.kind)).toEqual(['print', 'design', 'proof'])
    const [print, design, proof] = outs
    expect(print).toMatchObject({
      fileName: 'Chaney Wedding-print.png',
      width: 1200,
      height: 1800,
      dpi: 300,
      production: true
    })
    expect(print?.label).toBe('Print sheet PNG')
    expect(design).toMatchObject({
      fileName: 'Chaney Wedding-design.png',
      width: 600,
      height: 1800,
      widthIn: 2
    })
    expect(proof).toMatchObject({
      fileName: 'Chaney Wedding-proof.png',
      production: false,
      defaultSelected: false
    })
    expect(layerPackageOutput(p)).toMatchObject({
      kind: 'package',
      fileName: 'Chaney Wedding-layers.zip',
      width: 600,
      height: 1800,
      dpi: 300
    })
    expect(describeSize(print!)).toBe('1200 × 1800 px · 4 × 6 in · 300 DPI')
  })
  it('a single-up 4×6 offers one print PNG (its design is its print)', () => {
    const outs = exportOutputs(makeProject([], 'photo-4x6-portrait-600'))
    expect(outs.map((o) => o.kind)).toEqual(['print', 'proof'])
    expect(outs[0]).toMatchObject({ label: 'Print PNG', width: 2400, height: 3600, dpi: 600 })
  })
  it('the layer package is not offered; no image file is ticked on first use (B4, R2: only the dslrBooth template is)', () => {
    const outs = exportOutputs(makeProject([], 'strip-2x6-300'))
    expect(outs.filter((o) => o.defaultSelected).map((o) => o.kind)).toEqual([])
  })
  it('every file name is accepted by the main process', () => {
    const p = makeProject()
    for (const name of ['', 'A/B', 'CON', '  ', 'Party 🎉'])
      for (const o of exportOutputs({ ...p, metadata: { ...p.metadata, name: name || 'x' } }))
        expect(isSafeExportFileName(o.fileName)).toBe(true)
  })
})

describe('printableLeaves', () => {
  it('lists visible non-group layers in paint order, descending into groups', () => {
    const p = makeProject([
      shape('a', 0),
      group('g', 1),
      shape('g1', 0, { parentId: 'g' }),
      text('g2', 1, { parentId: 'g' }),
      shape('hidden', 2, { visible: false }),
      group('hg', 3, { visible: false }),
      shape('inHidden', 0, { parentId: 'hg' })
    ])
    expect(printableLeaves(p).map((l) => l.id)).toEqual(['a', 'g1', 'g2'])
  })
})

describe('classifyLayerPackage', () => {
  it('splits by stack position around the photo slots and by type above them', () => {
    const p = makeProject([
      shape('bg', 0, { x: 0, y: 0, width: 2400, height: 3600 }),
      text('behind-text', 1, { y: 50, height: 100 }),
      photo('p1', 1, { zIndex: 2 }),
      photo('p2', 2, { zIndex: 3, frame: { style: 'none' } }),
      shape('logo', 4, { x: 2000, y: 3300, width: 100, height: 100 }),
      text('title', 5, { y: 3400, height: 100 })
    ])
    const b = classifyLayerPackage(p)
    expect(b.background).toEqual(['bg', 'behind-text'])
    expect(b.photos).toEqual(['p1', 'p2'])
    expect(b.frames).toEqual(['p1'])
    expect(b.overlay).toEqual(['logo'])
    expect(b.text).toEqual(['title'])
    expect(b.notes).toEqual([])
  })
  it('notes artwork stacked between slots that overlaps a later slot', () => {
    const p = makeProject([
      photo('p1', 1, { zIndex: 0 }),
      shape('between', 1, { x: 300, y: 350, width: 100, height: 100 }),
      photo('p2', 2, { zIndex: 2 })
    ])
    const b = classifyLayerPackage(p)
    expect(b.overlay).toEqual(['between'])
    expect(b.notes).toEqual([
      expect.objectContaining({ code: 'between-photos', layerIds: ['between'] })
    ])
  })
  it('does not note between-slot artwork that overlaps no later slot', () => {
    const p = makeProject([
      photo('p1', 1, { zIndex: 0 }),
      shape('between', 1, { x: 3000, y: 3000, width: 10, height: 10 }),
      photo('p2', 2, { zIndex: 2 })
    ])
    expect(classifyLayerPackage(p).notes).toEqual([])
  })
  it('notes text that sits under overlapping artwork (text.png is lifted above it)', () => {
    const p = makeProject([
      photo('p1', 1, { zIndex: 0 }),
      text('t', 1, { x: 0, y: 3000, width: 500, height: 200 }),
      shape('cover', 2, { x: 100, y: 3050, width: 100, height: 100 })
    ])
    const b = classifyLayerPackage(p)
    expect(b.notes.map((n) => n.code)).toEqual(['text-lifted'])
  })
  it('without photo slots, everything but text is background', () => {
    const p = makeProject([shape('a', 0), text('t', 1)])
    const b = classifyLayerPackage(p)
    expect(b.background).toEqual(['a'])
    expect(b.text).toEqual(['t'])
    expect(b.overlay).toEqual([])
    expect(b.notes.map((n) => n.code)).toEqual(['no-photo-slots'])
  })
  it('notes a semi-transparent group whose children land in different files', () => {
    const p = makeProject([
      photo('p1', 1, { zIndex: 0 }),
      group('g', 1, { opacity: 0.5 }),
      shape('gs', 0, { parentId: 'g', x: 3000, y: 3000, width: 10, height: 10 }),
      text('gt', 1, { parentId: 'g', x: 3100, y: 3100, width: 10, height: 10 })
    ])
    expect(classifyLayerPackage(p).notes.map((n) => n.code)).toEqual(['group-opacity'])
  })
  it('ignores hidden layers', () => {
    const p = makeProject([photo('p1', 1, { zIndex: 0 }), shape('h', 1, { visible: false })])
    expect(classifyLayerPackage(p).overlay).toEqual([])
  })
})

describe('package files and manifest', () => {
  const project = () => {
    const p = makeProject(
      [
        shape('bg', 0, { x: 0, y: 0, width: 600, height: 1800 }),
        photo('p1', 1, { zIndex: 1, x: 30, y: 30, width: 540, height: 360 }),
        photo('p2', 2, {
          zIndex: 2,
          x: 30,
          y: 420,
          width: 540,
          height: 360,
          rotation: 5,
          frame: { style: 'solid', thickness: 8, color: literalColor('#112233') }
        }),
        photo('p1b', 1, { zIndex: 3, x: 30, y: 810, width: 540, height: 360 }),
        text('names', 4, { x: 0, y: 1500, width: 600, height: 120, fontFamily: 'Missing Script' })
      ] as Layer[],
      'strip-2x6-300'
    )
    return { ...p, metadata: { ...p.metadata, name: 'Chaney Wedding' } }
  }
  it('lists only non-empty bands, in re-stacking order, then the reference composites', () => {
    const files = packageFiles(classifyLayerPackage(project()))
    expect(files.map((f) => f.path)).toEqual([
      'background.png',
      'frames.png',
      'text.png',
      'design.png',
      'proof.png'
    ])
    expect(files.find((f) => f.role === 'proof')?.description).toMatch(/NOT production/)
  })
  it('describes slots in pixels and inches, keeps repeated photo numbers, and records the sheet copies', () => {
    const p = project()
    const m = buildPackageManifest(p, classifyLayerPackage(p), { appVersion: '0.1.0', fonts: env })
    expect(m.format).toBe('walkone.layer-package')
    expect(m.design).toEqual({ widthIn: 2, heightIn: 6, dpi: 300, widthPx: 600, heightPx: 1800 })
    expect(m.print.copies).toEqual([
      { x: 0, y: 0, width: 600, height: 1800 },
      { x: 600, y: 0, width: 600, height: 1800 }
    ])
    expect(m.photoSlots.map((s) => s.photoNumber)).toEqual([1, 2, 1])
    expect(m.photoSlots[1]).toMatchObject({
      x: 30,
      y: 420,
      xIn: 0.1,
      yIn: 1.4,
      widthIn: 1.8,
      rotation: 5,
      frame: { style: 'solid', thickness: 8, color: '#112233' }
    })
    expect(m.stackOrder).toEqual(['background.png', 'photos', 'frames.png', 'text.png'])
    expect(m.fonts).toEqual([{ family: 'Missing Script', availableOnExportComputer: 'missing' }])
  })
  it('is deterministic (no wall-clock time)', () => {
    const p = project()
    const a = JSON.stringify(buildPackageManifest(p, classifyLayerPackage(p), { appVersion: '1' }))
    const b = JSON.stringify(buildPackageManifest(p, classifyLayerPackage(p), { appVersion: '1' }))
    expect(a).toBe(b)
    expect(a).toContain(p.metadata.updatedAt)
  })
  it('the readme explains the stack, the slots and that the proof is not production artwork', () => {
    const p = project()
    const r = packageReadme(
      buildPackageManifest(p, classifyLayerPackage(p), { appVersion: '0.1.0', fonts: env })
    )
    expect(r).toContain('1. background.png')
    expect(r).toContain('2. (the booth photos, see Photo slots)')
    expect(r).toContain('Photo 2: x 30, y 420, 540 x 360, rotated 5 deg, frame 8px #112233')
    expect(r).toContain('NOT production artwork')
    expect(r).toContain('Missing Script (missing on the exporting computer')
    expect(r).toContain('Printed 2 times on a 4 x 6 in sheet.')
  })
})
