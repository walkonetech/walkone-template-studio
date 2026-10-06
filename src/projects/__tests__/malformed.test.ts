import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PersistenceError } from '../errors'
import { openPackage } from '../packageReader'
import { createProject } from '../../domain'
import {
  ASSETS,
  manifestOf,
  PNG_A,
  sampleProject,
  sha,
  tempDir,
  useTempDirCleanup,
  writeRawPackage,
  type RawEntry
} from './helpers'

useTempDirCleanup()

async function openRaw(entries: RawEntry[]): Promise<PersistenceError | 'ok'> {
  const file = join(await tempDir(), 'raw.boothproject')
  await writeRawPackage(file, entries)
  try {
    const pkg = await openPackage(file)
    pkg.close()
    return 'ok'
  } catch (e) {
    if (e instanceof PersistenceError) return e
    throw e
  }
}

const good = (): RawEntry[] => {
  const p = sampleProject([ASSETS[0]!])
  return [
    { name: 'project.json', data: manifestOf(p) },
    { name: 'assets/background.png', data: PNG_A }
  ]
}

function codeOf(r: PersistenceError | 'ok'): string {
  return r === 'ok' ? 'ok' : r.code
}

describe('structural validation of a native package', () => {
  it('accepts a well-formed hand-built package (sanity check for the raw builder)', async () => {
    expect(codeOf(await openRaw(good()))).toBe('ok')
  })

  it('rejects a non-zip file as corrupted', async () => {
    const file = join(await tempDir(), 'x.boothproject')
    await writeFile(file, 'definitely not a zip')
    await expect(openPackage(file)).rejects.toMatchObject({ code: 'corrupted-package' })
  })

  it('rejects a missing project.json', async () => {
    expect(codeOf(await openRaw([{ name: 'assets/a.png', data: PNG_A }]))).toBe('corrupted-package')
  })

  it('rejects duplicate manifests', async () => {
    const [m, a] = good()
    expect(codeOf(await openRaw([m!, a!, m!]))).toBe('corrupted-package')
  })

  it('rejects a case-colliding duplicate entry', async () => {
    const [m, a] = good()
    expect(codeOf(await openRaw([m!, a!, { name: 'ASSETS/BACKGROUND.png', data: PNG_A }]))).toBe(
      'corrupted-package'
    )
  })

  it('rejects malformed JSON as invalid-project', async () => {
    const r = await openRaw([{ name: 'project.json', data: '{ nope' }])
    expect(codeOf(r)).toBe('invalid-project')
  })

  it('rejects a newer schema version as unsupported-version', async () => {
    const p = { ...JSON.parse(manifestOf(sampleProject())), schemaVersion: 99 }
    const r = await openRaw([{ name: 'project.json', data: JSON.stringify(p) }])
    expect(codeOf(r)).toBe('unsupported-version')
    expect((r as PersistenceError).message).toMatch(/99/)
  })

  it('rejects a schema-valid but integrity-invalid project', async () => {
    const p = sampleProject([ASSETS[0]!])
    p.layers[0]!.parentId = 'ghost'
    const r = await openRaw([
      { name: 'project.json', data: JSON.stringify(p) },
      { name: 'assets/background.png', data: PNG_A }
    ])
    expect(codeOf(r)).toBe('invalid-project')
  })

  it('rejects a referenced asset that is absent from the package', async () => {
    const r = await openRaw([
      { name: 'project.json', data: manifestOf(sampleProject([ASSETS[0]!])) }
    ])
    expect(codeOf(r)).toBe('missing-asset')
  })

  it('reports unreferenced assets as warnings and does not carry them', async () => {
    const file = join(await tempDir(), 'u.boothproject')
    await writeRawPackage(file, [...good(), { name: 'assets/leftover.png', data: PNG_A }])
    const pkg = await openPackage(file)
    try {
      expect(pkg.scan.unreferencedEntries).toEqual(['assets/leftover.png'])
    } finally {
      pkg.close()
    }
  })
})

describe('archive path safety', () => {
  it.each([
    ['parent traversal', '../evil.txt'],
    ['nested traversal', 'assets/../../evil.txt'],
    ['absolute path', '/etc/passwd'],
    ['windows drive path', 'C:/evil.txt'],
    ['backslash path', 'assets\\evil.png']
  ])('rejects %s', async (_label, name) => {
    const r = await openRaw([...good(), { name, data: 'x' }])
    expect(['unsafe-path', 'corrupted-package']).toContain(codeOf(r))
    expect(codeOf(r)).not.toBe('ok')
  })

  it('maps traversal and absolute paths to unsafe-path', async () => {
    expect(codeOf(await openRaw([...good(), { name: '../evil.txt', data: 'x' }]))).toBe(
      'unsafe-path'
    )
    expect(codeOf(await openRaw([...good(), { name: '/abs.txt', data: 'x' }]))).toBe('unsafe-path')
  })

  it('rejects unexpected top-level files and folders', async () => {
    expect(codeOf(await openRaw([...good(), { name: 'run.sh', data: '#!/bin/sh' }]))).toBe(
      'corrupted-package'
    )
    expect(codeOf(await openRaw([...good(), { name: 'scripts/', data: '' }]))).toBe(
      'corrupted-package'
    )
    expect(codeOf(await openRaw([...good(), { name: 'other/a.png', data: PNG_A }]))).toBe(
      'corrupted-package'
    )
  })

  it('allows directory entries only under assets/', async () => {
    expect(codeOf(await openRaw([{ name: 'assets/', data: '' }, ...good()]))).toBe('ok')
  })

  it('rejects symbolic links', async () => {
    expect(
      codeOf(
        await openRaw([...good(), { name: 'assets/link.png', data: 'target', unixMode: 0o120777 }])
      )
    ).toBe('unsafe-path')
  })

  it('rejects a manifest whose asset path is unsafe or outside assets/', async () => {
    for (const path of ['../a.png', 'project.json', 'other/a.png', 'assets/', 'assets/a:b.png']) {
      const p = sampleProject()
      p.assets.push({
        id: 'x',
        filename: 'a.png',
        mediaType: 'image/png',
        path,
        source: { kind: 'upload' }
      })
      const r = await openRaw([{ name: 'project.json', data: JSON.stringify(p) }])
      expect(codeOf(r), path).not.toBe('ok')
    }
  })

  it('rejects two assets that collide on a case-insensitive file system', async () => {
    const p = sampleProject()
    for (const [id, path] of [
      ['x1', 'assets/Logo.png'],
      ['x2', 'assets/logo.PNG']
    ] as const) {
      p.assets.push({
        id,
        filename: 'logo.png',
        mediaType: 'image/png',
        path,
        source: { kind: 'upload' }
      })
    }
    const r = await openRaw([{ name: 'project.json', data: JSON.stringify(p) }])
    expect(codeOf(r)).toBe('corrupted-package')
  })
})

describe('asset integrity metadata', () => {
  it('rejects an asset whose size does not match the manifest', async () => {
    const p = createProject({ name: 'x', design: 'strip-2x6-300' })
    p.assets.push({
      id: 'a',
      filename: 'a.png',
      mediaType: 'image/png',
      path: 'assets/a.png',
      byteSize: 5,
      source: { kind: 'upload' }
    })
    const file = join(await tempDir(), 'sz.boothproject')
    await writeRawPackage(file, [
      { name: 'project.json', data: manifestOf(p) },
      { name: 'assets/a.png', data: PNG_A }
    ])
    const { ProjectService } = await import('../service')
    const { RecentProjectsStore } = await import('../recents')
    const root = await tempDir()
    const svc = new ProjectService({
      sessionsRoot: join(root, 's'),
      recents: new RecentProjectsStore(join(root, 'r.json'))
    })
    await expect(svc.openFile(file)).rejects.toMatchObject({ code: 'corrupted-package' })
  })

  it('rejects an asset whose checksum does not match, and leaves no session behind', async () => {
    const p = createProject({ name: 'x', design: 'strip-2x6-300' })
    p.assets.push({
      id: 'a',
      filename: 'a.png',
      mediaType: 'image/png',
      path: 'assets/a.png',
      sha256: sha(Buffer.from('other')),
      source: { kind: 'upload' }
    })
    const file = join(await tempDir(), 'sum.boothproject')
    await writeRawPackage(file, [
      { name: 'project.json', data: manifestOf(p) },
      { name: 'assets/a.png', data: PNG_A }
    ])
    const { ProjectService } = await import('../service')
    const { RecentProjectsStore } = await import('../recents')
    const { readdir } = await import('node:fs/promises')
    const root = await tempDir()
    const svc = new ProjectService({
      sessionsRoot: join(root, 's'),
      recents: new RecentProjectsStore(join(root, 'r.json'))
    })
    await expect(svc.openFile(file)).rejects.toMatchObject({ code: 'corrupted-package' })
    expect(await readdir(join(root, 's'))).toEqual([])
  })
})
