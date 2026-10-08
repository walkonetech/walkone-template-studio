import { useEffect, useSyncExternalStore } from 'react'
import { imageKey } from '@canvas/assets/imageCache'
import { decodeSvg, readAssetBytes } from './assetLoader'
import { imageCache } from './editorStore'

/**
 * Small preview images for the Assets drawer, as `data:` URLs (the CSP allows `img-src data:`). Raster assets are
 * decoded at thumbnail size (`createImageBitmap` with resize), so a 6000×4000 original is never fully decoded just to
 * draw a 60 px preview. If the canvas has already decoded the full image, the thumbnail is drawn from that instead and
 * no bytes cross IPC. Results are cached per session+asset (assets are immutable: a new file is a new asset id).
 */
export const THUMB_SIZE = 160

type Entry = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'error' }
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const bump = (): void => {
  version++
  for (const l of listeners) l()
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function drawToUrl(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, THUMB_SIZE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/webp', 0.85)
}

async function makeThumbnail(key: string): Promise<string> {
  const decoded = imageCache.peek(key)
  if (decoded) return drawToUrl(decoded.source, decoded.width, decoded.height)
  const { mediaType, data } = await readAssetBytes(key)
  if (mediaType === 'image/svg+xml') {
    const img = await decodeSvg(data)
    return drawToUrl(img, img.naturalWidth || 1000, img.naturalHeight || 1000)
  }
  const blob = new Blob([data.slice().buffer], { type: mediaType })
  const probe = await createImageBitmap(blob, { resizeWidth: THUMB_SIZE, resizeQuality: 'medium' })
  try {
    return drawToUrl(probe, probe.width, probe.height)
  } finally {
    probe.close()
  }
}

function ensure(key: string): void {
  if (entries.has(key)) return
  entries.set(key, { state: 'loading' })
  makeThumbnail(key).then(
    (url) => {
      if (entries.has(key)) entries.set(key, { state: 'ready', url })
      bump()
    },
    () => {
      if (entries.has(key)) entries.set(key, { state: 'error' })
      bump()
    }
  )
}

export function clearThumbnails(sessionId: string): void {
  for (const k of [...entries.keys()]) if (k.startsWith(`${sessionId}:`)) entries.delete(k)
  bump()
}

export function useThumbnail(
  sessionId: string | null,
  assetId: string
): { url: string | null; failed: boolean } {
  useSyncExternalStore(subscribe, () => version)
  const key = sessionId ? imageKey(sessionId, assetId) : null
  useEffect(() => {
    if (key) ensure(key)
  }, [key])
  const e = key ? entries.get(key) : undefined
  return { url: e?.state === 'ready' ? e.url : null, failed: e?.state === 'error' }
}
