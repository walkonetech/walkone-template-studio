import type { ImageSource } from '../rendering/draw'

/** A decoded, drawable image. `dispose` releases GPU/bitmap memory when the cache drops it. */
export interface DecodedImage extends ImageSource {
  dispose?: () => void
}

export type ImageLoader = (key: string) => Promise<DecodedImage>

type Entry =
  | { state: 'loading' }
  | { state: 'ready'; image: DecodedImage }
  | { state: 'error'; message: string }

/**
 * Cache of decoded project images, keyed `<sessionId>:<assetId>`. Loading is asynchronous and
 * de-duplicated; subscribers (a `useSyncExternalStore` hook) are told when anything changes. The
 * loader is injected, so the cache knows nothing about Electron, IPC or Konva.
 */
export class ImageCache {
  private readonly entries = new Map<string, Entry>()
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(private readonly loader: ImageLoader) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = (): number => this.version

  private bump(): void {
    this.version++
    for (const l of this.listeners) l()
  }

  /** The decoded image if ready. Never starts a load (safe to call while rendering). */
  peek(key: string): DecodedImage | undefined {
    const e = this.entries.get(key)
    return e?.state === 'ready' ? e.image : undefined
  }

  /** The decoded image if ready; starts loading it otherwise. */
  get(key: string): DecodedImage | undefined {
    const e = this.entries.get(key)
    if (e?.state === 'ready') return e.image
    if (!e) void this.load(key)
    return undefined
  }

  status(key: string): 'unknown' | 'loading' | 'ready' | 'error' {
    return this.entries.get(key)?.state ?? 'unknown'
  }

  errorOf(key: string): string | undefined {
    const e = this.entries.get(key)
    return e?.state === 'error' ? e.message : undefined
  }

  /** Starts loading anything not yet known and resolves when every key is ready or failed. */
  async ensure(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((k) => (this.entries.has(k) ? this.settled(k) : this.load(k))))
  }

  private async settled(key: string): Promise<void> {
    while (this.entries.get(key)?.state === 'loading') await new Promise((r) => setTimeout(r, 5))
  }

  private async load(key: string): Promise<void> {
    this.entries.set(key, { state: 'loading' })
    try {
      const image = await this.loader(key)
      // The key may have been cleared while loading; drop the result in that case.
      if (this.entries.get(key)?.state !== 'loading') {
        image.dispose?.()
        return
      }
      this.entries.set(key, { state: 'ready', image })
    } catch (e) {
      this.entries.set(key, { state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
    this.bump()
  }

  /** Drops (and disposes) entries whose key starts with `prefix`, or everything. */
  clear(prefix = ''): void {
    for (const [key, e] of [...this.entries]) {
      if (!key.startsWith(prefix)) continue
      if (e.state === 'ready') e.image.dispose?.()
      this.entries.delete(key)
    }
    this.bump()
  }
}

export const imageKey = (sessionId: string, assetId: string): string => `${sessionId}:${assetId}`
