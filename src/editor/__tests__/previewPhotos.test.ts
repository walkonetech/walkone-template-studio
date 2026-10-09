import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_SAMPLES,
  initialPreviewPhotos,
  isBuiltInSample,
  resetPreviewPhotos,
  sampleIdFor,
  sampleOrder,
  setSampleOverride,
  shufflePreviewPhotos
} from '../previewPhotos'

describe('sample catalogue', () => {
  it('has distinct ids and mixed aspect ratios (so cover/contain are exercised)', () => {
    const ids = BUILT_IN_SAMPLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const aspects = new Set(BUILT_IN_SAMPLES.map((s) => Math.sign(s.width - s.height)))
    expect(aspects).toEqual(new Set([-1, 0, 1]))
  })
})

describe('PhotoNumber → sample mapping', () => {
  const state = initialPreviewPhotos()
  it('numbers map to samples in catalogue order', () => {
    expect(sampleIdFor(1, state)).toBe(BUILT_IN_SAMPLES[0]?.id)
    expect(sampleIdFor(2, state)).toBe(BUILT_IN_SAMPLES[1]?.id)
    expect(sampleIdFor(3, state)).toBe(BUILT_IN_SAMPLES[2]?.id)
  })
  it('a repeated PhotoNumber (two layers, or both copies of a two-up sheet) uses the same sample', () => {
    expect(sampleIdFor(1, state)).toBe(sampleIdFor(1, state))
    const sheet = [1, 2, 3, 1, 2, 3].map((n) => sampleIdFor(n, state))
    expect(sheet.slice(0, 3)).toEqual(sheet.slice(3))
  })
  it('wraps around the catalogue for high numbers', () => {
    expect(sampleIdFor(BUILT_IN_SAMPLES.length + 1, state)).toBe(sampleIdFor(1, state))
  })
  it('an explicit choice wins and affects only that number', () => {
    const s = setSampleOverride(state, 2, 'sample-city')
    expect(sampleIdFor(2, s)).toBe('sample-city')
    expect(sampleIdFor(1, s)).toBe(sampleIdFor(1, state))
  })
})

describe('shuffle and reset', () => {
  it('shuffle is deterministic per seed, a permutation, and changes the assignment', () => {
    const a = sampleOrder(1)
    expect(sampleOrder(1)).toEqual(a)
    expect([...a].sort()).toEqual(BUILT_IN_SAMPLES.map((s) => s.id).sort())
    expect(a).not.toEqual(sampleOrder(0))
    const shuffled = shufflePreviewPhotos(
      setSampleOverride(initialPreviewPhotos(), 1, 'sample-city')
    )
    expect(shuffled.seed).toBe(1)
    expect(shuffled.overrides).toEqual({}) // documented: a shuffle replaces explicit choices
  })
  it('repeated shuffles keep PhotoNumber-based mapping (same number → same sample)', () => {
    const s = shufflePreviewPhotos(shufflePreviewPhotos(initialPreviewPhotos()))
    expect(sampleIdFor(2, s)).toBe(sampleIdFor(2, s))
    expect(isBuiltInSample(sampleIdFor(2, s))).toBe(true)
  })
  it('reset restores the defaults', () => {
    expect(resetPreviewPhotos()).toEqual(initialPreviewPhotos())
  })
})
