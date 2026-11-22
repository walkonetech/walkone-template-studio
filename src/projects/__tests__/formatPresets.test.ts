import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getPixelSize,
  resolveCompositionCells,
  toInches,
  type FormatDefinition
} from '../../domain'
import { FormatPresetStore } from '../formatPresets'
import { createProjectHandlers, type ProjectDialogs } from '../handlers'
import { makeEnv, tempDir, useTempDirCleanup } from './helpers'

/**
 * Phase 7B B5.5: My formats (app-local format presets) and New Project from a format. Presets hold only the format
 * (size, arrangement, generic safe margin, cut guides): never artwork, layers, palette, photos or client details.
 */

useTempDirCleanup()

const magnet: FormatDefinition = {
  name: '2×3 Magnet Insert',
  width: 2,
  height: 3,
  dpi: 300,
  unit: 'in',
  arrangement: {
    kind: 'repeat',
    sheetWidth: 4,
    sheetHeight: 6,
    columns: 2,
    rows: 2,
    columnGap: 0,
    rowGap: 0,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    align: 'center'
  },
  safeMarginMm: 3,
  cutGuides: true
}

async function world() {
  const env = await makeEnv()
  const dir = await tempDir()
  const formats = new FormatPresetStore(join(dir, 'formats.json'))
  const saves: (string | null)[] = []
  const dialogs: ProjectDialogs = {
    showOpen: async () => null,
    showImportImages: async () => null,
    showSave: async () => (saves.length ? saves.shift()! : null)
  }
  const handlers = createProjectHandlers({
    service: env.service,
    recents: env.recents,
    dialogs,
    formats
  })
  return { env, dir, formats, handlers, saves }
}

describe('My formats store (app-local)', () => {
  it('save → list → rename → delete', async () => {
    const { formats } = await world()
    expect(await formats.list()).toEqual([])
    const a = await formats.save(magnet)
    const b = await formats.save({
      ...magnet,
      name: 'Square',
      width: 3,
      height: 3,
      arrangement: { kind: 'exact' }
    })
    expect((await formats.list()).map((p) => p.format.name)).toEqual([
      'Square',
      '2×3 Magnet Insert'
    ])
    const renamed = await formats.rename(a.id, '  Fridge magnet  ')
    expect(renamed.format.name).toBe('Fridge magnet')
    expect(renamed.format.width).toBe(2)
    await formats.remove(b.id)
    expect((await formats.list()).map((p) => p.format.name)).toEqual(['Fridge magnet'])
  })
  it('stores only format setup, as plain JSON of the format definition', async () => {
    const { formats, dir } = await world()
    await formats.save(magnet)
    const raw = JSON.parse(await fs.readFile(join(dir, 'formats.json'), 'utf8')) as {
      version: number
      items: { format: Record<string, unknown> }[]
    }
    expect(raw.version).toBe(1)
    expect(Object.keys(raw.items[0]!).sort()).toEqual(['createdAt', 'format', 'id', 'updatedAt'])
    expect(Object.keys(raw.items[0]!.format).sort()).toEqual([
      'arrangement',
      'cutGuides',
      'dpi',
      'height',
      'name',
      'safeMarginMm',
      'unit',
      'width'
    ])
  })
  it('refuses invalid formats and anything extra (no artwork, layers or client data can be smuggled in)', async () => {
    const { formats } = await world()
    await expect(formats.save({ ...magnet, width: 3, height: 4 })).rejects.toThrow(/never scaled/)
    await expect(
      formats.save({ ...magnet, layers: [] } as unknown as FormatDefinition)
    ).rejects.toThrow(/not valid/)
    await expect(
      formats.save({ ...magnet, clientName: 'x' } as unknown as FormatDefinition)
    ).rejects.toThrow(/not valid/)
  })
  it('rename / delete of an unknown id (e.g. a built-in format) is refused', async () => {
    const { formats } = await world()
    await expect(formats.rename('strip-2x6-600', 'X')).rejects.toThrow(/no longer exists/)
    await expect(formats.remove('photo-4x6-portrait-600')).rejects.toThrow(/no longer exists/)
    await expect(formats.rename('x', '   ')).rejects.toThrow(/1 to 80/)
  })
  it('a damaged list is set aside and treated as empty', async () => {
    const { formats, dir } = await world()
    await fs.writeFile(join(dir, 'formats.json'), '{not json')
    expect(await formats.list()).toEqual([])
    await expect(fs.stat(join(dir, 'formats.json.corrupt'))).resolves.toBeTruthy()
  })
})

describe('format IPC handlers', () => {
  it('list / save / rename / delete through the handlers', async () => {
    const { handlers } = await world()
    const saved = await handlers.formatsSave({ format: magnet })
    expect(saved.status).toBe('ok')
    if (saved.status !== 'ok') return
    expect(await handlers.formatsRename({ id: saved.value.id, name: 'Magnet' })).toMatchObject({
      status: 'ok',
      value: { format: { name: 'Magnet' } }
    })
    const listed = await handlers.formatsList()
    expect(listed.status === 'ok' && listed.value.map((p) => p.format.name)).toEqual(['Magnet'])
    expect(await handlers.formatsDelete({ id: saved.value.id })).toEqual({
      status: 'ok',
      value: null
    })
    expect(await handlers.formatsDelete({ id: saved.value.id })).toMatchObject({
      status: 'error',
      error: { code: 'format-not-found' }
    })
  })
  it('an invalid format is a plain error, not a crash', async () => {
    const { handlers } = await world()
    expect(await handlers.formatsSave({ format: { ...magnet, columns: 1 } })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
    expect(
      await handlers.formatsSave({ format: { ...magnet, width: 3, height: 4 } })
    ).toMatchObject({
      status: 'error',
      error: { code: 'format-invalid' }
    })
  })
})

describe('New project from a format (one creation path)', () => {
  it('creates a normal project with the format geometry, no printer dependency, opened as new', async () => {
    const { handlers } = await world()
    const r = await handlers.newProject({ name: 'Magnets', format: magnet })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const p = r.value.project
    expect(r.value.dirty).toBe(true)
    expect(getPixelSize(p.canvas.print)).toEqual({ width: 600, height: 900 })
    expect(getPixelSize(p.output.print)).toEqual({ width: 1200, height: 1800 })
    expect(resolveCompositionCells(p.canvas.print, p.output)).toHaveLength(4)
    expect(p.canvas.safeMarginMm).toBe(3)
    expect(JSON.stringify(p)).not.toMatch(/printer|profile|dnp|cut/i)
  })
  it('save → reopen keeps the custom geometry and composition', async () => {
    const { handlers, saves, dir } = await world()
    const keychain: FormatDefinition = {
      ...magnet,
      name: 'Keychain',
      unit: 'mm',
      width: toInches(50, 'mm', 300),
      height: toInches(70, 'mm', 300),
      arrangement: { kind: 'exact' }
    }
    const r = await handlers.newProject({ name: 'Keys', format: keychain })
    if (r.status !== 'ok') throw new Error('expected ok')
    const path = join(dir, 'Keys.boothproject')
    saves.push(path)
    const saved = await handlers.saveAs(null, {
      sessionId: r.value.sessionId,
      project: r.value.project
    })
    expect(saved.status).toBe('ok')
    await handlers.close({ sessionId: r.value.sessionId })
    const reopened = await handlers.openRecent({ path })
    expect(reopened.status).toBe('ok')
    if (reopened.status !== 'ok') return
    expect(reopened.value.project.canvas).toEqual(r.value.project.canvas)
    expect(reopened.value.project.output).toEqual(r.value.project.output)
    expect(getPixelSize(reopened.value.project.canvas.print)).toEqual({ width: 591, height: 827 })
  })
  it('an invalid format never creates a project', async () => {
    const { handlers } = await world()
    expect(
      await handlers.newProject({ name: 'X', format: { ...magnet, width: 3, height: 4 } })
    ).toMatchObject({ status: 'error', error: { code: 'format-invalid' } })
    expect(
      await handlers.newProject({ name: 'X', format: { ...magnet, width: -1 } })
    ).toMatchObject({ status: 'error', error: { code: 'invalid-request' } })
  })
  it('built-in presets still create exactly the pre-B5.5 projects', async () => {
    const { handlers } = await world()
    const r = await handlers.newProject({ name: 'Strip', preset: 'strip-2x6-600' })
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.value.project.output).toEqual({
      print: { width: 4, height: 6, unit: 'in', dpi: 600 },
      layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 }
    })
    expect('safeMarginMm' in r.value.project.canvas).toBe(false)
  })
})
