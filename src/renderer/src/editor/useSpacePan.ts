import { useEffect, useState, type RefObject } from 'react'
import { canStartSpacePan } from '@editor/spacePan'
import { editorStore } from './editorStore'
import { focusArrivedByKeyboard } from '../ui/focusModality'

/**
 * Where the pointer last was (window coordinates), shared by every workspace. "Over the workspace" is decided from it
 * when Space is pressed, not from enter/leave events: the canvas host re-mounts (Design ↔ Print Preview) under a
 * pointer that has not moved, and then no mouseenter ever fires (B6). Forgotten when the pointer leaves the window.
 */
let pointer: { x: number; y: number } | null = null
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY }
    },
    { capture: true, passive: true }
  )
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null
  })
}

/**
 * Hold Space to pan the workspace: the cursor becomes a hand, dragging pans (a capture-phase listener keeps the canvas
 * from also moving or selecting things), releasing Space restores whatever tool state was there. Pure view state: it
 * never touches the project, history or dirty state.
 */
export function useSpacePan(hostRef: RefObject<HTMLElement | null>): {
  ready: boolean
  panning: boolean
} {
  const [ready, setReady] = useState(false)
  const [panning, setPanning] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const overWorkspace = (): boolean => {
      if (!pointer) return false
      const hit = document.elementFromPoint(pointer.x, pointer.y)
      return hit !== null && host.contains(hit)
    }
    let held = false
    let last: { x: number; y: number } | null = null

    const setHeld = (v: boolean): void => {
      held = v
      setReady(v)
      if (!v) {
        last = null
        setPanning(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (
        !canStartSpacePan({
          code: e.code,
          repeat: e.repeat,
          target: t
            ? {
                tagName: t.tagName,
                isContentEditable: t.isContentEditable,
                role: t.getAttribute('role')
              }
            : null,
          pointerOverWorkspace: overWorkspace(),
          keyboardFocused:
            t instanceof HTMLElement && t !== document.body && focusArrivedByKeyboard(),
          hasModifier: e.metaKey || e.ctrlKey || e.altKey,
          editingText: editorStore.getState().editingTextId !== null
        })
      ) {
        // Keep an ongoing hold alive on key repeat; ignore everything else.
        if (e.code === 'Space' && held) e.preventDefault()
        return
      }
      e.preventDefault()
      setHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && held) {
        e.preventDefault()
        setHeld(false)
      }
    }
    const onMouseDown = (e: MouseEvent): void => {
      if (!held || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      last = { x: e.clientX, y: e.clientY }
      setPanning(true)
    }
    const onMouseMove = (e: MouseEvent): void => {
      if (!last) return
      editorStore.getState().panBy(e.clientX - last.x, e.clientY - last.y)
      last = { x: e.clientX, y: e.clientY }
    }
    const onMouseUp = (): void => {
      last = null
      setPanning(false)
    }
    host.addEventListener('mousedown', onMouseDown, true) // capture: runs before the canvas sees the press
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    const onBlur = (): void => setHeld(false)
    window.addEventListener('blur', onBlur)
    return () => {
      host.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [hostRef])

  return { ready, panning }
}
