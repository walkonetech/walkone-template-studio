/* eslint-disable react-hooks/refs -- SPIKE FINDING: react-konva event handlers close over Konva refs; the React 19 compiler lint rule cannot prove these safe. */
/** SPIKE (Phase 3A): Konva 10 via react-konva 19 behind the domain model. Declarative scene from domain state. */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import {
  Ellipse,
  Group,
  Image as KImage,
  Layer as KLayer,
  Line,
  Rect,
  Shape,
  Stage,
  Text,
  Transformer
} from 'react-konva'
import type Konva from 'konva'
import type { Layer } from '@domain/index'
import type { EngineHandle, EngineProps, GeometryChange, HandleName } from '../shared/engine'
import { invert, matrixToGeometry, multiply, wrapDegrees, type Matrix } from '../shared/geometry'
import { coverSource } from '../shared/images'
import { computeSnap, type Rect as BoxRect } from '../shared/snap'
import { childrenOf, colorOf, DESIGN, topLevel } from '../shared/scene'

const TINTS = ['#e8544a', '#8bc34a', '#4db6ac', '#ba68c8']

/** Props shared by every node: box-center origin so rotation matches the domain definition. */
function common(l: Layer): Konva.NodeConfig {
  return {
    id: l.id,
    x: l.x + l.width / 2,
    y: l.y + l.height / 2,
    offsetX: l.width / 2,
    offsetY: l.height / 2,
    rotation: l.rotation,
    opacity: l.opacity,
    visible: l.visible,
    draggable: !l.locked,
    listening: !l.locked
  }
}

interface NodeCallbacks {
  images: EngineProps['images']
  all: readonly Layer[]
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void
  onGroupEnd: (g: Konva.Group, layerId: string) => void
  onNodeEnd: (node: Konva.Node) => void
}

function LayerNode({
  l,
  cb,
  inGroup = false
}: {
  l: Layer
  cb: NodeCallbacks
  inGroup?: boolean
}): React.JSX.Element | null {
  const textRef = useRef<Konva.Text>(null)
  // Text height is measured by Konva; re-center the origin on the measured box (layout effect = no flicker).
  useLayoutEffect(() => {
    const t = textRef.current
    if (!t || l.type !== 'text') return
    t.offsetY(t.height() / 2)
    t.y(l.y + t.height() / 2)
  })
  // Children of a runtime group move with the group, never on their own.
  const drag = {
    onDragMove: cb.onDragMove,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => cb.onNodeEnd(e.currentTarget),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => cb.onNodeEnd(e.currentTarget),
    ...(inGroup ? { draggable: false } : {})
  }
  switch (l.type) {
    case 'photo': {
      const sample = l.sampleAssetId ? cb.images[l.sampleAssetId] : undefined
      const border = l.frame.style === 'solid' ? l.frame.thickness : 0
      return (
        <Shape
          {...common(l)}
          {...drag}
          width={l.width}
          height={l.height}
          sceneFunc={(ctx, shape) => {
            const w = shape.width()
            const h = shape.height()
            const c = ctx._context
            c.save()
            c.beginPath()
            c.rect(0, 0, w, h)
            c.clip()
            if (sample) {
              const s = coverSource(sample, w, h)
              c.drawImage(sample, s.sx, s.sy, s.sw, s.sh, 0, 0, w, h)
            } else {
              c.fillStyle = TINTS[(l.photoNumber - 1) % TINTS.length] ?? '#999'
              c.fillRect(0, 0, w, h)
            }
            c.restore()
            if (border > 0) {
              c.strokeStyle = '#ffffff'
              c.lineWidth = border
              c.strokeRect(border / 2, border / 2, w - border, h - border)
            }
            c.fillStyle = 'rgba(255,255,255,0.95)'
            c.font = `700 ${Math.round(h * 0.4)}px Helvetica`
            c.textAlign = 'center'
            c.textBaseline = 'middle'
            c.fillText(String(l.photoNumber), w / 2, h / 2)
            c.font = `400 ${Math.round(h * 0.07)}px Helvetica`
            c.fillText(`Photo ${l.photoNumber}`, w / 2, h / 2 + h * 0.34)
          }}
          // Hit area = the full box (a sceneFunc shape would otherwise hit-test only what it fills via Konva's color trick)
          hitFunc={(ctx, shape) => {
            ctx.beginPath()
            ctx.rect(0, 0, shape.width(), shape.height())
            ctx.closePath()
            ctx.fillStrokeShape(shape)
          }}
        />
      )
    }
    case 'image': {
      const img = cb.images[l.assetId]
      return <KImage {...common(l)} {...drag} image={img} width={l.width} height={l.height} />
    }
    case 'text':
      return (
        <Text
          ref={textRef}
          {...common(l)}
          {...drag}
          text={l.content}
          width={l.width}
          fontFamily={l.fontFamily}
          fontSize={l.fontSize}
          fontStyle={`${l.fontStyle === 'italic' ? 'italic ' : ''}${l.fontWeight}`}
          align={l.align}
          lineHeight={l.lineHeight}
          letterSpacing={l.letterSpacing}
          fill={colorOf(l.fill)}
        />
      )
    case 'shape':
      return l.shape === 'ellipse' ? (
        <Ellipse
          {...common(l)}
          {...drag}
          radiusX={l.width / 2}
          radiusY={l.height / 2}
          offsetX={0}
          offsetY={0}
          fill={l.fill ? colorOf(l.fill) : 'transparent'}
          stroke={l.stroke ? colorOf(l.stroke.color) : 'transparent'}
          strokeWidth={l.stroke?.width ?? 0}
        />
      ) : (
        <Rect
          {...common(l)}
          {...drag}
          width={l.width}
          height={l.height}
          cornerRadius={l.cornerRadius}
          fill={l.fill ? colorOf(l.fill) : 'transparent'}
          stroke={l.stroke ? colorOf(l.stroke.color) : 'transparent'}
          strokeWidth={l.stroke?.width ?? 0}
        />
      )
    case 'group':
      // Children keep ABSOLUTE design coordinates; the runtime group starts at identity.
      return (
        <Group
          id={l.id}
          draggable={!l.locked}
          visible={l.visible}
          opacity={l.opacity}
          onDragMove={cb.onDragMove}
          onDragEnd={(e) => cb.onGroupEnd(e.currentTarget as Konva.Group, l.id)}
          onTransformEnd={(e) => cb.onGroupEnd(e.currentTarget as Konva.Group, l.id)}
        >
          {childrenOf(cb.all, l.id).map((c) => (
            <LayerNode key={c.id} l={c} cb={cb} inGroup />
          ))}
        </Group>
      )
  }
}

export function KonvaEngine(props: EngineProps & { ref?: Ref<EngineHandle> }): React.JSX.Element {
  const { project, images, selectedId, view, viewport } = props
  const stageRef = useRef<Konva.Stage>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  /** Stage→design matrix inverse: Konva absolute transforms include the stage's view scale/offset. */
  const stageMatrix = (): Matrix => {
    const s = stageRef.current
    return s ? (s.getAbsoluteTransform().getMatrix() as unknown as Matrix) : [1, 0, 0, 1, 0, 0]
  }
  const designGeometry = (
    node: Konva.Node,
    w: number,
    h: number
  ): ReturnType<typeof matrixToGeometry> => {
    const abs = node.getAbsoluteTransform().getMatrix() as unknown as Matrix
    const m = multiply(invert(stageMatrix()), abs)
    const g = matrixToGeometry(m, w, h, 'top-left')
    return { ...g, rotation: wrapDegrees(g.rotation) }
  }

  const reportNode = (node: Konva.Node): GeometryChange | null => {
    const id = node.id()
    const layer = latest.current.project.layers.find((x) => x.id === id)
    if (!layer) return null
    // Local (unscaled) size: Konva stores width/height separately from scaleX/scaleY.
    const w = node instanceof Ellipse_ ? (node as Konva.Ellipse).radiusX() * 2 : node.width()
    const h = node instanceof Ellipse_ ? (node as Konva.Ellipse).radiusY() * 2 : node.height()
    const geometry = designGeometry(node, w, h)
    const change: GeometryChange = { id, geometry }
    if (layer.type === 'text') {
      // Convention shared with the Fabric spike: scaleY scales the glyphs (fontSize); scaleX widens the box.
      // `geometry` already contains both scale factors (width×scaleX, height×scaleY).
      change.fontSize = layer.fontSize * Math.abs(node.scaleY())
    }
    return change
  }

  const onGroupEnd = (g: Konva.Group, groupId: string): void => {
    void groupId
    const changes: GeometryChange[] = []
    for (const child of g.getChildren()) {
      const id = child.id()
      const layer = latest.current.project.layers.find((x) => x.id === id)
      if (!layer) continue
      const isText = layer.type === 'text'
      const w = child.width()
      const h = isText ? child.height() : child.height()
      changes.push({ id, geometry: designGeometry(child, w, h) })
    }
    // Bake the group's transform into the children (domain is flat/absolute): reset the runtime group.
    g.position({ x: 0, y: 0 })
    g.rotation(0)
    g.scale({ x: 1, y: 1 })
    latest.current.onGuides([])
    latest.current.onGeometry(changes)
  }

  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>): void => {
    if (!latest.current.snapping) return
    const node = e.target
    const layerNode = layerRef.current
    if (!layerNode) return
    const rect = (n: Konva.Node): BoxRect => {
      const r = n.getClientRect({ relativeTo: layerNode })
      return { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
    }
    const others: BoxRect[] = []
    for (const child of layerNode.getChildren()) {
      if (child !== node && child.id() && child.id() !== '__design') others.push(rect(child))
    }
    const r = computeSnap(rect(node), others, DESIGN, 10 / latest.current.view.scale)
    if (r.dx !== 0 || r.dy !== 0) node.position({ x: node.x() + r.dx, y: node.y() + r.dy })
    latest.current.onGuides(r.guides)
  }

  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null
    tr.nodes(node && node.listening() ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, project])

  const onNodeEnd = (node: Konva.Node): void => {
    const change = reportNode(node)
    if (!change) return
    // Fold scale into size (Konva keeps scaleX/scaleY on the node after a transform): reset to identity scale.
    node.scale({ x: 1, y: 1 })
    latest.current.onGuides([])
    latest.current.onGeometry([change])
  }

  const cb: NodeCallbacks = { images, all: project.layers, onDragMove, onGroupEnd, onNodeEnd }

  useImperativeHandle(props.ref, (): EngineHandle => ({
    exportPng: (out) => {
      const stage = stageRef.current
      const tr = trRef.current
      if (!stage || !tr) throw new Error('no stage')
      const prev = {
        scale: stage.scale(),
        pos: stage.position(),
        w: stage.width(),
        h: stage.height()
      }
      const prevNodes = tr.nodes()
      tr.nodes([])
      // Export in design space: neutral view, design-sized stage, explicit pixelRatio (ignores devicePixelRatio).
      stage.scale({ x: 1, y: 1 })
      stage.position({ x: 0, y: 0 })
      stage.size({ width: DESIGN.width, height: DESIGN.height })
      const url = stage.toDataURL({
        x: 0,
        y: 0,
        width: DESIGN.width,
        height: DESIGN.height,
        pixelRatio: out.width / DESIGN.width,
        mimeType: 'image/png'
      })
      stage.size({ width: prev.w, height: prev.h })
      stage.scale(prev.scale)
      stage.position(prev.pos)
      tr.nodes(prevNodes)
      stage.batchDraw()
      return url
    },
    handlePoint: (id, handle) => {
      const stage = stageRef.current
      const tr = trRef.current
      if (!stage || !tr || !tr.nodes().some((n) => n.id() === id)) return null
      const names: Record<HandleName, string> = {
        tl: 'top-left',
        tr: 'top-right',
        bl: 'bottom-left',
        br: 'bottom-right',
        mt: 'top-center',
        mb: 'bottom-center',
        ml: 'middle-left',
        mr: 'middle-right',
        rot: 'rotater'
      }
      const anchor = tr.findOne(`.${names[handle]}`)
      if (!anchor) return null
      const p = anchor.getAbsolutePosition()
      const r = stage.container().getBoundingClientRect()
      return { x: r.left + p.x, y: r.top + p.y }
    },
    layerCenterPoint: (id) => {
      const stage = stageRef.current
      const node = stage?.findOne(`#${id}`)
      if (!stage || !node) return null
      const c = node.getClientRect()
      const r = stage.container().getBoundingClientRect()
      return { x: r.left + c.x + c.width / 2, y: r.top + c.y + c.height / 2 }
    },
    info: () => {
      const stage = stageRef.current
      const els = Array.from(stage?.container().querySelectorAll('canvas') ?? [])
      return {
        name: 'konva',
        objectCount: layerRef.current?.getChildren().length ?? 0,
        dpr: window.devicePixelRatio,
        canvases: els.map((c) => ({
          backing: [c.width, c.height] as [number, number],
          css: [c.clientWidth, c.clientHeight] as [number, number]
        }))
      }
    },
    dragBenchmark: (id, steps) => {
      const node = stageRef.current?.findOne(`#${id}`)
      const layer = layerRef.current
      if (!node || !layer) return -1
      const t0 = performance.now()
      for (let i = 0; i < steps; i++) {
        node.x(node.x() + 2)
        layer.draw()
      }
      return performance.now() - t0
    },
    zoomBenchmark: (n) => {
      const stage = stageRef.current
      if (!stage) return -1
      const t0 = performance.now()
      for (let i = 0; i < n; i++) {
        const s = 0.15 + (i % 10) * 0.01
        stage.scale({ x: s, y: s })
        stage.position({ x: 20, y: 20 })
        stage.draw()
      }
      stage.scale({ x: view.scale, y: view.scale })
      stage.position({ x: view.offsetX, y: view.offsetY })
      return performance.now() - t0
    }
  }))

  return (
    <Stage
      ref={stageRef}
      width={viewport.width}
      height={viewport.height}
      scaleX={view.scale}
      scaleY={view.scale}
      x={view.offsetX}
      y={view.offsetY}
      onMouseDown={(e) => {
        const t = e.target
        if (t === t.getStage() || t.id() === '__design') {
          props.onSelect(null)
          return
        }
        // Clicking inside a runtime group selects the group (the domain's group layer), not the child.
        const id = t.findAncestor('Group')?.id() || t.id()
        if (id) props.onSelect(id)
      }}
      data-engine="konva"
    >
      <KLayer ref={layerRef}>
        <Rect
          id="__design"
          x={0}
          y={0}
          width={DESIGN.width}
          height={DESIGN.height}
          fill={colorOf(project.canvas.backgroundColor)}
          listening
        />
        {topLevel(project.layers).map((l) => (
          <LayerNode key={l.id} l={l} cb={cb} />
        ))}
        {props.guides.map((g) => (
          <Line
            key={`${g.axis}-${g.at}`}
            points={g.axis === 'x' ? [g.at, -1e5, g.at, 1e5] : [-1e5, g.at, 1e5, g.at]}
            stroke="#e91e63"
            strokeWidth={2}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          anchorSize={18}
          borderStroke="#1a73e8"
          anchorStroke="#1a73e8"
          ignoreStroke
        />
      </KLayer>
    </Stage>
  )
}

// runtime class references (instanceof) from the underlying konva package
import KonvaLib from 'konva'
const Ellipse_ = KonvaLib.Ellipse
