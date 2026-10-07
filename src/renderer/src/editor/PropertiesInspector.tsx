import {
  IMAGE_ROLES,
  getPixelSize,
  isEditable,
  type ImageLayer,
  type Layer,
  type PhotoLayer,
  type ShapeLayer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import { wrapDegrees } from '@canvas/geometry/geometry'
import { describePrint } from '@editor/describe'
import { opacityToPercent, percentToOpacity } from '@editor/numberInput'
import { layerTypeLabel } from '@editor/layerTree'
import { editorStore, useEditor } from './editorStore'
import {
  CheckboxField,
  ColorField,
  NumberField,
  SelectField,
  TextAreaField,
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
const FONT_FAMILIES = [
  'Georgia',
  'Helvetica',
  'Arial',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Impact'
]
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: w,
  label: String(w)
}))

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <fieldset className="inspector-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
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
    <Section title="Layer">
      <TextField
        label="Name"
        value={layer.name}
        allowEmpty={false}
        onCommit={(name) => store.getState().renameLayer(layer.id, name)}
      />
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
      <p className="field-note">
        {layerTypeLabel(layer)}
        {locked ? ' · editing is disabled while locked' : ''}
      </p>
    </Section>
  )
}

function GeometrySection({ layer, locked }: { layer: Layer; locked: boolean }): React.JSX.Element {
  const isGroup = layer.type === 'group'
  const heightRule =
    layer.type === 'shape' && layer.shape === 'line' ? { min: 0 } : { positive: true }
  if (isGroup) {
    return (
      <Section title="Position & size (design px, derived from children)">
        <dl className="derived">
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <div key={k}>
              <dt>{k.toUpperCase()}</dt>
              <dd>{Math.round(layer[k] * 1000) / 1000}</dd>
            </div>
          ))}
        </dl>
        <p className="field-note">
          Move or resize the group on the canvas; its box follows its children.
        </p>
      </Section>
    )
  }
  return (
    <Section title="Position & size (design px)">
      <NumberField
        label="X"
        unit="px"
        value={layer.x}
        disabled={locked}
        onCommit={(x) => edit([layer.id], { x })}
      />
      <NumberField
        label="Y"
        unit="px"
        value={layer.y}
        disabled={locked}
        onCommit={(y) => edit([layer.id], { y })}
      />
      <NumberField
        label="Width"
        unit="px"
        value={layer.width}
        rule={{ positive: true }}
        disabled={locked}
        onCommit={(width) => edit([layer.id], { width })}
      />
      <NumberField
        label="Height"
        unit="px"
        value={layer.height}
        rule={heightRule}
        disabled={locked}
        onCommit={(height) => edit([layer.id], { height })}
      />
      <NumberField
        label="Rotation"
        unit="°"
        value={layer.rotation}
        disabled={locked}
        onCommit={(r) => edit([layer.id], { rotation: wrapDegrees(r) })}
      />
      <NumberField
        label="Opacity"
        unit="%"
        value={opacityToPercent(layer.opacity)}
        rule={{ min: 0, max: 100 }}
        disabled={locked}
        onCommit={(p) => edit([layer.id], { opacity: percentToOpacity(p) })}
      />
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
  const sample = layer.sampleAssetId
    ? project.assets.find((a) => a.id === layer.sampleAssetId)
    : undefined
  const solid = layer.frame.style === 'solid' ? layer.frame : null
  return (
    <Section title="Photo placeholder">
      <NumberField
        label="Photo number"
        value={layer.photoNumber}
        rule={{ integer: true, min: 1 }}
        disabled={locked}
        onCommit={(photoNumber) => edit([layer.id], { photoNumber })}
      />
      <p className="field-note">
        Repeated numbers are normal (for example, two-up strips). Layer id: {layer.id.slice(-8)}
      </p>
      <SelectField
        label="Photo fit"
        value={layer.fit}
        options={FIT_OPTIONS}
        disabled={locked}
        onCommit={(fit) => edit([layer.id], { fit })}
      />
      <NumberField
        label="Corner radius"
        unit="px"
        value={layer.cornerRadius}
        rule={{ min: 0 }}
        disabled={locked}
        onCommit={(cornerRadius) => edit([layer.id], { cornerRadius })}
      />
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
      {sample && <p className="field-note">Preview image: {sample.filename}</p>}
    </Section>
  )
}

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
  return (
    <Section title="Image">
      <SelectField
        label="Role"
        value={layer.role}
        options={IMAGE_ROLES.map((r) => ({ value: r, label: r }))}
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
      <dl className="derived">
        <div>
          <dt>Asset</dt>
          <dd>{asset ? asset.filename : 'Missing asset'}</dd>
        </div>
        {asset?.pixelWidth && asset.pixelHeight && (
          <div>
            <dt>Source</dt>
            <dd>
              {asset.pixelWidth}×{asset.pixelHeight} px
            </dd>
          </div>
        )}
        {asset && (
          <div>
            <dt>Type</dt>
            <dd>{asset.mediaType}</dd>
          </div>
        )}
      </dl>
    </Section>
  )
}

function TextSection({
  layer,
  project,
  locked
}: {
  layer: TextLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  return (
    <Section title="Text">
      <TextAreaField
        label="Content"
        value={layer.content}
        disabled={locked}
        onCommit={(content) => store.getState().commitText(layer.id, content)}
      />
      <datalist id="font-families">
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <TextField
        label="Font family"
        value={layer.fontFamily}
        list="font-families"
        allowEmpty={false}
        disabled={locked}
        onCommit={(fontFamily) => edit([layer.id], { fontFamily })}
      />
      <NumberField
        label="Font size"
        unit="px"
        value={layer.fontSize}
        rule={{ positive: true }}
        disabled={locked}
        onCommit={(fontSize) => edit([layer.id], { fontSize })}
      />
      <SelectField
        label="Weight"
        value={layer.fontWeight}
        options={WEIGHTS}
        disabled={locked}
        onCommit={(fontWeight) => edit([layer.id], { fontWeight })}
      />
      <SelectField
        label="Style"
        value={layer.fontStyle}
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'italic', label: 'Italic' }
        ]}
        disabled={locked}
        onCommit={(fontStyle) => edit([layer.id], { fontStyle })}
      />
      <SelectField
        label="Align"
        value={layer.align}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' }
        ]}
        disabled={locked}
        onCommit={(align) => edit([layer.id], { align })}
      />
      <NumberField
        label="Line height"
        unit="×"
        value={layer.lineHeight}
        rule={{ positive: true }}
        disabled={locked}
        onCommit={(lineHeight) => edit([layer.id], { lineHeight })}
      />
      <NumberField
        label="Letter spacing"
        unit="px"
        value={layer.letterSpacing}
        disabled={locked}
        onCommit={(letterSpacing) => edit([layer.id], { letterSpacing })}
      />
      <ColorField
        label="Color"
        value={layer.fill}
        palette={project.palette}
        disabled={locked}
        onCommit={(fill, c) => edit([layer.id], { fill }, c)}
      />
    </Section>
  )
}

function ShapeSection({
  layer,
  project,
  locked
}: {
  layer: ShapeLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  return (
    <Section title="Shape">
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
      <GeometrySection layer={layer} locked={locked} />
      {layer.type === 'photo' && <PhotoSection layer={layer} project={project} locked={locked} />}
      {layer.type === 'image' && <ImageSection layer={layer} project={project} locked={locked} />}
      {layer.type === 'text' && <TextSection layer={layer} project={project} locked={locked} />}
      {layer.type === 'shape' && <ShapeSection layer={layer} project={project} locked={locked} />}
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
  return (
    <>
      <Section title={`${layers.length} layers selected`}>
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
          <NumberField
            label="Opacity"
            unit="%"
            value={opacityToPercent(layers[0]?.opacity ?? 1)}
            mixed={opacities.size > 1}
            rule={{ min: 0, max: 100 }}
            disabled={editableIds.length === 0}
            onCommit={(p) => edit(editableIds, { opacity: percentToOpacity(p) })}
          />
        )}
        <div className="button-row">
          <button type="button" onClick={() => store.getState().duplicateSelection()}>
            Duplicate
          </button>
          <button type="button" onClick={() => store.getState().groupSelection()}>
            Group
          </button>
          <button type="button" onClick={() => store.getState().deleteSelection()}>
            Delete
          </button>
        </div>
        <p className="field-note">
          Position and size are edited per layer: select one layer, or move the whole selection on
          the canvas.
        </p>
      </Section>
    </>
  )
}

function ProjectSummary({ project }: { project: TemplateProject }): React.JSX.Element {
  const px = getPixelSize(project.canvas.print)
  return (
    <Section title="Project">
      <dl className="derived">
        <div>
          <dt>Name</dt>
          <dd>{project.metadata.name}</dd>
        </div>
        <div>
          <dt>Canvas</dt>
          <dd>{describePrint(project.canvas.print)}</dd>
        </div>
        <div>
          <dt>Layers</dt>
          <dd>{project.layers.length}</dd>
        </div>
        <div>
          <dt>Print area</dt>
          <dd>
            {px.width}×{px.height} px
          </dd>
        </div>
      </dl>
      <p className="field-note">
        Select a layer on the canvas or in the Layers panel to edit its properties. Geometry is in
        design pixels.
      </p>
    </Section>
  )
}

export function PropertiesInspector(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selectedIds = useEditor((s) => s.selectedIds)
  if (!project) return null
  const layers = selectedIds
    .map((id) => project.layers.find((l) => l.id === id))
    .filter((l): l is Layer => l !== undefined)
  return (
    <section className="panel inspector-panel" aria-label="Properties" data-editor-panel>
      <header className="panel-header">
        <h2>Properties</h2>
      </header>
      <div className="inspector-body">
        {layers.length === 0 && <ProjectSummary project={project} />}
        {layers.length === 1 && layers[0] && (
          <SingleInspector key={layers[0].id} layer={layers[0]} project={project} />
        )}
        {layers.length > 1 && <MultiInspector layers={layers} project={project} />}
      </div>
    </section>
  )
}
