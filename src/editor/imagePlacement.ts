import {
  createId,
  getPixelSize,
  type AssetReference,
  type ImageLayer,
  type TemplateProject
} from '@domain'
import { screenToDesign, type ViewTransform } from '@canvas/viewport/viewport'
import { uniqueName } from './naming'

/**
 * Where and how big a newly added image goes. Pure (no store, no DOM) so the policy is unit-tested.
 *
 * Initial size (ADR-036): images are placed 1 source pixel = 1 design pixel ("native") when that fits
 * comfortably (within 80% of the artboard on both axes); otherwise they are scaled DOWN proportionally to fit
 * 80%. A raster is never scaled up on insertion. Vector (SVG) images have no native pixel size worth keeping,
 * so they are fitted to 50% of the artboard (up or down; they stay sharp at any size).
 */
export const INITIAL_RASTER_MAX_FRACTION = 0.8
export const INITIAL_VECTOR_FRACTION = 0.5

export interface Size {
  width: number
  height: number
}

export function initialImageSize(
  asset: Pick<AssetReference, 'mediaType' | 'pixelWidth' | 'pixelHeight'>,
  design: Size
): Size {
  const pw = asset.pixelWidth ?? Math.round(design.width / 2)
  const ph = asset.pixelHeight ?? Math.round(design.height / 2)
  const vector = asset.mediaType === 'image/svg+xml'
  const scale = vector
    ? Math.min(
        (design.width * INITIAL_VECTOR_FRACTION) / pw,
        (design.height * INITIAL_VECTOR_FRACTION) / ph
      )
    : Math.min(
        1,
        (design.width * INITIAL_RASTER_MAX_FRACTION) / pw,
        (design.height * INITIAL_RASTER_MAX_FRACTION) / ph
      )
  return { width: Math.max(1, Math.round(pw * scale)), height: Math.max(1, Math.round(ph * scale)) }
}

/**
 * Top-left position for a box of `size` centred on `at` (design coordinates), or on the artboard when `at` is
 * absent. A drop point outside the artboard is pulled onto it so the new layer is always reachable.
 */
export function centerOn(
  size: Size,
  at: { x: number; y: number } | null,
  design: Size
): { x: number; y: number } {
  const cx = at ? Math.min(design.width, Math.max(0, at.x)) : design.width / 2
  const cy = at ? Math.min(design.height, Math.max(0, at.y)) : design.height / 2
  return { x: Math.round(cx - size.width / 2), y: Math.round(cy - size.height / 2) }
}

/** A drop's client (window) coordinates → design coordinates, through the stage container and the view. */
export function dropPointToDesign(
  view: ViewTransform,
  client: { x: number; y: number },
  containerRect: { left: number; top: number }
): { x: number; y: number } {
  return screenToDesign(view, client.x - containerRect.left, client.y - containerRect.top)
}

export function layerNameFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^./\\]+$/, '').trim()
  return stem === '' ? 'Image' : stem.slice(0, 120)
}

/** A new top-level ImageLayer for `asset`. zIndex is a placeholder; `addLayer` puts it on top. */
export function createImageLayer(
  project: TemplateProject,
  asset: AssetReference,
  options: { at?: { x: number; y: number } | null; createLayerId?: () => string } = {}
): ImageLayer {
  const design = getPixelSize(project.canvas.print)
  const size = initialImageSize(asset, design)
  const pos = centerOn(size, options.at ?? null, design)
  return {
    id: (options.createLayerId ?? createId)(),
    type: 'image',
    name: uniqueName(layerNameFromFilename(asset.filename), project.layers),
    ...pos,
    ...size,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    visible: true,
    locked: false,
    assetId: asset.id,
    role: 'graphic',
    fit: 'contain'
  }
}
