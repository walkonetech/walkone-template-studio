import { useEffect } from 'react'
import {
  Camera,
  Circle,
  Minus,
  Palette,
  RotateCcw,
  Shapes,
  Shuffle,
  Square,
  Type,
  Upload,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PhotoLayer, TextLayer } from '@domain'
import { TEXT_PRESETS } from '@editor/textPresets'
import {
  DRAWER_WIDTH_MAX,
  DRAWER_WIDTH_MIN,
  drawerClosesOnCanvasClick,
  type DrawerMode
} from '@editor/layout'
import { TOOLS, type ToolId } from '@editor/tools'
import type { NewLayerKind } from '@editor/newLayers'
import { AssetsDrawer } from './AssetsDrawer'
import { CanvasBackgroundSection } from './CanvasBackgroundSection'
import { PalettePanel } from './PalettePanel'
import { FontInventoryPanel } from './FontInventoryPanel'
import { fontStatusOf } from './fontCatalog'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { runCommand } from './commandRunner'
import { tipProps } from './tips'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Switch } from '../ui/Controls'
import { Splitter } from '../ui/Splitter'
import { Tooltip } from '../ui/Tooltip'

const st = editorStore.getState

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  elements: Shapes,
  text: Type,
  photos: Camera,
  uploads: Upload,
  colors: Palette
}

/**
 * The labelled left rail (B1): icon + word for every category, never icon-only mystery navigation. The active
 * category uses the accent (selection/navigation colour), never an element-kind colour.
 */
export function ToolRail(): React.JSX.Element {
  const tool = useLayout((s) => s.tool)
  const open = useLayout((s) => s.drawerOpen)
  return (
    <nav className="toolrail" aria-label="Tools" data-editor-panel data-region="rail">
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.id]
        const active = tool === t.id && open
        return (
          <Tooltip key={t.id} label={t.label} hint={t.hint} placement="right">
            <button
              type="button"
              className={`toolrail-btn ${active ? 'active' : ''}`}
              data-tool={t.id}
              aria-pressed={active}
              aria-controls={active ? 'tool-drawer' : undefined}
              onClick={() => layoutStore.getState().clickTool(t.id)}
            >
              <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}

/** A large "add" card: the element, plus one line on what it is for. Stays in the drawer after adding (B1). */
function AddCard({
  icon: Icon,
  title,
  sub,
  onClick,
  primary,
  testId
}: {
  icon: LucideIcon
  title: string
  sub: string
  onClick: () => void
  primary?: boolean
  testId?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`add-card${primary ? ' primary' : ''}`}
      onClick={onClick}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="add-card-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="add-card-text">
        <strong>{title}</strong>
        <span className="sub">{sub}</span>
      </span>
    </button>
  )
}

const SHAPES: readonly { kind: NewLayerKind; label: string; icon: LucideIcon }[] = [
  { kind: 'rectangle', label: 'Rectangle', icon: Square },
  { kind: 'ellipse', label: 'Ellipse', icon: Circle },
  { kind: 'line', label: 'Line', icon: Minus }
]

function ElementsBody(): React.JSX.Element {
  return (
    <>
      <AddCard
        icon={Camera}
        title="Photo slot"
        sub="Where the booth puts a guest photo"
        testId="add-photo"
        onClick={() => st().addNewLayer('photo')}
      />
      <AddCard
        icon={Type}
        title="Text"
        sub="Names, date, hashtag"
        testId="add-text"
        onClick={() => st().addNewLayer('text')}
      />
      <section aria-label="Shapes">
        <h3 className="section-heading">Shapes</h3>
        <div className="shape-tiles">
          {SHAPES.map((s) => (
            <button
              key={s.kind}
              type="button"
              className="shape-tile"
              data-testid={`add-${s.kind}`}
              onClick={() => st().addNewLayer(s.kind)}
            >
              <s.icon size={24} strokeWidth={1.5} aria-hidden="true" />
              {s.label}
            </button>
          ))}
        </div>
      </section>
      <section aria-label="Graphics">
        <h3 className="section-heading">Graphics</h3>
        <p className="drawer-note">
          Frames, badges and overlays will appear here when the asset library exists. Use Uploads
          for your own art.
        </p>
      </section>
    </>
  )
}

function TextBody(): React.JSX.Element {
  const selected = useEditor((s): TextLayer | null => {
    if (!s.project || s.selectedIds.length !== 1) return null
    const l = s.project.layers.find((x) => x.id === s.selectedIds[0])
    return l?.type === 'text' ? l : null
  })
  return (
    <>
      <AddCard
        icon={Type}
        title="Add text"
        sub="A new text box in the middle of the design"
        primary
        testId="add-text"
        onClick={() => st().addNewLayer('text')}
      />
      <section aria-label="Text styles" data-testid="text-styles">
        <h3 className="section-heading">Text styles</h3>
        {selected ? (
          <ul className="style-cards">
            {TEXT_PRESETS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`style-card style-${p.id}`}
                  aria-label={`Apply ${p.label} to “${selected.name}”`}
                  onClick={() =>
                    st().applyTextPreset(
                      selected.id,
                      p.id,
                      (f) => fontStatusOf(f).availability === 'available'
                    )
                  }
                >
                  <strong>{p.label}</strong>
                  <span className="sub">{p.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="drawer-note">
            Select a text layer to apply a style: title, names, date and more.
          </p>
        )}
      </section>
      <FontInventoryPanel />
    </>
  )
}

function PhotosBody(): React.JSX.Element {
  const display = useEditor((s) => s.photoDisplay)
  const layers = useEditor((s) => s.project?.layers)
  const selectedIds = useEditor((s) => s.selectedIds)
  const sorted = (layers ?? [])
    .filter((l): l is PhotoLayer => l.type === 'photo')
    .sort((a, b) => a.photoNumber - b.photoNumber)
  return (
    <>
      <AddCard
        icon={Camera}
        title="Add photo slot"
        sub="Where the booth places a guest photo. Part of the template."
        primary
        testId="add-photo"
        onClick={() => st().addNewLayer('photo')}
      />
      <section aria-label="Sample photos" data-testid="sample-photos">
        <h3 className="section-heading">Sample photos</h3>
        <p className="drawer-note">
          Example pictures that fill the photo slots while you design, so you can judge the layout.
          View only: they are never saved or exported.
        </p>
        <Switch
          label="Show sample photos"
          checked={display === 'preview'}
          onChange={() => runCommand('view.previewPhotos')}
        />
        <div className="drawer-row">
          <Tooltip label="Shuffle photos" {...tipProps('shuffle')}>
            <Button
              size="sm"
              icon={Shuffle}
              disabled={display !== 'preview'}
              onClick={() => runCommand('view.shufflePhotos')}
            >
              Shuffle
            </Button>
          </Tooltip>
          <Tooltip label="Reset samples" {...tipProps('resetSamples')}>
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              disabled={display !== 'preview'}
              onClick={() => st().resetSamples()}
            >
              Reset
            </Button>
          </Tooltip>
        </div>
      </section>
      <section aria-label="Photo slots in this design">
        <h3 className="section-heading">Photo slots in this design ({sorted.length})</h3>
        {sorted.length === 0 ? (
          <p className="drawer-note">No photo slots yet. Add one above.</p>
        ) : (
          <ul className="slot-list">
            {sorted.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={`slot-row${selectedIds.includes(l.id) ? ' selected' : ''}`}
                  onClick={() => st().selectLayer(l.id)}
                >
                  <Camera size={15} aria-hidden="true" className="kind-photo" />
                  <span className="grow">{l.name}</span>
                  <span className="ui-badge photo-number">#{l.photoNumber}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function ColorsBody(): React.JSX.Element {
  return (
    <>
      <PalettePanel />
      <CanvasBackgroundSection />
    </>
  )
}

/**
 * The tool drawer: docked beside the canvas on roomy windows, floating over the canvas (anchored beside the rail)
 * on narrower ones. It stays open while several things are added; a floating drawer closes on a canvas click, on
 * another rail category, on Close and on Escape. Its width (240–360 px) is remembered on this computer only.
 */
export function ToolDrawer({ mode }: { mode: DrawerMode }): React.JSX.Element | null {
  const open = useLayout((s) => s.drawerOpen)
  const tool = useLayout((s) => s.tool)
  const width = useLayout((s) => s.drawerWidth)
  useEffect(() => {
    if (!open || !drawerClosesOnCanvasClick(mode)) return
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest('.canvas-host'))
        layoutStore.getState().closeDrawer()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [open, mode])
  if (!open) return null
  const def = TOOLS.find((t) => t.id === tool)
  if (!def) return null
  return (
    <aside
      id="tool-drawer"
      className={`tooldrawer ${mode}`}
      aria-label={def.label}
      data-editor-panel
      data-region="drawer"
      data-mode={mode}
      data-tool={tool}
      style={{ width }}
    >
      <header className="drawer-header">
        <h2 className="drawer-title">{def.label}</h2>
        <IconButton
          size="sm"
          icon={X}
          label="Close"
          {...tipProps('closeDrawer')}
          onClick={() => layoutStore.getState().closeDrawer()}
        />
      </header>
      {tool === 'uploads' ? (
        <AssetsDrawer />
      ) : (
        <div className="drawer-body">
          {tool === 'elements' && <ElementsBody />}
          {tool === 'text' && <TextBody />}
          {tool === 'photos' && <PhotosBody />}
          {tool === 'colors' && <ColorsBody />}
        </div>
      )}
      <Splitter
        orientation="vertical"
        label="Resize drawer"
        value={width}
        min={DRAWER_WIDTH_MIN}
        max={DRAWER_WIDTH_MAX}
        onChange={(w) => layoutStore.getState().setDrawerWidth(w)}
      />
    </aside>
  )
}
