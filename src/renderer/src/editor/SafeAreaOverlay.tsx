import { useMemo } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import {
  checkSafeAreas,
  EVIDENCE_LABELS,
  formatMm,
  type FlaggedLayer,
  type Rect as ZoneRect,
  type SafeAreaReport,
  type SafeZones
} from '@output'
import { measureTextInk } from '@canvas/rendering/measureText'
import { selectOutputProfile } from '@editor/store'
import { CANVAS_THEME } from './canvasTheme'
import { useEditor } from './editorStore'

/**
 * Safe areas on the canvas (ADR-053): the active Output Profile's expected trim (amber hatch), keep-safe lines (teal,
 * dashed) and the critical content that breaks them (red outline). Editor-only chrome drawn in the overlay layer, never
 * in any render or export. Design view draws the LOGICAL design's zones (the strictest of every copy's edges); Print
 * Preview draws the sheet's zones and outlines the same flagged layers in every copy.
 */

/** The current safe-area report (null without a project). Recomputed when the project or the profile changes. */
export function useSafeAreaReport(): SafeAreaReport | null {
  const project = useEditor((s) => s.project)
  const profile = useEditor(selectOutputProfile)
  return useMemo(
    () => (project ? checkSafeAreas(project, profile, { textInk: measureTextInk }) : null),
    [project, profile]
  )
}

export interface SafeOverlayData {
  report: SafeAreaReport
  /** Zones on the logical design (Design view). */
  design: SafeZones
  /** Zones on the print sheet (Print Preview). */
  sheet: SafeZones
  /** Where each copy of the design sits on the sheet. */
  copies: { x: number; y: number }[]
}

/** The overlay to draw, or null: Safe areas off, no profile, or a profile that does not fit this project. */
export function useSafeAreaOverlay(): SafeOverlayData | null {
  const report = useSafeAreaReport()
  const show = useEditor((s) => s.showSafeAreas)
  if (!show || !report) return null
  const r = report.resolution
  if (r.status !== 'ok' && r.status !== 'layout-differs') {
    // No fitting printer profile: the format's generic safe margin, when it has one (B5.5).
    const g = report.generic
    if (!g) return null
    return {
      report,
      design: { ...g.design, boundaries: [], trimRects: [] },
      sheet: { ...g.sheet, boundaries: [], trimRects: [] },
      copies: g.cells.map((c) => ({ x: c.x, y: c.y }))
    }
  }
  return {
    report,
    design: r.design,
    sheet: r.sheet,
    copies: r.cells.map((c) => ({ x: c.x, y: c.y }))
  }
}

function TrimBands({ rects, scale }: { rects: ZoneRect[]; scale: number }): React.JSX.Element {
  return (
    <Shape
      name="safe-trim"
      listening={false}
      sceneFunc={(ctx: Konva.Context) => {
        if (rects.length === 0) return
        const path = (): void => {
          ctx.beginPath()
          for (const r of rects) ctx.rect(r.x, r.y, r.width, r.height)
        }
        path()
        ctx.setAttr('fillStyle', CANVAS_THEME.trimFill)
        ctx.fill() // one path, non-zero fill: overlapping corners are not darker
        ctx.save()
        path()
        ctx.clip()
        const step = 7 / scale
        const minX = Math.min(...rects.map((r) => r.x))
        const minY = Math.min(...rects.map((r) => r.y))
        const maxX = Math.max(...rects.map((r) => r.x + r.width))
        const maxY = Math.max(...rects.map((r) => r.y + r.height))
        ctx.beginPath()
        for (let d = minX - (maxY - minY); d < maxX; d += step) {
          ctx.moveTo(d, maxY)
          ctx.lineTo(d + (maxY - minY), minY)
        }
        ctx.setAttr('strokeStyle', CANVAS_THEME.trimHatch)
        ctx.setAttr('lineWidth', 1 / scale)
        ctx.stroke()
        ctx.restore()
      }}
    />
  )
}

function SafeLines({ rects }: { rects: ZoneRect[] }): React.JSX.Element {
  return (
    <>
      {rects.map((r, i) => (
        <Rect
          key={i}
          name="safe-line"
          listening={false}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          stroke={CANVAS_THEME.safeLine}
          strokeWidth={1.25}
          dash={[6, 4]}
          strokeScaleEnabled={false}
        />
      ))}
    </>
  )
}

/** Screen-pixel widths of the safe-area warning outline and its contrast halo. */
export const FLAG_WIDTH = 1.5
export const FLAG_HALO_WIDTH = 4.5

function Flagged({
  flagged,
  offsets
}: {
  flagged: readonly FlaggedLayer[]
  offsets: readonly { x: number; y: number }[]
}): React.JSX.Element {
  return (
    <>
      {offsets.flatMap((o, c) =>
        flagged.map((f) => {
          const box = {
            x: f.bounds.x + o.x,
            y: f.bounds.y + o.y,
            width: f.bounds.width,
            height: f.bounds.height
          }
          // The warning keeps its exact bounds; the halo is a wider dark understroke on the SAME rectangle (visual
          // contrast over red / light / busy artwork, B4). It adds no geometry and is never exported.
          return (
            <Group key={`${c}-${f.layerId}`} listening={false}>
              <Rect
                name="safe-flag-halo"
                listening={false}
                {...box}
                stroke={CANVAS_THEME.halo}
                strokeWidth={FLAG_HALO_WIDTH}
                strokeScaleEnabled={false}
              />
              <Rect
                name="safe-flag"
                listening={false}
                {...box}
                stroke={CANVAS_THEME.flagged}
                strokeWidth={FLAG_WIDTH}
                dash={[4, 3]}
                strokeScaleEnabled={false}
              />
            </Group>
          )
        })
      )}
    </>
  )
}

/** Konva overlay for one frame: the design (Design view) or the sheet (Print Preview, with one offset per copy). */
export function SafeAreaShapes({
  zones,
  flagged,
  offsets,
  scale
}: {
  zones: SafeZones
  flagged: readonly FlaggedLayer[]
  offsets: readonly { x: number; y: number }[]
  scale: number
}): React.JSX.Element {
  return (
    <Group name="safe-areas" listening={false}>
      <TrimBands rects={zones.trimRects} scale={scale} />
      <SafeLines rects={zones.safeRects} />
      <Flagged flagged={flagged} offsets={offsets} />
    </Group>
  )
}

/** One-line legend under the artboard, e.g. "Safe areas · DNP DS-RX1 · Provisional · keep-safe 3 mm · trim ~1.6–1.8 mm (inferred)". */
export function safeAreaLegend(report: SafeAreaReport): string {
  const r = report.resolution
  if (r.status !== 'ok' && r.status !== 'layout-differs')
    return report.generic
      ? `Generic safe margin · ${formatMm(report.generic.marginMm)} · general guidance, not printer-measured`
      : ''
  const p = r.profile
  const safe = [p.safeMarginMm.edge.value, p.safeMarginMm.cut.value].filter(
    (v): v is number => v !== null
  )
  const trims = (['top', 'bottom', 'left', 'right'] as const)
    .map((k) => p.trimMm[k])
    .filter((t) => t.value !== null)
  const lo = Math.min(...trims.map((t) => t.value as number))
  const hi = Math.max(...trims.map((t) => t.value as number))
  const trimText =
    trims.length === 0
      ? 'trim unknown'
      : `trim ~${lo === hi ? formatMm(lo) : `${lo}–${formatMm(hi)}`} (${EVIDENCE_LABELS[trims[0]!.evidence].toLowerCase()})`
  const safeText = safe.length
    ? `keep-safe ${formatMm(Math.max(...safe))}`
    : 'no keep-safe guidance'
  return `Safe areas · ${p.shortName} · ${EVIDENCE_LABELS[p.confidence]} · ${safeText} · ${trimText}`
}
