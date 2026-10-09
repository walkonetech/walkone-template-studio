import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Layer, PhotoLayer } from '@domain'
import type { PhotoPreview, PhotoPreviewLookup } from '@canvas/rendering/nodeSpec'
import { sampleIdFor } from '@editor/previewPhotos'
import { useEditor } from './editorStore'
import { previewCache } from './samplePhotos'

const photoNumbersOf = (layers: readonly Layer[] | undefined): number[] => {
  const set = new Set<number>()
  for (const l of layers ?? []) if (l.type === 'photo') set.add(l.photoNumber)
  return [...set].sort((a, b) => a - b)
}

/**
 * Sample photos for the photo layers of the open project, by PhotoNumber (never by layer, never per print copy). Loads
 * what is needed through the preview cache and returns a synchronous lookup, or undefined while Preview Photos is off.
 * Decoded pictures are shared: one image serves every layer and both copies of a two-up sheet.
 */
export function usePreviewPhotos(
  layers: readonly Layer[] | undefined
): PhotoPreviewLookup | undefined {
  const on = useEditor((s) => s.photoDisplay === 'preview')
  const preview = useEditor((s) => s.previewPhotos)
  const crops = useEditor((s) => s.photoCrops)
  const version = useSyncExternalStore(previewCache.subscribe, previewCache.getVersion)
  const numbers = useMemo(() => photoNumbersOf(layers), [layers])
  const ids = useMemo(
    () => (on ? [...new Set(numbers.map((n) => sampleIdFor(n, preview)))] : []),
    [on, numbers, preview]
  )
  useEffect(() => {
    if (ids.length > 0) void previewCache.ensure(ids)
  }, [ids])
  return useCallback(
    (layer: PhotoLayer): PhotoPreview | undefined => {
      if (!on) return undefined
      const image = previewCache.peek(sampleIdFor(layer.photoNumber, preview))
      if (!image) return undefined
      const crop = crops[layer.id]
      return crop ? { image, crop } : { image }
    },
    // `version` re-creates the lookup when a picture finishes loading so nodes redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
    [on, preview, crops, version]
  )
}
