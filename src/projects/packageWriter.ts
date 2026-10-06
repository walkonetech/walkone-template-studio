import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { serializeProject, type TemplateProject } from '../domain'
import { checkAssetPaths } from './assetPaths'
import { replaceFile, tempSiblingPath, defaultFsOps, type FsOps } from './atomicFile'
import { MANIFEST_NAME, hasProjectExtension } from './constants'
import { PersistenceError, fromFsError } from './errors'
import { openPackage } from './packageReader'

// Constructed in local time so the DOS timestamp fields are identical on every machine.
const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0)
const FILE_MODE = 0o100644
const COMPRESSED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export interface WritePackageOptions {
  /** Directory containing the session's `assets/` tree. */
  sessionDir: string
  project: TemplateProject
  destPath: string
  fsOps?: FsOps
}

/**
 * Verifies that every asset the project references exists in the session as a regular file
 * (and matches its recorded size when known). Hashes are not recomputed on every save; they are
 * checked when a package is opened.
 */
export async function verifySessionAssets(
  sessionDir: string,
  project: TemplateProject
): Promise<void> {
  checkAssetPaths(project)
  for (const asset of project.assets) {
    const file = join(sessionDir, ...asset.path.split('/'))
    let stat
    try {
      stat = await fs.stat(file)
    } catch {
      throw new PersistenceError(
        'missing-asset',
        `The file for asset "${asset.filename}" is missing.`,
        asset.path
      )
    }
    if (!stat.isFile()) {
      throw new PersistenceError(
        'missing-asset',
        `Asset "${asset.filename}" is not a regular file.`,
        asset.path
      )
    }
    if (asset.byteSize !== undefined && asset.byteSize !== stat.size) {
      throw new PersistenceError(
        'corrupted-package',
        `Asset "${asset.filename}" changed size unexpectedly.`,
        asset.path
      )
    }
  }
}

/**
 * Builds a `.boothproject` next to `destPath` as a temp file, verifies it by reopening it,
 * then atomically replaces the destination. Only referenced assets are packaged. Output order
 * and metadata are fixed, so the same project and assets produce the same bytes.
 */
export async function writePackage(options: WritePackageOptions): Promise<void> {
  const { sessionDir, project, destPath } = options
  if (!hasProjectExtension(destPath)) {
    throw new PersistenceError('invalid-request', 'Project files must end in .boothproject.')
  }
  let manifest: string
  try {
    manifest = serializeProject(project)
  } catch (e) {
    throw new PersistenceError(
      'invalid-project',
      'The project is not valid and cannot be saved.',
      String(e),
      e
    )
  }
  await verifySessionAssets(sessionDir, project)

  const tmp = tempSiblingPath(destPath)
  try {
    const zip = new yazl.ZipFile()
    const done = pipeline(zip.outputStream, createWriteStream(tmp, { flags: 'wx' }))
    zip.addBuffer(Buffer.from(manifest, 'utf8'), MANIFEST_NAME, {
      mtime: FIXED_MTIME,
      mode: FILE_MODE,
      compress: true
    })
    const assets = [...project.assets].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    )
    for (const asset of assets) {
      zip.addFile(join(sessionDir, ...asset.path.split('/')), asset.path, {
        mtime: FIXED_MTIME,
        mode: FILE_MODE,
        compress: !COMPRESSED_TYPES.has(asset.mediaType)
      })
    }
    zip.end()
    await done
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw fromFsError(e, 'write-failed', 'The project could not be written.')
  }

  // Verify the finished temp package before it can replace anything.
  try {
    const pkg = await openPackage(tmp, { skipExtensionCheck: true })
    try {
      const names = new Set(pkg.scan.project.assets.map((a) => a.path))
      if (
        pkg.scan.project.id !== project.id ||
        names.size !== project.assets.length ||
        pkg.scan.unreferencedEntries.length > 0
      ) {
        throw new PersistenceError('corrupted-package', 'The written project failed verification.')
      }
    } finally {
      pkg.close()
    }
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw e instanceof PersistenceError
      ? e
      : fromFsError(e, 'write-failed', 'The written project failed verification.')
  }

  await replaceFile(tmp, destPath, options.fsOps ?? defaultFsOps)
}
