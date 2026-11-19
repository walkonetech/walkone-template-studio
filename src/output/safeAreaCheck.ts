import {
  childrenOf,
  isEffectivelyVisible,
  topLevelLayers,
  type Layer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import { EVIDENCE_LABELS, isVerifiedEvidence, type Evidence, type OutputProfile } from './profile'
import {
  boundaryName,
  boundaryPlace,
  resolveSafeAreas,
  type Boundary,
  type Rect,
  type SafeAreaResolution
} from './safeArea'
import { formatMm, pxToMm } from './units'

/**
 * Output-profile-aware safe-area preflight (pure). Checks only CRITICAL content against the active profile's trim,
 * keep-safe margins and cuts, in the logical design (so both copies of a two-up strip get the same verdict):
 *   - text layers (their drawn text, when a measurer is supplied; otherwise the text box);
 *   - images whose role is logo or badge;
 *   - photo slots (the guest photo and its frame).
 * Backgrounds, overlays, frames, graphics and shapes may run into the trim or to the edge by design and are never
 * reported. Severity: warning when critical content crosses a cut, enters the expected trim or the keep-safe margin;
 * info for the profile's own status (none selected, provisional, not verified). Nothing here is an error: the export
 * is still valid, only the physical result is at risk.
 */

export type SafeAreaCode =
  | 'output-profile-none'
  | 'output-profile-mismatch'
  | 'output-profile-layout'
  | 'output-profile-provisional'
  | 'safe-area-cut'
  | 'safe-area-trim'
  | 'safe-area-margin'
  | 'safe-area-clear'

export type SafeAreaSeverity = 'error' | 'warning' | 'info'

export interface SafeAreaItem {
  code: SafeAreaCode
  severity: SafeAreaSeverity
  message: string
  layerIds: string[]
}

export type SafeAreaProblem = 'cut' | 'trim' | 'margin'

export interface FlaggedLayer {
  layerId: string
  problem: SafeAreaProblem
  /** The critical content's extent in design pixels (axis-aligned, clipped to the design). */
  bounds: Rect
  /** Distance to the boundary in mm (0 when it crosses a cut). */
  distanceMm: number
}

export interface SafeAreaReport {
  resolution: SafeAreaResolution
  items: SafeAreaItem[]
  flagged: FlaggedLayer[]
}

export interface SafeAreaCheckOptions {
  /**
   * Where a text layer's drawn text sits inside its box (unrotated, relative to the layer's x/y), from the renderer's
   * text layout. Without it the whole box counts, which over-reports wide boxes with short centred text.
   */
  textInk?: (layer: TextLayer) => Rect | null
}

export type CriticalKind = 'text' | 'logo' | 'badge' | 'photo'

/** What counts as critical content for safe-area checks (v1: existing layer types and image roles only). */
export function criticalKind(layer: Layer): CriticalKind | null {
  if (layer.type === 'text') return 'text'
  if (layer.type === 'photo') return 'photo'
  if (layer.type === 'image' && (layer.role === 'logo' || layer.role === 'badge')) return layer.role
  return null
}

const NOUN: Record<CriticalKind, string> = {
  text: 'Text',
  logo: 'Logo',
  badge: 'Badge',
  photo: 'Photo slot'
}

function describe(layer: Layer, kind: CriticalKind): string {
  if (layer.type === 'text') {
    const t = layer.content.replace(/\s+/g, ' ').trim()
    return `Text “${t.length > 28 ? `${t.slice(0, 27)}…` : t || layer.name}”`
  }
  if (layer.type === 'photo') return `Photo slot ${layer.photoNumber}`
  return `${NOUN[kind]} “${layer.name}”`
}

/** Visible, non-group layers in back-to-front order. */
function printedLeaves(project: TemplateProject): Layer[] {
  const out: Layer[] = []
  const walk = (list: Layer[]): void => {
    for (const l of list) {
      if (!isEffectivelyVisible(project.layers, l)) continue
      if (l.type === 'group') walk(childrenOf(project.layers, l.id))
      else if (l.opacity > 0) out.push(l)
    }
  }
  walk(topLevelLayers(project.layers))
  return out
}

/** Axis-aligned bounds of a local rect inside a (possibly rotated) layer box, in design pixels. */
export function rotatedBounds(
  layer: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  local: Rect = { x: 0, y: 0, width: layer.width, height: layer.height }
): Rect {
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  const a = (layer.rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const xs: number[] = []
  const ys: number[] = []
  for (const [px, py] of [
    [local.x, local.y],
    [local.x + local.width, local.y],
    [local.x, local.y + local.height],
    [local.x + local.width, local.y + local.height]
  ] as const) {
    const dx = layer.x + px - cx
    const dy = layer.y + py - cy
    xs.push(cx + dx * cos - dy * sin)
    ys.push(cy + dx * sin + dy * cos)
  }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

function clipTo(r: Rect, w: number, h: number): Rect | null {
  const x = Math.max(0, r.x)
  const y = Math.max(0, r.y)
  const right = Math.min(w, r.x + r.width)
  const bottom = Math.min(h, r.y + r.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const TOL = 0.01 // px: touching a line exactly is not crossing it

interface Hit {
  problem: SafeAreaProblem
  boundary: Boundary
  distancePx: number
}

const SEVERITY_RANK: Record<SafeAreaProblem, number> = { cut: 0, trim: 1, margin: 2 }

/** The worst way a rect meets one boundary, or null when it keeps its distance. */
function hitFor(r: Rect, b: Boundary): Hit | null {
  const lo = b.axis === 'x' ? r.x : r.y
  const hi = lo + (b.axis === 'x' ? r.width : r.height)
  const before = b.sides.includes('before')
  const after = b.sides.includes('after')
  if (before && after && lo < b.at - TOL && hi > b.at + TOL)
    return { problem: 'cut', boundary: b, distancePx: 0 }
  let d: number
  if (before && hi <= b.at + TOL) d = b.at - hi
  else if (after && lo >= b.at - TOL) d = lo - b.at
  else return null
  d = Math.max(0, d)
  if (b.trimPx !== null && d < b.trimPx - TOL)
    return { problem: 'trim', boundary: b, distancePx: d }
  if (d < b.safePx - TOL) return { problem: 'margin', boundary: b, distancePx: d }
  return null
}

function worse(a: Hit | null, b: Hit): Hit {
  if (!a) return b
  const r = SEVERITY_RANK[b.problem] - SEVERITY_RANK[a.problem]
  if (r !== 0) return r < 0 ? b : a
  return b.distancePx < a.distancePx ? b : a
}

const evidenceNote = (e: Evidence): string => EVIDENCE_LABELS[e].toLowerCase()

function message(
  subject: string,
  hit: Hit,
  dpi: number,
  zones: { width: number; height: number }
): string {
  const b = hit.boundary
  const where = `the ${boundaryName(b)}`
  const place = boundaryPlace(b, zones)
  const placeText = place === 'middle' ? '' : ` (${place})`
  const twoKinds = new Set(b.labels.map((l) => l.kind)).size > 1
  const copies = twoKinds
    ? ' On a two-up sheet this side is the cut on one copy and the outer edge on the other.'
    : ''
  if (hit.problem === 'cut')
    return `${subject} crosses ${where} and will be cut through. Move it to one side of the cut.`
  const dist = formatMm(pxToMm(hit.distancePx, dpi))
  if (hit.problem === 'trim')
    return `${subject} enters the expected trim at ${where}${placeText}: it is ${dist} from the edge, and about ${formatMm(b.trimMm ?? 0)} there may be cut off (${evidenceNote(b.trimEvidence)}). Keep it at least ${formatMm(b.safeMm)} away.${copies}`
  return `${subject} is ${dist} from ${where}${placeText}; keep critical content at least ${formatMm(b.safeMm)} away (${evidenceNote(b.safeEvidence)}).${copies}`
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Runs the safe-area check for a project and the selected profile (null = none selected). */
export function checkSafeAreas(
  project: TemplateProject,
  profile: OutputProfile | null,
  options: SafeAreaCheckOptions = {}
): SafeAreaReport {
  const resolution = resolveSafeAreas(project, profile)
  const items: SafeAreaItem[] = []
  const flagged: FlaggedLayer[] = []
  if (resolution.status === 'none') {
    items.push({
      code: 'output-profile-none',
      severity: 'info',
      message:
        'No output profile selected, so printer safe areas are not checked. Choose one in View › Output profile….',
      layerIds: []
    })
    return { resolution, items, flagged }
  }
  if (resolution.status === 'mismatch') {
    items.push({
      code: 'output-profile-mismatch',
      severity: 'warning',
      message: `The “${resolution.profile.name}” output profile does not match this project. ${resolution.reason} Safe areas are not checked; choose a matching profile or none.`,
      layerIds: []
    })
    return { resolution, items, flagged }
  }
  const { profile: p, dpi, design } = resolution
  if (resolution.status === 'layout-differs') {
    const cuts = p.cuts.map((c) => c.label).join(', ')
    items.push({
      code: 'output-profile-layout',
      severity: 'warning',
      message: `The “${p.name}” output profile cuts this sheet (${cuts}) through the middle of the design. That suits a sheet that already holds two strips; otherwise the print will be cut apart. Check the profile.`,
      layerIds: []
    })
  }
  if (!isVerifiedEvidence(p.confidence)) {
    items.push({
      code: 'output-profile-provisional',
      severity: 'info',
      message: `Safe areas are ${EVIDENCE_LABELS[p.confidence].toLowerCase()}: the “${p.shortName}” profile comes from ${p.observedEnvironment ?? 'unverified observations'}${p.observedDate ? ` (${p.observedDate})` : ''} and has not been measured on a print yet.`,
      layerIds: []
    })
  }

  let critical = 0
  for (const layer of printedLeaves(project)) {
    const kind = criticalKind(layer)
    if (!kind) continue
    const ink = layer.type === 'text' ? options.textInk?.(layer) : undefined
    if (ink === null) continue // empty text draws nothing
    const raw = rotatedBounds(layer, ink)
    const r = clipTo(raw, design.width, design.height)
    if (!r) continue // entirely off the design: other checks report it
    critical++
    let hit: Hit | null = null
    for (const b of design.boundaries) {
      const h = hitFor(r, b)
      if (h) hit = worse(hit, h)
    }
    if (!hit) continue
    flagged.push({
      layerId: layer.id,
      problem: hit.problem,
      bounds: r,
      distanceMm: pxToMm(hit.distancePx, dpi)
    })
    items.push({
      code:
        hit.problem === 'cut'
          ? 'safe-area-cut'
          : hit.problem === 'trim'
            ? 'safe-area-trim'
            : 'safe-area-margin',
      severity: 'warning',
      message: message(describe(layer, kind), hit, dpi, design),
      layerIds: [layer.id]
    })
  }
  if (flagged.length === 0 && critical > 0 && resolution.status === 'ok') {
    items.push({
      code: 'safe-area-clear',
      severity: 'info',
      message: `All critical content (${plural(critical, 'item')}: text, logos, badges and photo slots) is inside the safe area of “${p.shortName}”.`,
      layerIds: []
    })
  }
  const order: Record<SafeAreaSeverity, number> = { error: 0, warning: 1, info: 2 }
  items.sort((a, b) => order[a.severity] - order[b.severity])
  return { resolution, items, flagged }
}
