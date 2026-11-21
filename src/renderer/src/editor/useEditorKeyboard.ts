import { useEffect } from 'react'
import { nudgeDelta } from '@editor/nudge'
import { editorStore } from './editorStore'
import { commandForKey } from '@editor/commands'
import { runCommand } from './commandRunner'
import { isMac, isPrimaryModifier } from './platform'
import { controlOwnsKey, drawerMode, escapeTarget } from '@editor/layout'
import { layoutStore } from './layoutStore'
import { cycleRegion } from './regionNav'
import { closeDrawerReturningFocus } from './ToolRail'
import { closeChecksReturningFocus } from './ChecksButton'
import { focusMenuBar } from '../ui/Menu'

/** Keys the focused control keeps for itself (see `controlOwnsKey`). */
const isTypingTarget = (t: EventTarget | null, key: string): boolean => {
  if (!(t instanceof HTMLElement)) return false
  const role = t.closest('[role=menu],[role=menubar]')
    ? 'menu'
    : t.closest('[role=dialog]')
      ? 'dialog'
      : t.closest('[role=separator]')
        ? 'separator'
        : t.closest('[role=radiogroup]')
          ? 'radiogroup'
          : null
  const textEntry =
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  return controlOwnsKey({ role, textEntry }, key)
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
      // F6 / Shift+F6 move between the window's regions (also from inside fields).
      if (e.key === 'F6' && !mod && !e.altKey) {
        e.preventDefault()
        cycleRegion(e.shiftKey)
        return
      }
      // Windows / Linux: F10 focuses the menu bar (Alt + a menu's letter is handled by the menu bar itself).
      if (e.key === 'F10' && !isMac() && !e.shiftKey && !mod) {
        e.preventDefault()
        focusMenuBar()
        return
      }
      // New / Open work from anywhere, including the welcome screen and inside text fields.
      if (mod) {
        const global = commandForKey(e, true)
        if (global === 'file.new' || global === 'file.open') {
          e.preventDefault()
          if (!e.repeat) runCommand(global)
          return
        }
      }
      if (!s.project || isTypingTarget(e.target, e.key) || s.editingTextId) return
      // Escape closes ONE thing, in the 7A order: popover/menu (handled by the popover itself), floating drawer,
      // selection.
      if (e.key === 'Escape') {
        const l = layoutStore.getState()
        const floating = drawerMode(l.viewport.width) === 'floating'
        // The Checks panel sits in the drawer's place: Escape closes it like a floating drawer, and also when docked
        // if focus is inside it (one level, then focus returns to the Checks button).
        const checksPanel =
          l.checksOpen &&
          (floating || (e.target instanceof Element && e.target.closest('#checks-panel') !== null))
        const target = escapeTarget({
          popoverOpen: document.querySelector('[data-popover], [role=menu]') !== null,
          floatingDrawerOpen: (l.drawerOpen && floating) || checksPanel,
          hasSelection: s.selectedIds.length > 0
        })
        if (target === 'floating-drawer') {
          e.preventDefault()
          if (checksPanel) closeChecksReturningFocus()
          else closeDrawerReturningFocus()
          return
        }
        if (target === 'popover') return
      }
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
