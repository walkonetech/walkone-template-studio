import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { IsoTimestampSchema, nowIso } from '../domain'
import { writeFileAtomic } from './atomicFile'

const RecentItemSchema = z.strictObject({
  path: z.string().min(1),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  lastOpenedAt: IsoTimestampSchema
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

  /** Adds or moves a project to the top; the list is capped at `max`. */
  async add(entry: { path: string; projectId?: string; name: string }): Promise<void> {
    const path = resolve(entry.path)
    const items = (await this.read()).filter((i) => i.path !== path)
    const item: RecentProject = {
      path,
      name: entry.name,
      lastOpenedAt: nowIso(),
      ...(entry.projectId !== undefined ? { projectId: entry.projectId } : {})
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
    return Promise.all(
      items.map(async (i) => ({
        ...i,
        exists: await fs.stat(i.path).then(
          (s) => s.isFile(),
          () => false
        )
      }))
    )
  }

  async has(path: string): Promise<boolean> {
    const target = resolve(path)
    return (await this.read()).some((i) => i.path === target)
  }
}
