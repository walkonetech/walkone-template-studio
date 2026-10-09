import { useEffect, useState, type RefObject } from 'react'
import { canStartSpacePan } from '@editor/spacePan'
import { editorStore } from './editorStore'

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
    let over = false
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
          pointerOverWorkspace: over,
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
    const enter = (): void => {
      over = true
    }
    const leave = (): void => {
      over = false
    }
    host.addEventListener('mousedown', onMouseDown, true) // capture: runs before the canvas sees the press
    host.addEventListener('mouseenter', enter)
    host.addEventListener('mouseleave', leave)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('blur', () => setHeld(false))
    return () => {
      host.removeEventListener('mousedown', onMouseDown, true)
      host.removeEventListener('mouseenter', enter)
      host.removeEventListener('mouseleave', leave)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [hostRef])

  return { ready, panning }
}
