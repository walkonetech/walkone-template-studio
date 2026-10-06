import type { Layer } from '@domain'
import {
  fromCenterBox,
  matrixToGeometry,
  wrapDegrees,
  type Geometry,
  type Matrix
} from '../geometry/geometry'

/**
 * Committed canvas interactions are converted back into plain domain geometry here. Konva keeps
 * `scaleX/scaleY` on a node after a resize; the domain has none, so the scale is folded into
 * width/height and the runtime node is reset by the caller. All functions are pure.
 */

/** Smallest allowed layer side in design pixels (0.013 in at 600 DPI). */
export const MIN_SIZE_DESIGN = 8
/** Smallest transformer box in SCREEN pixels, so tiny zoom levels cannot collapse a layer. */
export const MIN_SIZE_SCREEN = 12
/** Geometry is rounded to this many decimals so repeated transforms cannot accumulate float noise. */
export const GEOMETRY_DECIMALS = 3
export const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315] as const

const round = (n: number, d = GEOMETRY_DECIMALS): number => {
  const f = 10 ** d
  const r = Math.round(n * f) / f
  return r === 0 ? 0 : r // avoid -0
}

export function roundGeometry(g: Geometry): Geometry {
  return {
    x: round(g.x),
    y: round(g.y),
    width: round(g.width),
    height: round(g.height),
    rotation: round(wrapDegrees(g.rotation))
  }
}

/** The node attributes Konva exposes for a node whose origin is the box center (offset = half size). */
export interface NodeTransform {
  /** Center position in design space. */
  x: number
  y: number
  /** Unscaled local size (for ellipses: 2 × radius). */
  width: number
  height: number
  scaleX: number
  scaleY: number
  rotation: number
}

/** Geometry of a top-level, center-origin node. Flips (negative scale) are not representable and are ignored. */
export function normalizeNodeTransform(t: NodeTransform): Geometry {
  return roundGeometry(
    fromCenterBox({
      cx: t.x,
      cy: t.y,
      width: t.width * Math.abs(t.scaleX),
      height: t.height * Math.abs(t.scaleY),
      rotation: t.rotation
    })
  )
}

/**
 * Text convention: a corner drag scales glyphs (fontSize × scaleY) and widens the box by scaleX; a
 * side drag only changes width. The measured height is advisory for text layers.
 */
export function normalizeTextTransform(
  t: NodeTransform,
  fontSize: number
): { geometry: Geometry; fontSize: number } {
  return {
    geometry: normalizeNodeTransform(t),
    fontSize: round(fontSize * Math.abs(t.scaleY))
  }
}

/** Geometry of a node nested in a runtime group, from its matrix already expressed in DESIGN space. */
export function normalizeFromMatrix(
  m: Matrix,
  localWidth: number,
  localHeight: number,
  origin: 'top-left' | 'center'
): Geometry {
  return roundGeometry(matrixToGeometry(m, localWidth, localHeight, origin))
}

/** Keeps the center and clamps each side to at least `min`. */
export function enforceMinSize(g: Geometry, min = MIN_SIZE_DESIGN): Geometry {
  if (g.width >= min && g.height >= min) return g
  const cx = g.x + g.width / 2
  const cy = g.y + g.height / 2
  const width = Math.max(g.width, min)
  const height = Math.max(g.height, min)
  return { ...g, x: cx - width / 2, y: cy - height / 2, width, height }
}

/** For Konva.Transformer `boundBoxFunc`: true when the proposed box (screen px) is too small. */
export const boxTooSmall = (
  box: { width: number; height: number },
  min = MIN_SIZE_SCREEN
): boolean => Math.abs(box.width) < min || Math.abs(box.height) < min

export type AnchorName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface TransformerOptions {
  keepRatio: boolean
  enabledAnchors: AnchorName[]
  rotateEnabled: boolean
  flipEnabled: false
}

const ALL: AnchorName[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]

/** Per-layer-type transformer behavior, kept in one place so photo/image rules can diverge later. */
export function transformerOptionsFor(layer: Layer): TransformerOptions {
  switch (layer.type) {
    case 'text':
      // height follows the text; corners scale the glyphs proportionally, sides change the wrap width
      return {
        keepRatio: true,
        enabledAnchors: [
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
          'middle-left',
          'middle-right'
        ],
        rotateEnabled: true,
        flipEnabled: false
      }
    case 'image':
      return { keepRatio: true, enabledAnchors: ALL, rotateEnabled: true, flipEnabled: false }
    case 'photo':
    case 'shape':
    case 'group':
      return { keepRatio: false, enabledAnchors: ALL, rotateEnabled: true, flipEnabled: false }
  }
}
