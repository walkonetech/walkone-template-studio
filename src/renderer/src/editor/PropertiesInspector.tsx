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
import { copiesPerSheet, printSizeName } from '@editor/describe'
import { recentFormatLabel } from '@editor/welcome'
import { selectOutputProfile } from '@editor/store'
import { selectionBounds } from '@editor/arrange'
import {
  SECTION_DEFAULT_OPEN,
  appearanceSummary,
  frameSummary,
  layerSummary,
  positionSummary,
  propertiesHeader,
  sharedValue,
  shapeSummary,
  spacingSummary,
  type SectionId
} from '@editor/propertiesModel'
import { opacityToPercent, percentToOpacity } from '@editor/numberInput'
import { printerView } from '@output'
import {
  Copy,
  Eye,
  EyeOff,
  FileText,
  Group,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MousePointerClick,
  Plus,
  Printer,
  Trash2,
  Ungroup
} from 'lucide-react'
import { useId } from 'react'
import { ArrangeControls } from './ArrangeControls'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { TextEssentials, TextSpacingSection } from './TypographySection'
import { PanelSection } from '../ui/PanelSection'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { KindChip } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Segmented } from '../ui/Segmented'
import {
  CheckboxField,
  ColorField,
  CompactNumber,
  FieldRow,
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
  { value: 'cover', label: 'Cover', title: 'Fill the box; the edges may be cropped' },
  { value: 'contain', label: 'Contain', title: 'Fit the whole picture inside the box' },
  { value: 'stretch', label: 'Stretch', title: 'Fill the box exactly, changing the shape' }
] as const

/**
 * A collapsible Properties section (B5): closed by default with a one-line summary of what is inside; opening it is
 * remembered for this session (UI state only, never the project, never undo history).
 */
function Section({
  id,
  title,
  summary,
  children
}: {
  id: SectionId
  title: string
  summary?: string
  children: React.ReactNode
}): React.JSX.Element {
  const open = useLayout((s) => s.sectionOpen[id] ?? SECTION_DEFAULT_OPEN[id])
  return (
    <PanelSection
      title={title}
      open={open}
      sectionId={id}
      onToggle={() => layoutStore.getState().setSectionOpen(id, !open)}
      {...(summary ? { summary } : {})}
    >
      {children}
    </PanelSection>
  )
}

// ---------------------------------------------------------------------------------------------- shared sections

function PositionSection({ layer, locked }: { layer: Layer; locked: boolean }): React.JSX.Element {
  const heightRule =
    layer.type === 'shape' && layer.shape === 'line' ? { min: 0 } : { positive: true }
  if (layer.type === 'group') {
    // A group has no stored geometry of its own: its box is derived from its children. X/Y therefore MOVE the group
    // (translating every child); the size is shown but changes only by transforming the group on the canvas.
    return (
      <Section id="position" title="Position & size" summary={positionSummary(layer)}>
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
          <div>
            <dt>Size</dt>
            <dd>
              {Math.round(layer.width * 1000) / 1000} × {Math.round(layer.height * 1000) / 1000} px
            </dd>
          </div>
        </dl>
        <p className="field-note">
          Moving a group keeps its children&apos;s relative positions. Resize it on the canvas.
        </p>
      </Section>
    )
  }
  return (
    <Section id="position" title="Position & size" summary={positionSummary(layer)}>
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
  locked
}: {
  layer: Layer
  locked: boolean
}): React.JSX.Element {
  return (
    <Section id="appearance" title="Appearance" summary={appearanceSummary(layer)}>
      <OpacityField
        value={opacityToPercent(layer.opacity)}
        disabled={locked}
        onCommit={(p) => edit([layer.id], { opacity: percentToOpacity(p) })}
      />
    </Section>
  )
}

function AlignSection({ count }: { count: number }): React.JSX.Element {
  return (
    <Section id="align" title="Align to canvas">
      <ArrangeControls count={count} />
    </Section>
  )
}

/** The layer's name (visibility and lock are the header's eye and lock buttons). */
function LayerSection({
  layer,
  project
}: {
  layer: Layer
  project: TemplateProject
}): React.JSX.Element {
  const inheritedLock = !layer.locked && !isEditable(project.layers, layer)
  return (
    <Section id="layer" title="Layer" summary={layerSummary(layer)}>
      <TextField
        label="Name"
        value={layer.name}
        allowEmpty={false}
        onCommit={(name) => store.getState().renameLayer(layer.id, name)}
      />
      {inheritedLock && <p className="field-note">Also locked by a parent group.</p>}
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------- per type

/** − 2 + stepper for the photo number (which guest photo of the session goes in this slot). */
function PhotoNumberField({
  layer,
  locked
}: {
  layer: PhotoLayer
  locked: boolean
}): React.JSX.Element {
  const id = useId()
  const set = (n: number): void => {
    if (n >= 1 && n !== layer.photoNumber) edit([layer.id], { photoNumber: n })
  }
  return (
    <FieldRow label="Photo number" htmlFor={id}>
      <span className="stepper">
        <IconButton
          size="sm"
          icon={Minus}
          label="Previous photo number"
          disabled={locked || layer.photoNumber <= 1}
          onClick={() => set(layer.photoNumber - 1)}
        />
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="ui-input num stepper-value"
          defaultValue={layer.photoNumber}
          key={layer.photoNumber}
          disabled={locked}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            const n = Number.parseInt(e.currentTarget.value, 10)
            if (Number.isFinite(n) && n >= 1) set(n)
            else e.currentTarget.value = String(layer.photoNumber)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.currentTarget.value = String(layer.photoNumber)
              e.currentTarget.blur()
            }
          }}
        />
        <IconButton
          size="sm"
          icon={Plus}
          label="Next photo number"
          disabled={locked}
          onClick={() => set(layer.photoNumber + 1)}
        />
        <span className="stepper-note">Shot {layer.photoNumber} of the session</span>
      </span>
    </FieldRow>
  )
}

function PhotoProperties({
  layer,
  project,
  locked
}: {
  layer: PhotoLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  const solid = layer.frame.style === 'solid' ? layer.frame : null
  return (
    <>
      <div className="essentials" data-essentials="photo">
        <PhotoNumberField layer={layer} locked={locked} />
        <FieldRow label="Fit">
          <Segmented
            label="Photo fit"
            value={layer.fit}
            options={FIT_OPTIONS}
            disabled={locked}
            onChange={(fit) => edit([layer.id], { fit })}
          />
        </FieldRow>
        <FieldRow label="Frame">
          <Segmented
            label="Frame"
            value={layer.frame.style}
            options={[
              { value: 'none', label: 'None' },
              { value: 'solid', label: 'Solid' }
            ]}
            disabled={locked}
            onChange={(style) =>
              style !== layer.frame.style &&
              edit([layer.id], {
                frame:
                  style === 'none'
                    ? { style: 'none' }
                    : {
                        style: 'solid',
                        thickness: 12,
                        color: { kind: 'literal', value: '#ffffff' }
                      }
              })
            }
          />
        </FieldRow>
        {solid && (
          <ColorField
            label="Frame color"
            value={solid.color}
            palette={project.palette}
            disabled={locked}
            onCommit={(color, c) => edit([layer.id], { frame: { ...solid, color } }, c)}
          />
        )}
        <NumberField
          label="Corner radius"
          unit="px"
          value={layer.cornerRadius}
          rule={{ min: 0 }}
          disabled={locked}
          onCommit={(cornerRadius) => edit([layer.id], { cornerRadius })}
        />
      </div>
      <PositionSection layer={layer} locked={locked} />
      <Section id="frame-details" title="Frame details" summary={frameSummary(layer)}>
        {solid ? (
          <NumberField
            label="Frame thickness"
            unit="px"
            value={solid.thickness}
            rule={{ positive: true }}
            disabled={locked}
            onCommit={(thickness) => edit([layer.id], { frame: { ...solid, thickness } })}
          />
        ) : (
          <p className="field-note">Choose Solid above to draw a frame around the photo.</p>
        )}
        <p className="field-note">
          Thickness and radius are in design pixels ({project.canvas.print.dpi} DPI), so they print
          the same at any zoom. A frame cannot be thicker than half the photo&apos;s shorter side; a
          radius is capped the same way. Decorative frames are imported artwork (Uploads).
        </p>
      </Section>
      <AppearanceSection layer={layer} locked={locked} />
      {!locked && <AlignSection count={1} />}
      <LayerSection layer={layer} project={project} />
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

function ImageProperties({
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
  const quality = res
    ? `${Math.round(res.dpi)} DPI · ${DPI_LABEL[res.status]}`
    : asset?.mediaType === 'image/svg+xml'
      ? 'Vector: sharp at any size'
      : 'Unknown'
  return (
    <>
      <div className="essentials" data-essentials="image">
        <SelectField
          label="Role"
          value={layer.role}
          options={IMAGE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          disabled={locked}
          onCommit={(role) => edit([layer.id], { role })}
        />
        <FieldRow label="Fit">
          <Segmented
            label="Image fit"
            value={layer.fit}
            options={FIT_OPTIONS}
            disabled={locked}
            onChange={(fit) => edit([layer.id], { fit })}
          />
        </FieldRow>
        <OpacityField
          value={opacityToPercent(layer.opacity)}
          disabled={locked}
          onCommit={(p) => edit([layer.id], { opacity: percentToOpacity(p) })}
        />
        <FieldRow label="Print quality">
          <span data-testid="image-dpi">
            {res ? <span className={`dpi-badge ${res.status}`}>{quality}</span> : quality}
          </span>
        </FieldRow>
        {res && res.status !== 'healthy' && (
          <p className="field-note">
            At {dpi} DPI print resolution, 300+ effective DPI is recommended; below 150 looks soft.
          </p>
        )}
        <div className="button-row">
          <Button
            size="sm"
            disabled={locked}
            onClick={() => void st().importAssetsFromDialog({ kind: 'replace', layerId: layer.id })}
            title="Choose a different image for this layer only"
          >
            Replace image…
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
            onClick={() => st().setLayerAsBackground(layer.id)}
            title="Fill the canvas, lock it and send it behind everything"
          >
            Set as background
          </Button>
        </div>
      </div>
      <PositionSection layer={layer} locked={locked} />
      <Section
        id="image-details"
        title="Image details"
        summary={asset ? asset.filename : 'Missing asset'}
      >
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
            <dd>{quality}</dd>
          </div>
          {asset && (
            <div>
              <dt>Type</dt>
              <dd>{asset.mediaType}</dd>
            </div>
          )}
        </dl>
      </Section>
      {!locked && <AlignSection count={1} />}
      <LayerSection layer={layer} project={project} />
    </>
  )
}

function ShapeProperties({
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
      <div className="essentials" data-essentials="shape">
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
        <p className="field-note essentials-summary">{shapeSummary(layer)}</p>
      </div>
      <PositionSection layer={layer} locked={locked} />
      <AppearanceSection layer={layer} locked={locked} />
      {!locked && <AlignSection count={1} />}
      <LayerSection layer={layer} project={project} />
    </>
  )
}

function GroupProperties({
  layer,
  project,
  locked
}: {
  layer: Layer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  const inside = project.layers.filter((l) => l.parentId === layer.id).length
  return (
    <>
      <div className="essentials" data-essentials="group">
        <FieldRow label="Layers inside">
          <span className="field-value">{inside}</span>
        </FieldRow>
        <div className="button-row">
          <Button
            size="sm"
            icon={Ungroup}
            disabled={locked}
            onClick={() => store.getState().ungroupSelection()}
          >
            Ungroup
          </Button>
        </div>
      </div>
      <PositionSection layer={layer} locked={locked} />
      {!locked && <AlignSection count={1} />}
      <LayerSection layer={layer} project={project} />
    </>
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
      {locked && (
        <p className="field-note locked-note" role="note">
          <Lock size={12} aria-hidden="true" /> This layer is locked. Unlock it to edit.
        </p>
      )}
      {layer.type === 'text' && (
        <>
          <TextEssentials layer={layer} project={project} locked={locked} />
          <PositionSection layer={layer} locked={locked} />
          <Section id="spacing" title="Spacing & box" summary={spacingSummary(layer)}>
            <TextSpacingSection layer={layer} locked={locked} />
          </Section>
          <AppearanceSection layer={layer} locked={locked} />
          {!locked && <AlignSection count={1} />}
          <LayerSection layer={layer} project={project} />
        </>
      )}
      {layer.type === 'photo' && (
        <PhotoProperties layer={layer} project={project} locked={locked} />
      )}
      {layer.type === 'image' && (
        <ImageProperties layer={layer} project={project} locked={locked} />
      )}
      {layer.type === 'shape' && (
        <ShapeProperties layer={layer} project={project} locked={locked} />
      )}
      {layer.type === 'group' && (
        <GroupProperties layer={layer} project={project} locked={locked} />
      )}
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
  const visible = sharedValue(layers, (l) => l.visible)
  const lockedAll = sharedValue(layers, (l) => l.locked)
  const opacity = sharedValue(layers, (l) => l.opacity)
  const editableIds = layers.filter((l) => isEditable(project.layers, l)).map((l) => l.id)
  const bounds = selectionBounds(project, ids)
  return (
    <>
      <div className="essentials" data-essentials="multi">
        <div className="essentials-block">
          <span className="essentials-label">Align and distribute</span>
          <ArrangeControls count={editableIds.length} />
        </div>
        <OpacityField
          value={opacityToPercent(opacity === 'mixed' ? 1 : opacity)}
          mixed={opacity === 'mixed'}
          disabled={editableIds.length === 0}
          onCommit={(p) => edit(editableIds, { opacity: percentToOpacity(p) })}
        />
        <div className="check-pair">
          <CheckboxField
            label="Visible"
            checked={visible === true}
            mixed={visible === 'mixed'}
            onCommit={(v) => edit(ids, { visible: v })}
          />
          <CheckboxField
            label="Locked"
            checked={lockedAll === true}
            mixed={lockedAll === 'mixed'}
            onCommit={(v) => edit(ids, { locked: v })}
          />
        </div>
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
      </div>
      <Section
        id="selection-position"
        title="Selection position"
        {...(bounds ? { summary: positionSummary({ ...bounds, rotation: 0 }) } : {})}
      >
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
              <dt>Size</dt>
              <dd>
                {Math.round(bounds.width * 1000) / 1000} × {Math.round(bounds.height * 1000) / 1000}{' '}
                px
              </dd>
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

/** Nothing selected (B1 mockup 02b): the project's format, printer and printing notes. */
function ProjectProperties({ project }: { project: TemplateProject }): React.JSX.Element {
  const px = getPixelSize(project.canvas.print)
  const sheet = getPixelSize(project.output.print)
  const copies = copiesPerSheet(project)
  const profile = useEditor(selectOutputProfile)
  const pv = profile ? printerView(profile) : null
  return (
    <>
      <div className="essentials" data-essentials="project">
        <FieldRow label="Name">
          <span className="field-value">{project.metadata.name}</span>
        </FieldRow>
        <FieldRow label="Format">
          <span className="format-card" data-testid="project-format">
            <span
              className="format-swatch"
              aria-hidden="true"
              style={{
                aspectRatio: `${project.canvas.print.width} / ${project.canvas.print.height}`
              }}
            />
            <span>
              <strong>
                {recentFormatLabel(project.canvas.print) ?? printSizeName(project.canvas.print)} ·{' '}
                {project.canvas.print.dpi} DPI
              </strong>
              <span className="format-sub">
                {px.width} × {px.height} px
                {copies > 1
                  ? ` · prints ${copies === 2 ? 'two' : copies} per ${printSizeName(project.output.print)} sheet`
                  : ''}
              </span>
            </span>
          </span>
        </FieldRow>
        <FieldRow label="Printer">
          <Button
            size="sm"
            variant="ghost"
            icon={Printer}
            onClick={() => layoutStore.getState().setOutputProfileOpen(true)}
          >
            {pv && profile
              ? `${profile.shortName} · ${pv.readiness.label}`
              : 'No printer · Choose…'}
          </Button>
        </FieldRow>
      </div>
      <Section
        id="printing-notes"
        title="Printing notes"
        summary={
          copies > 1
            ? `${copies} per sheet · ${printSizeName(project.output.print)}`
            : 'One per print'
        }
      >
        <dl className="derived">
          <div>
            <dt>{copies > 1 ? 'Design size' : 'Print area'}</dt>
            <dd>
              {px.width}×{px.height} px
            </dd>
          </div>
          {copies > 1 && (
            <div>
              <dt>Print sheet</dt>
              <dd>
                {printSizeName(project.output.print)} · {sheet.width}×{sheet.height} px
              </dd>
            </div>
          )}
          <div>
            <dt>Layers</dt>
            <dd>{project.layers.length}</dd>
          </div>
        </dl>
        {copies > 1 && (
          <p className="sheet-info" data-testid="printer-guidance">
            Prints as {copies} identical {printSizeName(project.canvas.print)} copies on one{' '}
            {printSizeName(project.output.print)} sheet. Design one strip; Template Studio places
            the copies. Printer finishing: configure dslrBooth and your printer for the 2-inch
            center cut. To see where the printer trims and cuts, choose Printer &amp; cutting… in
            the View menu.
          </p>
        )}
      </Section>
      <EmptyState icon={MousePointerClick} title="No layer selected">
        Select a layer on the canvas or in the Layers panel to edit it.
      </EmptyState>
    </>
  )
}

/** Pinned header: kind, name and what it is; eye and lock for one layer (B1 mockups 03/04). */
function PropertiesHeader({
  layers,
  project
}: {
  layers: Layer[]
  project: TemplateProject
}): React.JSX.Element {
  const only = layers.length === 1 ? layers[0] : undefined
  const head =
    layers.length === 0
      ? { title: 'Project', subtitle: 'Nothing selected' }
      : propertiesHeader(layers, project.layers)
  return (
    <div className="props-head" data-testid="properties-header">
      {only ? (
        <KindChip kind={only.type} />
      ) : (
        <span className="props-head-icon" aria-hidden="true">
          {layers.length === 0 ? <FileText size={15} /> : <Layers size={15} />}
        </span>
      )}
      <span className="props-head-text">
        <span className="props-head-title" title={head.title}>
          {head.title}
        </span>
        <span className="props-head-sub">{head.subtitle}</span>
      </span>
      {only && (
        <span className="props-head-actions">
          <IconButton
            size="sm"
            icon={only.visible ? Eye : EyeOff}
            label={only.visible ? `Hide ${only.name}` : `Show ${only.name}`}
            pressed={!only.visible}
            onClick={() => edit([only.id], { visible: !only.visible })}
          />
          <IconButton
            size="sm"
            icon={only.locked ? Lock : LockOpen}
            label={only.locked ? `Unlock ${only.name}` : `Lock ${only.name}`}
            pressed={only.locked}
            onClick={() => edit([only.id], { locked: !only.locked })}
          />
        </span>
      )}
    </div>
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
      </header>
      <PropertiesHeader layers={layers} project={project} />
      <div className="inspector-body">
        {layers.length === 0 && <ProjectProperties project={project} />}
        {only && <SingleInspector key={only.id} layer={only} project={project} />}
        {layers.length > 1 && <MultiInspector layers={layers} project={project} />}
      </div>
    </section>
  )
}
