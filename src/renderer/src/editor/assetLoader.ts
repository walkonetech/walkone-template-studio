import type { DecodedImage } from '@canvas/assets/imageCache'

/**
 * Loads a project-owned image for the canvas. Bytes come from the main process through the narrow
 * `readAsset` IPC (session + asset id, never a path), then are decoded here:
 *  - raster → `createImageBitmap` (no URL involved, so the CSP is untouched and the canvas stays untainted)
 *  - SVG    → an <img> from a `data:` URL (allowed by the existing `img-src data:`; SVG in <img> cannot run scripts)
 */
export async function loadProjectImage(key: string): Promise<DecodedImage> {
  const split = key.indexOf(':')
  const sessionId = key.slice(0, split)
  const assetId = key.slice(split + 1)
  const r = await window.api.project.readAsset({ sessionId, assetId })
  if (r.status !== 'ok') {
    throw new Error(r.status === 'error' ? r.error.message : 'Asset load was cancelled')
  }
  const { mediaType, data } = r.value
  if (mediaType === 'image/svg+xml') {
    let binary = ''
    for (let i = 0; i < data.length; i += 0x8000)
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
    const img = new Image()
    img.src = `data:image/svg+xml;base64,${btoa(binary)}`
    await img.decode()
    return { source: img, width: img.naturalWidth || 1000, height: img.naturalHeight || 1000 }
  }
  const bitmap = await createImageBitmap(new Blob([data.slice().buffer], { type: mediaType }))
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close()
  }
}
