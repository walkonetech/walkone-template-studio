import type { PhotoLayer } from '@domain'
import { DEFAULT_CROP, type PhotoCrop } from '@canvas/rendering/photoFit'
import { sampleIdFor, sampleSize } from '@editor/previewPhotos'
import { useMemo } from 'react'
import type { EditorState } from '@editor/store'
import { useEditor } from './editorStore'

export interface CropContext {
  layer: PhotoLayer
  sampleId: string
  src: { width: number; height: number }
  crop: PhotoCrop
}

/** Everything crop math needs for the layer being repositioned, from editor state (null when not cropping). */
export function selectCropContext(s: EditorState): CropContext | null {
  if (!s.cropSession || !s.project) return null
  const layer = s.project.layers.find((l) => l.id === s.cropSession?.layerId)
  if (!layer || layer.type !== 'photo') return null
  const sampleId = sampleIdFor(layer.photoNumber, s.previewPhotos)
  const src = sampleSize(sampleId, s.userSamples)
  if (!src) return null
  return { layer, sampleId, src, crop: s.photoCrops[layer.id] ?? DEFAULT_CROP }
}

/** React hook form of `selectCropContext`: selects stable pieces and memoizes the derived object (a selector that builds
 * a new object every call would make the store hook loop). */
export function useCropContext(): CropContext | null {
  const cropSession = useEditor((s) => s.cropSession)
  const project = useEditor((s) => s.project)
  const previewPhotos = useEditor((s) => s.previewPhotos)
  const userSamples = useEditor((s) => s.userSamples)
  const photoCrops = useEditor((s) => s.photoCrops)
  return useMemo(
    () =>
      selectCropContext({
        cropSession,
        project,
        previewPhotos,
        userSamples,
        photoCrops
      } as EditorState),
    [cropSession, project, previewPhotos, userSamples, photoCrops]
  )
}
