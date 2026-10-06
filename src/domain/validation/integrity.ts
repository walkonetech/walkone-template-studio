import { checkComposition } from '../print/composition'
import { getPixelSize, MAX_PIXEL_SIDE } from '../print/print'
import type { ColorValue } from '../color/color'
import type { Layer } from '../layers/layers'
import type { TemplateProject } from '../project/project'

export interface ProjectIssue {
  /** Machine-readable category. */
  code: string
  /** Dotted/bracketed location in the project, e.g. `layers[3].parentId`. */
  path: string
  message: string
}

function colorRefs(layer: Layer): ColorValue[] {
  switch (layer.type) {
    case 'photo':
      return layer.frame.style === 'solid' ? [layer.frame.color] : []
    case 'text':
      return [layer.fill]
    case 'shape':
      return [layer.fill, layer.stroke?.color].filter((c): c is ColorValue => c != null)
    default:
      return []
  }
}

/**
 * Cross-field structural checks that a per-field schema cannot express.
 * This is project validity, not export preflight.
 */
export function checkProjectIntegrity(project: TemplateProject): ProjectIssue[] {
  const issues: ProjectIssue[] = []
  const add = (code: string, path: string, message: string): void => {
    issues.push({ code, path, message })
  }

  // Canvas pixel sizes
  for (const [path, print] of [
    ['canvas.print', project.canvas.print],
    ['output.print', project.output.print]
  ] as const) {
    const px = getPixelSize(print)
    if (px.width < 1 || px.height < 1 || px.width > MAX_PIXEL_SIDE || px.height > MAX_PIXEL_SIDE) {
      add(
        'invalid-canvas-size',
        path,
        `Derived pixel size ${px.width}×${px.height} is out of range`
      )
    }
  }

  // Composition
  for (const problem of checkComposition(project.canvas.print, project.output)) {
    add('invalid-composition', 'output', problem.message)
  }

  // Palette
  const paletteIds = new Set<string>()
  const roleSeen = new Set<string>()
  project.palette.colors.forEach((c, i) => {
    if (paletteIds.has(c.id))
      add('duplicate-id', `palette.colors[${i}].id`, `Duplicate palette id ${c.id}`)
    paletteIds.add(c.id)
    if (c.role !== 'custom') {
      if (roleSeen.has(c.role))
        add(
          'duplicate-role',
          `palette.colors[${i}].role`,
          `Role "${c.role}" is used more than once`
        )
      roleSeen.add(c.role)
    }
  })
  const checkColor = (color: ColorValue, path: string): void => {
    if (color.kind === 'palette' && !paletteIds.has(color.paletteColorId)) {
      add('missing-palette-color', path, `Unknown palette color ${color.paletteColorId}`)
    }
  }
  checkColor(project.canvas.backgroundColor, 'canvas.backgroundColor')

  // Assets
  const assetIds = new Set<string>()
  const assetPaths = new Set<string>()
  project.assets.forEach((a, i) => {
    if (assetIds.has(a.id)) add('duplicate-id', `assets[${i}].id`, `Duplicate asset id ${a.id}`)
    assetIds.add(a.id)
    if (assetPaths.has(a.path))
      add('duplicate-path', `assets[${i}].path`, `Duplicate asset path ${a.path}`)
    assetPaths.add(a.path)
  })

  // Layers
  const byId = new Map<string, Layer>()
  project.layers.forEach((l, i) => {
    if (byId.has(l.id)) add('duplicate-id', `layers[${i}].id`, `Duplicate layer id ${l.id}`)
    else byId.set(l.id, l)
  })
  const siblingZ = new Map<string, Set<number>>()
  project.layers.forEach((l, i) => {
    const at = `layers[${i}]`
    if (l.type === 'photo' && (l.width <= 0 || l.height <= 0)) {
      add('invalid-geometry', at, 'Photo layers must have positive width and height')
    }
    if (l.type === 'group' && l.rotation !== 0) {
      add('invalid-group', `${at}.rotation`, 'Group rotation is not supported yet and must be 0')
    }
    if (l.parentId !== undefined) {
      const parent = byId.get(l.parentId)
      if (!parent) add('missing-parent', `${at}.parentId`, `Unknown parent ${l.parentId}`)
      else if (parent.type !== 'group')
        add('invalid-parent', `${at}.parentId`, 'Parent must be a group layer')
    }
    const zKey = l.parentId ?? ''
    const zs = siblingZ.get(zKey) ?? new Set<number>()
    if (zs.has(l.zIndex))
      add('duplicate-zindex', `${at}.zIndex`, `zIndex ${l.zIndex} repeats among siblings`)
    zs.add(l.zIndex)
    siblingZ.set(zKey, zs)
    if (l.type === 'image' && !assetIds.has(l.assetId)) {
      add('missing-asset', `${at}.assetId`, `Unknown asset ${l.assetId}`)
    }
    if (l.type === 'photo' && l.sampleAssetId !== undefined && !assetIds.has(l.sampleAssetId)) {
      add('missing-asset', `${at}.sampleAssetId`, `Unknown asset ${l.sampleAssetId}`)
    }
    colorRefs(l).forEach((c) => checkColor(c, at))
  })
  // Parent cycles
  for (const l of byId.values()) {
    const seen = new Set<string>([l.id])
    let cur = l.parentId
    while (cur !== undefined) {
      if (seen.has(cur)) {
        add('parent-cycle', `layers(${l.id}).parentId`, 'Layer hierarchy contains a cycle')
        break
      }
      seen.add(cur)
      cur = byId.get(cur)?.parentId
    }
  }

  // Compatibility metadata must point at real layers
  for (const [adapter, data] of Object.entries(project.sourceCompatibility ?? {})) {
    for (const layerId of Object.keys(data.layers ?? {})) {
      if (!byId.has(layerId)) {
        add(
          'dangling-compatibility',
          `sourceCompatibility.${adapter}.layers.${layerId}`,
          `Unknown layer ${layerId}`
        )
      }
    }
  }
  return issues
}
