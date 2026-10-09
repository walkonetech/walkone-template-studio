import { useRef } from 'react'
import { cropSlack, dragCrop } from '@canvas/rendering/photoFit'
import { screenToDesign, designToScreen } from '@canvas/viewport/viewport'
import { editorStore, useViewTransform } from './editorStore'
import { useCropContext } from './cropContext'

/**
 * Reposition mode, canvas side: a transparent layer above the stage. Dragging moves the PICTURE inside the fixed frame
 * (the layer itself never moves); pressing outside the frame finishes. The frame outline is editor chrome only.
 */
export function CropOverlay(): React.JSX.Element | null {
  const ctx = useCropContext()
  const view = useViewTransform()
  const drag = useRef<{ x: number; y: number; crop: NonNullable<typeof ctx>['crop'] } | null>(null)
  if (!ctx || !view) return null
  const { layer, src, crop } = ctx
  const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 }
  const c = designToScreen(view, centre.x, centre.y)
  const w = layer.width * view.scale
  const h = layer.height * view.scale

  const insideFrame = (clientX: number, clientY: number, host: DOMRect): boolean => {
    const d = screenToDesign(view, clientX - host.left, clientY - host.top)
    const a = (-layer.rotation * Math.PI) / 180
    const dx = d.x - centre.x
    const dy = d.y - centre.y
    const lx = dx * Math.cos(a) - dy * Math.sin(a)
    const ly = dx * Math.sin(a) + dy * Math.cos(a)
    return Math.abs(lx) <= layer.width / 2 && Math.abs(ly) <= layer.height / 2
  }

  const onDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const host = e.currentTarget.getBoundingClientRect()
    if (!insideFrame(e.clientX, e.clientY, host)) {
      editorStore.getState().commitCrop()
      return
    }
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, crop }
    const move = (m: MouseEvent): void => {
      const start = drag.current
      if (!start) return
      // screen → design → the frame's own (rotated) axes
      const dxD = (m.clientX - start.x) / view.scale
      const dyD = (m.clientY - start.y) / view.scale
      const a = (-layer.rotation * Math.PI) / 180
      const local = {
        x: dxD * Math.cos(a) - dyD * Math.sin(a),
        y: dxD * Math.sin(a) + dyD * Math.cos(a)
      }
      const slack = cropSlack(
        src,
        { width: layer.width, height: layer.height },
        layer.fit,
        start.crop.zoom
      )
      editorStore.getState().setPhotoCrop(layer.id, dragCrop(start.crop, local, slack))
    }
    const up = (): void => {
      drag.current = null
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="crop-overlay" data-testid="crop-overlay" onMouseDown={onDown}>
      <div
        className="crop-frame"
        aria-hidden="true"
        style={{
          left: c.x,
          top: c.y,
          width: w,
          height: h,
          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`
        }}
      />
    </div>
  )
}
