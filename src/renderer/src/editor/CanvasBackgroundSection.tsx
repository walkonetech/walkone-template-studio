import { getPixelSize } from '@domain'
import { ImageUp, Trash2 } from 'lucide-react'
import type { BackgroundMode } from '@editor/assetMutations'
import { editorStore, useEditor } from './editorStore'
import { ColorField, SelectField } from './fields'
import { Button } from '../ui/Button'

const MODES = [
  { value: 'cover', label: 'Fill (cover)' },
  { value: 'contain', label: 'Fit inside' },
  { value: 'original', label: 'Original size' }
] as const

/** Design drawer → Background: the artboard's solid colour and the optional background image. */
export function CanvasBackgroundSection(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  if (!project) return null
  const st = (): ReturnType<typeof editorStore.getState> => editorStore.getState()
  const bg = project.layers.find(
    (l) => l.type === 'image' && l.role === 'background' && l.parentId === undefined
  )
  const asset = bg?.type === 'image' ? project.assets.find((a) => a.id === bg.assetId) : undefined
  const { width: W, height: H } = getPixelSize(project.canvas.print)
  const mode: BackgroundMode =
    bg && bg.x === 0 && bg.y === 0 && bg.width === W && bg.height === H
      ? bg.type === 'image' && bg.fit === 'contain'
        ? 'contain'
        : 'cover'
      : 'original'
  return (
    <section aria-label="Canvas background" data-testid="canvas-background">
      <h3 className="section-heading">Background</h3>
      <ColorField
        label="Color"
        value={project.canvas.backgroundColor}
        palette={project.palette}
        onCommit={(color, continuous) =>
          st().setCanvasBackgroundColor(
            color,
            continuous ? { coalesceKey: 'canvas-background' } : {}
          )
        }
      />
      {bg && bg.type === 'image' ? (
        <>
          <p className="field-note" title={asset?.filename}>
            Image: {asset?.filename ?? 'missing asset'}
          </p>
          <SelectField
            label="Image fit"
            value={mode}
            options={MODES}
            onCommit={(m) => st().setAssetAsBackground(bg.assetId, m)}
          />
          <div className="button-row">
            <Button
              size="sm"
              icon={ImageUp}
              onClick={() => void st().importAssetsFromDialog({ kind: 'background', mode })}
            >
              Change…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => st().removeBackgroundImage()}
            >
              Remove
            </Button>
          </div>
        </>
      ) : (
        <div className="button-row">
          <Button
            size="sm"
            icon={ImageUp}
            onClick={() => void st().importAssetsFromDialog({ kind: 'background', mode: 'cover' })}
          >
            Background image…
          </Button>
        </div>
      )}
    </section>
  )
}
