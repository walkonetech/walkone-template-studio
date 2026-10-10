import { CANVAS_THEME } from './canvasTheme'
import { useEffect, useLayoutEffect, useRef, type ComponentType } from 'react'
import {
  Ellipse,
  Group,
  Layer as KLayer,
  Line,
  Rect,
  Shape,
  Stage,
  Text,
  Transformer
} from 'react-konva'
import type Konva from 'konva'
import {
  childrenOf,
  getPixelSize,
  selectableRoot,
  topLevelLayers,
  type Layer,
  type TemplateProject
} from '@domain'
import { commitGroupNode, commitTopLevelNode } from '@canvas/adapters/konvaCommit'
import { DESIGN_NODE_ID, snapDraggedNode } from '@canvas/adapters/konvaSnap'
import { resolveColor } from '@canvas/rendering/color'
import {
  specFor,
  type ImageLookup,
  type NodeClass,
  type RenderEnv
} from '@canvas/rendering/nodeSpec'
import { finalizeTextNode } from '@canvas/rendering/finalize'
import { ROTATION_SNAPS, boxTooSmall, transformerOptionsFor } from '@canvas/transforms/normalize'
import { transformTargets } from '@canvas/transforms/targets'
import type { GeometryChange } from '@editor/mutations'
import { isPrimaryModifier } from './platform'
import { selectDesignSize, selectViewTransform } from '@editor/store'
import { editorStore, useEditor, useViewTransform } from './editorStore'
import { useProjectImages } from './useProjectImages'
import { TextEditOverlay } from './TextEditOverlay'
import { registerCanvasDebug } from './debugHooks'
import {
  AXIS_LOCK_THRESHOLD_PX,
  constrainDrag,
  initialAxisLock,
  restrictSnap
} from '@canvas/transforms/axisLock'
import { usePreviewPhotos } from './usePreviewPhotos'
import { useSpacePan } from './useSpacePan'
import { CropOverlay } from './CropOverlay'
import { dropPointToDesign } from '@editor/imagePlacement'
import { ASSET_DRAG_TYPE, dragHasAsset, dragHasFiles } from './dropFiles'
import { importDroppedFiles } from './importActions'

/** react-konva components keyed by the spec's node class. One assertion at the dynamic-dispatch boundary. */
const COMPONENTS = { Group, Rect, Ellipse, Line, Text, Shape } as unknown as Record<
  NodeClass,
  ComponentType<Record<string, unknown>>
>

const store = editorStore

/**
 * Domain layer id for a Konva target. By default a click inside a group selects the OUTERMOST group (so a group
 * behaves as one object); with `deep` (Alt/Option-click) it selects the clicked layer itself.
 */
function layerIdFor(target: Konva.Node, layers: readonly Layer[], deep: boolean): string | null {
  let node: Konva.Node | null = target
  while (node) {
    const id = node.id()
    if (id && layers.some((l) => l.id === id))
      return deep ? id : (selectableRoot(layers, id)?.id ?? id)
    node = node.getParent()
  }
  return null
}

function restoreNode(node: Konva.Node, layer: Layer): void {
  // A rejected commit (e.g. the layer was locked mid-drag) must not leave the node displaced.
  if (layer.type === 'group') {
    node.position({ x: 0, y: 0 })
    node.rotation(0)
    node.scale({ x: 1, y: 1 })
  } else {
    node.setAttrs({
      x: layer.x + layer.width / 2,
      y: layer.y + layer.height / 2,
      rotation: layer.rotation,
      scaleX: 1,
      scaleY: 1
    })
  }
  node.getLayer()?.batchDraw()
}

const nodeFor = (stage: Konva.Stage | null, id: string): Konva.Node | undefined =>
  stage?.findOne((n: Konva.Node) => n.id() === id) ?? undefined

/** Shift-constrained drag: where the drag began (design coordinates of the dragged node) and which axis is locked. */
let dragOrigin: { id: string; x: number; y: number } | null = null
/** The other selected nodes of a multi-drag, with where each started (they are re-placed from the primary's delta). */
let dragFollowers: { node: Konva.Node; x: number; y: number }[] = []
let axisLock = initialAxisLock()

function onNodeDragStart(e: Konva.KonvaEventObject<DragEvent>): void {
  // With several layers selected Konva also "starts a drag" on every other selected node; only the node the pointer
  // actually grabbed (the first dragstart of the gesture) drives the constraint and snapping.
  if (!dragOrigin) {
    const node = e.currentTarget
    dragOrigin = { id: node.id(), x: node.x(), y: node.y() }
    axisLock = initialAxisLock()
    const s = store.getState()
    const stage = node.getStage()
    dragFollowers = s.project
      ? transformTargets(s.project.layers, s.selectedIds)
          .filter((l) => l.id !== node.id())
          .map((l) => nodeFor(stage, l.id))
          .filter((n): n is Konva.Node => !!n)
          .map((n) => ({ node: n, x: n.x(), y: n.y() }))
      : []
  }
  store.getState().setInteraction('transforming')
}

function onNodeDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
  const s = store.getState()
  const node = e.currentTarget
  if (dragOrigin && node.id() !== dragOrigin.id) return // followers are moved by the Transformer
  const view = selectViewTransform(s)
  // 1. Shift locks the move to its dominant axis (Photoshop style) ...
  if (dragOrigin && view && (e.evt.shiftKey || axisLock.axis)) {
    const r = constrainDrag(
      axisLock,
      { x: node.x() - dragOrigin.x, y: node.y() - dragOrigin.y },
      e.evt.shiftKey,
      AXIS_LOCK_THRESHOLD_PX / view.scale
    )
    axisLock = r.state
    node.position({ x: dragOrigin.x + r.delta.x, y: dragOrigin.y + r.delta.y })
  }
  // 2. ... then snapping may adjust only the axis that is still free.
  if (s.snapping.enabled) {
    const design = selectDesignSize(s)
    if (design && view) {
      const raw = snapDraggedNode(node, design, view, s.snapping.tolerancePx)
      if (raw) {
        const r = restrictSnap(raw, axisLock.axis)
        if (r.dx !== 0 || r.dy !== 0) node.position({ x: node.x() + r.dx, y: node.y() + r.dy })
        s.setGuides(
          axisLock.axis
            ? r.guides.filter((g) => g.axis !== (axisLock.axis === 'x' ? 'y' : 'x'))
            : r.guides
        )
      }
    }
  }
  // 3. Re-place the other selected layers from the grabbed one's final (constrained, snapped) displacement, so the
  //    whole selection keeps its relative geometry whatever the Transformer's own incremental sync did.
  if (dragOrigin && dragFollowers.length > 0) {
    const dx = node.x() - dragOrigin.x
    const dy = node.y() - dragOrigin.y
    for (const f of dragFollowers) f.node.position({ x: f.x + dx, y: f.y + dy })
  }
}

/** Reads one finished node into domain changes (scale folded in and reset). */
function changesFor(node: Konva.Node, layers: readonly Layer[]): GeometryChange[] {
  const layer = layers.find((l) => l.id === node.id())
  if (!layer) return []
  return layer.type === 'group'
    ? commitGroupNode(node as Konva.Group, layers)
    : [commitTopLevelNode(node, layer)]
}

/** Interaction finished: normalize every moved node, commit ONE mutation (one history entry). */
function finishInteraction(nodes: Konva.Node[]): void {
  const s = store.getState()
  if (!s.project) return
  const layers = s.project.layers
  const changes = nodes.flatMap((n) => changesFor(n, layers))
  const committed = s.commitGeometry(changes)
  s.setGuides([])
  s.setInteraction('idle')
  dragOrigin = null
  dragFollowers = []
  axisLock = initialAxisLock()
  if (!committed) {
    for (const n of nodes) {
      const layer = layers.find((l) => l.id === n.id())
      if (layer) restoreNode(n, layer)
    }
  }
}

/**
 * With several layers selected, Konva's shared Transformer drags all attached nodes together and fires `dragend`
 * on each of them in the same tick; the first one commits every target as ONE mutation and the rest are ignored.
 */
let multiEndHandled = false

function onNodeDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
  const node = e.currentTarget
  const s = store.getState()
  const targets = s.project ? transformTargets(s.project.layers, s.selectedIds) : []
  if (targets.length > 1 && targets.some((l) => l.id === node.id())) {
    if (multiEndHandled) return
    multiEndHandled = true
    queueMicrotask(() => {
      multiEndHandled = false
    })
    const stage = node.getStage()
    finishInteraction(targets.map((l) => nodeFor(stage, l.id)).filter((n): n is Konva.Node => !!n))
    return
  }
  finishInteraction([node])
}

/** Single-selection transforms commit per node; multi-selection commits once from the shared Transformer. */
function onNodeTransformEnd(e: Konva.KonvaEventObject<Event>): void {
  const s = store.getState()
  if (s.project && transformTargets(s.project.layers, s.selectedIds).length > 1) return
  finishInteraction([e.currentTarget])
}

function onTransformerEnd(e: Konva.KonvaEventObject<Event>): void {
  const tr = e.currentTarget as Konva.Transformer
  const nodes = tr.nodes()
  if (nodes.length > 1) finishInteraction([...nodes])
}

function handlersFor(
  layer: Layer,
  insideGroup: boolean,
  selectedDirectly: boolean
): Record<string, unknown> {
  // Group children move with their group unless selected on their own (e.g. from the Layers Panel).
  if (insideGroup && !selectedDirectly) return {}
  const base: Record<string, unknown> = {
    onDragStart: onNodeDragStart,
    onTransformStart: () => store.getState().setInteraction('transforming'),
    onDragMove: onNodeDragMove,
    onDragEnd: onNodeDragEnd,
    onTransformEnd: onNodeTransformEnd
  }
  if (layer.type === 'text') {
    base.onDblClick = () => store.getState().beginTextEdit(layer.id)
    base.onDblTap = () => store.getState().beginTextEdit(layer.id)
  }
  // Double-click a photo to reposition the sample picture inside its frame.
  if (layer.type === 'photo') {
    base.onDblClick = () => store.getState().beginCrop(layer.id)
    base.onDblTap = () => store.getState().beginCrop(layer.id)
  }
  base.onMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!store.getState().cropSession)
      e.target.getStage()?.container().style.setProperty('cursor', 'move')
  }
  base.onMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.target.getStage()?.container().style.removeProperty('cursor')
  }
  return base
}

function LayerView({
  layer,
  env,
  insideGroup = false
}: {
  layer: Layer
  env: RenderEnv
  insideGroup?: boolean
}): React.JSX.Element | null {
  const spec = specFor(layer, env, insideGroup)
  const nodeRef = useRef<Konva.Node>(null)
  // Konva measures text height itself; keep the origin on the measured box after every render.
  useLayoutEffect(() => {
    if (nodeRef.current) finalizeTextNode(nodeRef.current, layer)
  })
  if (!spec) return null
  const props: Record<string, unknown> = {
    ...spec.config,
    ...handlersFor(layer, insideGroup, env.selectedIds?.includes(layer.id) ?? false)
  }
  const Node = COMPONENTS[spec.className]
  if (layer.type === 'group') {
    // Children are rendered by domain order; the runtime group rests at identity.
    return (
      <Node {...props} ref={nodeRef}>
        {childrenOf(env.allLayers, layer.id).map((c) => (
          <LayerView key={c.id} layer={c} env={env} insideGroup />
        ))}
      </Node>
    )
  }
  return <Node {...props} ref={nodeRef} />
}

function PrintAreaMask({ width, height }: { width: number; height: number }): React.JSX.Element {
  // Editor-only dimming of everything outside the print area, so off-canvas content is visibly "outside".
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const c = ctx._context
        c.beginPath()
        c.rect(-1e6, -1e6, 2e6, 2e6)
        c.rect(0, 0, width, height)
        c.fillStyle = 'rgba(40,40,40,0.28)'
        c.fill('evenodd')
      }}
    />
  )
}

export function EditorCanvas(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  const viewState = useEditor((s) => s.view)
  const viewport = useEditor((s) => s.viewport)
  const selectedIds = useEditor((s) => s.selectedIds)
  const editingTextId = useEditor((s) => s.editingTextId)
  const photoDisplay = useEditor((s) => s.photoDisplay)
  const guides = useEditor((s) => s.guides)
  const guidesVisible = useEditor((s) => s.guidesVisible)
  const images: ImageLookup = useProjectImages(sessionId, project?.layers)
  const photoPreview = usePreviewPhotos(project?.layers)
  const showOverflow = useEditor((s) => s.showOverflow)
  const cropSession = useEditor((s) => s.cropSession)

  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)

  const view = useViewTransform()
  const pan = useSpacePan(hostRef)

  // Measure the host; the viewport size is editor state, the canvas never decides its own size.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = (): void =>
      store.getState().setViewport({
        width: Math.max(100, host.clientWidth),
        height: Math.max(100, host.clientHeight)
      })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  // Wheel: ctrl/cmd = zoom around the pointer, otherwise pan. Native listener so it can preventDefault.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (e: WheelEvent): void => {
      const s = store.getState()
      if (!s.project) return
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = host.getBoundingClientRect()
        s.zoomAtPoint(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top })
      } else {
        s.panBy(-e.deltaX, -e.deltaY)
      }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [])

  // Attach the shared transformer to every selected, editable, visible, topmost node (never while editing text).
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const targets =
      project && !editingTextId && !cropSession ? transformTargets(project.layers, selectedIds) : []
    const nodes = targets
      .map((l) => stage.findOne((n: Konva.Node) => n.id() === l.id))
      .filter((n): n is Konva.Node => !!n)
    const only = targets.length === 1 ? targets[0] : undefined
    tr.setAttrs(
      only
        ? transformerOptionsFor(only)
        : { keepRatio: false, enabledAnchors: [], rotateEnabled: true, flipEnabled: false }
    )
    if (targets.length > 1) {
      // A selection that includes a photo scales uniformly from the corners so no photo is distorted.
      const hasPhoto = targets.some((l) => l.type === 'photo')
      tr.setAttrs({
        keepRatio: hasPhoto,
        enabledAnchors: hasPhoto
          ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          : [
              'top-left',
              'top-center',
              'top-right',
              'middle-left',
              'middle-right',
              'bottom-left',
              'bottom-center',
              'bottom-right'
            ]
      })
    }
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, project, editingTextId, cropSession, viewState, viewport])

  useEffect(
    () => registerCanvasDebug(() => ({ stage: stageRef.current, transformer: trRef.current })),
    []
  )

  if (!project) return null
  const design = getPixelSize(project.canvas.print)
  const env: RenderEnv = {
    palette: project.palette,
    images,
    photoMode: photoDisplay,
    ...(photoPreview ? { photoPreview } : {}),
    frozenId: cropSession?.layerId ?? null,
    interactive: true,
    photoLabels: true,
    editingTextId,
    selectedIds,
    allLayers: project.layers
  }

  const onPointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
    const t = e.target
    const s = store.getState()
    if (!s.project) return
    const additive = e.evt.shiftKey || isPrimaryModifier(e.evt)
    if (t === t.getStage() || t.id() === DESIGN_NODE_ID) {
      if (!additive) s.clearSelection()
      return
    }
    if (t.getParent()?.getClassName() === 'Transformer') return // handles manage themselves
    const layers = s.project.layers
    const deepId = layerIdFor(t, layers, true)
    if (!deepId) return
    // Pressing something that is already selected keeps the selection (so a multi-selection can be dragged,
    // and a child selected from the Layers Panel can be moved on its own).
    if (!additive && s.selectedIds.includes(deepId)) return
    const id = e.evt.altKey ? deepId : layerIdFor(t, layers, false)
    if (!id) return
    // Shift on an already-selected layer may be the start of a constrained drag, so it only DESELECTS when the press
    // turns out to be a plain click (no movement), decided on release.
    if (e.evt.shiftKey && !isPrimaryModifier(e.evt) && s.selectedIds.includes(id)) {
      const start = { x: (e.evt as MouseEvent).clientX, y: (e.evt as MouseEvent).clientY }
      const onUp = (up: MouseEvent): void => {
        window.removeEventListener('mouseup', onUp, true)
        if (Math.hypot(up.clientX - start.x, up.clientY - start.y) < 4)
          store.getState().toggleSelection(id)
      }
      window.addEventListener('mouseup', onUp, true)
      return
    }
    if (additive) s.toggleSelection(id)
    else s.selectLayer(id)
  }

  // Files (from Finder/Explorer) and assets (from the Assets drawer) dropped on the artboard become image layers
  // centred on the drop point. Client coordinates are converted to DESIGN coordinates through the current view
  // (zoom and pan), so no screen-space value is ever stored.
  const designPointOf = (e: React.DragEvent): { x: number; y: number } | null => {
    const host = hostRef.current
    const t = selectViewTransform(store.getState())
    if (!host || !t) return null
    return dropPointToDesign(t, { x: e.clientX, y: e.clientY }, host.getBoundingClientRect())
  }
  const acceptsDrop = (e: React.DragEvent): boolean =>
    dragHasFiles(e.dataTransfer) || dragHasAsset(e.dataTransfer)

  return (
    <div
      ref={hostRef}
      className={`canvas-host${pan.ready ? ' pan-ready' : ''}${pan.panning ? ' panning' : ''}${cropSession ? ' cropping' : ''}`}
      onDragOver={(e) => {
        if (!acceptsDrop(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        if (!acceptsDrop(e)) return
        e.preventDefault()
        const at = designPointOf(e)
        const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE)
        if (assetId) store.getState().addAssetToCanvas(assetId, at)
        else void importDroppedFiles(e.dataTransfer, { kind: 'canvas', at })
      }}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        scaleX={view?.scale ?? 1}
        scaleY={view?.scale ?? 1}
        x={view?.offsetX ?? 0}
        y={view?.offsetY ?? 0}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        <KLayer name="workspace" listening={false}>
          <Rect
            x={0}
            y={0}
            width={design.width}
            height={design.height}
            fill="#ffffff"
            stroke={CANVAS_THEME.artboardEdge}
            strokeWidth={1}
            strokeScaleEnabled={false}
            shadowColor="#000000"
            shadowBlur={36}
            shadowOpacity={0.55}
            shadowOffsetY={10}
            shadowForStrokeEnabled={false}
          />
        </KLayer>
        <KLayer
          name="printable"
          {...(showOverflow
            ? {}
            : { clipX: 0, clipY: 0, clipWidth: design.width, clipHeight: design.height })}
        >
          <Rect
            id={DESIGN_NODE_ID}
            x={0}
            y={0}
            width={design.width}
            height={design.height}
            fill={resolveColor(project.palette, project.canvas.backgroundColor)}
          />
          <Layers project={project} env={env} />
        </KLayer>
        <KLayer name="editor-overlay">
          {showOverflow && <PrintAreaMask width={design.width} height={design.height} />}
          {guidesVisible &&
            guides.map((g) => (
              <Line
                key={`${g.axis}-${g.at}`}
                listening={false}
                points={g.axis === 'x' ? [g.at, -1e5, g.at, 1e5] : [-1e5, g.at, 1e5, g.at]}
                stroke={CANVAS_THEME.guide}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
              />
            ))}
          <Transformer
            ref={trRef}
            rotationSnaps={[...ROTATION_SNAPS]}
            rotationSnapTolerance={4}
            anchorSize={13}
            anchorCornerRadius={2}
            anchorFill={CANVAS_THEME.handleFill}
            anchorStroke={CANVAS_THEME.accent}
            borderStroke={CANVAS_THEME.outline}
            borderStrokeWidth={1}
            rotateAnchorOffset={28}
            ignoreStroke
            onTransformEnd={onTransformerEnd}
            boundBoxFunc={(oldBox, newBox) => (boxTooSmall(newBox) ? oldBox : newBox)}
          />
        </KLayer>
      </Stage>
      <TextEditOverlay />
      {cropSession && <CropOverlay />}
    </div>
  )
}

function Layers({ project, env }: { project: TemplateProject; env: RenderEnv }): React.JSX.Element {
  // Back-to-front by zIndex with array order as the tie-breaker (domain `sortedSiblings`), never by insertion order.
  return (
    <>
      {topLevelLayers(project.layers).map((l) => (
        <LayerView key={l.id} layer={l} env={env} />
      ))}
    </>
  )
}
