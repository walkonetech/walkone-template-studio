import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentType } from 'react'
import { Ellipse, Group, Layer as KLayer, Line, Rect, Shape, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import { childrenOf, topLevelLayers, type Layer } from '@domain'
import { cutLineLabel, cutLines, planOutput } from '@canvas/rendering/composition'
import { resolveColor } from '@canvas/rendering/color'
import { finalizeTextNode } from '@canvas/rendering/finalize'
import { specFor, type NodeClass, type RenderEnv } from '@canvas/rendering/nodeSpec'
import { CANVAS_THEME } from './canvasTheme'
import { registerCanvasDebug } from './debugHooks'
import { editorStore, useEditor, useViewTransform } from './editorStore'
import { useProjectImages } from './useProjectImages'
import { usePreviewPhotos } from './usePreviewPhotos'
import { useSpacePan } from './useSpacePan'

const COMPONENTS = { Group, Rect, Ellipse, Line, Text, Shape } as unknown as Record<
  NodeClass,
  ComponentType<Record<string, unknown>>
>

/** One authored layer drawn as an inert node (no handles, no hit testing): Print Preview never edits. */
function StaticLayer({
  layer,
  env,
  insideGroup = false
}: {
  layer: Layer
  env: RenderEnv
  insideGroup?: boolean
}): React.JSX.Element | null {
  const spec = specFor(layer, env, insideGroup)
  const ref = useRef<Konva.Node>(null)
  useLayoutEffect(() => {
    if (ref.current) finalizeTextNode(ref.current, layer)
  })
  if (!spec) return null
  const Node = COMPONENTS[spec.className]
  if (layer.type === 'group') {
    return (
      <Node {...spec.config} ref={ref}>
        {childrenOf(env.allLayers, layer.id).map((c) => (
          <StaticLayer key={c.id} layer={c} env={env} insideGroup />
        ))}
      </Node>
    )
  }
  return <Node {...spec.config} ref={ref} />
}

/**
 * Print Preview: the derived print sheet, read-only. The same authored layers are drawn once per copy (translated to the
 * cell and clipped to it) through the same node specs as Design mode, sharing the decoded image cache, so nothing is
 * duplicated in the project and an edit in Design shows in every copy immediately. The cut guide and copy labels are
 * editor-only chrome: they live outside the printable scene and are not part of any render.
 */
export function PrintPreviewCanvas(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  const viewport = useEditor((s) => s.viewport)
  const photoDisplay = useEditor((s) => s.photoDisplay)
  const images = useProjectImages(sessionId, project?.layers)
  const photoPreview = usePreviewPhotos(project?.layers)
  const view = useViewTransform()
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const pan = useSpacePan(hostRef)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = (): void =>
      editorStore.getState().setViewport({
        width: Math.max(100, host.clientWidth),
        height: Math.max(100, host.clientHeight)
      })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (e: WheelEvent): void => {
      const s = editorStore.getState()
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = host.getBoundingClientRect()
        s.zoomAtPoint(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top })
      } else s.panBy(-e.deltaX, -e.deltaY)
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => registerCanvasDebug(() => ({ stage: stageRef.current, transformer: null })), [])

  const plan = useMemo(() => {
    if (!project) return null
    try {
      return planOutput(project)
    } catch {
      return null
    }
  }, [project])
  if (!project || !view) return null
  if (!plan) {
    return (
      <div ref={hostRef} className="canvas-host">
        <p className="field-note" role="alert">
          This project&apos;s print sheet cannot hold its design copies.
        </p>
      </div>
    )
  }
  const lines = cutLines(project)
  const label = cutLineLabel(project)
  const bg = resolveColor(project.palette, project.canvas.backgroundColor)
  const toScreen = (x: number, y: number): { left: number; top: number } => ({
    left: view.offsetX + x * view.scale,
    top: view.offsetY + y * view.scale
  })
  return (
    <div
      ref={hostRef}
      className={`canvas-host${pan.ready ? ' pan-ready' : ''}${pan.panning ? ' panning' : ''}`}
      data-testid="print-preview"
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.offsetX}
        y={view.offsetY}
        listening={false}
      >
        <KLayer name="sheet" listening={false}>
          <Rect
            x={0}
            y={0}
            width={plan.width}
            height={plan.height}
            fill="#ffffff"
            shadowColor="#000000"
            shadowBlur={36}
            shadowOpacity={0.55}
            shadowOffsetY={10}
            shadowForStrokeEnabled={false}
          />
          {plan.copies.map((copy) => (
            <Group
              key={copy.cell.index}
              clipX={copy.cell.x}
              clipY={copy.cell.y}
              clipWidth={copy.cell.width}
              clipHeight={copy.cell.height}
            >
              <Rect
                x={copy.cell.x}
                y={copy.cell.y}
                width={copy.cell.width}
                height={copy.cell.height}
                fill={bg}
              />
              {topLevelLayers(copy.layers).map((l) => (
                <StaticLayer
                  key={l.id}
                  layer={l}
                  env={{
                    palette: project.palette,
                    images,
                    photoMode: photoDisplay,
                    ...(photoPreview ? { photoPreview } : {}),
                    interactive: false,
                    photoLabels: true,
                    allLayers: copy.layers
                  }}
                />
              ))}
            </Group>
          ))}
        </KLayer>
        <KLayer name="editor-overlay" listening={false}>
          {lines.map((l) => (
            <Line
              key={`${l.axis}-${l.at}`}
              listening={false}
              points={l.axis === 'x' ? [l.at, 0, l.at, plan.height] : [0, l.at, plan.width, l.at]}
              stroke={CANVAS_THEME.guide}
              strokeWidth={1.5}
              dash={[10, 8]}
              strokeScaleEnabled={false}
              opacity={0.85}
            />
          ))}
        </KLayer>
      </Stage>
      <div className="preview-labels" aria-hidden="true">
        {plan.copies.map((c) => (
          <span
            key={c.cell.index}
            className="preview-chip"
            style={{
              ...toScreen(c.cell.x + c.cell.width / 2, c.cell.y),
              transform: 'translate(-50%, calc(-100% - 8px))'
            }}
          >
            Copy {c.cell.index + 1}
          </span>
        ))}
        {lines
          .filter((l) => l.axis === 'x')
          .map((l) => (
            <span
              key={`cut-${l.at}`}
              className="preview-chip cut"
              style={{ ...toScreen(l.at, plan.height), transform: 'translate(-50%, 8px)' }}
            >
              ✂ {label}
            </span>
          ))}
      </div>
    </div>
  )
}
