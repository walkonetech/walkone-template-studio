import { useEffect } from 'react'
import { selectViewTransform } from '@editor/store'
import { editorStore } from './editorStore'
import { isPrimaryModifier } from './platform'

const isTypingTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  )
}

/**
 * Canvas keyboard actions. Never active while typing in a field or while the text-edit overlay is open.
 * Handlers read the store directly, so nothing here depends on React render state.
 */
export function useEditorKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = editorStore.getState()
      if (!s.project || isTypingTarget(e.target) || s.editingTextId) return
      const mod = isPrimaryModifier(e)
      const key = e.key
      if (mod && key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && key.toLowerCase() === 'd') {
        e.preventDefault()
        s.duplicateSelection()
        return
      }
      if (mod && key.toLowerCase() === 's') {
        e.preventDefault()
        void (e.shiftKey ? s.saveAs() : s.save())
        return
      }
      if (mod && key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) s.ungroupSelection()
        else s.groupSelection()
        return
      }
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault()
        const forward = e.code === 'BracketRight'
        s.stackSelection(
          e.shiftKey ? (forward ? 'front' : 'back') : forward ? 'forward' : 'backward'
        )
        return
      }
      if (mod) return
      if (key === 'Delete' || key === 'Backspace') {
        if (s.deleteSelection()) e.preventDefault()
        return
      }
      if (key === 'Escape') {
        s.clearSelection()
        return
      }
      if (key.startsWith('Arrow')) {
        // Arrow keys navigate the Layers Panel when focus is inside it; they nudge only from the canvas.
        if (e.target instanceof HTMLElement && e.target.closest('[data-editor-panel]')) return
        const view = selectViewTransform(s)
        if (!view || s.selectedIds.length === 0) return
        // One screen pixel per press (ten with Shift), expressed in design pixels so it is zoom-independent on screen.
        const step = (e.shiftKey ? 10 : 1) / view.scale
        const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0
        const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0
        if (s.nudgeSelection(dx, dy)) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
