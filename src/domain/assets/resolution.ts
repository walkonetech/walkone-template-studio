import type { FitMode } from '../layers/layers'
import type { AssetReference } from './assets'

/**
 * Effective print resolution of a raster asset as placed on a layer: source pixels per physical inch of
 * the box it is drawn into. Pure arithmetic over source pixels, layer size (design pixels) and the design DPI.
 *
 *   dpi = designDpi / scale        where scale = displayed design pixels per source pixel
 *
 * Example: 1200 px wide image shown 2 in wide → 600 dpi; the same image stretched to 4 in → 300 dpi.
 *
 * Thresholds (a documented starting policy, not a DSLR Booth fact): 300 dpi is the common photo-print target and
 * the print size DSLR Booth templates are authored at; below 150 dpi, photographic artwork looks visibly soft at
 * arm's length; in between is usable but worth a look. Vector (SVG) assets have no raster resolution.
 */
export const DPI_HEALTHY_MIN = 300
export const DPI_CAUTION_MIN = 150

export type ResolutionStatus = 'healthy' | 'caution' | 'low'

export interface EffectiveResolution {
  /** Worst-axis effective dpi (what the status is judged on). */
  dpi: number
  dpiX: number
  dpiY: number
  status: ResolutionStatus
}

export const resolutionStatus = (dpi: number): ResolutionStatus =>
  dpi >= DPI_HEALTHY_MIN ? 'healthy' : dpi >= DPI_CAUTION_MIN ? 'caution' : 'low'

/** `null` when the asset has no raster size to judge (SVG, unknown) or the box is empty. */
export function effectiveResolution(
  asset: Pick<AssetReference, 'mediaType' | 'pixelWidth' | 'pixelHeight'>,
  box: { width: number; height: number },
  designDpi: number,
  fit: FitMode
): EffectiveResolution | null {
  const { pixelWidth: pw, pixelHeight: ph } = asset
  if (asset.mediaType === 'image/svg+xml' || !pw || !ph) return null
  if (!(box.width > 0) || !(box.height > 0) || !(designDpi > 0)) return null
  const sx = box.width / pw
  const sy = box.height / ph
  let scaleX = sx
  let scaleY = sy
  if (fit === 'cover') scaleX = scaleY = Math.max(sx, sy)
  else if (fit === 'contain') scaleX = scaleY = Math.min(sx, sy)
  const dpiX = designDpi / scaleX
  const dpiY = designDpi / scaleY
  const dpi = Math.min(dpiX, dpiY)
  return { dpi, dpiX, dpiY, status: resolutionStatus(dpi) }
}
