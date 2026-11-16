import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import yazl from 'yazl'
import { z } from 'zod'
import { isSafeExportFileName, uniqueFileName } from '../export/naming'
import { MAX_PACKAGE_ENTRIES, isSafePackageEntryPath } from '../export/package'
import { readPngInfo, withPngDensity } from '../export/png'
import { writeFileAtomic } from '../projects/atomicFile'
import { PersistenceError, fromFsError, toSafeError } from '../projects/errors'
import type { IpcResult } from '../shared/persistence'
import type {
  ExportDestination,
  ExportFile,
  ExportPngFacts,
  ExportWriteResult,
  ExportWrittenFile
} from '../shared/ipc'

/**
 * Main-process side of export (Phase 6A, ADR-041). Konva in the renderer is authoritative for pixels; this layer only
 * chooses the destination, VERIFIES what it is handed (PNG signature and exact pixel size, safe single file names,
 * safe package entries), records print density in the PNG `pHYs` chunk, builds the package ZIP and writes every file
 * atomically. The renderer never sends or receives a filesystem path: destinations are opaque ids.
 */

/** Maximum bytes of one exported file / of one request (generous: a 4x6 at 600 DPI is ~10-30 MB as PNG). */
export const MAX_EXPORT_FILE_BYTES = 256 * 1024 * 1024
export const MAX_EXPORT_FILES = 8

// Constructed in local time so the DOS timestamp fields are identical on every machine (same as .boothproject).
const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0)
const FILE_MODE = 0o100644

export interface ExportDeps {
  /** Shows the native folder picker; resolves to an absolute folder path, or null when cancelled. */
  chooseFolder(ctx: unknown, defaultPath: string | null): Promise<string | null>
  /** Shows a file in the OS file manager. */
  showItemInFolder(path: string): void
  log?: (message: string, detail?: unknown) => void
}

const Facts = {
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpi: z.number().positive()
}
const PngFileSchema = z.strictObject({
  kind: z.literal('png'),
  name: z.string().min(1).max(200),
  data: z.instanceof(Uint8Array),
  ...Facts
})
const ZipFileSchema = z.strictObject({
  kind: z.literal('zip'),
  name: z.string().min(1).max(200),
  entries: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(100),
        data: z.instanceof(Uint8Array),
        png: z.strictObject(Facts).optional()
      })
    )
    .min(1)
    .max(MAX_PACKAGE_ENTRIES)
})
const WriteSchema = z.strictObject({
  destinationId: z.string().min(1).max(100),
  files: z
    .array(z.discriminatedUnion('kind', [PngFileSchema, ZipFileSchema]))
    .min(1)
    .max(MAX_EXPORT_FILES),
  onConflict: z.enum(['ask', 'replace', 'keep-both'])
})
const RevealSchema = z.strictObject({
  destinationId: z.string().min(1).max(100),
  name: z.string().min(1).max(200)
})

const invalid = (message: string, detail?: string): PersistenceError =>
  new PersistenceError('export-invalid-output', message, detail)

/** Verifies a PNG against the expected facts and returns it with the print density recorded. */
export function preparePng(data: Uint8Array, facts: ExportPngFacts, label: string): Uint8Array {
  if (data.byteLength > MAX_EXPORT_FILE_BYTES) throw invalid(`"${label}" is too large to export.`)
  let info
  try {
    info = readPngInfo(data)
  } catch (e) {
    throw invalid(`"${label}" is not a valid PNG image.`, String(e))
  }
  if (info.width !== facts.width || info.height !== facts.height) {
    throw invalid(
      `"${label}" has the wrong pixel size.`,
      `expected ${facts.width}x${facts.height}, got ${info.width}x${info.height}`
    )
  }
  return withPngDensity(data, facts.dpi)
}

/** Builds the package ZIP in memory: entries in the given order, fixed timestamps, so equal input gives equal bytes. */
export async function buildZip(
  entries: { path: string; data: Uint8Array; compress: boolean }[]
): Promise<Uint8Array> {
  const zip = new yazl.ZipFile()
  const chunks: Buffer[] = []
  const done = new Promise<void>((resolve, reject) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c))
    zip.outputStream.on('end', () => resolve())
    zip.outputStream.on('error', reject)
  })
  for (const e of entries) {
    zip.addBuffer(Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength), e.path, {
      mtime: FIXED_MTIME,
      mode: FILE_MODE,
      compress: e.compress
    })
  }
  zip.end()
  await done
  return new Uint8Array(Buffer.concat(chunks))
}

/** Turns one requested output into the exact bytes to write (verifies everything first; writes nothing). */
export async function prepareFile(file: ExportFile): Promise<Uint8Array> {
  if (!isSafeExportFileName(file.name))
    throw invalid('An export file name was not valid.', file.name)
  if (file.kind === 'png') {
    if (!file.name.toLowerCase().endsWith('.png')) throw invalid('A PNG export must end in .png.')
    return preparePng(file.data, file, file.name)
  }
  if (!file.name.toLowerCase().endsWith('.zip')) throw invalid('A package export must end in .zip.')
  const seen = new Set<string>()
  let total = 0
  const entries = file.entries.map((e) => {
    if (!isSafePackageEntryPath(e.path) || seen.has(e.path))
      throw invalid('The layer package contained an invalid entry.', e.path)
    seen.add(e.path)
    const isPng = e.path.endsWith('.png')
    if (isPng !== Boolean(e.png))
      throw invalid('The layer package contained an invalid entry.', e.path)
    const data = e.png ? preparePng(e.data, e.png, `${file.name}/${e.path}`) : e.data
    total += data.byteLength
    // PNG is already deflated; text compresses well.
    return { path: e.path, data, compress: !isPng }
  })
  if (total > MAX_EXPORT_FILE_BYTES) throw invalid('The layer package is too large to export.')
  return buildZip(entries)
}

interface Destination {
  folder: string
  /** Names this destination wrote; only these may be revealed. */
  written: Set<string>
}

async function existingNames(folder: string): Promise<Set<string>> {
  try {
    return new Set((await fs.readdir(folder)).map((n) => n.toLowerCase()))
  } catch (e) {
    throw new PersistenceError(
      'export-destination-missing',
      'The export folder is no longer available. Choose another folder.',
      String(e),
      e
    )
  }
}

export class ExportService {
  private readonly destinations = new Map<string, Destination>()
  /** Remembered for the next folder picker (this run of the app only). */
  private lastFolder: string | null = null

  constructor(private readonly deps: ExportDeps) {}

  private async run<T>(op: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
    try {
      return await op()
    } catch (e) {
      this.deps.log?.('export failed', e instanceof PersistenceError ? (e.detail ?? e.message) : e)
      return { status: 'error', error: toSafeError(e) }
    }
  }

  chooseDestination(ctx: unknown): Promise<IpcResult<ExportDestination>> {
    return this.run(async () => {
      const folder = await this.deps.chooseFolder(ctx, this.lastFolder)
      if (folder === null) return { status: 'cancelled' }
      const stat = await fs.stat(folder).catch(() => null)
      if (!stat?.isDirectory())
        throw new PersistenceError(
          'export-destination-missing',
          'Choose an existing folder to export to.'
        )
      this.lastFolder = folder
      const destinationId = randomUUID()
      this.destinations.set(destinationId, { folder, written: new Set() })
      return { status: 'ok', value: { destinationId, folderName: basename(folder) || folder } }
    })
  }

  private destination(id: string): Destination {
    const d = this.destinations.get(id)
    if (!d) throw new PersistenceError('invalid-request', 'Choose the export folder again.')
    return d
  }

  write(payload: unknown): Promise<IpcResult<ExportWriteResult>> {
    return this.run<ExportWriteResult>(async () => {
      const parsed = WriteSchema.safeParse(payload)
      if (!parsed.success)
        throw new PersistenceError(
          'invalid-request',
          'The export request was not valid.',
          parsed.error.message
        )
      const req = parsed.data
      const dest = this.destination(req.destinationId)
      const lowerNames = req.files.map((f) => f.name.toLowerCase())
      if (new Set(lowerNames).size !== lowerNames.length)
        throw invalid('Two outputs had the same file name.')

      // 1. Verify and prepare everything before touching the destination.
      const prepared: { file: ExportFile; bytes: Uint8Array }[] = []
      for (const file of req.files as ExportFile[])
        prepared.push({ file, bytes: await prepareFile(file) })

      // 2. Conflicts.
      const taken = await existingNames(dest.folder)
      const existing = req.files.filter((f) => taken.has(f.name.toLowerCase())).map((f) => f.name)
      if (existing.length > 0 && req.onConflict === 'ask') {
        return { status: 'ok', value: { outcome: 'conflict', existing } }
      }

      // 3. Write each file atomically (a failure leaves any previous file of that name intact).
      const written: ExportWrittenFile[] = []
      const failed: { name: string; error: ReturnType<typeof toSafeError> }[] = []
      for (const { file, bytes } of prepared) {
        const name =
          req.onConflict === 'keep-both'
            ? uniqueFileName(file.name, (n) => taken.has(n.toLowerCase()))
            : file.name
        taken.add(name.toLowerCase())
        const path = join(dest.folder, name)
        try {
          const stat = await fs.lstat(path).catch(() => null)
          if (stat && !stat.isFile())
            throw new PersistenceError('write-failed', `"${name}" exists and is not a file.`)
          await writeFileAtomic(path, bytes)
          dest.written.add(name)
          written.push({ requested: file.name, name, bytes: bytes.byteLength })
        } catch (e) {
          this.deps.log?.(
            'export write failed',
            e instanceof PersistenceError ? (e.detail ?? e.message) : e
          )
          const err = fromFsError(e, 'write-failed', `"${name}" could not be written.`)
          failed.push({ name, error: toSafeError(err) })
        }
      }
      return {
        status: 'ok',
        value: {
          outcome: 'written',
          folderName: basename(dest.folder) || dest.folder,
          written,
          failed
        }
      }
    })
  }

  reveal(payload: unknown): Promise<IpcResult<null>> {
    return this.run(async () => {
      const parsed = RevealSchema.safeParse(payload)
      if (!parsed.success)
        throw new PersistenceError('invalid-request', 'The request was not valid.')
      const dest = this.destination(parsed.data.destinationId)
      if (!dest.written.has(parsed.data.name))
        throw new PersistenceError(
          'not-allowed',
          'Only files exported in this session can be shown.'
        )
      this.deps.showItemInFolder(join(dest.folder, parsed.data.name))
      return { status: 'ok', value: null }
    })
  }
}
