import { promises as fs } from 'node:fs'
import { z } from 'zod'
import {
  FormatDefinitionSchema,
  IdSchema,
  IsoTimestampSchema,
  createId,
  nowIso,
  validateFormat,
  type FormatDefinition
} from '../domain'
import { writeFileAtomic } from './atomicFile'

/**
 * My formats (Phase 7B B5.5): custom format definitions the operator saved for reuse. APPLICATION-LOCAL metadata in the
 * app-data directory (`formats.json`), never part of a project: no artwork, layers, palette, photos or client details,
 * only the size / arrangement / guidance a new project starts from. No sync, no sharing.
 *
 * Extension point: a later Company Formats source (a read-only or shared list) would sit beside this store and be merged
 * into the same picker; the format model (`FormatDefinition`) is already the unit both would hold.
 */

export const MAX_FORMAT_PRESETS = 100

export const FormatPresetSchema = z.strictObject({
  id: IdSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  format: FormatDefinitionSchema
})
export type FormatPreset = z.infer<typeof FormatPresetSchema>

const FileSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(FormatPresetSchema).max(MAX_FORMAT_PRESETS)
})

export class FormatPresetError extends Error {
  constructor(
    readonly code: 'invalid' | 'not-found' | 'full',
    message: string
  ) {
    super(message)
  }
}

export class FormatPresetStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<FormatPreset[]> {
    let text: string
    try {
      text = await fs.readFile(this.filePath, 'utf8')
    } catch {
      return []
    }
    try {
      return FileSchema.parse(JSON.parse(text)).items
    } catch {
      // A damaged list is set aside (like recent projects) instead of blocking New Project.
      await fs.rename(this.filePath, `${this.filePath}.corrupt`).catch(() => undefined)
      return []
    }
  }

  private async write(items: FormatPreset[]): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify({ version: 1, items }, null, 2) + '\n')
  }

  /** Saved formats, most recently created first. */
  async list(): Promise<FormatPreset[]> {
    return this.read()
  }

  /** Validates and stores a format; returns the new preset. */
  async save(format: FormatDefinition): Promise<FormatPreset> {
    const parsed = FormatDefinitionSchema.safeParse(format)
    if (!parsed.success) throw new FormatPresetError('invalid', 'This format is not valid.')
    const issues = validateFormat(parsed.data)
    if (issues.length > 0) throw new FormatPresetError('invalid', issues[0]!.message)
    const items = await this.read()
    if (items.length >= MAX_FORMAT_PRESETS)
      throw new FormatPresetError(
        'full',
        `My formats holds up to ${MAX_FORMAT_PRESETS} formats. Delete one first.`
      )
    const now = nowIso()
    const preset: FormatPreset = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      format: parsed.data
    }
    await this.write([preset, ...items])
    return preset
  }

  async rename(id: string, name: string): Promise<FormatPreset> {
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 80)
      throw new FormatPresetError('invalid', 'A format name needs 1 to 80 characters.')
    const items = await this.read()
    const i = items.findIndex((p) => p.id === id)
    if (i < 0) throw new FormatPresetError('not-found', 'That format no longer exists.')
    const next: FormatPreset = {
      ...items[i]!,
      updatedAt: nowIso(),
      format: { ...items[i]!.format, name: trimmed }
    }
    items[i] = next
    await this.write(items)
    return next
  }

  async remove(id: string): Promise<void> {
    const items = await this.read()
    if (!items.some((p) => p.id === id))
      throw new FormatPresetError('not-found', 'That format no longer exists.')
    await this.write(items.filter((p) => p.id !== id))
  }
}
