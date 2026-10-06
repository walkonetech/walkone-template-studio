import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, getPixelSize } from '@domain/index'
import { coverSource } from '../images'
import { createSpikeProject, createStressProject, DESIGN } from '../scene'

describe('spike scene (built from the real domain model)', () => {
  it('is a valid 4x6 @600 DPI project matching the design constant', () => {
    const p = createSpikeProject()
    expect(checkProjectIntegrity(p)).toEqual([])
    expect(getPixelSize(p.canvas.print)).toEqual({ width: DESIGN.width, height: DESIGN.height })
  })

  it('has three photo layers whose photoNumber is independent of their id, one rotated', () => {
    const photos = createSpikeProject().layers.filter((l) => l.type === 'photo')
    expect(photos.map((l) => l.id)).toEqual(['photo-1', 'photo-2', 'photo-3'])
    expect(photos.map((l) => (l.type === 'photo' ? l.photoNumber : 0))).toEqual([1, 2, 3])
    expect(photos.some((l) => l.rotation !== 0)).toBe(true)
  })

  it('contains an off-canvas layer and a flat-model group', () => {
    const p = createSpikeProject()
    expect(p.layers.some((l) => l.x < 0)).toBe(true)
    expect(p.layers.filter((l) => l.parentId === 'group-1')).toHaveLength(2)
  })

  it('stress scenes stay valid at 10/50/100 extra layers', () => {
    for (const n of [10, 50, 100]) expect(checkProjectIntegrity(createStressProject(n))).toEqual([])
  })
})

describe('coverSource (photo fill/crop)', () => {
  it('crops the long side of a wider image centered', () => {
    const s = coverSource({ width: 1600, height: 900 }, 1900, 880)
    expect(s.sw / s.sh).toBeCloseTo(1900 / 880, 9)
    expect(s.sx).toBeCloseTo(0, 9) // width fully used
    expect(s.sy).toBeGreaterThan(0) // top/bottom cropped
    expect(s.sy * 2 + s.sh).toBeCloseTo(900, 9)
  })

  it('crops the sides of a taller image', () => {
    const s = coverSource({ width: 900, height: 1600 }, 1000, 500)
    expect(s.sx).toBeCloseTo(0, 9)
    expect(s.sh).toBeLessThan(1600)
  })
})
