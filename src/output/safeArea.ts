import {
  checkComposition,
  getPixelSize,
  resolveCompositionCells,
  type CompositionCell,
  type TemplateProject
} from '@domain'
import type { Evidence, OutputProfile } from './profile'
import { inchesToPx, mmToPx } from './units'

/**
 * Safe-area geometry (pure). A profile describes the PRINT SHEET: its edges (with the expected trim at each) and its
 * cuts. Those physical boundaries are converted to pixels at the project's DPI (millimetres first, then pixels) and
 * then expressed in two frames:
 *   - the sheet, for Print Preview (every copy, the cut between them);
 *   - the logical design, for Design view: each copy's share of the sheet boundaries, mapped into design coordinates
 *     and merged. A 2×6 strip printed two-up gets its outer edge on one side and the centre cut on the other for
 *     copy 1, and the reverse for copy 2, so in the one authored strip BOTH sides carry the stricter of the two.
 * Nothing here touches the project; Template Studio's composition (DesignCanvas → OutputComposition) is reused as is.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type BoundaryKind = 'edge' | 'cut'

export interface BoundaryLabel {
  kind: BoundaryKind
  /** "top edge", "outer edge", "2-inch centre cut", … */
  name: string
  /** 1-based copy this label applies to when the sheet holds several copies; null for the sheet itself. */
  copy: number | null
}

/** A physical boundary (sheet edge or cut) as a line in a region's pixel coordinates. */
export interface Boundary {
  /** 'x' = vertical line at x = `at`; 'y' = horizontal line at y = `at`. */
  axis: 'x' | 'y'
  at: number
  /** Which sides of the line hold printed content in this region: 'before' = smaller coordinates. */
  sides: readonly ('before' | 'after')[]
  /** Expected loss on each content side, in px; null = not known. */
  trimPx: number | null
  trimMm: number | null
  trimEvidence: Evidence
  /** Keep-safe distance on each content side, in px (0 = no guidance). */
  safePx: number
  safeMm: number
  safeEvidence: Evidence
  labels: readonly BoundaryLabel[]
}

export interface SafeZones {
  width: number
  height: number
  boundaries: Boundary[]
  /** Expected-loss bands (may overlap at corners; draw them as one path). */
  trimRects: Rect[]
  /** Keep-safe rectangles: one per piece of the region between cuts, inset by each side's safe distance. */
  safeRects: Rect[]
}

export type SafeAreaResolution =
  | { status: 'none' }
  | { status: 'mismatch'; profile: OutputProfile; reason: string }
  | {
      /** 'layout-differs': the sheet matches but the profile's cuts run through the design (e.g. a single 4×6). */
      status: 'ok' | 'layout-differs'
      profile: OutputProfile
      dpi: number
      design: SafeZones
      sheet: SafeZones
      cells: CompositionCell[]
    }

const EPS = 0.5
const near = (a: number, b: number, eps = EPS): boolean => Math.abs(a - b) <= eps

interface SheetBoundarySource {
  axis: 'x' | 'y'
  at: number
  kind: BoundaryKind
  name: string
  trimMm: number | null
  trimEvidence: Evidence
  safeMm: number
  safeEvidence: Evidence
}

/** The profile's physical boundaries in sheet pixels at `dpi`. */
function sheetSources(profile: OutputProfile, dpi: number): SheetBoundarySource[] {
  const w = inchesToPx(profile.sheet.widthIn, dpi)
  const h = inchesToPx(profile.sheet.heightIn, dpi)
  const strips = profile.composition.mode === 'copies' && profile.composition.columns > 1
  const edge = profile.safeMarginMm.edge
  const cut = profile.safeMarginMm.cut
  const e = (
    axis: 'x' | 'y',
    at: number,
    name: string,
    trim: OutputProfile['trimMm']['top']
  ): SheetBoundarySource => ({
    axis,
    at,
    kind: 'edge',
    name,
    trimMm: trim.value,
    trimEvidence: trim.evidence,
    safeMm: edge.value ?? 0,
    safeEvidence: edge.evidence
  })
  return [
    e('y', 0, 'top edge', profile.trimMm.top),
    e('y', h, 'bottom edge', profile.trimMm.bottom),
    e('x', 0, strips ? 'outer edge' : 'left edge', profile.trimMm.left),
    e('x', w, strips ? 'outer edge' : 'right edge', profile.trimMm.right),
    ...profile.cuts.map((c): SheetBoundarySource => ({
      axis: c.axis,
      at: inchesToPx(c.positionIn, dpi),
      kind: 'cut',
      name: c.label,
      trimMm: profile.trimMm.cut.value,
      trimEvidence: profile.trimMm.cut.evidence,
      safeMm: cut.value ?? 0,
      safeEvidence: cut.evidence
    }))
  ]
}

/** Region-local boundary for a source line, or null when the line does not touch the region. */
function toRegion(
  src: SheetBoundarySource,
  region: Rect,
  dpi: number,
  copy: number | null
): Boundary | null {
  const start = src.axis === 'x' ? region.x : region.y
  const size = src.axis === 'x' ? region.width : region.height
  const local = src.at - start
  if (local < -EPS || local > size + EPS) return null
  const at = Math.min(size, Math.max(0, local))
  const sides: ('before' | 'after')[] = []
  if (at > EPS) sides.push('before')
  if (at < size - EPS) sides.push('after')
  return {
    axis: src.axis,
    at,
    sides,
    trimPx: src.trimMm === null ? null : mmToPx(src.trimMm, dpi),
    trimMm: src.trimMm,
    trimEvidence: src.trimEvidence,
    safePx: mmToPx(src.safeMm, dpi),
    safeMm: src.safeMm,
    safeEvidence: src.safeEvidence,
    labels: [{ kind: src.kind, name: src.name, copy }]
  }
}

const RANK: Record<Evidence, number> = {
  unknown: 0,
  nominal: 1,
  inferred: 2,
  provisional: 3,
  'observed-test-laptop': 4,
  'owner-measured': 5,
  'verified-production': 6
}
/** The weaker of two evidence levels (a merged value is only as trustworthy as its weakest input). */
const weaker = (a: Evidence, b: Evidence): Evidence => (RANK[a] <= RANK[b] ? a : b)

/** Merges boundaries on the same line: the stricter distances, the weaker evidence, every label. */
function mergeBoundaries(list: Boundary[]): Boundary[] {
  const out: Boundary[] = []
  for (const b of list) {
    const same = out.findIndex(
      (o) => o.axis === b.axis && near(o.at, b.at) && o.sides.join() === b.sides.join() // same line, same content side(s)
    )
    if (same < 0) {
      out.push(b)
      continue
    }
    const o = out[same] as Boundary
    const trimPx =
      o.trimPx === null ? b.trimPx : b.trimPx === null ? o.trimPx : Math.max(o.trimPx, b.trimPx)
    const trimMm =
      o.trimMm === null ? b.trimMm : b.trimMm === null ? o.trimMm : Math.max(o.trimMm, b.trimMm)
    out[same] = {
      ...o,
      trimPx,
      trimMm,
      // An unknown trim on one side does not weaken a known one on the other: the known value is what is drawn.
      trimEvidence:
        o.trimMm === null
          ? b.trimEvidence
          : b.trimMm === null
            ? o.trimEvidence
            : weaker(o.trimEvidence, b.trimEvidence),
      safePx: Math.max(o.safePx, b.safePx),
      safeMm: Math.max(o.safeMm, b.safeMm),
      safeEvidence: weaker(o.safeEvidence, b.safeEvidence),
      labels: [...o.labels, ...b.labels]
    }
  }
  return out.sort((a, b) => (a.axis === b.axis ? a.at - b.at : a.axis === 'x' ? -1 : 1))
}

function clip(r: Rect, w: number, h: number): Rect | null {
  const x = Math.max(0, r.x)
  const y = Math.max(0, r.y)
  const right = Math.min(w, r.x + r.width)
  const bottom = Math.min(h, r.y + r.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

function buildZones(width: number, height: number, boundaries: Boundary[]): SafeZones {
  const trimRects: Rect[] = []
  for (const b of boundaries) {
    if (b.trimPx === null || b.trimPx <= 0) continue
    for (const side of b.sides) {
      const lo = side === 'before' ? b.at - b.trimPx : b.at
      const r =
        b.axis === 'x'
          ? { x: lo, y: 0, width: b.trimPx, height }
          : { x: 0, y: lo, width, height: b.trimPx }
      const c = clip(r, width, height)
      if (c) trimRects.push(c)
    }
  }
  // Split the region at interior boundaries (cuts), then inset each piece by the boundary on each of its sides.
  const splits = (axis: 'x' | 'y', size: number): number[] => {
    const at = boundaries
      .filter((b) => b.axis === axis && b.at > EPS && b.at < size - EPS)
      .map((b) => b.at)
    return [0, ...at, size]
  }
  const xs = splits('x', width)
  const ys = splits('y', height)
  const safeAt = (axis: 'x' | 'y', at: number, side: 'before' | 'after'): number =>
    boundaries.find((b) => b.axis === axis && near(b.at, at) && b.sides.includes(side))?.safePx ?? 0
  const safeRects: Rect[] = []
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const x0 = xs[i] as number
      const x1 = xs[i + 1] as number
      const y0 = ys[j] as number
      const y1 = ys[j + 1] as number
      const left = x0 + safeAt('x', x0, 'after')
      const right = x1 - safeAt('x', x1, 'before')
      const top = y0 + safeAt('y', y0, 'after')
      const bottom = y1 - safeAt('y', y1, 'before')
      if (right > left && bottom > top)
        safeRects.push({ x: left, y: top, width: right - left, height: bottom - top })
    }
  }
  return { width, height, boundaries, trimRects, safeRects }
}

const sameInches = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6

const describeSheet = (w: number, h: number): string => `${w}×${h} in`

/**
 * Resolves a profile against a project. `none` without a profile; `mismatch` when the profile describes a different
 * sheet (no safe areas are shown then); otherwise the zones on the sheet and on the logical design.
 */
export function resolveSafeAreas(
  project: TemplateProject,
  profile: OutputProfile | null
): SafeAreaResolution {
  if (!profile) return { status: 'none' }
  const out = project.output.print
  if (
    !sameInches(out.width, profile.sheet.widthIn) ||
    !sameInches(out.height, profile.sheet.heightIn)
  ) {
    return {
      status: 'mismatch',
      profile,
      reason: `The profile is for a ${describeSheet(profile.sheet.widthIn, profile.sheet.heightIn)} sheet; this project prints on ${describeSheet(out.width, out.height)}.`
    }
  }
  if (checkComposition(project.canvas.print, project.output).length > 0) {
    return { status: 'mismatch', profile, reason: 'The project’s print layout is not valid.' }
  }
  const dpi = out.dpi
  const sheetPx = getPixelSize(out)
  const cells = resolveCompositionCells(project.canvas.print, project.output)
  const sources = sheetSources(profile, dpi)
  const composed = cells.length > 1

  const sheetBoundaries = mergeBoundaries(
    sources
      .map((s) => toRegion(s, { x: 0, y: 0, ...sheetPx }, dpi, null))
      .filter((b): b is Boundary => b !== null)
  )
  const design = getPixelSize(project.canvas.print)
  const designBoundaries = mergeBoundaries(
    cells.flatMap((cell) =>
      sources
        .map((s) => toRegion(s, cell, dpi, composed ? cell.index + 1 : null))
        .filter((b): b is Boundary => b !== null)
    )
  )
  // A cut that runs through a copy (not along its edge) means the profile's layout is not this project's layout.
  const cutThrough = designBoundaries.some(
    (b) => b.sides.length === 2 && b.labels.some((l) => l.kind === 'cut')
  )
  return {
    status: cutThrough ? 'layout-differs' : 'ok',
    profile,
    dpi,
    cells,
    sheet: buildZones(sheetPx.width, sheetPx.height, sheetBoundaries),
    design: buildZones(design.width, design.height, designBoundaries)
  }
}

/** "left side", "right side", "top", "bottom" or "middle" of a region, for a boundary. */
export function boundaryPlace(b: Boundary, zones: Pick<SafeZones, 'width' | 'height'>): string {
  const size = b.axis === 'x' ? zones.width : zones.height
  if (near(b.at, 0)) return b.axis === 'x' ? 'left side' : 'top'
  if (near(b.at, size)) return b.axis === 'x' ? 'right side' : 'bottom'
  return 'middle'
}

/** Human name of a boundary: cuts first, then edges, each once ("2-inch centre cut and outer edge"). */
export function boundaryName(b: Boundary): string {
  const names: string[] = []
  for (const kind of ['cut', 'edge'] as const)
    for (const l of b.labels) if (l.kind === kind && !names.includes(l.name)) names.push(l.name)
  return names.join(' and ')
}
