import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NEW_LAYER_KINDS, type NewLayerKind } from '@editor/newLayers'
import { buildPanelRows, layerTypeLabel, type PanelRow } from '@editor/layerTree'
import { editorStore, useEditor } from './editorStore'
import { Icon, iconNameFor } from './Icons'
import { isPrimaryModifier } from './platform'

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
      className="rename-input"
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
      data-layer-id={layer.id}
      data-parent-id={layer.parentId ?? ''}
      data-selected={selected || undefined}
      className={[
        'layer-row',
        selected ? 'selected' : '',
        active ? 'active' : '',
        !row.effectivelyVisible ? 'is-hidden' : '',
        dragging ? 'dragging' : '',
        mark === 'above'
          ? 'drop-above'
          : mark === 'below'
            ? 'drop-below'
            : mark === 'blocked'
              ? 'drop-blocked'
              : ''
      ].join(' ')}
      style={{ paddingLeft: 6 + row.depth * 16 }}
      onClick={(e) => onRowClick(e, layer.id)}
      onPointerDown={(e) => onRowPointerDown(e, layer.id)}
      onDoubleClick={() => startRename(layer.id)}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          className={`icon-btn chevron ${row.collapsed ? '' : 'open'}`}
          aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} group ${layer.name}`}
          onClick={(e) => {
            e.stopPropagation()
            store.getState().toggleCollapsed(layer.id)
          }}
        >
          <Icon name="chevron" size={14} />
        </button>
      ) : (
        <span className="chevron-spacer" />
      )}
      <span className="type-icon" title={layerTypeLabel(layer)}>
        <Icon name={iconNameFor(layer)} />
        <span className="sr-only">{layerTypeLabel(layer)}: </span>
      </span>
      {renaming ? (
        <RenameInput id={layer.id} initial={layer.name} onClose={stopRename} />
      ) : (
        <span className="layer-name" title={`${layer.name} — ${layerTypeLabel(layer)}`}>
          {layer.name}
        </span>
      )}
      {meta && <span className="layer-meta">{meta}</span>}
      <button
        type="button"
        tabIndex={-1}
        className={`icon-btn toggle ${row.directVisible ? '' : 'off'} ${row.hiddenByAncestor ? 'inherited' : ''}`}
        aria-label={visLabel}
        aria-pressed={!row.directVisible}
        title={row.hiddenByAncestor ? `${visLabel} (also hidden by a parent group)` : visLabel}
        onClick={(e) => {
          e.stopPropagation()
          store.getState().setVisibility(layer.id, !row.directVisible)
        }}
      >
        <Icon name={row.directVisible ? 'eye' : 'eye-off'} />
        {row.hiddenByAncestor && <span className="sr-only"> (hidden by parent group)</span>}
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={`icon-btn toggle ${row.directLocked ? 'on' : ''} ${row.lockedByAncestor ? 'inherited' : ''}`}
        aria-label={lockLabel}
        aria-pressed={row.directLocked}
        title={row.lockedByAncestor ? `${lockLabel} (also locked by a parent group)` : lockLabel}
        onClick={(e) => {
          e.stopPropagation()
          store.getState().setLocked(layer.id, !row.directLocked)
        }}
      >
        <Icon name={row.directLocked ? 'lock' : 'unlock'} />
        {row.lockedByAncestor && <span className="sr-only"> (locked by parent group)</span>}
      </button>
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

  return (
    <section className="panel layers-panel" aria-label="Layers" data-editor-panel>
      <header className="panel-header">
        <h2>Layers{layers ? ` (${layers.length})` : ''}</h2>
        <select
          aria-label="Add layer"
          value=""
          onChange={(e) => {
            if (e.target.value) store.getState().addNewLayer(e.target.value as NewLayerKind)
          }}
        >
          <option value="">Add…</option>
          {NEW_LAYER_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </header>
      <div className="panel-sub">
        <input
          type="search"
          aria-label="Filter layers by name"
          placeholder="Filter layers"
          value={filter}
          onChange={(e) => store.getState().setLayerFilter(e.target.value)}
        />
        <div className="stack-buttons" role="group" aria-label="Stacking order">
          <button
            type="button"
            aria-label="Bring to front"
            title="Bring to front"
            disabled={!activeId}
            onClick={() => store.getState().stackSelection('front')}
          >
            ⤒
          </button>
          <button
            type="button"
            aria-label="Bring forward"
            title="Bring forward"
            disabled={!activeId}
            onClick={() => store.getState().stackSelection('forward')}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Send backward"
            title="Send backward"
            disabled={!activeId}
            onClick={() => store.getState().stackSelection('backward')}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Send to back"
            title="Send to back"
            disabled={!activeId}
            onClick={() => store.getState().stackSelection('back')}
          >
            ⤓
          </button>
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
            mark={markFor(row.layer.id)}
            dragging={drag?.id === row.layer.id}
            onRowClick={onRowClick}
            onRowPointerDown={onRowPointerDown}
            startRename={startRename}
            stopRename={stopRename}
          />
        ))}
        {rows.length === 0 && (
          <li className="empty">
            {filter ? 'No layers match the filter.' : 'No layers yet. Use Add… to create one.'}
          </li>
        )}
      </ul>
      <details className="panel-help">
        <summary>Keyboard and layer order help</summary>
        <p>
          Top of the list is the front of the artwork. Arrow keys move; Shift extends; Enter or F2
          renames; L locks; V shows/hides; drag a row to reorder within its group.
        </p>
      </details>
    </section>
  )
}
