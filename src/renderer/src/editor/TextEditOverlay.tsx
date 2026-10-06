import { useEffect, useRef } from 'react'
import { editorStore, useEditor, useViewTransform } from './editorStore'

/**
 * HTML textarea aligned over the text layer being edited (production inline-edit approach, ADR-029).
 * Enter commits, Shift+Enter inserts a newline, Escape cancels, blur commits. It exists in the DOM
 * only while editing, so nothing stale is left behind.
 */
export function TextEditOverlay(): React.JSX.Element | null {
  const editingId = useEditor((s) => s.editingTextId)
  const project = useEditor((s) => s.project)
  const view = useViewTransform()
  const layer = editingId ? project?.layers.find((l) => l.id === editingId) : undefined
  if (!editingId || !layer || layer.type !== 'text' || !view) return null
  return (
    <OverlayField
      key={editingId}
      layer={layer}
      scale={view.scale}
      left={view.offsetX + layer.x * view.scale}
      top={view.offsetY + layer.y * view.scale}
    />
  )
}

function OverlayField({
  layer,
  scale,
  left,
  top
}: {
  layer: Extract<import('@domain').Layer, { type: 'text' }>
  scale: number
  left: number
  top: number
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const finished = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const finish = (commit: boolean): void => {
    if (finished.current) return
    finished.current = true
    const s = editorStore.getState()
    if (commit && ref.current) s.commitText(layer.id, ref.current.value)
    s.endTextEdit()
  }

  const colour = layer.fill.kind === 'literal' ? layer.fill.value : '#000000'
  return (
    <textarea
      ref={ref}
      defaultValue={layer.content}
      aria-label="Edit text"
      className="text-edit-overlay"
      spellCheck={false}
      onInput={(e) => {
        e.currentTarget.style.height = 'auto'
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(true)
        }
      }}
      onBlur={() => finish(true)}
      style={{
        left,
        top,
        width: layer.width * scale,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize * scale,
        fontWeight: layer.fontWeight,
        fontStyle: layer.fontStyle,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * scale,
        textAlign: layer.align,
        color: colour,
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: '50% 50%'
      }}
    />
  )
}
