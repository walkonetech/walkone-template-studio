import type { ImageLookup, PhotoPreviewLookup } from './nodeSpec'
import {
  getPixelSize,
  isEffectivelyVisible,
  topLevelLayers,
  childrenOf,
  type Layer,
  type TemplateProject
} from '@domain'

/** Pure planning for the offscreen high-resolution render (no Konva, no DOM). */

export interface RenderOptions {
  /** Output size in pixels; defaults to the design canvas pixel size. Viewport zoom is irrelevant. */
  width?: number
  height?: number
  /**
   * 'omit' leaves photo slots out entirely (layer package bands); 'frame' draws ONLY each slot's native frame, with
   * the photo area empty (production export PNGs and the package `frames.png`). Neither ever draws samples.
   */
  photos?: 'placeholder' | 'preview' | 'omit' | 'frame'
  /**
   * Draw only the leaf layers (non-group) this accepts; groups are always kept as containers. Used by the layer package
   * to render one semantic band of the stack at a time. Omitted = every printable layer.
   */
  include?: (layer: Layer) => boolean
  /** 'transparent' leaves the canvas background colour out (overlay bands of the layer package). Default 'canvas'. */
  background?: 'canvas' | 'transparent'
  /**
   * Sample pictures (with `photos: 'preview'`). A DESIGN-PREVIEW render may bake sample photos in; PRODUCTION output
   * (a future export) must use `photos: 'omit'`, which leaves the capture slots empty, and never supplies this.
   */
  photoPreview?: PhotoPreviewLookup
}

export interface RenderPlan {
  /** Exact output canvas size. */
  width: number
  height: number
  /** Design canvas size (logical coordinates). */
  design: { width: number; height: number }
  /** design → output scale factor (x, y). */
  scaleX: number
  scaleY: number
  /** Printable layers in paint order (back to front, groups depth-first); hidden layers and omitted photos removed. */
  layers: Layer[]
}

export function planRender(project: TemplateProject, options: RenderOptions = {}): RenderPlan {
  const design = getPixelSize(project.canvas.print)
  const width = options.width ?? design.width
  const height = options.height ?? design.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Render size must be positive integers')
  }
  const photos = options.photos ?? 'placeholder'
  const layers: Layer[] = []
  const walk = (list: Layer[]): void => {
    for (const l of list) {
      if (!isEffectivelyVisible(project.layers, l)) continue
      if (l.type === 'photo' && photos === 'omit') continue
      if (l.type !== 'group' && options.include && !options.include(l)) continue
      layers.push(l)
      if (l.type === 'group') walk(childrenOf(project.layers, l.id))
    }
  }
  walk(topLevelLayers(project.layers))
  return {
    width,
    height,
    design,
    scaleX: width / design.width,
    scaleY: height / design.height,
    layers
  }
}

/** Asset ids used by the planned layers (image layers, plus photo samples in preview mode) that cannot be resolved. */
export function missingAssetIds(
  layers: readonly Layer[],
  images: ImageLookup,
  includeSamples = false
): string[] {
  const missing = new Set<string>()
  for (const l of layers) {
    if (l.type === 'image' && !images(l.assetId)) missing.add(l.assetId)
    if (includeSamples && l.type === 'photo' && l.sampleAssetId && !images(l.sampleAssetId))
      missing.add(l.sampleAssetId)
  }
  return [...missing]
}
