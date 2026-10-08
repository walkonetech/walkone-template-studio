import { editorStore, type ImportPlacementArg } from './editorStore'
import { readDroppedImages } from './dropFiles'

/** Imports the supported image files of a drop, reporting skipped files through the status message. */
export async function importDroppedFiles(
  dt: DataTransfer,
  placement: ImportPlacementArg
): Promise<void> {
  const s = editorStore.getState()
  const { files, skipped } = await readDroppedImages(dt)
  if (files.length === 0) {
    if (skipped.length > 0) s.setMessage(skipped[0] ?? null)
    return
  }
  await s.importDroppedFiles(files, placement)
  if (skipped.length > 0) {
    const current = editorStore.getState().lastMessage
    s.setMessage([current, skipped[0]].filter(Boolean).join(' '))
  }
}
