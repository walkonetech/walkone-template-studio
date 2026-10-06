import { useEffect } from 'react'
import { selectViewTransform } from '@editor/store'
import { editorStore } from './editorStore'

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
      const mod = e.metaKey || e.ctrlKey
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
