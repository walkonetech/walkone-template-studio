import {
  getPixelSize,
  resolveCompositionCells,
  type Layer,
  type PhotoLayer,
  type TemplateProject
} from '@domain'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { resolveColor } from '@canvas/rendering/color'
import { clampCornerRadius, clampFrameThickness } from '@canvas/rendering/photoFit'
import { printableLeaves } from '@editor/exportPlan'
import { boundsOf } from '@editor/mutations'
import { exportFileStem } from '@export/naming'
import { ORIGINAL_DEVICE, PREVIEW_PNG, formatSavedDate, templateId, toArgb } from './profile'
import type { DslrElement, DslrTemplate } from './templateXml'

/**
 * Template Studio project → dslrBooth 7.48 template (Phase 6B, ADR-047). Pure: decides WHAT the package contains;
 * the renderer draws the PNGs with the shared Konva pipeline and the main process verifies and writes the ZIP.
 *
 * Mapping (raster where dslrBooth's behaviour is unknown or differs, native where it is the point of the template):
 *  - every photo slot becomes a native `<Photo>` (PhotoNumber, box, rotation): that is where the booth puts the shots;
 *  - everything else is flattened, in stacking order, into a few full-canvas transparent PNG `<Image>`s: the "base"
 *    image (canvas colour + everything behind the first photo) and one image above each run of photos;
 *  - a slot's frame is drawn INSIDE the slot box in Template Studio but grows OUTWARD in dslrBooth, and dslrBooth has
 *    no corner radius: so frames and rounded-corner masks are drawn into the image right above the photo instead of
 *    using `Thickness`/`StrokeColor` (always 0 / default, as in every fixture);
 *  - text is always rasterized, so the booth needs no fonts (missing fonts silently fall back on the booth PC). This
 *    includes dslrBooth live text imported as editable text (6C C1): it is NOT written back as a native `<Text>`.
 */

export type DslrVariant = 'strip' | 'sheet' | 'single'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface DslrImagePlan {
  /** Entry name in the ZIP. */
  path: string
  /** Element name shown in dslrBooth's editor. */
  name: string
  /** The bottom image: opaque, includes the canvas colour. */
  base: boolean
  /** Non-photo leaf layers drawn into this image, in stacking order. */
  leafIds: string[]
  /** Photo slots whose native frame is drawn into this image. */
  frameIds: string[]
  /** Photo slots with rounded corners: the corners are covered with what lies beneath the slot. */
  maskIds: string[]
}

export interface DslrPhotoPlan {
  layerId: string
  photoNumber: number
  /** One integer box per copy on the canvas (unrotated box; rotation is about its centre). */
  boxes: Box[]
  /** Whole clockwise degrees in (-180, 180]. */
  rotation: number
  /** True when the box was rounded INWARD (a frame/mask image covers the edge, so no photo pixel may show past it). */
  inward: boolean
}

export type DslrItem =
  { kind: 'image'; image: DslrImagePlan } | { kind: 'photo'; photo: DslrPhotoPlan }

export interface DslrPlan {
  variant: DslrVariant
  canvas: { width: number; height: number; dpi: number }
  /** Where each copy of the design sits on the canvas (one cell unless `variant` is 'sheet'). */
  copies: Box[]
  /** Back to front. */
  items: DslrItem[]
  /** For each masked photo slot: the non-photo leaves stacked below it (what shows in its rounded corners). */
  under: Record<string, string[]>
}

const EPS = 1e-6

/**
 * Native 2×6 strip: the design is 2×6 in and the sheet is a 4×6 holding exactly two copies side by side with no gap,
 * at the same DPI. dslrBooth then makes the two-up print itself (`print_2_per_page`, runtime findings).
 */
export function isNativeStrip(project: TemplateProject): boolean {
  const d = project.canvas.print
  const s = project.output.print
  if (d.width !== 2 || d.height !== 6 || s.width !== 4 || s.height !== 6 || s.dpi !== d.dpi)
    return false
  if (!hasDerivedCopies(project)) return false
  const cells = resolveCompositionCells(d, project.output)
  const px = getPixelSize(d)
  return (
    cells.length === 2 &&
    cells.every((c) => c.y === 0 && c.width === px.width && c.height === px.height) &&
    cells.some((c) => c.x === 0) &&
    cells.some((c) => c.x === px.width)
  )
}

/** Which variant the main dslrBooth output of this project is. */
export const mainVariant = (project: TemplateProject): DslrVariant =>
  isNativeStrip(project) ? 'strip' : hasDerivedCopies(project) ? 'sheet' : 'single'

const needsCover = (p: PhotoLayer): { frame: boolean; mask: boolean } => ({
  frame: p.frame.style === 'solid' && clampFrameThickness(p.frame.thickness, p.width, p.height) > 0,
  mask: clampCornerRadius(p.cornerRadius, p.width, p.height) > 0
})

function overlaps(a: Layer, b: Layer): boolean {
  const p = boundsOf(a)
  const q = boundsOf(b)
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom
}

/** Whole degrees in (-180, 180]. */
export function wholeDegrees(deg: number): number {
  let r = Math.round(deg) % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r === 0 ? 0 : r
}

/** Integer box: nearest edges, or INWARD edges (never larger than the exact box). */
export function intBox(x: number, y: number, w: number, h: number, inward: boolean): Box {
  const l = inward ? Math.ceil(x - EPS) : Math.round(x)
  const t = inward ? Math.ceil(y - EPS) : Math.round(y)
  const r = inward ? Math.floor(x + w + EPS) : Math.round(x + w)
  const b = inward ? Math.floor(y + h + EPS) : Math.round(y + h)
  return { left: l, top: t, width: Math.max(1, r - l), height: Math.max(1, b - t) }
}

export function planDslrTemplate(project: TemplateProject, variant: DslrVariant): DslrPlan {
  const design = getPixelSize(project.canvas.print)
  const sheet = variant === 'sheet'
  const canvas = sheet
    ? { ...getPixelSize(project.output.print), dpi: project.output.print.dpi }
    : { ...design, dpi: project.canvas.print.dpi }
  const copies: Box[] = sheet
    ? resolveCompositionCells(project.canvas.print, project.output).map((c) => ({
        left: c.x,
        top: c.y,
        width: c.width,
        height: c.height
      }))
    : [{ left: 0, top: 0, width: design.width, height: design.height }]

  const leaves = printableLeaves(project)
  const items: DslrItem[] = []
  const under: Record<string, string[]> = {}
  let images = 0

  // The image being collected: covers (frames/masks) of the photos just placed, then the following artwork.
  let current: DslrImagePlan = {
    path: 'background.png',
    name: 'Background',
    base: true,
    leafIds: [],
    frameIds: [],
    maskIds: []
  }
  /** Photo slots placed since `current` started (their covers go into `current`). */
  let pending: PhotoLayer[] = []

  const flush = (): void => {
    const empty =
      current.leafIds.length === 0 && current.frameIds.length === 0 && current.maskIds.length === 0
    if (current.base || !empty) items.push({ kind: 'image', image: current })
    images++
    current = {
      path: `artwork-${images}.png`,
      name: `Artwork ${images}`,
      base: false,
      leafIds: [],
      frameIds: [],
      maskIds: []
    }
    pending = []
  }

  leaves.forEach((leaf, index) => {
    if (leaf.type !== 'photo') {
      current.leafIds.push(leaf.id)
      return
    }
    // A photo goes ABOVE everything collected so far. Close the current image unless it only holds covers of photos
    // that this one does not overlap (then the covers can still be drawn above all of them, exactly).
    const onlyCovers = !current.base && current.leafIds.length === 0
    if (!onlyCovers || pending.some((p) => overlaps(p, leaf))) flush()
    const cover = needsCover(leaf)
    const rotation = wholeDegrees(leaf.rotation)
    const inward = cover.frame || cover.mask
    items.push({
      kind: 'photo',
      photo: {
        layerId: leaf.id,
        photoNumber: leaf.photoNumber,
        rotation,
        inward,
        boxes: copies.map((c) =>
          intBox(leaf.x + c.left, leaf.y + c.top, leaf.width, leaf.height, inward)
        )
      }
    })
    if (cover.mask) {
      current.maskIds.push(leaf.id)
      under[leaf.id] = leaves.slice(0, index).flatMap((l) => (l.type === 'photo' ? [] : [l.id]))
    }
    if (cover.frame) current.frameIds.push(leaf.id)
    pending.push(leaf)
  })
  flush()

  // Renumber the non-base images so names have no gaps.
  let n = 0
  for (const it of items) {
    if (it.kind !== 'image' || it.image.base) continue
    n++
    it.image.path = `artwork-${n}.png`
    it.image.name = n === 1 ? 'Artwork' : `Artwork ${n}`
  }
  return { variant, canvas, copies, items, under }
}

/** The ZIP stem and template Name (equal, as in every fixture). */
export const dslrTemplateName = (
  projectName: string,
  variant: DslrVariant,
  main: boolean
): string => exportFileStem(projectName) + (main ? '' : variant === 'sheet' ? ' 4x6' : '')

/**
 * dslrBooth's `Dimensions` is the unit its editor shows sizes in (0 px, 1 in, 2 cm; observed in 6C: a template
 * imported with 1 showed inches and came back in pixels). Keep the unit of an imported template; 0 otherwise. It never
 * changes geometry: every size in the XML is in pixels.
 */
export function dslrDimensionsUnit(project: TemplateProject): number {
  const raw = project.sourceCompatibility?.['dslrbooth']?.project?.['rootAttributes']
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw['Dimensions'] : undefined
  return typeof value === 'string' && /^\s*[012]\s*$/.test(value) ? Number(value) : 0
}

/** The `template.xml` model for a plan. `now` is the save time written as `LastSavedDate`. */
export function buildDslrTemplate(
  project: TemplateProject,
  plan: DslrPlan,
  opts: { name: string; now: Date }
): DslrTemplate {
  const elements: DslrElement[] = []
  let z = 0
  for (const it of plan.items) {
    if (it.kind === 'image') {
      elements.push({
        type: 'Image',
        name: it.image.name,
        imagePath: it.image.path,
        left: 0,
        top: 0,
        width: plan.canvas.width,
        height: plan.canvas.height,
        zIndex: z++
      })
    } else {
      it.photo.boxes.forEach((b, i) => {
        elements.push({
          type: 'Photo',
          name: `Photo ${it.photo.photoNumber}${i > 0 ? ' Copy' : ''}`,
          photoNumber: it.photo.photoNumber,
          ...b,
          zIndex: z++,
          rotation: it.photo.rotation
        })
      })
    }
  }
  return {
    root: {
      name: opts.name,
      width: plan.canvas.width,
      height: plan.canvas.height,
      dimensions: dslrDimensionsUnit(project),
      resolution: plan.canvas.dpi,
      backgroundColor: toArgb(resolveColor(project.palette, project.canvas.backgroundColor)),
      print2PerPage: plan.variant === 'strip',
      lastSavedDate: formatSavedDate(opts.now),
      id: templateId(`${project.id}:${plan.variant}`),
      originalDevice: ORIGINAL_DEVICE
    },
    elements
  }
}

/** Every PNG the package holds, in render order (preview last). */
export const dslrImagePaths = (plan: DslrPlan): string[] => [
  ...plan.items.flatMap((it) => (it.kind === 'image' ? [it.image.path] : [])),
  PREVIEW_PNG
]

export const photoCount = (project: TemplateProject): number =>
  new Set(printableLeaves(project).flatMap((l) => (l.type === 'photo' ? [l.photoNumber] : []))).size
