import { describe, expect, it } from 'vitest'
import type { Layer } from '@domain'
import { scene } from '../../../editor/__tests__/helpers'
import { transformTargets } from '../targets'

describe('transformTargets', () => {
  const layers = scene().layers
  it('returns selected topmost layers only', () => {
    expect(transformTargets(layers, ['g', 'g-a', 'photo-1']).map((l) => l.id)).toEqual([
      'g',
      'photo-1'
    ])
  })
  it('excludes locked (directly or via a parent) and hidden layers', () => {
    const locked = layers.map((l) =>
      l.id === 'g'
        ? ({ ...l, locked: true } as Layer)
        : l.id === 'photo-2'
          ? ({ ...l, visible: false } as Layer)
          : l
    )
    expect(transformTargets(locked, ['g-a', 'photo-2', 'photo-1']).map((l) => l.id)).toEqual([
      'photo-1'
    ])
  })
  it('a child selected on its own is a valid target', () => {
    expect(transformTargets(layers, ['g-b']).map((l) => l.id)).toEqual(['g-b'])
  })
  it('ignores unknown ids', () => {
    expect(transformTargets(layers, ['nope'])).toEqual([])
  })
})
