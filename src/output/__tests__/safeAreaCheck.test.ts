import { describe, expect, it } from 'vitest'
import { createProject, literalColor, type Layer, type TemplateProject } from '@domain'
import { DNP_DS_RX1_PROFILE_ID, findOutputProfile } from '../builtIn'
import { parseOutputProfile, type OutputProfile } from '../profile'
import { checkSafeAreas, criticalKind, rotatedBounds } from '../safeAreaCheck'
import { mmToPx } from '../units'

const profile = findOutputProfile(DNP_DS_RX1_PROFILE_ID) as OutputProfile
const common = { rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0 }

const text = (id: string, over: Partial<Layer> = {}): Layer =>
  ({
    ...common,
    id,
    type: 'text',
    name: id,
    x: 100,
    y: 800,
    width: 400,
    height: 60,
    content: 'Sarah & John',
    fontFamily: 'Georgia',
    fontSize: 48,
    fontWeight: 400,
    fontStyle: 'normal',
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    fill: literalColor('#000000'),
    ...over
  }) as Layer
const image = (id: string, role: string, over: Partial<Layer> = {}): Layer =>
  ({
    ...common,
    id,
    type: 'image',
    name: id,
    x: 200,
    y: 200,
    width: 200,
    height: 200,
    assetId: 'a1',
    role,
    fit: 'contain',
    ...over
  }) as Layer
const photo = (id: string, n: number, over: Partial<Layer> = {}): Layer =>
  ({
    ...common,
    id,
    type: 'photo',
    name: `Photo ${n}`,
    x: 60,
    y: 60 + 420 * (n - 1),
    width: 480,
    height: 400,
    photoNumber: n,
    fit: 'cover',
    frame: { style: 'none' },
    cornerRadius: 0,
    ...over
  }) as Layer

/** 2×6 strip at `dpi` (300: 600×1800 design px). Layer geometry is given in 300-DPI px and scaled. */
function strip(layers: Layer[], dpi: 300 | 600 = 300): TemplateProject {
  const p = createProject({
    name: 'T',
    design: `strip-2x6-${dpi}`,
    now: '2026-01-01T00:00:00.000Z',
    createId: () => 'p'
  })
  const k = dpi / 300
  return {
    ...p,
    layers: layers.map(
      (l) => ({ ...l, x: l.x * k, y: l.y * k, width: l.width * k, height: l.height * k }) as Layer
    )
  }
}
const codes = (r: ReturnType<typeof checkSafeAreas>): string[] => r.items.map((i) => i.code)

describe('no profile / provisional profile', () => {
  it('without a profile: one info note and no layer checks', () => {
    const r = checkSafeAreas(strip([text('t', { x: 0, y: 0 })]), null)
    expect(r.resolution.status).toBe('none')
    expect(r.items).toEqual([
      expect.objectContaining({ code: 'output-profile-none', severity: 'info', layerIds: [] })
    ])
    expect(r.flagged).toEqual([])
  })

  it('a provisional profile says so (info), and a clean design gets an "all inside" note', () => {
    const r = checkSafeAreas(strip([photo('p1', 1), text('t')]), profile)
    expect(codes(r)).toEqual(['output-profile-provisional', 'safe-area-clear'])
    expect(r.items.every((i) => i.severity === 'info')).toBe(true)
    expect(r.items[0]?.message).toMatch(
      /observed on test laptop.*DNP DS-RX1.*research laptop.*not been measured/
    )
    expect(r.items[1]?.message).toMatch(/All critical content \(2 items/)
  })

  it('a verified profile has no provisional note', () => {
    const data = JSON.parse(JSON.stringify(profile)) as Record<string, unknown>
    data.confidence = 'owner-measured'
    const r = parseOutputProfile(data)
    if (!r.ok) throw new Error(r.error)
    expect(codes(checkSafeAreas(strip([text('t')]), r.profile))).toEqual(['safe-area-clear'])
  })

  it('a mismatching sheet is one warning and no layer checks', () => {
    const p = createProject({
      name: 'L',
      design: 'photo-4x6-landscape-300',
      now: '2026-01-01T00:00:00.000Z'
    })
    const r = checkSafeAreas({ ...p, layers: [text('t', { x: 0, y: 0 })] }, profile)
    expect(codes(r)).toEqual(['output-profile-mismatch'])
    expect(r.items[0]?.severity).toBe('warning')
  })
})

describe('critical text', () => {
  it('text 2.8 mm from the strip side: a warning naming the centre cut, with the distance in mm', () => {
    const x = mmToPx(2.8, 300) // outside the 1.6 mm trim band, inside the 3 mm margin
    const r = checkSafeAreas(strip([text('t', { x, width: 300 })]), profile)
    const w = r.items.find((i) => i.code === 'safe-area-margin')
    expect(w?.severity).toBe('warning')
    expect(w?.layerIds).toEqual(['t'])
    expect(w?.message).toMatch(
      /^Text “Sarah & John” is 2\.8 mm from the 2-inch centre cut and outer edge \(left side\); keep critical content at least 3 mm away \(provisional\)/
    )
    expect(r.flagged[0]).toMatchObject({ layerId: 't', problem: 'margin' })
    expect(r.flagged[0]?.distanceMm).toBeCloseTo(2.8, 6)
  })

  it('text 1.2 mm from the right side (the cut on copy 1) is reported as 1.2 mm in the expected trim', () => {
    const right = 600 - mmToPx(1.2, 300)
    const r = checkSafeAreas(strip([text('t', { x: right - 300, width: 300 })]), profile)
    const w = r.items.find((i) => i.layerIds.includes('t'))
    expect(w?.code).toBe('safe-area-trim')
    expect(w?.message).toMatch(
      /is 1\.2 mm from the edge, and about 1\.6 mm there may be cut off \(inferred\)/
    )
    expect(w?.message).toMatch(/right side/)
  })

  it('the same physical distance gives the same verdict at 600 DPI', () => {
    const x = mmToPx(2.8, 300)
    const a = checkSafeAreas(strip([text('t', { x, width: 300 })], 300), profile)
    const b = checkSafeAreas(strip([text('t', { x, width: 300 })], 600), profile)
    expect(b.items.map((i) => i.message)).toEqual(a.items.map((i) => i.message))
    expect(b.flagged[0]?.distanceMm).toBeCloseTo(a.flagged[0]?.distanceMm as number, 9)
  })

  it('a full-width box with short centred text is judged by the drawn text when a measurer is supplied', () => {
    const wide = text('t', { x: 0, width: 600 })
    expect(checkSafeAreas(strip([wide]), profile).flagged).toHaveLength(1) // box only: touches both sides
    const ink = (): { x: number; y: number; width: number; height: number } => ({
      x: 150,
      y: 0,
      width: 300,
      height: 58
    })
    const r = checkSafeAreas(strip([wide]), profile, { textInk: ink })
    expect(r.flagged).toHaveLength(0)
    expect(codes(r)).toContain('safe-area-clear')
  })

  it('empty text (measurer returns null) is not checked', () => {
    const r = checkSafeAreas(strip([text('t', { x: 0 })]), profile, { textInk: () => null })
    expect(r.flagged).toHaveLength(0)
  })

  it('text near the top edge enters the trim (1.8 mm, inferred)', () => {
    const r = checkSafeAreas(strip([text('t', { y: 5 })]), profile)
    expect(r.items.find((i) => i.code === 'safe-area-trim')?.message).toMatch(/top edge \(top\)/)
  })

  it('rotated text is checked by its rotated extent', () => {
    const t = text('t', { x: 100, y: 800, width: 400, height: 60, rotation: 90 })
    const b = rotatedBounds(t)
    expect(b.width).toBeCloseTo(60, 9)
    expect(b.height).toBeCloseTo(400, 9)
    expect(checkSafeAreas(strip([t]), profile).flagged).toHaveLength(0)
  })

  it('hidden layers are not checked', () => {
    const r = checkSafeAreas(strip([text('t', { x: 0, visible: false })]), profile)
    expect(r.flagged).toHaveLength(0)
  })
})

describe('logos, badges, photos and decoration', () => {
  it('a logo in the expected trim is a warning', () => {
    const r = checkSafeAreas(strip([image('logo', 'logo', { x: 200, y: 1800 - 205 })]), profile)
    const w = r.items.find((i) => i.code === 'safe-area-trim')
    expect(w?.message).toMatch(
      /^Logo “logo” enters the expected trim at the bottom edge \(bottom\)/
    )
  })

  it('a badge inside the margin is a warning', () => {
    const r = checkSafeAreas(strip([image('b', 'badge', { x: 600 - 230 })]), profile)
    expect(r.items.find((i) => i.layerIds.includes('b'))?.message).toMatch(
      /^Badge “b” is 2\.5 mm from/
    )
  })

  it('full-bleed background, overlay, frame and graphic images and shapes are never reported', () => {
    const bleed = { x: -10, y: -10, width: 620, height: 1820 }
    const shape = {
      ...common,
      id: 's',
      type: 'shape',
      name: 's',
      ...bleed,
      shape: 'rectangle',
      fill: literalColor('#123456'),
      stroke: null,
      cornerRadius: 0
    } as Layer
    const r = checkSafeAreas(
      strip([
        image('bg', 'background', bleed),
        image('ov', 'overlay', bleed),
        image('fr', 'frame', bleed),
        image('gr', 'graphic', bleed),
        shape
      ]),
      profile
    )
    expect(r.flagged).toEqual([])
    expect(codes(r)).toEqual(['output-profile-provisional'])
    expect(
      ['background', 'overlay', 'frame', 'graphic'].map((role) => criticalKind(image('x', role)))
    ).toEqual([null, null, null, null])
  })

  it('a photo slot crossing the safe margin is a warning; one 6 mm in is fine', () => {
    const r = checkSafeAreas(
      strip([photo('p1', 1, { x: 20 }), photo('p2', 2, { x: 71, width: 458 })]),
      profile
    )
    expect(r.flagged.map((f) => f.layerId)).toEqual(['p1'])
    expect(r.items.find((i) => i.layerIds.includes('p1'))?.message).toMatch(
      /^Photo slot 1 is 1\.7 mm from/
    )
  })
})

describe('a cut through the design (single 4×6 with the two-up profile)', () => {
  it('warns about the layout and about content crossing the cut', () => {
    const p = createProject({
      name: 'S',
      design: 'photo-4x6-portrait-300',
      now: '2026-01-01T00:00:00.000Z'
    })
    const r = checkSafeAreas({ ...p, layers: [text('title', { x: 300, width: 600 })] }, profile)
    expect(codes(r)).toEqual([
      'output-profile-layout',
      'safe-area-cut',
      'output-profile-provisional'
    ])
    expect(r.items[1]?.message).toMatch(
      /^Text “Sarah & John” crosses the 2-inch centre cut and will be cut through/
    )
    expect(r.flagged[0]).toMatchObject({ problem: 'cut', distanceMm: 0 })
  })
})

describe('the check never changes the project', () => {
  it('is pure', () => {
    const p = strip([text('t', { x: 0 }), photo('p1', 1)])
    const before = JSON.stringify(p)
    checkSafeAreas(p, profile)
    checkSafeAreas(p, null)
    expect(JSON.stringify(p)).toBe(before)
  })
})
