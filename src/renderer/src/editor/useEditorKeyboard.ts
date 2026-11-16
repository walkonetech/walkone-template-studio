import { useEffect } from 'react'
import { nudgeDelta } from '@editor/nudge'
import { editorStore } from './editorStore'
import { commandForKey } from '@editor/commands'
import { runCommand } from './commandRunner'
import { isPrimaryModifier } from './platform'

const isTypingTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false
  // Keys belong to the control itself: splitters (arrows resize), menus, dialogs, radio groups.
  if (t.closest('[role=separator],[role=menu],[role=menubar],[role=dialog],[role=radiogroup]'))
    return true
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
      // A modal dialog owns the keyboard, even when focus has fallen out of it onto <body>: nothing may act on the
      // canvas behind it.
      if (document.querySelector('[role=dialog][aria-modal=true]')) return
      const s = editorStore.getState()
      const mod = isPrimaryModifier(e)
      // New / Open work from anywhere, including the welcome screen and inside text fields.
      if (mod) {
        const global = commandForKey(e, true)
        if (global === 'file.new' || global === 'file.open') {
          e.preventDefault()
          if (!e.repeat) runCommand(global)
          return
        }
      }
      if (!s.project || isTypingTarget(e.target) || s.editingTextId) return
      if (mod) {
        const view = commandForKey(e, true)
        if (view?.startsWith('view.')) {
          e.preventDefault()
          runCommand(view)
          return
        }
      }
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
      if (mod && !e.shiftKey && key.toLowerCase() === 'e') {
        e.preventDefault()
        if (!e.repeat) runCommand('file.export')
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
      if (s.cropSession) {
        // Reposition mode owns Enter (finish) and Escape (cancel, restoring the crop it began with).
        if (key === 'Escape') {
          s.cancelCrop()
          e.preventDefault()
          return
        }
        if (key === 'Enter') {
          s.commitCrop()
          e.preventDefault()
          return
        }
      }
      if (key === 'Escape') {
        s.clearSelection()
        return
      }
      if (key.startsWith('Arrow')) {
        // Arrow keys navigate the Layers Panel when focus is inside it; they nudge only from the canvas.
        if (e.target instanceof HTMLElement && e.target.closest('[data-editor-panel]')) return
        if (s.selectedIds.length === 0) return
        // Design pixels, never screen pixels: one per press, ten with Shift, at every zoom level.
        const d = nudgeDelta(key, e.shiftKey)
        if (d && s.nudgeSelection(d.dx, d.dy)) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
