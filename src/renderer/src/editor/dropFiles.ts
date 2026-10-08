import { MAX_IMPORT_FILES } from '@shared/ipc'

/** Drag-and-drop helpers shared by the canvas and the Assets drawer. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const
/** Custom drag type used when dragging an asset out of the Assets drawer onto the canvas. */
export const ASSET_DRAG_TYPE = 'application/x-walkone-asset'
const MAX_FILE_BYTES = 256 * 1024 * 1024

export const dragHasFiles = (dt: DataTransfer | null): boolean =>
  !!dt && Array.from(dt.types).includes('Files')
export const dragHasAsset = (dt: DataTransfer | null): boolean =>
  !!dt && Array.from(dt.types).includes(ASSET_DRAG_TYPE)

const extensionOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1).toLowerCase()

/**
 * Reads the supported image files of a drop. Only the file CONTENT and display name go to the main process (never
 * a path); the main process decides what the bytes are. Unsupported or oversized files are reported, not sent.
 */
export async function readDroppedImages(
  dt: DataTransfer
): Promise<{ files: { name: string; data: Uint8Array }[]; skipped: string[] }> {
  const files: { name: string; data: Uint8Array }[] = []
  const skipped: string[] = []
  for (const file of Array.from(dt.files)) {
    const supported = (IMAGE_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))
    if (!supported || file.size === 0)
      skipped.push(`${file.name}: not a PNG, JPEG, WebP or SVG image.`)
    else if (file.size > MAX_FILE_BYTES) skipped.push(`${file.name}: too large to import.`)
    else if (files.length >= MAX_IMPORT_FILES) skipped.push(`${file.name}: too many files at once.`)
    else files.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
  }
  return { files, skipped }
}
