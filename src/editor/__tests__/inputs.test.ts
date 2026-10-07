import { describe, expect, it } from 'vitest'
import {
  formatNumber,
  normalizeHex,
  opacityToPercent,
  parseNumberInput,
  percentToOpacity,
  roundTo
} from '../numberInput'
import { rangeIds, toggleId } from '../selection'
import { createNewLayer, nextPhotoNumber } from '../newLayers'
import { uniqueName } from '../naming'
import { checkProjectIntegrity, topmostIds } from '@domain'
import { addLayer } from '../mutations'
import { makeProject, photo, scene, shape } from './helpers'

describe('numeric field parsing (commit-time only)', () => {
  it('accepts normal numbers, negatives and decimals', () => {
    expect(parseNumberInput('120')).toEqual({ ok: true, value: 120 })
    expect(parseNumberInput('-250')).toEqual({ ok: true, value: -250 })
    expect(parseNumberInput(' 12.5 px ')).toEqual({ ok: true, value: 12.5 })
    expect(parseNumberInput('1,5')).toEqual({ ok: true, value: 1.5 })
    expect(parseNumberInput('.5')).toEqual({ ok: true, value: 0.5 })
    expect(parseNumberInput('1.23456')).toEqual({ ok: true, value: 1.235 })
  })

  it('rejects partial and invalid input', () => {
    for (const bad of ['', '-', '.', '1.2.3', 'abc', '1e5', '--1', 'NaN', 'Infinity']) {
      expect(parseNumberInput(bad).ok, bad).toBe(false)
    }
  })

  it('enforces positive, min/max and integer rules', () => {
    expect(parseNumberInput('0', { positive: true }).ok).toBe(false)
    expect(parseNumberInput('-5', { positive: true }).ok).toBe(false)
    expect(parseNumberInput('0.5', { positive: true }).ok).toBe(true)
    expect(parseNumberInput('101', { min: 0, max: 100 }).ok).toBe(false)
    expect(parseNumberInput('3.5', { integer: true }).ok).toBe(false)
    expect(parseNumberInput('3', { integer: true, min: 1 })).toEqual({ ok: true, value: 3 })
    expect(parseNumberInput('0', { integer: true, min: 1 }).ok).toBe(false)
  })

  it('formats without trailing zeros and converts opacity at the UI boundary only', () => {
    expect(formatNumber(12.5)).toBe('12.5')
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(1.23456)).toBe('1.235')
    expect(opacityToPercent(0.55)).toBe(55)
    expect(percentToOpacity(55)).toBe(0.55)
    expect(roundTo(-0.0001)).toBe(0)
  })

  it('normalizes hex colors to the canonical lowercase form', () => {
    expect(normalizeHex('#ABCDEF')).toBe('#abcdef')
    expect(normalizeHex('abc')).toBe('#aabbcc')
    expect(normalizeHex('#ABCD')).toBe('#aabbccdd')
    expect(normalizeHex('#11223344')).toBe('#11223344')
    expect(normalizeHex('#12345')).toBeNull()
    expect(normalizeHex('red')).toBeNull()
  })
})

describe('selection helpers', () => {
  it('toggles ids and computes inclusive ranges in either direction', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
    const order = ['a', 'b', 'c', 'd']
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(order, null, 'c')).toEqual(['c'])
    expect(rangeIds(order, 'zzz', 'c')).toEqual(['c'])
    expect(rangeIds(order, 'a', 'zzz')).toEqual([])
  })

  it('topmostIds drops descendants whose ancestor is also selected', () => {
    const { layers } = scene()
    expect(topmostIds(layers, ['g', 'g-a', 'photo-1'])).toEqual(['g', 'photo-1'])
    expect(topmostIds(layers, ['g-a', 'g-b'])).toEqual(['g-a', 'g-b'])
  })
})

describe('new layers', () => {
  it('a NEW photo gets the next capture slot: max photoNumber + 1', () => {
    expect(nextPhotoNumber([])).toBe(1)
    expect(nextPhotoNumber(scene().layers)).toBe(4)
    expect(nextPhotoNumber([photo('a', 1), photo('b', 1), photo('c', 7)])).toBe(8) // repeated numbers allowed
  })

  it('every kind is valid, visible inside the design, uniquely identified and named', () => {
    let n = 0
    let project = scene()
    for (const kind of ['photo', 'text', 'rectangle', 'ellipse', 'line'] as const) {
      const layer = createNewLayer(project, kind, () => `new-${++n}`)
      expect(layer.x + layer.width).toBeGreaterThan(0)
      expect(layer.x).toBeGreaterThanOrEqual(0)
      expect(layer.x + layer.width).toBeLessThanOrEqual(2400)
      project = addLayer(project, layer)
    }
    expect(checkProjectIntegrity(project)).toEqual([])
    expect(new Set(project.layers.map((l) => l.id)).size).toBe(project.layers.length)
  })

  it('works on a 2x6 strip too', () => {
    const strip = makeProject([], 'strip-2x6-600')
    const l = createNewLayer(strip, 'photo', () => 'x')
    expect(l.width).toBeLessThanOrEqual(1200)
    expect(l).toMatchObject({ type: 'photo', photoNumber: 1 })
  })

  it('uniqueName numbers duplicates but never blocks them', () => {
    expect(uniqueName('Rectangle', [])).toBe('Rectangle')
    expect(uniqueName('Rectangle', [shape('a', 0, { name: 'Rectangle' })])).toBe('Rectangle 2')
    expect(
      uniqueName('Rectangle', [
        shape('a', 0, { name: 'Rectangle' }),
        shape('b', 1, { name: 'Rectangle 2' })
      ])
    ).toBe('Rectangle 3')
  })
})
