import type { Layer } from '../layers/layers'
import { MAX_DPI } from '../print/print'
import type { TemplateProject } from './project'

function scaleLayer(layer: Layer, f: number): Layer {
  const base = {
    x: layer.x * f,
    y: layer.y * f,
    width: layer.width * f,
    height: layer.height * f
  }
  switch (layer.type) {
    case 'photo':
      return {
        ...layer,
        ...base,
        cornerRadius: layer.cornerRadius * f,
        frame:
          layer.frame.style === 'solid'
            ? { ...layer.frame, thickness: layer.frame.thickness * f }
            : layer.frame
      }
    case 'text':
      return {
        ...layer,
        ...base,
        fontSize: layer.fontSize * f,
        letterSpacing: layer.letterSpacing * f
      }
    case 'shape':
      return {
        ...layer,
        ...base,
        cornerRadius: layer.cornerRadius * f,
        stroke: layer.stroke ? { ...layer.stroke, width: layer.stroke.width * f } : null
      }
    default:
      return { ...layer, ...base }
  }
}

/**
 * The only supported way to change a project's DPI. Physical sizes stay the same; every
 * canvas-pixel length (positions, sizes, font sizes, strokes, radii, spacing) is scaled by
 * newDpi / oldDpi. Values are left unrounded; exporters round. Output DPI follows the design
 * so the composition stays valid. Changing `canvas.print.dpi` any other way would silently
 * reinterpret existing geometry and is not offered.
 */
export function rescaleProjectDpi(project: TemplateProject, newDpi: number): TemplateProject {
  if (!Number.isInteger(newDpi) || newDpi < 1 || newDpi > MAX_DPI) {
    throw new RangeError(`DPI must be an integer between 1 and ${MAX_DPI}`)
  }
  const factor = newDpi / project.canvas.print.dpi
  return {
    ...project,
    canvas: { ...project.canvas, print: { ...project.canvas.print, dpi: newDpi } },
    output: { ...project.output, print: { ...project.output.print, dpi: newDpi } },
    layers: project.layers.map((l) => scaleLayer(l, factor))
  }
}
