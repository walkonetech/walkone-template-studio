import type { CloseReason } from '@shared/ipc'
import type { OpResult } from '@editor/store'
import type { CommandId } from '@editor/commands'
import { editorStore } from './editorStore'
import { layoutStore } from './layoutStore'
import { chooseDslrTemplate } from './dslrImportActions'

const st = editorStore.getState

/**
 * Replacing or closing the open project asks the MAIN process (native Save / Don't Save / Cancel prompt) when the
 * project is Modified. The same coordinator guards window close and quit, so there is one flow, not several.
 */
export const guarded =
  (reason: CloseReason, op: () => Promise<OpResult>) => async (): Promise<void> => {
    if (await st().guardClose(reason)) await op()
  }

/** Maps command ids (see `@editor/commands`) to store actions. Menus, buttons and shortcuts all route through here. */
export function runCommand(id: CommandId): void {
  const s = st()
  switch (id) {
    case 'file.new':
      void s
        .guardClose('replace')
        .then((ok) => ok && layoutStore.getState().setNewProjectOpen(true))
      return
    case 'file.open':
      void guarded('replace', () => s.openFromDialog())()
      return
    case 'file.importDslr':
      void chooseDslrTemplate()
      return
    case 'file.save':
      void s.save()
      return
    case 'file.saveAs':
      void s.saveAs()
      return
    case 'file.export':
      // Finish a Reposition first so the proof shows the crop the user sees.
      s.commitCrop()
      layoutStore.getState().setExportOpen(true)
      return
    case 'file.close':
      void guarded('close-project', () => s.closeProject())()
      return
    case 'edit.undo':
      s.undo()
      return
    case 'edit.redo':
      s.redo()
      return
    case 'edit.duplicate':
      s.duplicateSelection()
      return
    case 'edit.delete':
      s.deleteSelection()
      return
    case 'edit.group':
      s.groupSelection()
      return
    case 'edit.ungroup':
      s.ungroupSelection()
      return
    case 'view.fit':
      s.fitToWindow()
      return
    case 'view.actual':
      s.zoomToActualSize()
      return
    case 'view.zoomIn':
      s.zoomIn()
      return
    case 'view.zoomOut':
      s.zoomOut()
      return
    case 'view.snap':
      s.setSnapping({ enabled: !s.snapping.enabled })
      return
    case 'view.design':
      s.setViewMode('design')
      return
    case 'view.printPreview':
      s.setViewMode('preview')
      return
    case 'arrange.alignLeft':
      s.alignSelection('left')
      return
    case 'arrange.alignCenter':
      s.alignSelection('hcenter')
      return
    case 'arrange.alignRight':
      s.alignSelection('right')
      return
    case 'arrange.alignTop':
      s.alignSelection('top')
      return
    case 'arrange.alignMiddle':
      s.alignSelection('vcenter')
      return
    case 'arrange.alignBottom':
      s.alignSelection('bottom')
      return
    case 'arrange.distributeH':
      s.distributeSelection('horizontal')
      return
    case 'arrange.distributeV':
      s.distributeSelection('vertical')
      return
    case 'view.showOverflow':
      s.setShowOverflow(!s.showOverflow)
      return
    case 'view.shufflePhotos':
      s.shufflePhotos()
      return
    case 'view.previewPhotos':
      s.setPhotoDisplay(s.photoDisplay === 'preview' ? 'placeholder' : 'preview')
      return
  }
}
