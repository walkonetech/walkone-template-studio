import { describe, expect, it } from 'vitest'
import { deserializeProject, loadProject, serializeProject, type TemplateProject } from '..'
import { baseProject, photo, TS, withLayers } from './helpers'

function load(text: string): TemplateProject {
  const r = deserializeProject(text)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.project
}

describe('serialization', () => {
  it('round-trips a project exactly', () => {
    const p = withLayers([photo('a', 1, { zIndex: 0 }), photo('b', 1, { zIndex: 1, x: -10 })])
    expect(load(serializeProject(p))).toEqual(p)
  })

  it('is deterministic and ends with a newline', () => {
    const p = baseProject()
    const text = serializeProject(p)
    expect(serializeProject(load(text))).toBe(text)
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text).schemaVersion).toBe(1)
  })

  it('fails cleanly on invalid JSON', () => {
    const r = deserializeProject('{nope')
    expect(r).toMatchObject({ ok: false, errors: [{ code: 'invalid-json' }] })
  })

  it('rejects non-objects and unrelated JSON', () => {
    expect(loadProject([])).toMatchObject({ ok: false })
    expect(loadProject({ schemaVersion: 1 })).toMatchObject({ ok: false })
  })

  it('reports unsupported newer schema versions clearly', () => {
    const r = loadProject({ ...baseProject(), schemaVersion: 3 })
    expect(r).toMatchObject({ ok: false, errors: [{ code: 'unsupported-schema-version' }] })
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/schema version 3/)
  })

  it('rejects missing or invalid schema versions', () => {
    const { schemaVersion: _omit, ...rest } = baseProject()
    void _omit
    expect(loadProject(rest)).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid-schema-version' }]
    })
    expect(loadProject({ ...rest, schemaVersion: 0 })).toMatchObject({ ok: false })
  })

  it('rejects malformed layers with a located error', () => {
    const p = withLayers([photo('a', 1)])
    const bad = JSON.parse(JSON.stringify(p))
    bad.layers[0].opacity = 2
    const r = loadProject(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some((e) => e.path.startsWith('layers[0]'))).toBe(true)
    bad.layers[0].opacity = 1
    bad.layers[0].photoNumber = 0
    expect(loadProject(bad).ok).toBe(false)
    bad.layers[0].photoNumber = 1.5
    expect(loadProject(bad).ok).toBe(false)
    bad.layers[0].photoNumber = 1
    bad.layers[0].type = 'bogus'
    expect(loadProject(bad).ok).toBe(false)
  })

  it('does not silently drop unknown fields', () => {
    const r = loadProject({ ...baseProject(), surprise: true })
    expect(r.ok).toBe(false)
  })

  it('rejects invalid print configuration and composition', () => {
    const bad = JSON.parse(serializeProject(baseProject()))
    bad.canvas.print.dpi = 0
    expect(loadProject(bad).ok).toBe(false)
    bad.canvas.print.dpi = 600
    bad.canvas.print.width = -1
    expect(loadProject(bad).ok).toBe(false)
    bad.canvas.print.width = 2
    expect(loadProject(bad)).toMatchObject({ ok: false, errors: [{ code: 'invalid-composition' }] })
  })

  it('rejects unsafe asset paths and timestamps', () => {
    const p = baseProject()
    const asset = {
      id: 'x',
      filename: 'a.png',
      mediaType: 'image/png',
      path: '../a.png',
      source: { kind: 'upload' }
    }
    expect(loadProject({ ...p, assets: [asset] }).ok).toBe(false)
    expect(loadProject({ ...p, assets: [{ ...asset, path: 'assets/a.png' }] }).ok).toBe(true)
    expect(loadProject({ ...p, assets: [{ ...asset, path: '/abs/a.png' }] }).ok).toBe(false)
    expect(loadProject({ ...p, metadata: { ...p.metadata, createdAt: 'yesterday' } }).ok).toBe(
      false
    )
  })
})

describe('source compatibility metadata', () => {
  it('is optional', () => {
    expect(baseProject().sourceCompatibility).toBeUndefined()
    expect(load(serializeProject(baseProject())).sourceCompatibility).toBeUndefined()
  })

  it('retains JSON-safe unknown values with sorted keys', () => {
    const p: TemplateProject = {
      ...withLayers([photo('a', 1)]),
      sourceCompatibility: {
        dslrbooth: {
          importedAt: TS,
          project: { Z: 'last', Dimensions: 1, nested: { b: [1, null], a: true } },
          layers: { a: { Rotation: -3 } },
          unmapped: [{ tag: 'Mystery', attrs: { k: 'v' } }]
        }
      }
    }
    const text = serializeProject(p)
    expect(load(text)).toEqual(p)
    expect(text.indexOf('"Dimensions"')).toBeLessThan(text.indexOf('"Z"'))
  })

  it('rejects dangling layer references and non-JSON values', () => {
    const p = {
      ...withLayers([photo('a', 1)]),
      sourceCompatibility: { dslrbooth: { importedAt: TS, layers: { ghost: { a: 1 } } } }
    }
    expect(loadProject(p)).toMatchObject({
      ok: false,
      errors: [{ code: 'dangling-compatibility' }]
    })
    const q = {
      ...baseProject(),
      sourceCompatibility: { dslrbooth: { importedAt: TS, project: { f: () => 1 } } }
    }
    expect(loadProject(q).ok).toBe(false)
  })
})
