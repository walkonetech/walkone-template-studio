import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  childrenOf,
  descendantIds,
  isEditable,
  isEffectivelyVisible,
  selectableRoot,
  sortedSiblings,
  topLevelLayers,
  type Layer
} from '..'

const shape = (id: string, zIndex: number, extra: Partial<Layer> = {}): Layer =>
  ({
    id,
    type: 'shape',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex,
    visible: true,
    locked: false,
    shape: 'rectangle',
    fill: null,
    stroke: null,
    cornerRadius: 0,
    ...extra
  }) as Layer
const group = (id: string, zIndex: number, extra: Partial<Layer> = {}): Layer =>
  ({ ...shape(id, zIndex), type: 'group', ...extra }) as unknown as Layer

describe('layer tree helpers', () => {
  const layers = [
    shape('b', 2),
    shape('a', 1),
    group('g', 3),
    shape('c1', 0, { parentId: 'g' }),
    group('g2', 1, { parentId: 'g' }),
    shape('c2', 0, { parentId: 'g2' })
  ]

  it('sorts siblings by zIndex and breaks ties by array order', () => {
    expect(topLevelLayers(layers).map((l) => l.id)).toEqual(['a', 'b', 'g'])
    const tied = [shape('x', 1), shape('y', 1), shape('z', 0)]
    expect(sortedSiblings(tied, undefined).map((l) => l.id)).toEqual(['z', 'x', 'y'])
  })

  it('finds children, descendants and ancestors', () => {
    expect(childrenOf(layers, 'g').map((l) => l.id)).toEqual(['c1', 'g2'])
    expect(descendantIds(layers, 'g').sort()).toEqual(['c1', 'c2', 'g2'])
    expect(ancestorsOf(layers, 'c2').map((l) => l.id)).toEqual(['g2', 'g'])
  })

  it('selects the outermost group for nested layers', () => {
    expect(selectableRoot(layers, 'c2')?.id).toBe('g')
    expect(selectableRoot(layers, 'a')?.id).toBe('a')
    expect(selectableRoot(layers, 'nope')).toBeUndefined()
  })

  it('treats a locked or hidden ancestor as locking or hiding its descendants', () => {
    const l2 = layers.map((l) =>
      l.id === 'g' ? ({ ...l, locked: true, visible: false } as Layer) : l
    )
    const c2 = l2.find((l) => l.id === 'c2') as Layer
    expect(isEditable(l2, c2)).toBe(false)
    expect(isEffectivelyVisible(l2, c2)).toBe(false)
    expect(isEditable(layers, c2)).toBe(true)
  })
})
