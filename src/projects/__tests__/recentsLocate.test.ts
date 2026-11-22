import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectHandlers, type ProjectDialogs } from '../handlers'
import { RecentProjectsStore } from '../recents'
import { makeEnv, tempDir, useTempDirCleanup } from './helpers'

/**
 * Phase 7B B5.1: Locate… on a missing recent card reconnects THAT card to the moved file (one logical project, one
 * card). Cancel changes nothing. Keyed by the project id the recent list already stores; recents stay app-local and
 * the project file is not touched.
 */

useTempDirCleanup()

async function world() {
  const env = await makeEnv()
  const opens: (string | null)[] = []
  const saves: (string | null)[] = []
  const dialogs: ProjectDialogs = {
    showOpen: async () => (opens.length ? opens.shift()! : null),
    showImportImages: async () => null,
    showSave: async () => (saves.length ? saves.shift()! : null)
  }
  const handlers = createProjectHandlers({ service: env.service, recents: env.recents, dialogs })
  return { env, handlers, opens, saves }
}

/** Saves a synthetic project at `<dir>/<name>.boothproject`, closes it, and returns the path. */
async function savedProject(w: Awaited<ReturnType<typeof world>>, dir: string, name: string) {
  const created = await w.handlers.newProject({ name, preset: 'strip-2x6-300' })
  if (created.status !== 'ok') throw new Error('expected ok')
  const path = join(dir, `${name}.boothproject`)
  w.saves.push(path)
  const saved = await w.handlers.saveAs(null, {
    sessionId: created.value.sessionId,
    project: created.value.project
  })
  if (saved.status !== 'ok') throw new Error('save failed')
  await w.handlers.close({ sessionId: created.value.sessionId })
  return { path }
}

const listed = async (h: ReturnType<typeof createProjectHandlers>) => {
  const r = await h.recents()
  if (r.status !== 'ok') throw new Error('expected ok')
  return r.value
}

describe('recent projects: Locate… reconciles the moved file (B5.1)', () => {
  it('save → move → File not found → Locate → one recovered card that reopens', async () => {
    const dir = await tempDir()
    const w = await world()
    const { handlers, opens } = w
    const { path } = await savedProject(w, dir, 'Wedding')
    const before = await listed(handlers)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ path, exists: true, name: 'Wedding' })

    const moved = join(dir, 'moved', 'Wedding.boothproject')
    await fs.mkdir(join(dir, 'moved'))
    await fs.rename(path, moved)
    expect(await listed(handlers)).toMatchObject([{ path, exists: false }])

    opens.push(moved)
    const located = await handlers.locateRecent(null, { path })
    expect(located).toMatchObject({ status: 'ok', value: { fileName: 'Wedding.boothproject' } })
    if (located.status !== 'ok') throw new Error('expected ok')
    await handlers.close({ sessionId: located.value.sessionId })

    const after = await listed(handlers)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ path: moved, exists: true, name: 'Wedding' })
    expect(after[0]!.print).toEqual(before[0]!.print)
    expect(after.some((r) => !r.exists)).toBe(false)

    const reopened = await handlers.openRecent({ path: moved })
    expect(reopened).toMatchObject({ status: 'ok', value: { fileName: 'Wedding.boothproject' } })
  })

  it('Locate → Cancel leaves the missing card exactly as it was', async () => {
    const dir = await tempDir()
    const w = await world()
    const { handlers, opens } = w
    const { path } = await savedProject(w, dir, 'Gala')
    await fs.rename(path, join(dir, 'elsewhere.boothproject'))
    const before = await listed(handlers)
    opens.push(null)
    expect(await handlers.locateRecent(null, { path })).toEqual({ status: 'cancelled' })
    expect(await listed(handlers)).toEqual(before)
  })

  it('opening the moved file with File › Open also replaces the missing card of the same project', async () => {
    const dir = await tempDir()
    const w = await world()
    const { handlers, opens } = w
    const { path } = await savedProject(w, dir, 'Party')
    const moved = join(dir, 'Party renamed.boothproject')
    await fs.rename(path, moved)
    opens.push(moved)
    const r = await handlers.open(null)
    expect(r.status).toBe('ok')
    const after = await listed(handlers)
    expect(after.map((x) => [x.path, x.exists])).toEqual([[moved, true]])
  })

  it('locating a DIFFERENT project opens it but keeps the missing card', async () => {
    const dir = await tempDir()
    const w = await world()
    const { handlers, opens } = w
    const a = await savedProject(w, dir, 'Alpha')
    const b = await savedProject(w, dir, 'Beta')
    await fs.rename(a.path, join(dir, 'gone.boothproject'))
    opens.push(b.path)
    expect((await handlers.locateRecent(null, { path: a.path })).status).toBe('ok')
    const after = await listed(handlers)
    expect(after.map((x) => [x.name, x.exists])).toEqual([
      ['Beta', true],
      ['Alpha', false]
    ])
  })

  it('never removes a card whose file still exists (two real copies stay two cards)', async () => {
    const dir = await tempDir()
    const store = new RecentProjectsStore(join(dir, 'recents.json'))
    const one = join(dir, 'one.boothproject')
    const two = join(dir, 'two.boothproject')
    await fs.writeFile(one, 'x')
    await fs.writeFile(two, 'x')
    await store.add({ path: one, projectId: 'p1', name: 'Copy' })
    await store.add({ path: two, projectId: 'p1', name: 'Copy' }, { replacing: one })
    expect((await store.list()).map((x) => x.path)).toEqual([two, one])
  })

  it('an older entry without a project id is replaced only through its own Locate…', async () => {
    const dir = await tempDir()
    const store = new RecentProjectsStore(join(dir, 'recents.json'))
    const old = join(dir, 'old.boothproject')
    const other = join(dir, 'other-missing.boothproject')
    const found = join(dir, 'found.boothproject')
    await fs.writeFile(found, 'x')
    await store.add({ path: other, name: 'Other' })
    await store.add({ path: old, name: 'Legacy' })
    await store.add({ path: found, projectId: 'p9', name: 'Legacy' }, { replacing: old })
    expect((await store.list()).map((x) => [x.path, x.exists])).toEqual([
      [found, true],
      [other, false]
    ])
  })

  it('rejects Locate for a path that is not in the recent list (no dialog)', async () => {
    const w = await world()
    const { handlers, opens } = w
    opens.push('/should/not/be/used.boothproject')
    expect(await handlers.locateRecent(null, { path: '/etc/passwd' })).toMatchObject({
      status: 'error',
      error: { code: 'not-allowed' }
    })
    expect(opens).toHaveLength(1)
  })
})
