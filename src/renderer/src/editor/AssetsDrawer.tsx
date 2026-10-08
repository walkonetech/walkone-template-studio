import { useState } from 'react'
import { FileImage, ImagePlus, ImageUp, Layers, Trash2 } from 'lucide-react'
import { assetUsage, type AssetReference, type TemplateProject } from '@domain'
import { editorStore, useEditor } from './editorStore'
import { useThumbnail } from './thumbnails'
import { ASSET_DRAG_TYPE, dragHasFiles } from './dropFiles'
import { importDroppedFiles } from './importActions'
import { Button } from '../ui/Button'

const TYPE_LABEL: Record<AssetReference['mediaType'], string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/svg+xml': 'SVG'
}

function AssetItem({
  asset,
  project,
  sessionId
}: {
  asset: AssetReference
  project: TemplateProject
  sessionId: string
}): React.JSX.Element {
  const { url, failed } = useThumbnail(sessionId, asset.id)
  const used = assetUsage(project, asset.id).total
  const st = (): ReturnType<typeof editorStore.getState> => editorStore.getState()
  const size =
    asset.pixelWidth && asset.pixelHeight ? `${asset.pixelWidth}×${asset.pixelHeight}` : null
  return (
    <li className="asset-item" data-asset-id={asset.id}>
      <div
        className="asset-card"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onDoubleClick={() => st().addAssetToCanvas(asset.id)}
        title="Double-click to add to the canvas, or drag it onto the canvas"
      >
        <span className={`asset-thumb ${asset.hasAlpha ? 'alpha' : ''}`}>
          {url ? (
            <img src={url} alt="" draggable={false} />
          ) : failed ? (
            <FileImage size={20} aria-hidden="true" />
          ) : null}
        </span>
        <span className="asset-meta">
          <span className="asset-name" title={asset.filename}>
            {asset.filename}
          </span>
          <span className="asset-sub">
            {[size, TYPE_LABEL[asset.mediaType]].filter(Boolean).join(' · ')}
          </span>
          <span className="asset-sub" data-testid="asset-usage">
            {failed
              ? 'Preview unavailable'
              : used === 0
                ? 'Not used'
                : `Used by ${used} layer${used === 1 ? '' : 's'}`}
          </span>
        </span>
      </div>
      <div className="asset-actions">
        <Button
          size="sm"
          icon={ImagePlus}
          onClick={() => st().addAssetToCanvas(asset.id)}
          aria-label={`Add ${asset.filename} to canvas`}
        >
          Add
        </Button>
        <Button
          size="sm"
          icon={Layers}
          onClick={() => st().setAssetAsBackground(asset.id)}
          aria-label={`Set ${asset.filename} as background`}
          title="Fill the canvas behind everything else"
        >
          Background
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={() => st().removeAsset(asset.id)}
          aria-label={`Remove ${asset.filename} from project`}
          aria-disabled={used > 0}
          title={
            used > 0
              ? `In use by ${used} layer${used === 1 ? '' : 's'}: remove those layers first`
              : 'Remove from project'
          }
        />
      </div>
    </li>
  )
}

/**
 * Project assets: images that belong to THIS project (copied into the project on import). Not a global library.
 * Dropping image files here imports them into the project WITHOUT placing them on the canvas.
 */
export function AssetsDrawer(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  const [over, setOver] = useState(false)
  const assets = project?.assets ?? []
  return (
    <aside
      className={`tooldrawer assets-drawer ${over ? 'drop-active' : ''}`}
      aria-label="Project assets"
      data-editor-panel
      data-testid="assets-drawer"
      onDragOver={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!dragHasFiles(e.dataTransfer)) return
        e.preventDefault()
        setOver(false)
        void importDroppedFiles(e.dataTransfer, { kind: 'library' })
      }}
    >
      <h2 className="panel-heading">Assets</h2>
      <Button
        variant="primary"
        icon={ImageUp}
        className="assets-import"
        onClick={() => void editorStore.getState().importAssetsFromDialog({ kind: 'library' })}
      >
        Import files…
      </Button>
      <p className="field-note">PNG, JPEG, WebP or SVG. Images are copied into the project.</p>
      <h3 className="section-heading">
        Project assets{assets.length > 0 ? ` (${assets.length})` : ''}
      </h3>
      {assets.length === 0 ? (
        <p className="field-note assets-empty">
          No images yet. Import files, or drop them here or on the canvas.
        </p>
      ) : (
        <ul className="asset-list" aria-label="Project assets">
          {project && sessionId
            ? assets.map((a) => (
                <AssetItem key={a.id} asset={a} project={project} sessionId={sessionId} />
              ))
            : null}
        </ul>
      )}
    </aside>
  )
}
