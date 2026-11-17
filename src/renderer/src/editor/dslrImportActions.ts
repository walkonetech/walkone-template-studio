import { layoutStore } from './layoutStore'

/**
 * File › Import dslrBooth template…: main shows the ZIP picker and analyses the file; the dialog then shows what will
 * be imported. Nothing replaces the open project until the user confirms Import (which asks about unsaved changes).
 */
export async function chooseDslrTemplate(): Promise<void> {
  const r = await window.api.dslrImport.choose()
  if (r.status === 'cancelled') return
  // Shown in the dialog (the status bar is not visible on the start screen).
  if (r.status === 'error')
    layoutStore
      .getState()
      .setDslrImport({ kind: 'error', fileHint: null, message: r.error.message })
  else layoutStore.getState().setDslrImport({ kind: 'preview', preview: r.value })
}
