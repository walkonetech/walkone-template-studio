import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Layer } from '@domain'
import { imageKey } from '@canvas/assets/imageCache'
import type { ImageLookup } from '@canvas/rendering/nodeSpec'
import { imageCache } from './editorStore'

/** Asset ids the layers need: image layers and photo sample previews. */
function neededAssetIds(layers: readonly Layer[] | undefined): string[] {
  const ids = new Set<string>()
  for (const l of layers ?? []) {
    if (l.type === 'image') ids.add(l.assetId)
    if (l.type === 'photo' && l.sampleAssetId) ids.add(l.sampleAssetId)
  }
  return [...ids].sort()
}

/**
 * Loads the images a project needs through the asset bridge and returns a synchronous lookup for
 * rendering. Re-renders when images finish loading; releases the session's images when it changes.
 */
export function useProjectImages(
  sessionId: string | null,
  layers: readonly Layer[] | undefined
): ImageLookup {
  const version = useSyncExternalStore(imageCache.subscribe, imageCache.getVersion)
  const idsKey = useMemo(() => neededAssetIds(layers).join('|'), [layers])

  useEffect(() => {
    if (!sessionId || !idsKey) return
    void imageCache.ensure(idsKey.split('|').map((id) => imageKey(sessionId, id)))
  }, [sessionId, idsKey])

  useEffect(() => {
    if (!sessionId) return
    return () => imageCache.clear(`${sessionId}:`)
  }, [sessionId])

  // `version` is intentionally a dependency: a new lookup identity re-renders nodes when an image arrives.
  return useCallback<ImageLookup>(
    (assetId) => (sessionId ? imageCache.peek(imageKey(sessionId, assetId)) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [sessionId, version]
  )
}
