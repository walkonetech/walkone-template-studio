import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  IsoTimestampSchema,
  PrintConfigurationSchema,
  nowIso,
  type PrintConfiguration
} from '../domain'
import { writeFileAtomic } from './atomicFile'

const RecentItemSchema = z.strictObject({
  path: z.string().min(1),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  lastOpenedAt: IsoTimestampSchema,
  /** The design's print size (Start screen card: "2×6 strip"). Optional: entries written before Phase 7B B3 lack it. */
  print: PrintConfigurationSchema.optional()
})
export type RecentProject = z.infer<typeof RecentItemSchema>

const RecentFileSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(RecentItemSchema)
})

export interface RecentProjectEntry extends RecentProject {
  /** False when the file is no longer on disk (it stays listed until removed or evicted). */
  exists: boolean
}

export const DEFAULT_MAX_RECENTS = 10

const fileExists = (path: string): Promise<boolean> =>
  fs.stat(path).then(
    (s) => s.isFile(),
    () => false
  )

/**
 * Small JSON list of recently used project paths (no project contents). Lives in the app-data
 * directory; local only. A corrupted file is set aside as `<file>.corrupt` and treated as empty.
 * JSON is sufficient here; SQLite is not warranted for a short list (ADR-026).
 */
export class RecentProjectsStore {
  constructor(
    private readonly filePath: string,
    private readonly max: number = DEFAULT_MAX_RECENTS
  ) {}

  private async read(): Promise<RecentProject[]> {
    let text: string
    try {
      text = await fs.readFile(this.filePath, 'utf8')
    } catch {
      return []
    }
    try {
      return RecentFileSchema.parse(JSON.parse(text)).items
    } catch {
      await fs.rename(this.filePath, `${this.filePath}.corrupt`).catch(() => undefined)
      return []
    }
  }

  private async write(items: RecentProject[]): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify({ version: 1, items }, null, 2) + '\n')
  }

  /**
   * Adds or moves a project to the top; the list is capped at `max`.
   *
   * Reconciliation (Phase 7B B5.1): one logical project keeps one card. Besides an entry at the same path, the new
   * entry replaces
   *  - any entry for the SAME project id whose file is no longer on disk (the file was moved or renamed and has now
   *    been opened from its new place), and
   *  - the entry the user pressed Locate… on (`replacing`), when that file is missing and it is the same project
   *    (same id, or an older entry written without an id).
   * An entry whose file still exists is never removed this way (two real copies of a project stay two cards), and a
   * Locate that picks a different project leaves the missing card as it was.
   */
  async add(
    entry: {
      path: string
      projectId?: string
      name: string
      print?: PrintConfiguration
    },
    options: { replacing?: string } = {}
  ): Promise<void> {
    const path = resolve(entry.path)
    const replacing = options.replacing !== undefined ? resolve(options.replacing) : undefined
    const all = await this.read()
    const missing = new Set<string>()
    for (const i of all) {
      if (i.path === path) continue
      const sameProject = entry.projectId !== undefined && i.projectId === entry.projectId
      const located =
        i.path === replacing && (i.projectId === undefined || i.projectId === entry.projectId)
      if ((sameProject || located) && !(await fileExists(i.path))) missing.add(i.path)
    }
    const items = all.filter((i) => i.path !== path && !missing.has(i.path))
    const item: RecentProject = {
      path,
      name: entry.name,
      lastOpenedAt: nowIso(),
      ...(entry.projectId !== undefined ? { projectId: entry.projectId } : {}),
      ...(entry.print !== undefined ? { print: entry.print } : {})
    }
    await this.write([item, ...items].slice(0, this.max))
  }

  async remove(path: string): Promise<void> {
    const target = resolve(path)
    await this.write((await this.read()).filter((i) => i.path !== target))
  }

  /** Most recent first, each flagged with whether the file still exists. */
  async list(): Promise<RecentProjectEntry[]> {
    const items = await this.read()
    return Promise.all(items.map(async (i) => ({ ...i, exists: await fileExists(i.path) })))
  }

  async has(path: string): Promise<boolean> {
    const target = resolve(path)
    return (await this.read()).some((i) => i.path === target)
  }
}
