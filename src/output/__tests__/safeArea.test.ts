import { describe, expect, it } from 'vitest'
import { createProject, type TemplateProject } from '@domain'
import { DNP_DS_RX1_PROFILE_ID, findOutputProfile } from '../builtIn'
import type { OutputProfile } from '../profile'
import { boundaryName, boundaryPlace, resolveSafeAreas, type SafeZones } from '../safeArea'
import { mmToPx } from '../units'

const profile = findOutputProfile(DNP_DS_RX1_PROFILE_ID) as OutputProfile
const project = (design: Parameters<typeof createProject>[0]['design']): TemplateProject =>
  createProject({ name: 'T', design, now: '2026-01-01T00:00:00.000Z', createId: () => 'p' })

const ok = (p: TemplateProject) => {
  const r = resolveSafeAreas(p, profile)
  if (r.status !== 'ok' && r.status !== 'layout-differs') throw new Error(r.status)
  return r
}
const at = (z: SafeZones, axis: 'x' | 'y', pos: number) =>
  z.boundaries.find((b) => b.axis === axis && Math.abs(b.at - pos) < 0.5)

describe('safe areas: one logical 2×6 strip', () => {
  for (const dpi of [300, 600] as const) {
    it(`2×6 @${dpi}: both sides carry the cut on one copy and the outer edge on the other; 3 mm inset everywhere`, () => {
      const r = ok(project(`strip-2x6-${dpi}`))
      expect(r.status).toBe('ok')
      const d = r.design
      expect([d.width, d.height]).toEqual([2 * dpi, 6 * dpi])
      const safe = mmToPx(3, dpi)
      const left = at(d, 'x', 0)
      const right = at(d, 'x', 2 * dpi)
      expect(left?.labels).toEqual([
        { kind: 'edge', name: 'outer edge', copy: 1 },
        { kind: 'cut', name: '2-inch centre cut', copy: 2 }
      ])
      expect(right?.labels.map((l) => [l.kind, l.copy])).toEqual([
        ['cut', 1],
        ['edge', 2]
      ])
      expect(boundaryName(left!)).toBe('2-inch centre cut and outer edge')
      expect(boundaryPlace(left!, d)).toBe('left side')
      for (const b of [left, right, at(d, 'y', 0), at(d, 'y', 6 * dpi)]) {
        expect(b?.safePx).toBeCloseTo(safe, 9)
        expect(b?.safeMm).toBe(3)
        expect(b?.safeEvidence).toBe('provisional')
      }
      // one safe rectangle: the strip inset by 3 mm on all four sides
      expect(d.safeRects).toHaveLength(1)
      const s = d.safeRects[0]!
      expect(s.x).toBeCloseTo(safe, 9)
      expect(s.y).toBeCloseTo(safe, 9)
      expect(s.width).toBeCloseTo(2 * dpi - 2 * safe, 9)
      expect(s.height).toBeCloseTo(6 * dpi - 2 * safe, 9)
      // trim: inferred 1.8 mm top/bottom and 1.6 mm at the outer edge (the cut side is unknown, so the outer edge's
      // known value is drawn on both sides of the logical strip)
      expect(at(d, 'y', 0)?.trimPx).toBeCloseTo(mmToPx(1.8, dpi), 9)
      expect(left?.trimPx).toBeCloseTo(mmToPx(1.6, dpi), 9)
      expect(left?.trimEvidence).toBe('inferred')
      expect(d.trimRects).toHaveLength(4)
      // no boundary runs through the strip
      expect(d.boundaries.every((b) => b.sides.length === 1)).toBe(true)
    })
  }

  it('the same 3 mm is the same physical distance at 300 and 600 DPI', () => {
    const a = ok(project('strip-2x6-300')).design.safeRects[0]!
    const b = ok(project('strip-2x6-600')).design.safeRects[0]!
    expect(b.x / 600).toBeCloseTo(a.x / 300, 12)
    expect(b.width / 600).toBeCloseTo(a.width / 300, 12)
  })
})

describe('safe areas: the two-up print sheet', () => {
  for (const dpi of [300, 600] as const) {
    it(`sheet @${dpi}: the centre cut sits at exactly 2 in; each copy has its own safe rectangle`, () => {
      const r = ok(project(`strip-2x6-${dpi}`))
      const s = r.sheet
      expect([s.width, s.height]).toEqual([4 * dpi, 6 * dpi])
      const cut = s.boundaries.filter((b) => b.labels.some((l) => l.kind === 'cut'))
      expect(cut).toHaveLength(1)
      expect(cut[0]!.at).toBe(2 * dpi)
      expect(cut[0]!.sides).toEqual(['before', 'after'])
      expect(cut[0]!.trimPx).toBeNull() // loss at the cut: unknown until the readout
      const safe = mmToPx(3, dpi)
      expect(s.safeRects).toHaveLength(2)
      const [l, rr] = s.safeRects as [(typeof s.safeRects)[0], (typeof s.safeRects)[0]]
      expect(l.x).toBeCloseTo(safe, 9)
      expect(l.x + l.width).toBeCloseTo(2 * dpi - safe, 9)
      expect(rr.x).toBeCloseTo(2 * dpi + safe, 9)
      expect(rr.x + rr.width).toBeCloseTo(4 * dpi - safe, 9)
      // only the four sheet edges have a known trim band
      expect(s.trimRects).toHaveLength(4)
    })
  }

  it('Design and Print Preview agree: each copy’s share of the sheet zones is the design zone moved to its cell', () => {
    const r = ok(project('strip-2x6-600'))
    expect(r.cells.map((c) => c.x)).toEqual([0, 1200])
    for (const cell of r.cells) {
      const sheetRect = r.sheet.safeRects[cell.index]!
      const design = r.design.safeRects[0]!
      // the design's safe rect is the union of both copies' constraints, so it lies inside each copy's sheet rect
      expect(design.x + cell.x).toBeGreaterThanOrEqual(sheetRect.x - 1e-9)
      expect(design.x + design.width + cell.x).toBeLessThanOrEqual(
        sheetRect.x + sheetRect.width + 1e-9
      )
      expect(design.y).toBeCloseTo(sheetRect.y, 9)
      expect(design.height).toBeCloseTo(sheetRect.height, 9)
    }
  })
})

describe('profile vs project layout', () => {
  it('no profile: nothing printer-specific', () => {
    expect(resolveSafeAreas(project('strip-2x6-300'), null)).toEqual({ status: 'none' })
  })

  it('a different sheet (landscape 6×4 or a 300 DPI design of another size) is a mismatch with no zones', () => {
    const r = resolveSafeAreas(project('photo-4x6-landscape-300'), profile)
    expect(r.status).toBe('mismatch')
    if (r.status === 'mismatch') expect(r.reason).toMatch(/4×6 in sheet.*6×4 in/)
  })

  it('a single 4×6 portrait design: the 2-inch cut runs through the design (layout-differs)', () => {
    const r = ok(project('photo-4x6-portrait-300'))
    expect(r.status).toBe('layout-differs')
    const cut = r.design.boundaries.find((b) => b.labels.some((l) => l.kind === 'cut'))
    expect(cut?.at).toBe(600)
    expect(cut?.sides).toEqual(['before', 'after'])
    expect(r.design.safeRects).toHaveLength(2)
    // left/right edges are plain sheet edges on a single sheet
    expect(at(r.design, 'x', 0)?.labels).toEqual([{ kind: 'edge', name: 'outer edge', copy: null }])
  })

  it('does not change the project', () => {
    const p = project('strip-2x6-600')
    const before = JSON.stringify(p)
    resolveSafeAreas(p, profile)
    expect(JSON.stringify(p)).toBe(before)
  })
})
