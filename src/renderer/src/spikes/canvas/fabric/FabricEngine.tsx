/** SPIKE (Phase 3A): Fabric.js 7 behind the domain model. Imperative, no official React wrapper. */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import {
  Canvas,
  FabricImage,
  Group,
  Rect,
  Textbox,
  Ellipse,
  type FabricObject,
  type TPointerEventInfo
} from 'fabric'
import type { Layer } from '@domain/index'
import type { EngineHandle, EngineProps, GeometryChange, HandleName } from '../shared/engine'
import { fromCenterBox, matrixToGeometry, wrapDegrees, type Matrix } from '../shared/geometry'
import { computeSnap, type Guide, type Rect as BoxRect } from '../shared/snap'
import { colorOf, childrenOf, DESIGN, topLevel } from '../shared/scene'
import { PhotoPlaceholder } from './PhotoPlaceholder'

const ids = new WeakMap<FabricObject, string>()
const layerOf = (o: FabricObject): string | undefined => ids.get(o)

function frameThickness(l: Layer): number {
  return l.type === 'photo' && l.frame.style === 'solid' ? l.frame.thickness : 0
}

/** Creates the Fabric object for a domain layer. Geometry is applied separately by `applyGeometry`. */
function createObject(
  l: Layer,
  images: EngineProps['images'],
  all: readonly Layer[]
): FabricObject {
  switch (l.type) {
    case 'photo': {
      const sample = l.sampleAssetId ? images[l.sampleAssetId] : undefined
      return new PhotoPlaceholder({ photoNumber: l.photoNumber, border: frameThickness(l), sample })
    }
    case 'image': {
      const img = images[l.assetId]
      if (!img) throw new Error(`missing image ${l.assetId}`)
      return new FabricImage(img)
    }
    case 'text':
      return new Textbox(l.content, {
        fontFamily: l.fontFamily,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        fontStyle: l.fontStyle,
        textAlign: l.align,
        lineHeight: l.lineHeight,
        charSpacing: (l.letterSpacing / l.fontSize) * 1000,
        fill: colorOf(l.fill),
        width: l.width
      })
    case 'shape':
      return l.shape === 'ellipse'
        ? new Ellipse({ rx: l.width / 2, ry: l.height / 2 })
        : new Rect({ width: l.width, height: l.height, rx: l.cornerRadius, ry: l.cornerRadius })
    case 'group': {
      const kids = childrenOf(all, l.id).map((c) => {
        const o = createObject(c, images, all)
        ids.set(o, c.id)
        applyGeometry(o, c, images)
        applyStyle(o, c)
        return o
      })
      const g = new Group(kids, { subTargetCheck: false, interactive: false })
      return g
    }
  }
}

function applyStyle(o: FabricObject, l: Layer): void {
  o.set({ opacity: l.opacity, visible: l.visible })
  if (l.type === 'shape') {
    o.set({
      fill: l.fill ? colorOf(l.fill) : 'transparent',
      stroke: l.stroke ? colorOf(l.stroke.color) : null,
      strokeWidth: l.stroke ? l.stroke.width : 0,
      strokeUniform: true
    })
  }
  if (l.type === 'photo' && o instanceof PhotoPlaceholder)
    o.set({ border: frameThickness(l), dirty: true })
  const locked = l.locked
  o.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    hasBorders: true,
    // Cached bitmaps are resampled at export; disable for pixel-exact output (see research notes).
    objectCaching: false,
    // Lock and select are domain concepts; transform controls follow the domain's flags only.
    hasControls: !locked,
    // Keep rotation about the box center, matching the domain definition.
    originX: 'center',
    originY: 'center',
    transparentCorners: false,
    cornerSize: 18,
    touchCornerSize: 28,
    cornerColor: '#1a73e8',
    borderColor: '#1a73e8',
    borderScaleFactor: 2
  })
}

/** Applies domain geometry (design space) to a Fabric object whose origin is the box center. */
function applyGeometry(o: FabricObject, l: Layer, images: EngineProps['images']): void {
  if (l.type === 'group') return // group geometry derives from its children
  const cx = l.x + l.width / 2
  const cy = l.y + l.height / 2
  if (l.type === 'image') {
    const img = images[l.assetId]
    if (img) o.set({ scaleX: l.width / img.width, scaleY: l.height / img.height })
  } else if (l.type === 'text') {
    // Text height is measured by Fabric, not stored in the box; width is the wrap width.
    o.set({ width: l.width, scaleX: 1, scaleY: 1 })
    ;(o as Textbox).initDimensions()
    o.set({ left: cx, top: l.y + o.height / 2, angle: l.rotation })
    o.setCoords()
    return
  } else if (l.type === 'shape' && l.shape === 'ellipse') {
    o.set({ rx: l.width / 2, ry: l.height / 2, scaleX: 1, scaleY: 1 })
  } else {
    o.set({ width: l.width, height: l.height, scaleX: 1, scaleY: 1 })
  }
  o.set({ left: cx, top: cy, angle: l.rotation })
  o.setCoords()
}

/** Absolute design-space geometry of a Fabric object (works for objects nested in a group). */
function geometryOf(o: FabricObject): ReturnType<typeof matrixToGeometry> {
  const m = o.calcTransformMatrix() as unknown as Matrix
  return matrixToGeometry(m, o.width, o.height, 'center')
}

function aabb(o: FabricObject): BoxRect {
  const pts = o.getCoords() // scene plane == design space (view transform is separate)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys)
  }
}

export function FabricEngine({
  ref,
  ...props
}: EngineProps & { ref?: Ref<EngineHandle> }): React.JSX.Element {
  const { project, images, selectedId, view, viewport, snapping } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const objects = useRef(new Map<string, FabricObject>())
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  const guidesRef = useRef<Guide[]>([])

  // ---- lifecycle: create once, dispose on unmount (safe under StrictMode double effects)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const el = document.createElement('canvas')
    host.appendChild(el)
    const canvas = new Canvas(el, {
      width: latest.current.viewport.width,
      height: latest.current.viewport.height,
      backgroundColor: '#b9b9b9',
      selection: false,
      // Fabric's default is proportional scaling on corner handles; match Konva's free resize for this comparison.
      uniformScaling: false,
      preserveObjectStacking: true,
      renderOnAddRemove: false
    })
    canvasRef.current = canvas
    const objs = objects.current

    const emitSelection = (): void => {
      const a = canvas.getActiveObject()
      latest.current.onSelect(a ? (layerOf(a) ?? null) : null)
    }
    canvas.on('selection:created', emitSelection)
    canvas.on('selection:updated', emitSelection)
    canvas.on('selection:cleared', emitSelection)

    canvas.on('object:moving', (e) => {
      if (!latest.current.snapping) return
      const t = e.target
      const box = aabb(t)
      const v = latest.current.view
      const others: BoxRect[] = []
      for (const o of canvas.getObjects()) {
        if (o !== t && layerOf(o)) others.push(aabb(o))
      }
      const r = computeSnap(box, others, DESIGN, 10 / v.scale)
      if (r.dx !== 0 || r.dy !== 0) {
        t.set({ left: t.left + r.dx, top: t.top + r.dy })
        t.setCoords()
      }
      guidesRef.current = r.guides
      latest.current.onGuides(r.guides)
    })

    canvas.on('after:render', () => {
      const guides = guidesRef.current
      if (!guides.length) return
      const ctx = canvas.getContext()
      const vpt = canvas.viewportTransform
      ctx.save()
      ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
      ctx.strokeStyle = '#e91e63'
      ctx.lineWidth = 2 / vpt[0]
      for (const g of guides) {
        ctx.beginPath()
        if (g.axis === 'x') {
          ctx.moveTo(g.at, -1e5)
          ctx.lineTo(g.at, 1e5)
        } else {
          ctx.moveTo(-1e5, g.at)
          ctx.lineTo(1e5, g.at)
        }
        ctx.stroke()
      }
      ctx.restore()
    })

    canvas.on('mouse:up', () => {
      if (guidesRef.current.length) {
        guidesRef.current = []
        latest.current.onGuides([])
        canvas.requestRenderAll()
      }
    })

    canvas.on('object:modified', (e: { target: FabricObject } & Partial<TPointerEventInfo>) => {
      const t = e.target
      const changes: GeometryChange[] = []
      const id = layerOf(t)
      if (t instanceof Group && id) {
        // Runtime group: report every child's ABSOLUTE geometry (domain stays flat, absolute coordinates)
        for (const child of t.getObjects()) {
          const cid = layerOf(child)
          if (cid) changes.push({ id: cid, geometry: wrapRot(geometryOf(child)) })
        }
        // The group layer's own box = bounds of its children, rotation 0 (domain rule)
        const g = t.getBoundingRect()
        void g
      } else if (id) {
        const layer = latest.current.project.layers.find((l) => l.id === id)
        const change: GeometryChange = { id, geometry: wrapRot(geometryOf(t)) }
        if (layer?.type === 'text' && t instanceof Textbox) {
          // Fabric scaled the glyphs (scaleY) and/or widened the box (width): fold both into domain values.
          change.fontSize = layer.fontSize * Math.abs(t.scaleY)
        }
        changes.push(change)
      }
      if (changes.length) latest.current.onGeometry(changes)
    })

    return () => {
      canvasRef.current = null
      objs.clear()
      void canvas.dispose()
      el.remove()
      host.querySelectorAll('.canvas-container').forEach((n) => n.remove())
    }
  }, [])

  // ---- sync: domain → Fabric (ids, geometry, style, z-order). Idempotent.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const objs = objects.current
    const layers = project.layers
    const wanted = new Set(topLevel(layers).map((l) => l.id))
    for (const [id, o] of objs) {
      if (id !== '__design' && !wanted.has(id)) {
        canvas.remove(o)
        objs.delete(id)
      }
    }
    // Design background (not a domain layer: derived from canvas.backgroundColor)
    let bg = objs.get('__design')
    if (!bg) {
      // Fabric 7 changed the default origin to 'center', so a top-left anchored rect must say so.
      bg = new Rect({
        originX: 'left',
        originY: 'top',
        left: 0,
        top: 0,
        width: DESIGN.width,
        height: DESIGN.height,
        selectable: false,
        evented: false,
        objectCaching: false,
        // Fabric's default strokeWidth is 1 and is part of the bounding box: it insets the fill by 0.5px.
        strokeWidth: 0,
        hoverCursor: 'default'
      })
      objs.set('__design', bg)
      canvas.add(bg)
    }
    bg.set({ fill: colorOf(project.canvas.backgroundColor) })

    topLevel(layers).forEach((l, i) => {
      let o = objs.get(l.id)
      if (!o) {
        o = createObject(l, images, layers)
        ids.set(o, l.id)
        objs.set(l.id, o)
        canvas.add(o)
      }
      applyStyle(o, l)
      if (o instanceof Textbox && l.type === 'text') {
        o.set({
          text: l.content,
          fontSize: l.fontSize,
          fill: colorOf(l.fill),
          textAlign: l.align,
          lineHeight: l.lineHeight
        })
      }
      applyGeometry(o, l, images)
      canvas.moveObjectTo(o, i + 1)
    })
    // selection mirrors domain state
    const active = canvas.getActiveObject()
    const target = selectedId ? objs.get(selectedId) : undefined
    if (target && target.selectable && active !== target) canvas.setActiveObject(target)
    if (!selectedId && active) canvas.discardActiveObject()
    canvas.requestRenderAll()
  }, [project, images, selectedId])

  // ---- view: display transform only; never touches design coordinates
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setDimensions({ width: viewport.width, height: viewport.height })
    canvas.setViewportTransform([view.scale, 0, 0, view.scale, view.offsetX, view.offsetY])
    canvas.requestRenderAll()
  }, [view, viewport])

  useEffect(() => {
    void snapping
  }, [snapping])

  useImperativeHandle(ref, (): EngineHandle => ({
    exportPng: (out) => {
      const canvas = canvasRef.current
      if (!canvas) throw new Error('no canvas')
      const prev = canvas.viewportTransform
      const prevGuides = guidesRef.current
      guidesRef.current = []
      canvas.discardActiveObject()
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
      // Scale the design area to the requested output size; retina scaling is disabled inside.
      const el = canvas.toCanvasElement(out.width / DESIGN.width, {
        left: 0,
        top: 0,
        width: DESIGN.width,
        height: DESIGN.height
      })
      canvas.setViewportTransform(prev)
      guidesRef.current = prevGuides
      canvas.requestRenderAll()
      return el.toDataURL('image/png')
    },
    handlePoint: (id, handle) => {
      const canvas = canvasRef.current
      const o = objects.current.get(id)
      if (!canvas || !o) return null
      const map: Record<HandleName, string> = {
        tl: 'tl',
        tr: 'tr',
        bl: 'bl',
        br: 'br',
        mt: 'mt',
        mb: 'mb',
        ml: 'ml',
        mr: 'mr',
        rot: 'mtr'
      }
      const c = (o.oCoords as unknown as Record<string, { x: number; y: number }>)[map[handle]]
      if (!c) return null
      const r = canvas.upperCanvasEl.getBoundingClientRect()
      return { x: r.left + c.x, y: r.top + c.y }
    },
    layerCenterPoint: (id) => {
      const canvas = canvasRef.current
      const o = objects.current.get(id)
      if (!canvas || !o) return null
      const p = o.getCenterPoint()
      const v = canvas.viewportTransform
      const r = canvas.upperCanvasEl.getBoundingClientRect()
      return { x: r.left + p.x * v[0] + v[4], y: r.top + p.y * v[3] + v[5] }
    },
    info: () => {
      const canvas = canvasRef.current
      const els = Array.from(hostRef.current?.querySelectorAll('canvas') ?? [])
      return {
        name: 'fabric',
        objectCount: canvas?.getObjects().length ?? 0,
        dpr: window.devicePixelRatio,
        canvases: els.map((c) => ({
          backing: [c.width, c.height] as [number, number],
          css: [c.clientWidth, c.clientHeight] as [number, number]
        }))
      }
    },
    dragBenchmark: (id, steps) => {
      const canvas = canvasRef.current
      const o = objects.current.get(id)
      if (!canvas || !o) return -1
      const t0 = performance.now()
      for (let i = 0; i < steps; i++) {
        o.set({ left: o.left + 2 })
        o.setCoords()
        canvas.renderAll()
      }
      return performance.now() - t0
    },
    zoomBenchmark: (n) => {
      const canvas = canvasRef.current
      if (!canvas) return -1
      const t0 = performance.now()
      for (let i = 0; i < n; i++) {
        const s = 0.15 + (i % 10) * 0.01
        canvas.setViewportTransform([s, 0, 0, s, 20, 20])
        canvas.renderAll()
      }
      canvas.setViewportTransform([view.scale, 0, 0, view.scale, view.offsetX, view.offsetY])
      return performance.now() - t0
    }
  }))

  return (
    <div
      ref={hostRef}
      style={{ width: viewport.width, height: viewport.height }}
      data-engine="fabric"
    />
  )
}

function wrapRot(g: ReturnType<typeof matrixToGeometry>): ReturnType<typeof matrixToGeometry> {
  return { ...g, rotation: wrapDegrees(g.rotation) }
}

export { fromCenterBox }
