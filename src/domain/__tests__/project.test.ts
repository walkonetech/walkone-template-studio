import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  checkProjectIntegrity,
  createProject,
  createTwoUpStripOutput,
  getPrintPreset,
  HexColorSchema,
  rescaleProjectDpi,
  type Layer
} from '..'
import { baseProject, counterIds, photo, TS, withLayers } from './helpers'

describe('project factory', () => {
  it('produces a structurally valid project with the current schema version', () => {
    const p = baseProject()
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(checkProjectIntegrity(p)).toEqual([])
    expect(p.metadata.createdAt).toBe(TS)
  })

  it('generates unique ids by default', () => {
    const a = createProject({ name: 'a', design: 'strip-2x6-600' })
    const b = createProject({ name: 'b', design: 'strip-2x6-600' })
    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('can create a two-up strip project', () => {
    const design = getPrintPreset('strip-2x6-600')
    const p = createProject({ name: 'x', design, output: createTwoUpStripOutput(design) })
    expect(checkProjectIntegrity(p)).toEqual([])
  })
})

describe('layer rules', () => {
  const codes = (layers: Layer[]): string[] =>
    checkProjectIntegrity(withLayers(layers)).map((i) => i.code)

  it('allows repeated photoNumber', () => {
    expect(codes([photo('a', 1, { zIndex: 0 }), photo('b', 1, { zIndex: 1 })])).toEqual([])
  })

  it('rejects duplicate layer ids', () => {
    expect(codes([photo('a', 1, { zIndex: 0 }), photo('a', 2, { zIndex: 1 })])).toContain(
      'duplicate-id'
    )
  })

  it('allows negative and off-canvas geometry', () => {
    expect(codes([photo('a', 1, { x: -250, y: -155, width: 5000, height: 9000 })])).toEqual([])
  })

  it('rejects repeated zIndex among siblings', () => {
    expect(codes([photo('a', 1), photo('b', 2)])).toContain('duplicate-zindex')
  })

  it('validates hierarchy', () => {
    expect(codes([photo('a', 1, { parentId: 'nope' })])).toContain('missing-parent')
    expect(codes([photo('a', 1), photo('b', 2, { zIndex: 1, parentId: 'a' })])).toContain(
      'invalid-parent'
    )
  })

  it('rejects missing asset and palette references', () => {
    const img = {
      ...photo('i', 1),
      type: 'image',
      assetId: 'none',
      role: 'overlay',
      fit: 'cover'
    } as unknown as Layer
    expect(codes([img])).toContain('missing-asset')
    const p = withLayers([
      photo('a', 1, {
        frame: { style: 'solid', thickness: 4, color: { kind: 'palette', paletteColorId: 'x' } }
      })
    ])
    expect(checkProjectIntegrity(p).map((i) => i.code)).toContain('missing-palette-color')
  })
})

describe('colors', () => {
  it('accepts canonical hex and rejects others', () => {
    for (const ok of ['#ffffff', '#00112233'])
      expect(HexColorSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['#FFFFFF', '#fff', 'red', '#12345', 'ffffff']) {
      expect(HexColorSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('rescaleProjectDpi', () => {
  it('scales geometry explicitly and keeps physical size', () => {
    const p = {
      ...baseProject(),
      canvas: { ...baseProject().canvas, print: getPrintPreset('photo-4x6-portrait-300') }
    }
    const project = createProject({
      name: 'r',
      design: 'photo-4x6-portrait-300',
      now: TS,
      createId: counterIds()
    })
    const withPhoto = { ...project, layers: [photo('a', 1, { x: 76, width: 500 })] }
    const scaled = rescaleProjectDpi(withPhoto, 600)
    expect(scaled.canvas.print).toMatchObject({ width: 4, height: 6, dpi: 600 })
    expect(scaled.output.print.dpi).toBe(600)
    expect(scaled.layers[0]).toMatchObject({ x: 152, width: 1000 })
    expect(withPhoto.layers[0]).toMatchObject({ x: 76 })
    expect(checkProjectIntegrity(scaled)).toEqual([])
    expect(p.canvas.print.dpi).toBe(300)
  })

  it('rejects an invalid dpi', () => {
    expect(() => rescaleProjectDpi(baseProject(), 0)).toThrow(RangeError)
  })
})
