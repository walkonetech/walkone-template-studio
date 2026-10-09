import { Minus, Plus, RotateCcw } from 'lucide-react'
import { MAX_CROP_ZOOM, MIN_CROP_ZOOM, zoomCrop } from '@canvas/rendering/photoFit'
import { editorStore } from './editorStore'
import { useCropContext } from './cropContext'
import { tipProps } from './tips'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

/** Reposition mode, controls side: zoom the picture inside its frame, reset, or finish. Esc cancels, Enter finishes. */
export function CropBar(): React.JSX.Element | null {
  const ctx = useCropContext()
  if (!ctx) return null
  const { layer, src, crop } = ctx
  const st = editorStore.getState
  const setZoom = (z: number): void =>
    st().setPhotoCrop(
      layer.id,
      zoomCrop(crop, z, src, { width: layer.width, height: layer.height }, layer.fit)
    )
  return (
    <div className="crop-bar" role="group" aria-label="Reposition photo" data-testid="crop-bar">
      <span>Repositioning Photo {layer.photoNumber}: drag the picture</span>
      <IconButton
        size="sm"
        icon={Minus}
        label="Zoom photo out"
        {...tipProps('cropZoomOut')}
        disabled={crop.zoom <= MIN_CROP_ZOOM}
        onClick={() => setZoom(crop.zoom - 0.25)}
        placement="bottom"
      />
      <input
        type="range"
        aria-label="Photo zoom"
        min={MIN_CROP_ZOOM}
        max={MAX_CROP_ZOOM}
        step={0.05}
        value={crop.zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
      />
      <IconButton
        size="sm"
        icon={Plus}
        label="Zoom photo in"
        {...tipProps('cropZoomIn')}
        disabled={crop.zoom >= MAX_CROP_ZOOM}
        onClick={() => setZoom(crop.zoom + 0.25)}
        placement="bottom"
      />
      <IconButton
        size="sm"
        icon={RotateCcw}
        label="Reset position"
        {...tipProps('resetCrop')}
        onClick={() => st().resetPhotoCrop(layer.id)}
        placement="bottom"
      />
      <Button size="sm" variant="primary" onClick={() => st().commitCrop()}>
        Done
      </Button>
    </div>
  )
}
