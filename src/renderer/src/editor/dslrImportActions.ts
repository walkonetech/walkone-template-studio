import { layoutStore } from './layoutStore'
import { afterNativePicker, commandOrigin, noteMenuOpener } from '../ui/restoreFocus'

/**
 * File › Import dslrBooth template…: main shows the ZIP picker and analyses the file; the dialog then shows what will
 * be imported. Nothing replaces the open project until the user confirms Import (which asks about unsaved changes).
 */
export async function chooseDslrTemplate(): Promise<void> {
  const origin = commandOrigin(document.activeElement)
  const r = await window.api.dslrImport.choose()
  if (r.status === 'cancelled') return afterNativePicker(origin, 'cancelled')
  // The import dialog opens next: it hands focus back to the same place when it closes (B6.1).
  if (origin) noteMenuOpener(origin)
  // Shown in the dialog (the status bar is not visible on the start screen).
  if (r.status === 'error')
    layoutStore
      .getState()
      .setDslrImport({ kind: 'error', fileHint: null, message: r.error.message })
  else layoutStore.getState().setDslrImport({ kind: 'preview', preview: r.value })
}
