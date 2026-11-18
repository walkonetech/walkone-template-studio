import {
  IMAGE_ROLES,
  effectiveResolution,
  getPixelSize,
  isEditable,
  type ImageLayer,
  type Layer,
  type PhotoLayer,
  type ShapeLayer,
  type TemplateProject
} from '@domain'
import { wrapDegrees } from '@canvas/geometry/geometry'
import { copiesPerSheet, describePrint, printSizeName } from '@editor/describe'
import { isDefaultCrop } from '@canvas/rendering/photoFit'
import { BUILT_IN_SAMPLES, sampleIdFor } from '@editor/previewPhotos'
import { chooseUserPreviewPhoto } from './previewActions'
import { tipProps } from './tips'
import { Tooltip } from '../ui/Tooltip'
import { selectionBounds } from '@editor/arrange'
import { ArrangeControls } from './ArrangeControls'
import { opacityToPercent, percentToOpacity } from '@editor/numberInput'
import { layerTypeLabel } from '@editor/layerTree'
import { Copy, Group, MousePointerClick, Move, RotateCcw, Shuffle, Trash2 } from 'lucide-react'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { TypographySection } from './TypographySection'
import { PanelSection } from '../ui/PanelSection'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import {
  CheckboxField,
  ColorField,
  CompactNumber,
  NumberField,
  OpacityField,
  SelectField,
  TextField
} from './fields'

const store = editorStore

type Patch = Parameters<ReturnType<typeof editorStore.getState>['editLayers']>[1]
const edit = (ids: readonly string[], patch: Patch, continuous = false): void => {
  store
    .getState()
    .editLayers(
      ids,
      patch,
      continuous ? { coalesceKey: `color:${ids.join(',')}:${Object.keys(patch).join(',')}` } : {}
    )
}

const FIT_OPTIONS = [
  { value: 'cover', label: 'Cover (fill, crop)' },
  { value: 'contain', label: 'Contain (fit inside)' },
  { value: 'stretch', label: 'Stretch' }
] as const

function Section({
  id,
  title,
  children,
  aside
}: {
  id: string
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
}): React.JSX.Element {
  const collapsed = useLayout((st) => st.collapsedSections.includes(id))
  return (
    <PanelSection
      title={title}
      open={!collapsed}
      onToggle={() => layoutStore.getState().toggleSection(id)}
      {...(aside ? { aside } : {})}
    >
      {children}
    </PanelSection>
  )
}

function GeneralSection({
  layer,
  project,
  locked
}: {
  layer: Layer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  const inheritedLock = !layer.locked && !isEditable(project.layers, layer)
  return (
    <Section id="layer" title="Layer">
      <TextField
        label="Name"
        value={layer.name}
        allowEmpty={false}
        onCommit={(name) => store.getState().renameLayer(layer.id, name)}
      />
      <div className="check-pair">
        <CheckboxField
          label="Visible"
          checked={layer.visible}
          onCommit={(visible) => edit([layer.id], { visible })}
        />
        <CheckboxField
          label="Locked"
          checked={layer.locked}
          onCommit={(v) => edit([layer.id], { locked: v })}
          {...(inheritedLock ? { hint: 'Also locked by a parent group' } : {})}
        />
      </div>
      {locked && <p className="field-note">Editing is disabled while this layer is locked.</p>}
    </Section>
  )
}

function TransformSection({ layer, locked }: { layer: Layer; locked: boolean }): React.JSX.Element {
  const isGroup = layer.type === 'group'
  const heightRule =
    layer.type === 'shape' && layer.shape === 'line' ? { min: 0 } : { positive: true }
  if (isGroup) {
    // A group has no stored geometry of its own: its box is derived from its children. X/Y therefore MOVE the group
    // (translating every child); the size is shown but changes only by transforming the group on the canvas.
    return (
      <Section id="transform" title="Transform">
        <div className="grid-2">
          <CompactNumber
            label="X"
            short="X"
            unit="px"
            value={layer.x}
            disabled={locked}
            onCommit={(x) => store.getState().moveSelectionTo({ x })}
          />
          <CompactNumber
            label="Y"
            short="Y"
            unit="px"
            value={layer.y}
            disabled={locked}
            onCommit={(y) => store.getState().moveSelectionTo({ y })}
          />
        </div>
        <dl className="derived">
          {(['width', 'height'] as const).map((k) => (
            <div key={k}>
              <dt>{k === 'width' ? 'W' : 'H'}</dt>
              <dd>{Math.round(layer[k] * 1000) / 1000}</dd>
            </div>
          ))}
        </dl>
        <p className="field-note">
          Moving a group keeps its children&apos;s relative positions. Resize it on the canvas.
        </p>
      </Section>
    )
  }
  return (
    <Section id="transform" title="Transform">
      <div className="grid-2">
        <CompactNumber
          label="X"
          short="X"
          unit="px"
          value={layer.x}
          disabled={locked}
          onCommit={(x) => edit([layer.id], { x })}
        />
        <CompactNumber
          label="Y"
          short="Y"
          unit="px"
          value={layer.y}
          disabled={locked}
          onCommit={(y) => edit([layer.id], { y })}
        />
        <CompactNumber
          label="Width"
          short="W"
          unit="px"
          value={layer.width}
          rule={{ positive: true }}
          disabled={locked}
          onCommit={(width) =>
            edit(
              [layer.id],
              layer.type === 'photo'
                ? { width, height: Math.max(1, Math.round((width * layer.height) / layer.width)) }
                : { width }
            )
          }
        />
        <CompactNumber
          label="Height"
          short="H"
          unit="px"
          value={layer.height}
          rule={heightRule}
          disabled={locked}
          onCommit={(height) =>
            edit(
              [layer.id],
              layer.type === 'photo'
                ? { height, width: Math.max(1, Math.round((height * layer.width) / layer.height)) }
                : { height }
            )
          }
        />
        <CompactNumber
          label="Rotation"
          short="R"
          unit="°"
          value={layer.rotation}
          disabled={locked}
          onCommit={(r) => edit([layer.id], { rotation: wrapDegrees(r) })}
        />
      </div>
    </Section>
  )
}

function AppearanceSection({
  layer,
  locked,
  children
}: {
  layer: Layer
  locked: boolean
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <Section id="appearance" title="Appearance">
      <OpacityField
        value={opacityToPercent(layer.opacity)}
        disabled={locked}
        onCommit={(p) => edit([layer.id], { opacity: percentToOpacity(p) })}
      />
      {children}
    </Section>
  )
}

function PhotoSection({
  layer,
  project,
  locked
}: {
  layer: PhotoLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  const solid = layer.frame.style === 'solid' ? layer.frame : null
  const previewOn = useEditor((s) => s.photoDisplay === 'preview')
  const previewPhotos = useEditor((s) => s.previewPhotos)
  const userSamples = useEditor((s) => s.userSamples)
  const crop = useEditor((s) => s.photoCrops[layer.id])
  const cropping = useEditor((s) => s.cropSession?.layerId === layer.id)
  const sampleId = sampleIdFor(layer.photoNumber, previewPhotos)
  const options = [
    ...BUILT_IN_SAMPLES.map((x) => ({ value: x.id, label: x.label })),
    ...userSamples.map((x) => ({ value: x.id, label: `Your photo: ${x.name}` }))
  ]
  const st = (): ReturnType<typeof editorStore.getState> => editorStore.getState()
  return (
    <>
      <Section id="photo" title="Photo">
        <NumberField
          label="Photo number"
          value={layer.photoNumber}
          rule={{ integer: true, min: 1 }}
          disabled={locked}
          onCommit={(photoNumber) => edit([layer.id], { photoNumber })}
        />
        <p className="field-note">
          The capture slot. Repeated numbers are normal (for example, two-up strips). Layer id:{' '}
          {layer.id.slice(-8)}
        </p>
        <SelectField
          label="Photo fit"
          value={layer.fit}
          options={FIT_OPTIONS}
          disabled={locked}
          onCommit={(fit) => edit([layer.id], { fit })}
        />
      </Section>
      <Section id="photo-preview" title="Sample photo">
        <CheckboxField
          label="Preview photos"
          checked={previewOn}
          onCommit={(on) => st().setPhotoDisplay(on ? 'preview' : 'placeholder')}
        />
        <SelectField
          label="Sample"
          value={sampleId}
          options={options}
          onCommit={(id) => st().setSampleFor(layer.photoNumber, id)}
        />
        <p className="field-note">
          Samples are only a preview: they follow the photo number, are not saved in the project and
          are never printed as capture content.
        </p>
        <div className="button-row">
          <Tooltip label="Shuffle photos" {...tipProps('shuffle')}>
            <Button size="sm" icon={Shuffle} onClick={() => st().shufflePhotos()}>
              Shuffle
            </Button>
          </Tooltip>
          <Tooltip label="Reset samples" {...tipProps('resetSamples')}>
            <Button size="sm" onClick={() => st().resetSamples()}>
              Reset samples
            </Button>
          </Tooltip>
          <Tooltip label="Choose photo…" {...tipProps('chooseSample')}>
            <Button
              size="sm"
              onClick={() =>
                void chooseUserPreviewPhoto(layer.photoNumber).then((m) => m && st().setMessage(m))
              }
            >
              Choose photo…
            </Button>
          </Tooltip>
        </div>
        <div className="button-row">
          <Tooltip label="Reposition photo" {...tipProps('reposition')}>
            <Button
              size="sm"
              icon={Move}
              disabled={locked || layer.fit === 'stretch'}
              aria-pressed={cropping}
              onClick={() => (cropping ? st().commitCrop() : st().beginCrop(layer.id))}
            >
              {cropping ? 'Done' : 'Reposition…'}
            </Button>
          </Tooltip>
          <Tooltip label="Reset position" {...tipProps('resetCrop')}>
            <Button
              size="sm"
              icon={RotateCcw}
              disabled={isDefaultCrop(crop)}
              onClick={() => st().resetPhotoCrop(layer.id)}
            >
              Reset position
            </Button>
          </Tooltip>
        </div>
        {layer.fit === 'stretch' && (
          <p className="field-note">
            Stretch fills the frame exactly, so there is nothing to reposition.
          </p>
        )}
      </Section>
      <Section id="photo-frame" title="Frame">
        <SelectField
          label="Frame"
          value={layer.frame.style}
          options={[
            { value: 'none', label: 'None' },
            { value: 'solid', label: 'Solid' }
          ]}
          disabled={locked}
          onCommit={(style) =>
            edit([layer.id], {
              frame:
                style === 'none'
                  ? { style: 'none' }
                  : { style: 'solid', thickness: 12, color: { kind: 'literal', value: '#ffffff' } }
            })
          }
        />
        {solid && (
          <>
            <NumberField
              label="Frame thickness"
              unit="px"
              value={solid.thickness}
              rule={{ positive: true }}
              disabled={locked}
              onCommit={(thickness) => edit([layer.id], { frame: { ...solid, thickness } })}
            />
            <ColorField
              label="Frame color"
              value={solid.color}
              palette={project.palette}
              disabled={locked}
              onCommit={(color, c) => edit([layer.id], { frame: { ...solid, color } }, c)}
            />
          </>
        )}
        <NumberField
          label="Corner radius"
          unit="px"
          value={layer.cornerRadius}
          rule={{ min: 0 }}
          disabled={locked}
          onCommit={(cornerRadius) => edit([layer.id], { cornerRadius })}
        />
        <p className="field-note">
          Thickness and radius are in design pixels ({project.canvas.print.dpi} DPI), so they print
          the same at any zoom. A frame cannot be thicker than half the photo&apos;s shorter side; a
          radius is capped the same way. Shadows are not available yet. Decorative frames are
          imported artwork (Assets).
        </p>
      </Section>
    </>
  )
}

const ROLE_LABELS: Record<ImageLayer['role'], string> = {
  background: 'Background',
  overlay: 'Overlay',
  frame: 'Frame art',
  badge: 'Badge',
  logo: 'Logo',
  graphic: 'Graphic'
}
const DPI_LABEL = { healthy: 'Good for print', caution: 'Check quality', low: 'Low resolution' }

function ImageSection({
  layer,
  project,
  locked
}: {
  layer: ImageLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  const asset = project.assets.find((a) => a.id === layer.assetId)
  const dpi = project.canvas.print.dpi
  const res = asset ? effectiveResolution(asset, layer, dpi, layer.fit) : null
  const st = (): ReturnType<typeof editorStore.getState> => editorStore.getState()
  const inches = (px: number): string => (px / dpi).toFixed(2).replace(/\.?0+$/, '')
  return (
    <Section id="image" title="Image">
      <SelectField
        label="Role"
        value={layer.role}
        options={IMAGE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        disabled={locked}
        onCommit={(role) => edit([layer.id], { role })}
      />
      <SelectField
        label="Image fit"
        value={layer.fit}
        options={FIT_OPTIONS}
        disabled={locked}
        onCommit={(fit) => edit([layer.id], { fit })}
      />
      <dl className="derived" data-testid="image-info">
        <div>
          <dt>Asset</dt>
          <dd title={asset?.filename}>{asset ? asset.filename : 'Missing asset'}</dd>
        </div>
        {asset?.pixelWidth && asset.pixelHeight && (
          <div>
            <dt>Source</dt>
            <dd>
              {asset.pixelWidth}×{asset.pixelHeight} px
            </dd>
          </div>
        )}
        <div>
          <dt>Displayed</dt>
          <dd>
            {Math.round(layer.width)}×{Math.round(layer.height)} px · {inches(layer.width)}×
            {inches(layer.height)} in
          </dd>
        </div>
        <div>
          <dt>Print quality</dt>
          <dd data-testid="image-dpi">
            {res ? (
              <span className={`dpi-badge ${res.status}`}>
                {Math.round(res.dpi)} DPI · {DPI_LABEL[res.status]}
              </span>
            ) : asset?.mediaType === 'image/svg+xml' ? (
              'Vector: sharp at any size'
            ) : (
              'Unknown'
            )}
          </dd>
        </div>
        {asset && (
          <div>
            <dt>Type</dt>
            <dd>{asset.mediaType}</dd>
          </div>
        )}
      </dl>
      {res && res.status !== 'healthy' && (
        <p className="field-note">
          At {dpi} DPI print resolution, 300+ effective DPI is recommended; below 150 looks soft.
        </p>
      )}
      <div className="button-row">
        <Button
          size="sm"
          disabled={locked}
          onClick={() => st().setLayerAsBackground(layer.id)}
          title="Fill the canvas, lock it and send it behind everything"
        >
          Set as background
        </Button>
        <Button
          size="sm"
          disabled={locked || !asset?.pixelWidth}
          onClick={() => st().setImageOriginalSize(layer.id)}
        >
          Original size
        </Button>
        <Button
          size="sm"
          disabled={locked}
          onClick={() => void st().importAssetsFromDialog({ kind: 'replace', layerId: layer.id })}
          title="Choose a different image for this layer only"
        >
          Replace image…
        </Button>
      </div>
    </Section>
  )
}

function ShapeAppearance({
  layer,
  project,
  locked
}: {
  layer: ShapeLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  return (
    <>
      <CheckboxField
        label="Fill"
        checked={layer.fill !== null}
        disabled={locked}
        onCommit={(on) =>
          edit([layer.id], { fill: on ? { kind: 'literal', value: '#4a6fa5' } : null })
        }
      />
      {layer.fill && (
        <ColorField
          label="Fill color"
          value={layer.fill}
          palette={project.palette}
          disabled={locked}
          onCommit={(fill, c) => edit([layer.id], { fill }, c)}
        />
      )}
      <CheckboxField
        label="Stroke"
        checked={layer.stroke !== null}
        disabled={locked}
        onCommit={(on) =>
          edit([layer.id], {
            stroke: on ? { color: { kind: 'literal', value: '#222222' }, width: 6 } : null
          })
        }
      />
      {layer.stroke && (
        <>
          <ColorField
            label="Stroke color"
            value={layer.stroke.color}
            palette={project.palette}
            disabled={locked}
            onCommit={(color, c) => edit([layer.id], { stroke: { ...layer.stroke!, color } }, c)}
          />
          <NumberField
            label="Stroke width"
            unit="px"
            value={layer.stroke.width}
            rule={{ positive: true }}
            disabled={locked}
            onCommit={(width) => edit([layer.id], { stroke: { ...layer.stroke!, width } })}
          />
        </>
      )}
    </>
  )
}

function ShapeSection({
  layer,
  locked
}: {
  layer: ShapeLayer
  locked: boolean
}): React.JSX.Element {
  return (
    <Section id="shape" title="Shape">
      <SelectField
        label="Shape"
        value={layer.shape}
        options={[
          { value: 'rectangle', label: 'Rectangle' },
          { value: 'ellipse', label: 'Ellipse' },
          { value: 'line', label: 'Line' }
        ]}
        disabled={locked}
        onCommit={(shape) => edit([layer.id], { shape })}
      />
      {layer.shape === 'rectangle' && (
        <NumberField
          label="Corner radius"
          unit="px"
          value={layer.cornerRadius}
          rule={{ min: 0 }}
          disabled={locked}
          onCommit={(cornerRadius) => edit([layer.id], { cornerRadius })}
        />
      )}
    </Section>
  )
}

function SingleInspector({
  layer,
  project
}: {
  layer: Layer
  project: TemplateProject
}): React.JSX.Element {
  const locked = !isEditable(project.layers, layer)
  return (
    <>
      <GeneralSection layer={layer} project={project} locked={locked} />
      <TransformSection layer={layer} locked={locked} />
      {/* Group opacity is intentionally not exposed (children carry their own). */}
      {layer.type !== 'group' && (
        <AppearanceSection layer={layer} locked={locked}>
          {layer.type === 'shape' && (
            <ShapeAppearance layer={layer} project={project} locked={locked} />
          )}
        </AppearanceSection>
      )}
      {!locked && (
        <Section id="arrange" title="Align to canvas">
          <ArrangeControls count={1} />
        </Section>
      )}
      {layer.type === 'photo' && <PhotoSection layer={layer} project={project} locked={locked} />}
      {layer.type === 'image' && <ImageSection layer={layer} project={project} locked={locked} />}
      {layer.type === 'text' && (
        <TypographySection layer={layer} project={project} locked={locked} />
      )}
      {layer.type === 'shape' && <ShapeSection layer={layer} locked={locked} />}
    </>
  )
}

function MultiInspector({
  layers,
  project
}: {
  layers: Layer[]
  project: TemplateProject
}): React.JSX.Element {
  const ids = layers.map((l) => l.id)
  const all = (f: (l: Layer) => boolean): boolean => layers.every(f)
  const some = (f: (l: Layer) => boolean): boolean => layers.some(f)
  const opacities = new Set(layers.map((l) => l.opacity))
  const editableIds = layers.filter((l) => isEditable(project.layers, l)).map((l) => l.id)
  const bounds = selectionBounds(project, ids)
  return (
    <>
      <Section id="multi" title={`${layers.length} layers selected`}>
        <CheckboxField
          label="Visible"
          checked={all((l) => l.visible)}
          mixed={some((l) => l.visible) && !all((l) => l.visible)}
          onCommit={(visible) => edit(ids, { visible })}
        />
        <CheckboxField
          label="Locked"
          checked={all((l) => l.locked)}
          mixed={some((l) => l.locked) && !all((l) => l.locked)}
          onCommit={(locked) => edit(ids, { locked })}
        />
        {opacities.size >= 1 && (
          <OpacityField
            value={opacityToPercent(layers[0]?.opacity ?? 1)}
            mixed={opacities.size > 1}
            disabled={editableIds.length === 0}
            onCommit={(p) => edit(editableIds, { opacity: percentToOpacity(p) })}
          />
        )}
        <div className="button-row">
          <Button size="sm" icon={Copy} onClick={() => store.getState().duplicateSelection()}>
            Duplicate
          </Button>
          <Button size="sm" icon={Group} onClick={() => store.getState().groupSelection()}>
            Group
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={Trash2}
            onClick={() => store.getState().deleteSelection()}
          >
            Delete
          </Button>
        </div>
      </Section>
      {/* Aligning is the main job with several layers: keep it near the top, so it stays reachable on short windows
          (6C W6: 1920×1080 at 125 % left it below the fold). */}
      <Section id="arrange" title="Align and distribute">
        <ArrangeControls count={editableIds.length} />
      </Section>
      <Section id="selection-bounds" title="Selection position">
        <div className="grid-2">
          <CompactNumber
            label="X"
            short="X"
            unit="px"
            value={bounds?.x ?? 0}
            disabled={!bounds}
            onCommit={(x) => store.getState().moveSelectionTo({ x })}
          />
          <CompactNumber
            label="Y"
            short="Y"
            unit="px"
            value={bounds?.y ?? 0}
            disabled={!bounds}
            onCommit={(y) => store.getState().moveSelectionTo({ y })}
          />
        </div>
        {bounds && (
          <dl className="derived">
            <div>
              <dt>W</dt>
              <dd>{Math.round(bounds.width * 1000) / 1000}</dd>
            </div>
            <div>
              <dt>H</dt>
              <dd>{Math.round(bounds.height * 1000) / 1000}</dd>
            </div>
          </dl>
        )}
        <p className="field-note">
          X and Y move the whole selection, keeping the spacing between layers. Resize on the
          canvas.
        </p>
      </Section>
    </>
  )
}

function ProjectSummary({ project }: { project: TemplateProject }): React.JSX.Element {
  const px = getPixelSize(project.canvas.print)
  const sheet = getPixelSize(project.output.print)
  const copies = copiesPerSheet(project)
  return (
    <>
      <Section id="project" title="Project">
        <dl className="derived">
          <div>
            <dt>Name</dt>
            <dd>{project.metadata.name}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{describePrint(project.canvas.print).split(' • ').slice(0, 2).join(' · ')}</dd>
          </div>
          <div>
            <dt>Layers</dt>
            <dd>{project.layers.length}</dd>
          </div>
          <div>
            <dt>{copies > 1 ? 'Design size' : 'Print area'}</dt>
            <dd>
              {px.width}×{px.height} px
            </dd>
          </div>
          {copies > 1 && (
            <>
              <div>
                <dt>Print sheet</dt>
                <dd>
                  {printSizeName(project.output.print)} · {sheet.width}×{sheet.height} px
                </dd>
              </div>
              <div>
                <dt>Copies per sheet</dt>
                <dd>{copies}</dd>
              </div>
            </>
          )}
        </dl>
        {copies > 1 && (
          <p className="sheet-info" data-testid="printer-guidance">
            Prints as {copies} identical {printSizeName(project.canvas.print)} copies on one{' '}
            {printSizeName(project.output.print)} sheet. Design one strip; Template Studio places
            the copies. Printer finishing: configure DSLR Booth and your printer for the 2-inch
            center cut.
          </p>
        )}
      </Section>
      <EmptyState icon={MousePointerClick} title="No layer selected">
        Select a layer on the canvas or in the Layers panel to edit it.
      </EmptyState>
    </>
  )
}

export function PropertiesInspector(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selectedIds = useEditor((s) => s.selectedIds)
  if (!project) return null
  const layers = selectedIds
    .map((id) => project.layers.find((l) => l.id === id))
    .filter((l): l is Layer => l !== undefined)
  const only = layers.length === 1 ? layers[0] : undefined
  return (
    <section className="panel inspector-panel" aria-label="Properties" data-editor-panel>
      <header className="panel-header">
        <h2 className="panel-heading">Properties</h2>
        {only && <span className="ui-badge">{layerTypeLabel(only)}</span>}
      </header>
      <div className="inspector-body">
        {layers.length === 0 && <ProjectSummary project={project} />}
        {only && <SingleInspector key={only.id} layer={only} project={project} />}
        {layers.length > 1 && <MultiInspector layers={layers} project={project} />}
      </div>
    </section>
  )
}
