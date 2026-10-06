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
  isEditable,
  isEffectivelyVisible,
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
import { selectDesignSize, selectViewTransform } from '@editor/store'
import { editorStore, useEditor, useViewTransform } from './editorStore'
import { useProjectImages } from './useProjectImages'
import { TextEditOverlay } from './TextEditOverlay'
import { registerCanvasDebug } from './debugHooks'

/** react-konva components keyed by the spec's node class. One assertion at the dynamic-dispatch boundary. */
const COMPONENTS = { Group, Rect, Ellipse, Line, Text, Shape } as unknown as Record<
  NodeClass,
  ComponentType<Record<string, unknown>>
>

const store = editorStore

/** Domain layer id for a Konva target; clicks inside a group select the outermost group. */
function layerIdFor(target: Konva.Node, layers: readonly Layer[]): string | null {
  let node: Konva.Node | null = target
  while (node) {
    const id = node.id()
    if (id && layers.some((l) => l.id === id)) return selectableRoot(layers, id)?.id ?? id
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

function onNodeDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
  const s = store.getState()
  if (!s.snapping.enabled) return
  const design = selectDesignSize(s)
  const view = selectViewTransform(s)
  if (!design || !view) return
  const node = e.currentTarget
  const r = snapDraggedNode(node, design, view, s.snapping.tolerancePx)
  if (!r) return
  if (r.dx !== 0 || r.dy !== 0) node.position({ x: node.x() + r.dx, y: node.y() + r.dy })
  s.setGuides(r.guides)
}

/** Interaction finished: normalize, commit ONE mutation (one history entry), reset runtime scale. */
function onNodeEnd(node: Konva.Node): void {
  const s = store.getState()
  const layer = s.project?.layers.find((l) => l.id === node.id())
  if (!s.project || !layer) return
  const changes =
    layer.type === 'group'
      ? commitGroupNode(node as Konva.Group, s.project.layers)
      : [commitTopLevelNode(node, layer)]
  const committed = s.commitGeometry(changes)
  s.setGuides([])
  s.setInteraction('idle')
  if (!committed) restoreNode(node, layer)
}

function handlersFor(layer: Layer, insideGroup: boolean): Record<string, unknown> {
  if (insideGroup) return {}
  const base: Record<string, unknown> = {
    onDragStart: () => store.getState().setInteraction('transforming'),
    onTransformStart: () => store.getState().setInteraction('transforming'),
    onDragMove: onNodeDragMove,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onNodeEnd(e.currentTarget),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onNodeEnd(e.currentTarget)
  }
  if (layer.type === 'text') {
    base.onDblClick = () => store.getState().beginTextEdit(layer.id)
    base.onDblTap = () => store.getState().beginTextEdit(layer.id)
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
  const props: Record<string, unknown> = { ...spec.config, ...handlersFor(layer, insideGroup) }
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

  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)

  const view = useViewTransform()

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

  // Attach the transformer to the selected, editable, visible node (never while editing text).
  const activeId = selectedIds[selectedIds.length - 1] ?? null
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const layer = project?.layers.find((l) => l.id === activeId)
    let node: Konva.Node | undefined
    if (
      project &&
      layer &&
      !editingTextId &&
      isEditable(project.layers, layer) &&
      isEffectivelyVisible(project.layers, layer)
    ) {
      node = stage.findOne((n: Konva.Node) => n.id() === layer.id) ?? undefined
      tr.setAttrs(transformerOptionsFor(layer))
    }
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [activeId, project, editingTextId, viewState, viewport])

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
    interactive: true,
    photoLabels: true,
    editingTextId,
    allLayers: project.layers
  }

  const onPointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
    const t = e.target
    const s = store.getState()
    if (!s.project) return
    if (t === t.getStage() || t.id() === DESIGN_NODE_ID) {
      s.clearSelection()
      return
    }
    if (t.getParent()?.getClassName() === 'Transformer') return // handles manage themselves
    const id = layerIdFor(t, s.project.layers)
    if (id) s.selectLayer(id)
  }

  return (
    <div ref={hostRef} className="canvas-host">
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
            shadowColor="#000000"
            shadowBlur={30}
            shadowOpacity={0.35}
            shadowOffsetY={8}
            shadowForStrokeEnabled={false}
          />
        </KLayer>
        <KLayer name="printable">
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
          <PrintAreaMask width={design.width} height={design.height} />
          {guidesVisible &&
            guides.map((g) => (
              <Line
                key={`${g.axis}-${g.at}`}
                listening={false}
                points={g.axis === 'x' ? [g.at, -1e5, g.at, 1e5] : [-1e5, g.at, 1e5, g.at]}
                stroke="#e91e63"
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
            anchorFill="#ffffff"
            anchorStroke="#1a73e8"
            borderStroke="#1a73e8"
            rotateAnchorOffset={28}
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) => (boxTooSmall(newBox) ? oldBox : newBox)}
          />
        </KLayer>
      </Stage>
      <TextEditOverlay />
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
