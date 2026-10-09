import { editorStore } from './editorStore'
import { decodeSvg } from './assetLoader'
import { previewCache, registerUserPhoto } from './samplePhotos'

let userCounter = 0

/**
 * "Choose photo…": the user picks a picture from disk (main process dialog; only the bytes come back) and it becomes
 * the preview sample for one PhotoNumber. It is decoded here, kept in memory for this session only, and is NOT added to
 * the project, its assets or its session folder. Returns an error message, or null on success/cancel.
 */
export async function chooseUserPreviewPhoto(photoNumber: number): Promise<string | null> {
  const r = await window.api.project.pickPreviewPhoto()
  if (r.status === 'cancelled') return null
  if (r.status === 'error') return r.error.message
  const { name, mediaType, data, pixelWidth, pixelHeight } = r.value
  try {
    const id = `user-${++userCounter}`
    if (mediaType === 'image/svg+xml') {
      const img = await decodeSvg(data)
      registerUserPhoto(id, { source: img, width: pixelWidth, height: pixelHeight })
    } else {
      const bitmap = await createImageBitmap(new Blob([data.slice().buffer], { type: mediaType }))
      registerUserPhoto(id, {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close()
      })
    }
    const s = editorStore.getState()
    s.addUserSample({ id, name, width: pixelWidth, height: pixelHeight })
    s.setSampleFor(photoNumber, id)
    s.setPhotoDisplay('preview')
    void previewCache.ensure([id])
    return null
  } catch {
    return 'That picture could not be displayed.'
  }
}
