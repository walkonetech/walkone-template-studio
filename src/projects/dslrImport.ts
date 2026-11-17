import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import yauzl from 'yauzl'
import {
  mapDslrTemplate,
  referencedEntries,
  type DslrImageFacts,
  type DslrImportLayout,
  type DslrImportResult
} from '../import/dslrbooth/map'
import { DslrImportError } from '../import/dslrbooth/template'
import { MAX_IMPORT_BYTES, inspectImage } from './imageInspect'
import { PersistenceError } from './errors'
import type { InitialAsset } from './session'

/**
 * Reading a dslrBooth template ZIP (DSLR Booth importer, main process). The ZIP comes from outside, so it is read
 * defensively: entry count and sizes are capped, unsafe paths/links/encryption are refused, and nothing is extracted
 * to disk — the referenced pictures are read into memory, checked like any image import, and handed to the pure
 * mapper (`src/import/dslrbooth/map.ts`). The project is created by the ProjectService from the result.
 */

export const DSLR_IMPORT_LIMITS = {
  maxEntries: 500,
  maxXmlBytes: 4 * 1024 * 1024,
  maxPreviewBytes: 64 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxZipBytes: 2 * 1024 * 1024 * 1024
} as const

const TEMPLATE = 'template.xml'

const bad = (message: string, detail?: string): PersistenceError =>
  new PersistenceError('import-invalid', message, detail)

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      file,
      // strictFileNames off: Windows tools may write "\" separators; yauzl still refuses absolute and ".." paths.
      { lazyEntries: true, autoClose: false, strictFileNames: false, validateEntrySizes: true },
      (err, zip) =>
        err
          ? reject(
              /relative path|absolute path|invalid characters/i.test(err.message)
                ? new PersistenceError(
                    'unsafe-path',
                    'The ZIP contains an unsafe path and was not imported.',
                    err.message
                  )
                : bad('This file is not a readable ZIP.', err.message)
            )
          : resolve(zip)
    )
  })
}

function listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = []
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry)
      if (entries.length > DSLR_IMPORT_LIMITS.maxEntries) {
        reject(bad('The ZIP contains too many files to be a dslrBooth template.'))
        return
      }
      zip.readEntry()
    })
    zip.on('end', () => resolve(entries))
    zip.on('error', (e: Error) =>
      reject(
        /relative path|absolute path|invalid characters/i.test(e.message)
          ? new PersistenceError(
              'unsafe-path',
              'The ZIP contains an unsafe path and was not imported.',
              e.message
            )
          : bad('The ZIP is damaged.', e.message)
      )
    )
    zip.readEntry()
  })
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, max: number): Promise<Uint8Array> {
  if (entry.uncompressedSize > max)
    return Promise.reject(bad(`“${entry.fileName}” in the ZIP is too large.`))
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err) return reject(bad('The ZIP is damaged.', err.message))
      const chunks: Buffer[] = []
      let size = 0
      stream.on('data', (c: Buffer) => {
        size += c.length
        if (size > max) {
          stream.destroy()
          reject(bad(`“${entry.fileName}” in the ZIP is too large.`))
          return
        }
        chunks.push(c)
      })
      stream.on('error', (e) => reject(bad('The ZIP is damaged.', e.message)))
      stream.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    })
  })
}

/** Junk added by macOS / Windows when zipping a folder; never part of a template. */
const isJunk = (name: string): boolean =>
  name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/i.test(name) || /(^|\/)Thumbs\.db$/i.test(name)

export interface DslrPackageAnalysis {
  result: DslrImportResult
  /** The package's own preview (shown next to the import report; never imported). */
  preview: { data: Uint8Array; width: number; height: number } | null
  /** Bytes for each asset of `result.project`, ready for a new working session. */
  initialAssets: InitialAsset[]
}

/**
 * Reads and maps a dslrBooth template ZIP. Throws PersistenceError with a user-safe message when the file cannot be
 * imported at all; everything recoverable is in `result.items`.
 */
export async function analyzeDslrPackage(
  path: string,
  layout?: DslrImportLayout
): Promise<DslrPackageAnalysis> {
  const stat = await fs.stat(path).catch(() => null)
  if (!stat?.isFile()) throw new PersistenceError('file-not-found', 'That file could not be found.')
  if (stat.size > DSLR_IMPORT_LIMITS.maxZipBytes)
    throw bad('That file is too large to be a dslrBooth template.')
  const zip = await openZip(path)
  try {
    const all = await listEntries(zip)
    const files = new Map<string, yauzl.Entry>()
    let total = 0
    for (const entry of all) {
      const name = entry.fileName.replace(/\\/g, '/')
      if (name.endsWith('/') || isJunk(name)) continue
      if (entry.generalPurposeBitFlag & 0x1) throw bad('Password-protected ZIPs are not supported.')
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
        throw bad('The ZIP uses an unsupported compression method.')
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
        throw new PersistenceError('unsafe-path', 'The ZIP contains a link, which is not allowed.')
      total += entry.uncompressedSize
      if (total > DSLR_IMPORT_LIMITS.maxTotalBytes)
        throw bad('The ZIP expands to an unreasonable size.')
      if (files.has(name)) throw bad(`The ZIP contains “${name}” twice.`)
      files.set(name, entry)
    }

    // template.xml at the top, or inside ONE folder (a template folder zipped again on a Mac or PC).
    const candidates = [...files.keys()].filter(
      (n) => (n.split('/').pop() ?? '').toLowerCase() === TEMPLATE
    )
    const top = candidates.filter((n) => !n.includes('/'))
    const chosen = top.length === 1 ? top[0] : candidates.length === 1 ? candidates[0] : undefined
    if (chosen === undefined)
      throw bad(
        candidates.length === 0
          ? 'This ZIP is not a dslrBooth template: it has no template.xml.'
          : 'This ZIP holds more than one template. Import them one at a time.'
      )
    const folder = chosen.slice(0, chosen.length - TEMPLATE.length)
    const local = new Map<string, yauzl.Entry>()
    for (const [name, entry] of files)
      if (name.startsWith(folder)) local.set(name.slice(folder.length), entry)
    const entryNames = [...local.keys()].sort()
    const xmlName = entryNames.find((n) => n.toLowerCase() === TEMPLATE) as string
    const templateXml = await readEntry(
      zip,
      local.get(xmlName) as yauzl.Entry,
      DSLR_IMPORT_LIMITS.maxXmlBytes
    )
    const xmlNames = entryNames.map((n) => (n === xmlName ? TEMPLATE : n))

    let wanted: string[]
    try {
      wanted = referencedEntries(templateXml, xmlNames)
    } catch (e) {
      if (e instanceof DslrImportError) throw bad(e.message)
      throw e
    }
    const bytes = new Map<string, Uint8Array>()
    const images = new Map<string, DslrImageFacts>()
    for (const name of wanted) {
      const entry = local.get(name) as yauzl.Entry
      try {
        const data = await readEntry(zip, entry, MAX_IMPORT_BYTES)
        const info = inspectImage(data)
        bytes.set(name, data)
        images.set(name, {
          ok: true,
          mediaType: info.mediaType,
          extension: info.extension,
          pixelWidth: info.pixelWidth,
          pixelHeight: info.pixelHeight,
          hasAlpha: info.hasAlpha,
          byteSize: data.length,
          sha256: createHash('sha256').update(data).digest('hex')
        })
      } catch (e) {
        images.set(name, {
          ok: false,
          message: e instanceof PersistenceError ? e.message.replace(/\.$/, '') : 'unreadable'
        })
      }
    }

    let preview: DslrPackageAnalysis['preview'] = null
    const previewName = entryNames.find((n) => n.toLowerCase() === 'preview.png')
    if (previewName) {
      try {
        const data = await readEntry(
          zip,
          local.get(previewName) as yauzl.Entry,
          DSLR_IMPORT_LIMITS.maxPreviewBytes
        )
        const info = inspectImage(data)
        if (info.mediaType === 'image/png')
          preview = { data, width: info.pixelWidth, height: info.pixelHeight }
      } catch {
        preview = null // the preview is optional and never imported
      }
    }

    let result: DslrImportResult
    try {
      result = mapDslrTemplate(
        { fileName: basename(path), entryNames: xmlNames, templateXml, images },
        layout ? { layout } : {}
      )
    } catch (e) {
      if (e instanceof DslrImportError) throw bad(e.message)
      throw e
    }
    const initialAssets: InitialAsset[] = result.assets.map((a) => ({
      path: a.asset.path,
      data: bytes.get(a.entry) as Uint8Array
    }))
    return { result, preview, initialAssets }
  } finally {
    zip.close()
  }
}
