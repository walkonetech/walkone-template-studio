import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { PersistenceError, fromFsError } from './errors'

/** File operations that can be replaced in tests to simulate failures. */
export interface FsOps {
  rename(from: string, to: string): Promise<void>
}
export const defaultFsOps: FsOps = { rename: (a, b) => fs.rename(a, b) }

export function tempSiblingPath(dest: string): string {
  return `${dest}.tmp-${randomBytes(4).toString('hex')}`
}

async function fsyncFile(path: string): Promise<void> {
  const handle = await fs.open(path, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function fsyncDirBestEffort(dir: string): Promise<void> {
  try {
    const handle = await fs.open(dir, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Directory fsync is unsupported on some platforms (e.g. Windows); ignore.
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.stat(path)
    return true
  } catch {
    return false
  }
}

const RENAME_OVER_FAILURES = new Set(['EPERM', 'EEXIST', 'EBUSY', 'EACCES', 'ENOTEMPTY'])

/**
 * Replaces `dest` with the completed `tmp` file.
 * 1. Flush `tmp` to disk.
 * 2. `rename(tmp, dest)` — atomic replace on POSIX and normally on Windows (MoveFileEx replace).
 * 3. If the OS refuses to rename over the existing file, move the old file to a backup name,
 *    rename `tmp` into place, then delete the backup; if the second step fails, restore the backup.
 * The previous file is never truncated. On any failure `tmp` is removed and the original stays.
 */
export async function replaceFile(
  tmp: string,
  dest: string,
  ops: FsOps = defaultFsOps
): Promise<void> {
  try {
    await fsyncFile(tmp)
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw fromFsError(e, 'write-failed', 'The project could not be written to disk.')
  }
  try {
    await ops.rename(tmp, dest)
    await fsyncDirBestEffort(dirname(dest))
    return
  } catch (first) {
    const code = (first as NodeJS.ErrnoException).code
    const canFallBack = code !== undefined && RENAME_OVER_FAILURES.has(code) && (await exists(dest))
    if (!canFallBack) {
      await fs.rm(tmp, { force: true })
      throw fromFsError(
        first,
        'replace-failed',
        'The existing project could not be replaced. Your previous file is unchanged.'
      )
    }
    const backup = tempSiblingPath(dest) + '.bak'
    try {
      await ops.rename(dest, backup)
    } catch (e) {
      await fs.rm(tmp, { force: true })
      throw fromFsError(
        e,
        'replace-failed',
        'The existing project could not be replaced. Your previous file is unchanged.'
      )
    }
    try {
      await ops.rename(tmp, dest)
    } catch (e) {
      try {
        await ops.rename(backup, dest)
      } catch {
        throw new PersistenceError(
          'replace-failed',
          'Saving failed and the previous file could not be restored automatically. A backup copy was kept next to the project.',
          `backup=${backup}`,
          e
        )
      }
      await fs.rm(tmp, { force: true })
      throw fromFsError(
        e,
        'replace-failed',
        'The existing project could not be replaced. Your previous file is unchanged.'
      )
    }
    await fs.rm(backup, { force: true })
    await fsyncDirBestEffort(dirname(dest))
  }
}

/** Writes a small text file atomically (temp file in the same directory, then replace). */
export async function writeFileAtomic(
  dest: string,
  text: string,
  ops: FsOps = defaultFsOps
): Promise<void> {
  const tmp = join(dirname(dest), `.${basename(tempSiblingPath(dest))}`)
  try {
    await fs.writeFile(tmp, text, 'utf8')
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw fromFsError(e, 'write-failed', 'A file could not be written.')
  }
  await replaceFile(tmp, dest, ops)
}
