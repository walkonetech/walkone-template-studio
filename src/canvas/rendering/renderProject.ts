import Konva from 'konva'
import { childrenOf, topLevelLayers, type Layer, type TemplateProject } from '@domain'
import { resolveColor } from './color'
import { specFor, type ImageLookup, type NodeSpec, type RenderEnv } from './nodeSpec'
import { finalizeTextNode } from './finalize'
import { missingAssetIds, planRender, type RenderOptions } from './plan'

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
    const env: RenderEnv = {
      palette: project.palette,
      images,
      photoMode: options.photos === 'preview' ? 'preview' : 'placeholder',
      interactive: false,
      photoLabels: options.photoLabels ?? true,
      allLayers: project.layers
    }
    const build = (domain: Layer, parent: Konva.Container, insideGroup: boolean): void => {
      const spec = specFor(domain, env, insideGroup)
      if (!spec) return
      if (domain.type === 'photo' && options.photos === 'omit') return
      const node = new CLASSES[spec.className](spec.config)
      parent.add(node as Konva.Group | Konva.Shape)
      finalizeTextNode(node, domain)
      if (domain.type === 'group') {
        for (const child of childrenOf(project.layers, domain.id))
          build(child, node as Konva.Group, true)
      }
    }
    for (const l of topLevelLayers(project.layers)) build(l, layer, false)
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
