/**
 * SPIKE (Phase 3A, retained as reference after choosing Konva): harness hosting the engine over the domain
 * model. Experimental; superseded by the Phase 3B editor canvas. The Fabric implementation was removed (see git history).
 */
import { StrictMode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Layer, TemplateProject } from '@domain/index'
import { KonvaEngine } from './konva/KonvaEngine'
import type { EngineHandle, GeometryChange, HandleName } from './shared/engine'
import { createTestImages, type ImageMap } from './shared/images'
import { DESIGN, createSpikeProject, createStressProject } from './shared/scene'
import type { Guide } from './shared/snap'
import { centeredView, fitView, type ViewTransform } from './shared/viewport'

const VIEWPORT = { width: 600, height: 720 }
type EngineName = 'konva'
type ViewMode = 'fit' | '100' | '50'

type Action =
  | { type: 'reset'; project: TemplateProject }
  | { type: 'geometry'; changes: GeometryChange[] }
  | { type: 'patch'; id: string; patch: Partial<Layer> }
  | { type: 'remove'; id: string }
  | { type: 'restore'; layer: Layer }
  | { type: 'forward'; id: string }
  | { type: 'backward'; id: string }

function groupBox(project: TemplateProject, groupId: string): TemplateProject {
  const kids = project.layers.filter((l) => l.parentId === groupId)
  if (!kids.length) return project
  // Axis-aligned bounds of the (possibly rotated) children; domain rule: groups carry rotation 0.
  let l = Infinity,
    t = Infinity,
    r = -Infinity,
    b = -Infinity
  for (const k of kids) {
    const cx = k.x + k.width / 2,
      cy = k.y + k.height / 2
    const a = (k.rotation * Math.PI) / 180
    const hw = (Math.abs(Math.cos(a)) * k.width + Math.abs(Math.sin(a)) * k.height) / 2
    const hh = (Math.abs(Math.sin(a)) * k.width + Math.abs(Math.cos(a)) * k.height) / 2
    l = Math.min(l, cx - hw)
    r = Math.max(r, cx + hw)
    t = Math.min(t, cy - hh)
    b = Math.max(b, cy + hh)
  }
  return {
    ...project,
    layers: project.layers.map((x) =>
      x.id === groupId ? { ...x, x: l, y: t, width: r - l, height: b - t } : x
    )
  }
}

function reducer(p: TemplateProject, a: Action): TemplateProject {
  switch (a.type) {
    case 'reset':
      return a.project
    case 'geometry': {
      let next: TemplateProject = {
        ...p,
        layers: p.layers.map((l) => {
          const c = a.changes.find((x) => x.id === l.id)
          if (!c) return l
          const g = c.geometry
          const moved = {
            ...l,
            x: g.x,
            y: g.y,
            width: g.width,
            height: g.height,
            rotation: g.rotation
          } as Layer
          return c.fontSize !== undefined && moved.type === 'text'
            ? { ...moved, fontSize: c.fontSize }
            : moved
        })
      }
      for (const gid of new Set(
        next.layers
          .filter((l) => a.changes.some((c) => c.id === l.id) && l.parentId)
          .map((l) => l.parentId as string)
      )) {
        next = groupBox(next, gid)
      }
      return next
    }
    case 'patch':
      return {
        ...p,
        layers: p.layers.map((l) => (l.id === a.id ? ({ ...l, ...a.patch } as Layer) : l))
      }
    case 'remove':
      return { ...p, layers: p.layers.filter((l) => l.id !== a.id && l.parentId !== a.id) }
    case 'restore':
      return { ...p, layers: [...p.layers, a.layer] }
    case 'forward':
    case 'backward': {
      const sib = p.layers
        .filter((l) => l.parentId === p.layers.find((x) => x.id === a.id)?.parentId)
        .sort((x, y) => x.zIndex - y.zIndex)
      const i = sib.findIndex((l) => l.id === a.id)
      const j = a.type === 'forward' ? i + 1 : i - 1
      const other = sib[j]
      const self = sib[i]
      if (!other || !self) return p
      return {
        ...p,
        layers: p.layers.map((l) =>
          l.id === self.id
            ? { ...l, zIndex: other.zIndex }
            : l.id === other.id
              ? { ...l, zIndex: self.zIndex }
              : l
        )
      }
    }
  }
}

export interface SpikeApi {
  state: () => {
    engine: EngineName
    view: ViewTransform
    selectedId: string | null
    layers: Layer[]
    guides: Guide[]
  }
  setEngine: (e: EngineName) => void
  setViewMode: (m: ViewMode) => void
  select: (id: string | null) => void
  handlePoint: (id: string, h: HandleName) => { x: number; y: number } | null
  centerPoint: (id: string) => { x: number; y: number } | null
  exportPng: (w: number, h: number) => string
  info: () => ReturnType<EngineHandle['info']>
  loadScene: (n: number) => void
  remount: () => void
  dispatch: (a: Action) => void
  bench: (id: string, steps: number) => { drag: number; zoom: number }
  setSnapping: (b: boolean) => void
  ready: () => boolean
  canvasCount: () => number
}

declare global {
  interface Window {
    __spike?: SpikeApi
  }
}

export function SpikeHarness(): React.JSX.Element {
  const [project, dispatch] = useReducer(reducer, undefined, createSpikeProject)
  const [engine, setEngine] = useState<EngineName>('konva') // single engine after the Phase 3A decision
  const [viewMode, setViewMode] = useState<ViewMode>('fit')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [images, setImages] = useState<ImageMap | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [snapping, setSnapping] = useState(true)
  const [epoch, setEpoch] = useState(0)
  const [log, setLog] = useState('')
  const [exportInfo, setExportInfo] = useState('')
  const [deleted, setDeleted] = useState<Layer | null>(null)
  const handle = useRef<EngineHandle>(null)

  useEffect(() => {
    void createTestImages().then(setImages)
  }, [])

  const view = useMemo<ViewTransform>(() => {
    if (viewMode === 'fit') return fitView(DESIGN, VIEWPORT)
    return centeredView(DESIGN, VIEWPORT, viewMode === '100' ? 1 : 0.5)
  }, [viewMode])

  const onGeometry = useCallback((changes: GeometryChange[]) => {
    dispatch({ type: 'geometry', changes })
  }, [])

  const selected = project.layers.find((l) => l.id === selectedId)

  const doExport = (w: number, h: number): string => {
    const h0 = handle.current
    if (!h0) throw new Error('no engine')
    const t0 = performance.now()
    const url = h0.exportPng({ width: w, height: h })
    const ms = performance.now() - t0
    setExportInfo(
      `${engine} export ${w}×${h}: ${Math.round(url.length / 1024)} KB data URL in ${ms.toFixed(0)} ms`
    )
    return url
  }

  // Test hook for scripted manual validation (real mouse events are still dispatched by the driver)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-published every render
  useEffect(() => {
    const stateRef = { engine, viewMode, selectedId, project, guides, images }
    const api: SpikeApi = {
      state: () => ({
        engine: stateRef.engine,
        view,
        selectedId: stateRef.selectedId,
        layers: stateRef.project.layers,
        guides: stateRef.guides
      }),
      setEngine,
      setViewMode,
      select: setSelectedId,
      handlePoint: (id, h) => handle.current?.handlePoint(id, h) ?? null,
      centerPoint: (id) => handle.current?.layerCenterPoint(id) ?? null,
      exportPng: doExport,
      info: () => handle.current?.info() ?? { name: 'none', objectCount: 0, dpr: 0, canvases: [] },
      loadScene: (n) =>
        dispatch({
          type: 'reset',
          project: n === 0 ? createSpikeProject() : createStressProject(n)
        }),
      remount: () => setEpoch((e) => e + 1),
      dispatch,
      bench: (id, steps) => ({
        drag: handle.current?.dragBenchmark(id, steps) ?? -1,
        zoom: handle.current?.zoomBenchmark(steps) ?? -1
      }),
      setSnapping,
      ready: () => images !== null && handle.current !== null,
      canvasCount: () => document.querySelectorAll('canvas').length
    }
    window.__spike = api
    return () => {
      delete window.__spike
    }
  })

  const Engine = KonvaEngine

  return (
    <StrictMode>
      <main
        style={{ display: 'flex', gap: 16, padding: 12, fontSize: 13, alignItems: 'flex-start' }}
      >
        <div>
          <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['fit', '100', '50'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)} disabled={viewMode === m}>
                {m === 'fit' ? 'Fit' : `${m}%`}
              </button>
            ))}
            <button onClick={() => setEpoch((e) => e + 1)}>Recreate scene</button>
            <button onClick={() => doExport(2400, 3600)}>Export 2400×3600</button>
            <button onClick={() => doExport(1200, 1800)}>Export 1200×1800</button>
          </div>
          <div
            style={{
              width: VIEWPORT.width,
              height: VIEWPORT.height,
              border: '1px solid #666',
              overflow: 'hidden'
            }}
          >
            {images && (
              <Engine
                key={`${engine}-${epoch}`}
                ref={handle}
                project={project}
                images={images}
                selectedId={selectedId}
                view={view}
                viewport={VIEWPORT}
                snapping={snapping}
                onSelect={setSelectedId}
                onGeometry={onGeometry}
                onGuides={setGuides}
                guides={guides}
              />
            )}
          </div>
        </div>
        <div style={{ minWidth: 380 }}>
          <p>
            <strong>Canvas spike (experimental)</strong> · engine: {engine} · view: {viewMode} ·
            scale {view.scale.toFixed(4)}
          </p>
          <p>
            <button
              disabled={!selected}
              onClick={() => selectedId && dispatch({ type: 'forward', id: selectedId })}
            >
              Forward
            </button>{' '}
            <button
              disabled={!selected}
              onClick={() => selectedId && dispatch({ type: 'backward', id: selectedId })}
            >
              Backward
            </button>{' '}
            <button
              disabled={!selected}
              onClick={() =>
                selected &&
                dispatch({ type: 'patch', id: selected.id, patch: { locked: !selected.locked } })
              }
            >
              Lock
            </button>{' '}
            <button
              disabled={!selected}
              onClick={() =>
                selected &&
                dispatch({ type: 'patch', id: selected.id, patch: { visible: !selected.visible } })
              }
            >
              Hide
            </button>{' '}
            <button
              disabled={!selected}
              onClick={() => {
                if (selected) {
                  setDeleted(selected)
                  dispatch({ type: 'remove', id: selected.id })
                  setSelectedId(null)
                }
              }}
            >
              Delete
            </button>{' '}
            <button
              disabled={!deleted}
              onClick={() => {
                if (deleted) {
                  dispatch({ type: 'restore', layer: deleted })
                  setDeleted(null)
                }
              }}
            >
              Recreate
            </button>
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                checked={snapping}
                onChange={(e) => setSnapping(e.target.checked)}
              />{' '}
              snapping
            </label>{' '}
            {[0, 10, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() =>
                  dispatch({
                    type: 'reset',
                    project: n === 0 ? createSpikeProject() : createStressProject(n)
                  })
                }
              >
                {n === 0 ? 'Scene' : `+${n}`}
              </button>
            ))}
          </p>
          <pre id="readout" style={{ whiteSpace: 'pre-wrap' }}>
            {selected
              ? JSON.stringify(
                  {
                    id: selected.id,
                    type: selected.type,
                    x: +selected.x.toFixed(2),
                    y: +selected.y.toFixed(2),
                    width: +selected.width.toFixed(2),
                    height: +selected.height.toFixed(2),
                    rotation: +selected.rotation.toFixed(2),
                    z: selected.zIndex,
                    ...(selected.type === 'photo' ? { photoNumber: selected.photoNumber } : {}),
                    ...(selected.type === 'text' ? { fontSize: +selected.fontSize.toFixed(2) } : {})
                  },
                  null,
                  1
                )
              : 'no selection'}
          </pre>
          <p id="guides">guides: {guides.map((g) => `${g.axis}=${g.at}`).join(', ') || 'none'}</p>
          <p id="export-info">{exportInfo}</p>
          <p id="log">{log}</p>
          <button onClick={() => setLog(JSON.stringify(handle.current?.info()))}>Info</button>
        </div>
      </main>
    </StrictMode>
  )
}
