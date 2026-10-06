import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { replaceFile, writeFileAtomic, defaultFsOps, type FsOps } from '../atomicFile'
import { tempDir, useTempDirCleanup } from './helpers'

useTempDirCleanup()

const err = (code: string): Error => Object.assign(new Error(code), { code })

describe('replaceFile', () => {
  it('replaces the destination', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'dest'), 'old')
    await writeFile(join(dir, 'tmp'), 'new')
    await replaceFile(join(dir, 'tmp'), join(dir, 'dest'))
    expect(await readFile(join(dir, 'dest'), 'utf8')).toBe('new')
    expect(await readdir(dir)).toEqual(['dest'])
  })

  it('keeps the old file and removes the temp file when rename fails', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'dest'), 'old')
    await writeFile(join(dir, 'tmp'), 'new')
    const ops: FsOps = {
      rename: async () => {
        throw err('EIO')
      }
    }
    await expect(replaceFile(join(dir, 'tmp'), join(dir, 'dest'), ops)).rejects.toMatchObject({
      code: 'replace-failed'
    })
    expect(await readFile(join(dir, 'dest'), 'utf8')).toBe('old')
    expect(await readdir(dir)).toEqual(['dest'])
  })

  it('falls back to backup-and-swap when the OS refuses to rename over an existing file', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'dest'), 'old')
    await writeFile(join(dir, 'tmp'), 'new')
    let first = true
    const ops: FsOps = {
      rename: async (a, b) => {
        if (first && b === join(dir, 'dest')) {
          first = false
          throw err('EPERM')
        }
        return defaultFsOps.rename(a, b)
      }
    }
    await replaceFile(join(dir, 'tmp'), join(dir, 'dest'), ops)
    expect(await readFile(join(dir, 'dest'), 'utf8')).toBe('new')
    expect(await readdir(dir)).toEqual(['dest'])
  })

  it('restores the backup if the final rename fails during the fallback', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'dest'), 'old')
    await writeFile(join(dir, 'tmp'), 'new')
    let tmpAttempts = 0
    const ops: FsOps = {
      rename: async (a, b) => {
        if (a === join(dir, 'tmp')) {
          tmpAttempts++
          throw err(tmpAttempts === 1 ? 'EPERM' : 'EIO')
        }
        return defaultFsOps.rename(a, b)
      }
    }
    await expect(replaceFile(join(dir, 'tmp'), join(dir, 'dest'), ops)).rejects.toMatchObject({
      code: 'replace-failed'
    })
    expect(await readFile(join(dir, 'dest'), 'utf8')).toBe('old')
    expect(await readdir(dir)).toEqual(['dest'])
  })
})

describe('writeFileAtomic', () => {
  it('writes and overwrites without leaving temp files', async () => {
    const dir = await tempDir()
    await writeFileAtomic(join(dir, 'f.json'), 'one')
    await writeFileAtomic(join(dir, 'f.json'), 'two')
    expect(await readFile(join(dir, 'f.json'), 'utf8')).toBe('two')
    expect(await readdir(dir)).toEqual(['f.json'])
  })
})
