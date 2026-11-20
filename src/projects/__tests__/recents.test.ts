import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RecentProjectsStore } from '../recents'
import { tempDir, useTempDirCleanup } from './helpers'

useTempDirCleanup()

async function setup(
  max?: number
): Promise<{ store: RecentProjectsStore; dir: string; file: string }> {
  const dir = await tempDir()
  const file = join(dir, 'recents.json')
  return { store: new RecentProjectsStore(file, max), dir, file }
}

describe('recent projects', () => {
  it('adds, orders most-recent-first and moves a re-opened project to the top', async () => {
    const { store, dir } = await setup()
    const a = join(dir, 'a.boothproject')
    const b = join(dir, 'b.boothproject')
    await writeFile(a, 'x')
    await writeFile(b, 'x')
    await store.add({ path: a, name: 'A', projectId: 'pa' })
    await store.add({ path: b, name: 'B' })
    expect((await store.list()).map((i) => i.name)).toEqual(['B', 'A'])
    await store.add({ path: a, name: 'A renamed' })
    const list = await store.list()
    expect(list.map((i) => i.name)).toEqual(['A renamed', 'B'])
    expect(list.every((i) => i.exists)).toBe(true)
  })

  it('is bounded', async () => {
    const { store, dir } = await setup(3)
    for (let i = 0; i < 6; i++)
      await store.add({ path: join(dir, `p${i}.boothproject`), name: `P${i}` })
    expect((await store.list()).map((i) => i.name)).toEqual(['P5', 'P4', 'P3'])
  })

  it('keeps missing files listed but flagged, and can remove them', async () => {
    const { store, dir } = await setup()
    const gone = join(dir, 'gone.boothproject')
    await store.add({ path: gone, name: 'Gone' })
    expect((await store.list())[0]).toMatchObject({ name: 'Gone', exists: false })
    expect(await store.has(gone)).toBe(true)
    await store.remove(gone)
    expect(await store.list()).toEqual([])
  })

  it('stores only path, name, id and time (no project contents)', async () => {
    const { store, dir, file } = await setup()
    await store.add({ path: join(dir, 'a.boothproject'), name: 'A', projectId: 'p1' })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(Object.keys(saved.items[0]).sort()).toEqual([
      'lastOpenedAt',
      'name',
      'path',
      'projectId'
    ])
  })

  it('may record the design print size for the Start screen card (B3); older entries without it still load', async () => {
    const { store, dir, file } = await setup()
    const print = { width: 2, height: 6, unit: 'in' as const, dpi: 600 }
    await store.add({ path: join(dir, 'a.boothproject'), name: 'A', print })
    expect((await store.list())[0]?.print).toEqual(print)
    // An entry written before B3 (no print) is still valid.
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        items: [
          {
            path: join(dir, 'old.boothproject'),
            name: 'Old',
            lastOpenedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
    )
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.print).toBeUndefined()
  })

  it.each([
    ['not json at all'],
    ['{"version":2,"items":[]}'],
    ['{"version":1,"items":[{"path":1}]}'],
    ['[]']
  ])('treats a corrupted file (%s) as empty, sets it aside, and keeps working', async (content) => {
    const { store, dir, file } = await setup()
    await writeFile(file, content)
    expect(await store.list()).toEqual([])
    expect(await readFile(`${file}.corrupt`, 'utf8')).toBe(content)
    await store.add({ path: join(dir, 'a.boothproject'), name: 'A' })
    expect(await store.list()).toHaveLength(1)
  })

  it('handles a missing file', async () => {
    const { store } = await setup()
    expect(await store.list()).toEqual([])
  })
})
