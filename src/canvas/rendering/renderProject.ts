import Konva from 'konva'
import { childrenOf, topLevelLayers, type Layer, type TemplateProject } from '@domain'
import { resolveColor } from './color'
import { specFor, type ImageLookup, type NodeSpec, type RenderEnv } from './nodeSpec'
import { finalizeTextNode } from './finalize'
import { missingAssetIds, planRender, type RenderOptions } from './plan'
import { planOutput } from './composition'

export class RenderError extends Error {
  constructor(
    message: string,
    readonly missingAssets: string[] = []
  ) {
    super(message)
    this.name = 'RenderError'
  }
}

type NodeCtor = new (config: Konva.NodeConfig) => Konva.Node
const CLASSES: Record<NodeSpec['className'], NodeCtor> = {
  Group: Konva.Group,
  Rect: Konva.Rect,
  Ellipse: Konva.Ellipse,
  Line: Konva.Line,
  Text: Konva.Text,
  Shape: Konva.Shape as unknown as NodeCtor
}

/**
 * Adds the nodes of one design (the given layer list, in paint order) to a Konva container. Shared by the design
 * render and every copy of the output render, so a copy is drawn by exactly the same code as the design itself.
 */
function addDesignNodes(
  parent: Konva.Container,
  project: TemplateProject,
  layers: readonly Layer[],
  images: ImageLookup,
  options: RenderOptions & { photoLabels?: boolean }
): void {
  const env: RenderEnv = {
    palette: project.palette,
    images,
    photoMode: options.photos === 'preview' ? 'preview' : 'placeholder',
    interactive: false,
    photoLabels: options.photoLabels ?? true,
    allLayers: layers
  }
  const build = (domain: Layer, into: Konva.Container, insideGroup: boolean): void => {
    const spec = specFor(domain, env, insideGroup)
    if (!spec) return
    if (domain.type === 'photo' && options.photos === 'omit') return
    const node = new CLASSES[spec.className](spec.config)
    into.add(node as Konva.Group | Konva.Shape)
    finalizeTextNode(node, domain)
    if (domain.type === 'group') {
      for (const child of childrenOf(layers, domain.id)) build(child, node as Konva.Group, true)
    }
  }
  for (const l of topLevelLayers(layers)) build(l, parent, false)
}

/**
 * Renders the DESIGN canvas of a project to a raster canvas of an exact pixel size, independent of any
 * editor viewport, zoom or devicePixelRatio. Only printable content is drawn: background, images, text,
 * shapes and (per `options.photos`) photo placeholders. Selection boxes, transformer, guides, snap lines
 * and workspace chrome do not exist in this scene. Synchronous; images must already be decoded.
 */
export function renderProjectToCanvas(
  project: TemplateProject,
  images: ImageLookup,
  options: RenderOptions & { photoLabels?: boolean } = {}
): HTMLCanvasElement {
  const plan = planRender(project, options)
  const missing = missingAssetIds(plan.layers, images)
  if (missing.length > 0) throw new RenderError(`Missing images: ${missing.join(', ')}`, missing)

  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: plan.design.width,
    height: plan.design.height
  })
  try {
    const layer = new Konva.Layer({ listening: false })
    stage.add(layer)
    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: plan.design.width,
        height: plan.design.height,
        fill: resolveColor(project.palette, project.canvas.backgroundColor)
      })
    )
    addDesignNodes(layer, project, project.layers, images, options)
    layer.draw()

    const ratio = plan.width / plan.design.width
    const canvas = stage.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    if (canvas.width === plan.width && canvas.height === plan.height) return canvas
    // Rounding guard: always hand back EXACTLY the requested size.
    const exact = document.createElement('canvas')
    exact.width = plan.width
    exact.height = plan.height
    exact.getContext('2d')?.drawImage(canvas, 0, 0, plan.width, plan.height)
    return exact
  } finally {
    stage.destroy()
  }
}

/**
 * Renders the print SHEET (output composition) to a raster canvas of an exact pixel size: the authored design drawn
 * once per copy, each translated to its cell and clipped to it, on a white sheet. For a single-up project this is
 * the design render. Nothing is duplicated in the project; copies are derived (see `composition.ts`). Editor-only
 * guides (cut line, labels) do not exist in this scene. Synchronous; images must already be decoded.
 */
export function renderOutputToCanvas(
  project: TemplateProject,
  images: ImageLookup,
  options: RenderOptions & { photoLabels?: boolean } = {}
): HTMLCanvasElement {
  const out = planOutput(project)
  const width = options.width ?? out.width
  const height = options.height ?? out.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Render size must be positive integers')
  }
  const plan = planRender(project, options)
  const missing = missingAssetIds(plan.layers, images)
  if (missing.length > 0) throw new RenderError(`Missing images: ${missing.join(', ')}`, missing)

  const stage = new Konva.Stage({
    container: document.createElement('div'),
    width: out.width,
    height: out.height
  })
  try {
    const layer = new Konva.Layer({ listening: false })
    stage.add(layer)
    layer.add(new Konva.Rect({ x: 0, y: 0, width: out.width, height: out.height, fill: '#ffffff' }))
    for (const copy of out.copies) {
      const group = new Konva.Group({
        x: 0,
        y: 0,
        clipX: copy.cell.x,
        clipY: copy.cell.y,
        clipWidth: copy.cell.width,
        clipHeight: copy.cell.height
      })
      layer.add(group)
      group.add(
        new Konva.Rect({
          x: copy.cell.x,
          y: copy.cell.y,
          width: copy.cell.width,
          height: copy.cell.height,
          fill: resolveColor(project.palette, project.canvas.backgroundColor)
        })
      )
      addDesignNodes(group, project, copy.layers, images, options)
    }
    layer.draw()
    const ratio = width / out.width
    const canvas = stage.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    if (canvas.width === width && canvas.height === height) return canvas
    const exact = document.createElement('canvas')
    exact.width = width
    exact.height = height
    exact.getContext('2d')?.drawImage(canvas, 0, 0, width, height)
    return exact
  } finally {
    stage.destroy()
  }
}
