import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Ellipsis,
  Eye,
  EyeOff,
  Layers as LayersIcon,
  ListFilter,
  Lock,
  LockOpen,
  Plus,
  TriangleAlert
} from 'lucide-react'
import { NEW_LAYER_KINDS } from '@editor/newLayers'
import { buildPanelRows, layerTypeLabel, type PanelRow } from '@editor/layerTree'
import { editorStore, useEditor } from './editorStore'
import { LayerTypeIcon } from './Icons'
import { isPrimaryModifier } from './platform'
import { Tooltip } from '../ui/Tooltip'
import { tipProps } from './tips'
import { EmptyState } from '../ui/EmptyState'
import { MenuButton, type MenuEntry } from '../ui/Menu'
import { COMMANDS, type CommandId } from '@editor/commands'
import { runCommand } from './commandRunner'
import { shortcutFor } from './TopBar'
import { useSafeAreaReport } from './SafeAreaOverlay'

/** Layers the Output Profile's safe-area check flags (shown as a warning marker on their rows). */
function useFlaggedLayerIds(): ReadonlySet<string> {
  const report = useSafeAreaReport()
  return useMemo(() => new Set(report?.flagged.map((f) => f.layerId) ?? []), [report])
}

const store = editorStore
type Placement = 'above' | 'below'
interface DragState {
  id: string
  targetId: string | null
  placement: Placement | null
  valid: boolean
}

/**
 * Pointer-based drag reorder (no DnD dependency): dragging a row over a SIBLING shows a drop line above/below it and
 * releasing commits one `moveLayerRelative` mutation. Cross-group drops are not supported and show as not allowed.
 */
function useRowReorder(): {
  drag: DragState | null
  onRowPointerDown: (e: React.PointerEvent, id: string) => void
  consumeClick: () => boolean
} {
  const [drag, setDrag] = useState<DragState | null>(null)
  const suppressClick = useRef(false)

  const onRowPointerDown = useCallback((e: React.PointerEvent, id: string): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,input,textarea,select')) return
    const start = { x: e.clientX, y: e.clientY }
    const parentOf = (el: Element | null): string => el?.getAttribute('data-parent-id') ?? ''
    const sourceParent = parentOf((e.currentTarget as HTMLElement) ?? null)
    let dragging = false
    let last: DragState = { id, targetId: null, placement: null, valid: false }

    const onMove = (ev: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return
        dragging = true
      }
      const el =
        document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-layer-id]') ?? null
      const targetId = el?.getAttribute('data-layer-id') ?? null
      if (!el || !targetId || targetId === id) {
        last = { id, targetId: null, placement: null, valid: false }
      } else {
        const r = el.getBoundingClientRect()
        last = {
          id,
          targetId,
          placement: ev.clientY < r.top + r.height / 2 ? 'above' : 'below',
          valid: parentOf(el) === sourceParent
        }
      }
      setDrag(last)
    }
    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (dragging) {
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
        if (commit && last.valid && last.targetId && last.placement) {
          // Panel top = front, so dropping on the upper half places the layer in FRONT of the target ('above').
          store.getState().moveLayerRelative(id, last.targetId, last.placement)
        } else if (commit && last.targetId && !last.valid) {
          store.getState().setMessage('Layers can only be reordered within the same group.')
        }
      }
      setDrag(null)
    }
    const onUp = (): void => finish(true)
    const onCancel = (): void => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [])

  const consumeClick = useCallback((): boolean => suppressClick.current, [])
  return { drag, onRowPointerDown, consumeClick }
}

/** Enter commits, Escape cancels, blur commits; an empty name is rejected by the store with a message. */
function RenameInput({
  id,
  initial,
  onClose
}: {
  id: string
  initial: string
  onClose: () => void
}): React.JSX.Element {
  const doneRef = useRef(false)
  const finish = (commit: boolean, value: string): void => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) store.getState().renameLayer(id, value)
    onClose()
  }
  return (
    <input
      className="ui-input rename-input"
      aria-label="Layer name"
      defaultValue={initial}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(true, e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(true, e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false, e.currentTarget.value)
        }
      }}
    />
  )
}

interface RowProps {
  row: PanelRow
  selected: boolean
  active: boolean
  renaming: boolean
  mark: Placement | 'blocked' | null
  /** The Output Profile's safe-area check flags this layer (near a trim line or across a cut). */
  warning: boolean
  dragging: boolean
  onRowClick: (e: React.MouseEvent, id: string) => void
  onRowPointerDown: (e: React.PointerEvent, id: string) => void
  startRename: (id: string) => void
  stopRename: () => void
}

const LayerRow = memo(function LayerRow({
  row,
  selected,
  active,
  renaming,
  mark,
  warning,
  dragging,
  onRowClick,
  onRowPointerDown,
  startRename,
  stopRename
}: RowProps): React.JSX.Element {
  const { layer } = row
  const meta =
    layer.type === 'photo'
      ? `#${layer.photoNumber}`
      : layer.type === 'image' && layer.role !== 'graphic'
        ? layer.role
        : ''
  const lockLabel = row.directLocked ? `Unlock layer ${layer.name}` : `Lock layer ${layer.name}`
  const visLabel = row.directVisible ? `Hide layer ${layer.name}` : `Show layer ${layer.name}`
  return (
    <li
      id={`layer-row-${layer.id}`}
      role="treeitem"
      aria-selected={selected}
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? !row.collapsed : undefined}
      // B6: the row's name is its type, name, photo number and state only — not the labels of the eye/lock buttons
      // inside it ("Text: Title, hidden" rather than "Text: Title Hide layer Title Lock layer Title").
      aria-labelledby={[
        `lr-type-${layer.id}`,
        renaming ? '' : `lr-name-${layer.id}`,
        meta ? `lr-meta-${layer.id}` : '',
        !row.effectivelyVisible || row.effectivelyLocked ? `lr-state-${layer.id}` : '',
        warning ? `lr-warn-${layer.id}` : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-layer-id={layer.id}
      data-parent-id={layer.parentId ?? ''}
      data-selected={selected || undefined}
      data-kind={layer.type}
      className={[
        'layer-row',
        selected ? 'selected' : '',
        active ? 'active' : '',
        !row.effectivelyVisible ? 'is-hidden' : '',
        !row.directVisible || row.directLocked ? 'has-state' : '',
        dragging ? 'dragging' : '',
        mark === 'above'
          ? 'drop-above'
          : mark === 'below'
            ? 'drop-below'
            : mark === 'blocked'
              ? 'drop-blocked'
              : ''
      ].join(' ')}
      style={{ paddingLeft: 6 + row.depth * 14 }}
      onClick={(e) => onRowClick(e, layer.id)}
      onPointerDown={(e) => onRowPointerDown(e, layer.id)}
      onDoubleClick={() => startRename(layer.id)}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          className={`row-chevron ${row.collapsed ? '' : 'open'}`}
          aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} group ${layer.name}`}
          onClick={(e) => {
            e.stopPropagation()
            store.getState().toggleCollapsed(layer.id)
          }}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      ) : (
        <span className="row-chevron-spacer" />
      )}
      <span className="type-icon" title={layerTypeLabel(layer)}>
        <LayerTypeIcon layer={layer} />
        <span className="sr-only" id={`lr-type-${layer.id}`}>
          {layerTypeLabel(layer)}:{' '}
        </span>
      </span>
      {renaming ? (
        <RenameInput id={layer.id} initial={layer.name} onClose={stopRename} />
      ) : (
        <span
          className="layer-name"
          id={`lr-name-${layer.id}`}
          title={`${layer.name} — ${layerTypeLabel(layer)}`}
        >
          {layer.name}
        </span>
      )}
      {meta && (
        <span className="layer-meta" id={`lr-meta-${layer.id}`}>
          {meta}
        </span>
      )}
      {(!row.effectivelyVisible || row.effectivelyLocked) && (
        // B6: hidden / locked are said in words too (the eye and lock icons are only pictures).
        <span className="sr-only" id={`lr-state-${layer.id}`} data-testid="layer-state-text">
          {[!row.effectivelyVisible ? 'hidden' : '', row.effectivelyLocked ? 'locked' : '']
            .filter(Boolean)
            .map((w) => `, ${w}`)
            .join('')}
        </span>
      )}
      {warning && (
        <span className="row-warning" title="Needs attention: close to a trim line or across a cut">
          <TriangleAlert size={14} aria-hidden="true" />
          <span className="sr-only" id={`lr-warn-${layer.id}`}>
            {' '}
            (needs attention: close to a trim line or across a cut)
          </span>
        </span>
      )}
      <span className="row-actions">
        <button
          type="button"
          tabIndex={-1}
          className={`row-toggle ${row.directVisible ? 'on-state' : 'off-state'} ${row.hiddenByAncestor ? 'inherited' : ''}`}
          aria-label={visLabel}
          aria-pressed={!row.directVisible}
          title={row.hiddenByAncestor ? `${visLabel} (also hidden by a parent group)` : visLabel}
          onClick={(e) => {
            e.stopPropagation()
            store.getState().setVisibility(layer.id, !row.directVisible)
          }}
        >
          {row.directVisible ? (
            <Eye size={15} aria-hidden="true" />
          ) : (
            <EyeOff size={15} aria-hidden="true" />
          )}
          {row.hiddenByAncestor && <span className="sr-only"> (hidden by parent group)</span>}
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={`row-toggle ${row.directLocked ? 'off-state' : 'on-state'} ${row.lockedByAncestor ? 'inherited' : ''}`}
          aria-label={lockLabel}
          aria-pressed={row.directLocked}
          title={row.lockedByAncestor ? `${lockLabel} (also locked by a parent group)` : lockLabel}
          onClick={(e) => {
            e.stopPropagation()
            store.getState().setLocked(layer.id, !row.directLocked)
          }}
        >
          {row.directLocked ? (
            <Lock size={15} aria-hidden="true" />
          ) : (
            <LockOpen size={15} aria-hidden="true" />
          )}
          {row.lockedByAncestor && <span className="sr-only"> (locked by parent group)</span>}
        </button>
      </span>
    </li>
  )
})

export function LayersPanel(): React.JSX.Element {
  const layers = useEditor((s) => s.project?.layers)
  const collapsedGroups = useEditor((s) => s.collapsedGroups)
  const filter = useEditor((s) => s.layerFilter)
  const selectedIds = useEditor((s) => s.selectedIds)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const { drag, onRowPointerDown, consumeClick } = useRowReorder()

  const rows = useMemo(
    () => buildPanelRows(layers ?? [], { collapsed: new Set(collapsedGroups), filter }),
    [layers, collapsedGroups, filter]
  )
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const activeId = selectedIds[selectedIds.length - 1] ?? null

  // Keep the active row in view when selection changes from the canvas or the keyboard.
  useEffect(() => {
    if (activeId)
      document.getElementById(`layer-row-${activeId}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const onRowClick = useCallback(
    (e: React.MouseEvent, id: string): void => {
      if (consumeClick()) return
      const s = store.getState()
      if (e.shiftKey)
        s.selectRange(
          rows.map((r) => r.layer.id),
          id
        )
      else if (isPrimaryModifier(e)) s.toggleSelection(id)
      else s.selectLayer(id)
    },
    [rows, consumeClick]
  )
  const startRename = useCallback((id: string) => setRenamingId(id), [])
  const stopRename = useCallback(() => setRenamingId(null), [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    if (renamingId) return
    const ids = rows.map((r) => r.layer.id)
    const s = store.getState()
    const idx = activeId ? ids.indexOf(activeId) : -1
    const row = idx >= 0 ? rows[idx] : undefined
    const go = (next: string | undefined): void => {
      if (!next) return
      e.preventDefault()
      if (e.shiftKey) s.selectRange(ids, next)
      else s.selectLayer(next)
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(ids[Math.min(ids.length - 1, idx + 1)])
      case 'ArrowUp':
        return go(ids[Math.max(0, idx - 1)])
      case 'Home':
        return go(ids[0])
      case 'End':
        return go(ids[ids.length - 1])
      case 'ArrowRight':
        if (row?.hasChildren && row.collapsed) {
          e.preventDefault()
          s.toggleCollapsed(row.layer.id)
        } else if (row?.hasChildren) go(ids[idx + 1])
        return
      case 'ArrowLeft':
        if (row?.hasChildren && !row.collapsed) {
          e.preventDefault()
          s.toggleCollapsed(row.layer.id)
        } else if (row?.layer.parentId) go(row.layer.parentId)
        return
      case 'Enter':
      case 'F2':
        if (row) {
          e.preventDefault()
          setRenamingId(row.layer.id)
        }
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        s.deleteSelection()
        return
      case 'l':
      case 'L':
        if (row && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          s.setLocked(row.layer.id, !row.directLocked)
        }
        return
      case 'v':
      case 'V':
        if (row && !e.metaKey && !e.ctrlKey) {
          e.preventDefault()
          s.setVisibility(row.layer.id, !row.directVisible)
        }
        return
    }
  }

  const markFor = (id: string): Placement | 'blocked' | null => {
    if (!drag || drag.targetId !== id) return null
    return drag.valid ? drag.placement : 'blocked'
  }

  const st = store.getState
  const flagged = useFlaggedLayerIds()
  const selectionCount = selectedIds.length
  const addEntries: MenuEntry[] = NEW_LAYER_KINDS.map((k) => ({
    id: k.kind,
    label: k.kind === 'photo' ? 'Photo slot' : k.label,
    onSelect: () => st().addNewLayer(k.kind)
  }))
  // Lower-frequency layer actions live in one "More" menu (B1); the same commands are in the Edit and Arrange menus
  // and on the keyboard, so nothing is lost by taking them out of the header.
  const cmd = (id: CommandId): MenuEntry => ({
    id,
    label: COMMANDS[id].label,
    shortcut: shortcutFor(id),
    disabled: selectionCount === 0,
    onSelect: () => runCommand(id)
  })
  const moreEntries: MenuEntry[] = [
    cmd('edit.duplicate'),
    cmd('edit.group'),
    cmd('edit.ungroup'),
    'separator',
    cmd('arrange.bringToFront'),
    cmd('arrange.bringForward'),
    cmd('arrange.sendBackward'),
    cmd('arrange.sendToBack'),
    'separator',
    cmd('edit.delete'),
    'separator',
    {
      id: 'shortcuts',
      label: COMMANDS['help.shortcuts'].label,
      onSelect: () => runCommand('help.shortcuts')
    }
  ]

  return (
    <section className="panel layers-panel" aria-label="Layers" data-editor-panel>
      <header className="panel-header">
        <h2 className="panel-heading">
          Layers {layers && <span className="ui-badge">{layers.length}</span>}
        </h2>
        <div className="panel-actions" role="toolbar" aria-label="Layer actions">
          <Tooltip label="Add layer" {...tipProps('addLayer')}>
            <MenuButton
              label="Add layer"
              entries={addEntries}
              className="ui-iconbtn sm add-btn"
              align="end"
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
            </MenuButton>
          </Tooltip>
          <Tooltip label="More layer actions" {...tipProps('layersMore')}>
            <MenuButton
              label="More layer actions"
              entries={moreEntries}
              className="ui-iconbtn sm more-btn"
              align="end"
            >
              <Ellipsis size={16} strokeWidth={2} aria-hidden="true" />
            </MenuButton>
          </Tooltip>
        </div>
      </header>
      <div className="panel-sub">
        <div className="search-wrap">
          <ListFilter size={14} aria-hidden="true" />
          <input
            type="search"
            className="ui-input"
            aria-label="Filter layers by name"
            placeholder="Filter layers"
            value={filter}
            onChange={(e) => store.getState().setLayerFilter(e.target.value)}
          />
        </div>
      </div>
      <ul
        className="layer-list"
        role="tree"
        aria-label="Layers, front to back"
        aria-multiselectable="true"
        aria-activedescendant={activeId ? `layer-row-${activeId}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {rows.map((row) => (
          <LayerRow
            key={row.layer.id}
            row={row}
            selected={selected.has(row.layer.id)}
            active={row.layer.id === activeId}
            renaming={renamingId === row.layer.id}
            warning={flagged.has(row.layer.id)}
            mark={markFor(row.layer.id)}
            dragging={drag?.id === row.layer.id}
            onRowClick={onRowClick}
            onRowPointerDown={onRowPointerDown}
            startRename={startRename}
            stopRename={stopRename}
          />
        ))}
        {rows.length === 0 && (
          <li role="presentation">
            {filter ? (
              <EmptyState icon={ListFilter} title="No matching layers">
                Nothing in this project matches “{filter}”.
              </EmptyState>
            ) : (
              <EmptyState icon={LayersIcon} title="No layers yet">
                Use the + button, or the Design tools on the left, to add a photo, text or shape.
              </EmptyState>
            )}
          </li>
        )}
      </ul>
    </section>
  )
}
