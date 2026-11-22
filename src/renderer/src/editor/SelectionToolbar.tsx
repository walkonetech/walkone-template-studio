import { useLayoutEffect, useRef, useState } from 'react'
import {
  AlignCenterVertical,
  ChevronDown,
  Copy,
  Frame,
  Group,
  ImageUp,
  Layers,
  Minus,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Ungroup
} from 'lucide-react'
import { isEditable, type Layer } from '@domain'
import { resolveColor } from '@canvas/rendering/color'
import { selectionBounds } from '@editor/arrange'
import {
  TOOLBAR_MAX_DOTS,
  colorTarget,
  currentColor,
  placeToolbar,
  toScreenRect,
  toolbarActions,
  toolbarKind,
  toolbarVisible,
  type ToolbarAction
} from '@editor/selectionToolbar'
import { selectViewMode, selectViewTransform } from '@editor/store'
import { editorStore, useEditor } from './editorStore'
import { layoutStore } from './layoutStore'
import { runCommand } from './commandRunner'
import { ArrangeControls } from './ArrangeControls'
import { useAppearance } from '../appearance/appearanceStore'
import { MenuPopover, type MenuEntry } from '../ui/Menu'
import { Popover } from '../ui/Popover'

const st = editorStore.getState

/** A toolbar button that opens a menu (Arrange, Frame, More). */
function MenuAction({
  label,
  icon: Icon,
  entries,
  showLabel = true,
  testId
}: {
  label: string
  icon: typeof Copy
  entries: readonly MenuEntry[]
  showLabel?: boolean
  testId: string
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="seltb-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-action={testId}
        title={showLabel ? undefined : label}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Icon size={15} aria-hidden="true" />
        {showLabel && <span>{label}</span>}
        {showLabel && <ChevronDown size={13} aria-hidden="true" className="caret" />}
      </button>
      {anchor && (
        <MenuPopover
          anchor={anchor}
          entries={entries}
          label={label}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  )
}

/** Event Palette dots for the layer's colour (the real palette; a project without one gets "Event colors…"). */
function ColorDots({ layer }: { layer: Layer }): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const target = colorTarget(layer)
  if (!project || !target) return null
  const colors = project.palette.colors.slice(0, TOOLBAR_MAX_DOTS)
  if (colors.length === 0) {
    return (
      <button
        type="button"
        className="seltb-btn"
        data-action="colors"
        onClick={() => {
          const l = layoutStore.getState()
          if (!(l.drawerOpen && l.tool === 'colors')) l.clickTool('colors')
        }}
      >
        <Palette size={15} aria-hidden="true" />
        <span>Event colors…</span>
      </button>
    )
  }
  const current = currentColor(layer, target)
  const activeId = current?.kind === 'palette' ? current.paletteColorId : null
  const set = (paletteColorId: string): void => {
    const value = { kind: 'palette' as const, paletteColorId }
    if (layer.type === 'text') st().editLayers([layer.id], { fill: value })
    else if (layer.type === 'shape') {
      if (target === 'fill') st().editLayers([layer.id], { fill: value })
      else if (layer.stroke)
        st().editLayers([layer.id], { stroke: { ...layer.stroke, color: value } })
    }
  }
  return (
    <span
      className="seltb-dots"
      role="radiogroup"
      aria-label={`${target === 'fill' ? 'Color' : 'Line color'} from the Event Palette`}
      data-action="colors"
    >
      {colors.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={activeId === c.id}
          aria-label={`${c.name} (${c.value})`}
          title={c.name}
          className="seltb-dot"
          style={{
            background: resolveColor(project.palette, { kind: 'palette', paletteColorId: c.id })
          }}
          onClick={() => set(c.id)}
        />
      ))}
    </span>
  )
}

/** Align / distribute for several layers, in a small popover (the same controls as Properties). */
function AlignAction({ count }: { count: number }): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="seltb-btn"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-action="align"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <AlignCenterVertical size={15} aria-hidden="true" />
        <span>Align</span>
        <ChevronDown size={13} aria-hidden="true" className="caret" />
      </button>
      {anchor && (
        <Popover
          anchor={anchor}
          label="Align and distribute"
          onClose={() => setAnchor(null)}
          placement="bottom"
          testId="toolbar-align"
        >
          <div className="seltb-pop">
            <ArrangeControls count={count} />
          </div>
        </Popover>
      )}
    </>
  )
}

const ARRANGE: readonly MenuEntry[] = [
  { id: 'front', label: 'Bring to front', onSelect: () => runCommand('arrange.bringToFront') },
  { id: 'forward', label: 'Bring forward', onSelect: () => runCommand('arrange.bringForward') },
  { id: 'backward', label: 'Send backward', onSelect: () => runCommand('arrange.sendBackward') },
  { id: 'back', label: 'Send to back', onSelect: () => runCommand('arrange.sendToBack') }
]

function Action({ id, layers }: { id: ToolbarAction; layers: Layer[] }): React.JSX.Element | null {
  const only = layers.length === 1 ? layers[0]! : null
  const ids = layers.map((l) => l.id)
  switch (id) {
    case 'edit-text':
      return only ? (
        <button
          type="button"
          className="seltb-btn"
          data-action="edit-text"
          onClick={() => st().beginTextEdit(only.id)}
        >
          <Pencil size={15} aria-hidden="true" />
          <span>Edit text</span>
        </button>
      ) : null
    case 'colors':
      return only ? <ColorDots layer={only} /> : null
    case 'photo-number':
      return only?.type === 'photo' ? (
        <span className="seltb-stepper" data-action="photo-number">
          <button
            type="button"
            className="seltb-icon"
            aria-label="Previous photo number"
            title="Previous photo number"
            disabled={only.photoNumber <= 1}
            onClick={() => st().editLayers([only.id], { photoNumber: only.photoNumber - 1 })}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="seltb-value" aria-live="polite">
            Photo {only.photoNumber}
          </span>
          <button
            type="button"
            className="seltb-icon"
            aria-label="Next photo number"
            title="Next photo number"
            onClick={() => st().editLayers([only.id], { photoNumber: only.photoNumber + 1 })}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </span>
      ) : null
    case 'frame':
      return only?.type === 'photo' ? (
        <MenuAction
          label="Frame"
          icon={Frame}
          testId="frame"
          entries={[
            {
              id: 'none',
              label: 'No frame',
              checked: only.frame.style === 'none',
              onSelect: () =>
                only.frame.style !== 'none' &&
                st().editLayers([only.id], { frame: { style: 'none' } })
            },
            {
              id: 'solid',
              label: 'Solid frame',
              checked: only.frame.style === 'solid',
              onSelect: () =>
                only.frame.style !== 'solid' &&
                st().editLayers([only.id], {
                  frame: {
                    style: 'solid',
                    thickness: 12,
                    color: { kind: 'literal', value: '#ffffff' }
                  }
                })
            }
          ]}
        />
      ) : null
    case 'replace-image':
      return only ? (
        <button
          type="button"
          className="seltb-btn"
          data-action="replace-image"
          onClick={() => void st().importAssetsFromDialog({ kind: 'replace', layerId: only.id })}
        >
          <ImageUp size={15} aria-hidden="true" />
          <span>Replace image…</span>
        </button>
      ) : null
    case 'ungroup':
      return (
        <button
          type="button"
          className="seltb-btn"
          data-action="ungroup"
          onClick={() => st().ungroupSelection()}
        >
          <Ungroup size={15} aria-hidden="true" />
          <span>Ungroup</span>
        </button>
      )
    case 'align':
      return <AlignAction count={layers.length} />
    case 'group':
      return (
        <button
          type="button"
          className="seltb-btn"
          data-action="group"
          onClick={() => st().groupSelection()}
        >
          <Group size={15} aria-hidden="true" />
          <span>Group</span>
        </button>
      )
    case 'arrange':
      return <MenuAction label="Arrange" icon={Layers} testId="arrange" entries={ARRANGE} />
    case 'duplicate':
      return (
        <button
          type="button"
          className="seltb-btn"
          data-action="duplicate"
          onClick={() => st().duplicateSelection()}
        >
          <Copy size={15} aria-hidden="true" />
          <span>Duplicate</span>
        </button>
      )
    case 'more': {
      const allHidden = layers.every((l) => !l.visible)
      return (
        <MenuAction
          label="More actions"
          icon={MoreHorizontal}
          showLabel={false}
          testId="more"
          entries={[
            {
              id: 'hide',
              label: allHidden ? 'Show' : 'Hide',
              onSelect: () => st().editLayers(ids, { visible: allHidden })
            },
            { id: 'lock', label: 'Lock', onSelect: () => st().editLayers(ids, { locked: true }) },
            'separator',
            { id: 'delete', label: 'Delete', onSelect: () => st().deleteSelection() }
          ]}
        />
      )
    }
  }
}

/**
 * The contextual selection toolbar (B5): 3–5 frequent actions in words next to the selection, inside the canvas area.
 * Placement follows the selection through zoom and pan and stays fully inside the canvas host (shared placement rule).
 * Hidden in Print Preview, while text is edited, while dragging or transforming, for locked selections and when
 * turned off in Settings › Editor.
 */
export function SelectionToolbar(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const selectedIds = useEditor((s) => s.selectedIds)
  const viewMode = useEditor(selectViewMode)
  const editingText = useEditor((s) => s.editingTextId !== null)
  const interacting = useEditor((s) => s.interaction === 'transforming')
  // Subscribe to the view's stable inputs; the transform itself is derived (a new object each time).
  useEditor((s) => s.view)
  const view = selectViewTransform(editorStore.getState())
  const viewport = useEditor((s) => s.viewport)
  const enabled = useAppearance((s) => s.showSelectionToolbar)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  const visible = toolbarVisible({
    enabled,
    viewMode,
    editingText,
    interacting,
    project,
    selectedIds
  })
  const layers =
    visible && project
      ? selectedIds
          .map((id) => project.layers.find((l) => l.id === id))
          .filter((l): l is Layer => l !== undefined && isEditable(project.layers, l))
      : []
  const kind = toolbarKind(layers)
  const bounds = visible && project ? selectionBounds(project, selectedIds) : null
  const actions = kind ? toolbarActions(kind) : []
  const actionKey = `${kind}:${layers.map((l) => l.id).join(',')}`

  // Measure the toolbar whenever it mounts or changes size (its actions, palette, photo number, density, scale).
  const shown = visible && kind !== null
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const next = { width: el.offsetWidth, height: el.offsetHeight }
      setSize((s) => (s && s.width === next.width && s.height === next.height ? s : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shown, actionKey])

  if (!visible || !kind || !bounds || !view) return null
  const pos = size
    ? placeToolbar({
        selection: toScreenRect(bounds, view),
        size,
        host: viewport
      })
    : null
  return (
    <div
      ref={ref}
      className="seltb"
      role="toolbar"
      aria-label="Selection actions"
      data-testid="selection-toolbar"
      data-kind={kind}
      data-side={pos?.side}
      key={actionKey}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {actions.map((a, i) => (
        <span key={a} className="seltb-item" data-sep={i > 0 && a !== 'more' ? true : undefined}>
          <Action id={a} layers={layers} />
        </span>
      ))}
    </div>
  )
}
