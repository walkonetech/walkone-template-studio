import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import yauzl from 'yauzl'
import { loadProject, type AssetReference, type TemplateProject } from '../domain'
import { checkAssetPaths } from './assetPaths'
import {
  ASSETS_PREFIX,
  MANIFEST_NAME,
  MAX_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  hasProjectExtension
} from './constants'
import { PersistenceError, fromFsError } from './errors'

export interface PackageScan {
  project: TemplateProject
  /** Entries under assets/ that no AssetReference points at. They are not extracted. */
  unreferencedEntries: string[]
}

export interface OpenPackage {
  scan: PackageScan
  /** Extracts every referenced asset into `<destDir>/assets/...`, verifying size and hash where recorded. */
  extractAssets(destDir: string): Promise<void>
  close(): void
}

function yauzlError(e: unknown): PersistenceError {
  if (e instanceof PersistenceError) return e
  const msg = e instanceof Error ? e.message : String(e)
  if (/relative path|absolute path|invalid characters/i.test(msg)) {
    return new PersistenceError(
      'unsafe-path',
      'The project file contains an unsafe path and was not opened.',
      msg,
      e
    )
  }
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
    return fromFsError(e, 'corrupted-package', 'The project file could not be read.')
  }
  return new PersistenceError(
    'corrupted-package',
    'The project file is damaged or is not a valid project package.',
    msg,
    e
  )
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (err, zip) => (err ? reject(yauzlError(err)) : resolve(zip))
    )
  })
}

function readEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = []
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry)
      if (entries.length > MAX_ENTRIES) {
        reject(
          new PersistenceError('corrupted-package', 'The project file contains too many entries.')
        )
        return
      }
      zip.readEntry()
    })
    zip.on('end', () => resolve(entries))
    zip.on('error', (e) => reject(yauzlError(e)))
    zip.readEntry()
  })
}

function openStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err ? reject(yauzlError(err)) : resolve(stream)))
  })
}

async function readEntryBuffer(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  max: number
): Promise<Buffer> {
  const stream = await openStream(zip, entry)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buf.length
    if (size > max)
      throw new PersistenceError('corrupted-package', 'project.json is unreasonably large.')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

/** Strict structural rules for the native package. Throws on the first violation. */
function validateEntries(entries: yauzl.Entry[]): {
  manifest: yauzl.Entry
  assets: Map<string, yauzl.Entry>
} {
  let manifest: yauzl.Entry | undefined
  const assets = new Map<string, yauzl.Entry>()
  const seenLower = new Set<string>()
  let total = 0
  for (const entry of entries) {
    const name = entry.fileName
    const isDir = name.endsWith('/')
    const key = name.toLowerCase()
    if (seenLower.has(key)) {
      throw new PersistenceError(
        'corrupted-package',
        'The project file contains duplicate entries.',
        name
      )
    }
    seenLower.add(key)
    if (
      name.startsWith('/') ||
      name.includes('\\') ||
      /^[a-zA-Z]:/.test(name) ||
      name.split('/').some((s, i, a) => s === '..' || s === '.' || (s === '' && i !== a.length - 1))
    ) {
      throw new PersistenceError(
        'unsafe-path',
        'The project file contains an unsafe path and was not opened.',
        name
      )
    }
    if (entry.generalPurposeBitFlag & 0x1) {
      throw new PersistenceError(
        'corrupted-package',
        'Encrypted project files are not supported.',
        name
      )
    }
    if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
      throw new PersistenceError(
        'corrupted-package',
        'The project file uses an unsupported compression method.',
        name
      )
    }
    const unixType = (entry.externalFileAttributes >>> 16) & 0o170000
    if (unixType === 0o120000) {
      throw new PersistenceError(
        'unsafe-path',
        'The project file contains a link, which is not allowed.',
        name
      )
    }
    total += entry.uncompressedSize
    if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new PersistenceError(
        'corrupted-package',
        'The project file expands to an unreasonable size.'
      )
    }
    if (isDir) {
      // Only the assets/ directory tree may appear as directory entries.
      if (name !== ASSETS_PREFIX && !name.startsWith(ASSETS_PREFIX)) {
        throw new PersistenceError(
          'corrupted-package',
          `Unexpected folder "${name}" in the project file.`,
          name
        )
      }
      continue
    }
    if (name === MANIFEST_NAME) {
      manifest = entry
    } else if (name.startsWith(ASSETS_PREFIX)) {
      assets.set(name, entry)
    } else {
      throw new PersistenceError(
        'corrupted-package',
        `Unexpected file "${name}" in the project file.`,
        name
      )
    }
  }
  if (!manifest) {
    throw new PersistenceError('corrupted-package', 'The project file has no project.json.')
  }
  return { manifest, assets }
}

function manifestToProject(buf: Buffer): TemplateProject {
  let raw: unknown
  try {
    raw = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, ''))
  } catch (e) {
    throw new PersistenceError('invalid-project', 'project.json is not valid JSON.', String(e), e)
  }
  const result = loadProject(raw)
  if (result.ok) return result.project
  const first = result.errors[0]
  const detail = result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; ')
  if (first?.code === 'unsupported-schema-version') {
    throw new PersistenceError('unsupported-version', first.message, detail)
  }
  throw new PersistenceError('invalid-project', 'The project data is invalid or damaged.', detail)
}

async function extractOne(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  asset: AssetReference,
  destDir: string
): Promise<void> {
  const target = join(destDir, ...asset.path.split('/'))
  await fs.mkdir(dirname(target), { recursive: true })
  const hash = createHash('sha256')
  let bytes = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length
      hash.update(chunk)
      cb(null, chunk)
    }
  })
  try {
    await pipeline(await openStream(zip, entry), meter, createWriteStream(target, { flags: 'wx' }))
  } catch (e) {
    await fs.rm(target, { force: true })
    throw e instanceof PersistenceError
      ? e
      : fromFsError(e, 'corrupted-package', 'An asset could not be extracted.')
  }
  if (asset.byteSize !== undefined && asset.byteSize !== bytes) {
    throw new PersistenceError(
      'corrupted-package',
      `Asset "${asset.filename}" does not match its recorded size.`,
      asset.path
    )
  }
  if (asset.sha256 !== undefined && asset.sha256 !== hash.digest('hex')) {
    throw new PersistenceError(
      'corrupted-package',
      `Asset "${asset.filename}" is damaged (checksum mismatch).`,
      asset.path
    )
  }
}

/**
 * Opens and structurally validates a `.boothproject` package without extracting anything.
 * Rules: only `project.json` and files under `assets/` are allowed; unsafe paths, links,
 * encryption, duplicates and case-insensitive collisions are rejected; the manifest must load
 * as a valid project; every referenced asset must be present. Unreferenced files under
 * `assets/` are reported (and not carried into the working session) rather than silently kept.
 */
export async function openPackage(
  file: string,
  options: { skipExtensionCheck?: boolean } = {}
): Promise<OpenPackage> {
  if (!options.skipExtensionCheck && !hasProjectExtension(file)) {
    throw new PersistenceError('invalid-request', 'Please choose a .boothproject file.')
  }
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile())
      throw new PersistenceError('file-not-found', 'The selected path is not a file.')
  } catch (e) {
    throw fromFsError(e, 'file-not-found', 'The project file could not be found.')
  }
  const zip = await openZip(file)
  try {
    const entries = await readEntries(zip)
    const { manifest, assets } = validateEntries(entries)
    const project = manifestToProject(await readEntryBuffer(zip, manifest, MAX_MANIFEST_BYTES))
    checkAssetPaths(project)
    const referenced = new Set<string>()
    for (const asset of project.assets) {
      if (!assets.has(asset.path)) {
        throw new PersistenceError(
          'missing-asset',
          `The project is missing the file for "${asset.filename}".`,
          asset.path
        )
      }
      referenced.add(asset.path)
    }
    const unreferencedEntries = [...assets.keys()].filter((n) => !referenced.has(n)).sort()
    return {
      scan: { project, unreferencedEntries },
      async extractAssets(destDir) {
        for (const asset of project.assets) {
          const entry = assets.get(asset.path)
          if (entry) await extractOne(zip, entry, asset, destDir)
        }
      },
      close: () => zip.close()
    }
  } catch (e) {
    zip.close()
    throw yauzlError(e)
  }
}
