import { describe, expect, it } from 'vitest'
import type Konva from 'konva'
import type { Layer } from '@domain'
import { photo, shape, text } from '../../../editor/__tests__/helpers'
import { commitGroupNode, commitTopLevelNode } from '../konvaCommit'
import { snapDraggedNode } from '../konvaSnap'

/** Minimal duck-typed Konva node: only what the adapters read/write. */
function fakeNode(
  a: Record<string, number | string>,
  extra: Record<string, unknown> = {}
): Konva.Node {
  const attrs: Record<string, number | string> = { scaleX: 1, scaleY: 1, rotation: 0, ...a }
  const node = {
    id: () => String(attrs.id),
    x: () => Number(attrs.x),
    y: () => Number(attrs.y),
    width: () => Number(attrs.width),
    height: () => Number(attrs.height),
    scaleX: () => Number(attrs.scaleX),
    scaleY: () => Number(attrs.scaleY),
    rotation: () => Number(attrs.rotation),
    getClassName: () => 'Shape',
    scale: (s: { x: number; y: number }) => {
      attrs.scaleX = s.x
      attrs.scaleY = s.y
    },
    ...extra
  }
  return node as unknown as Konva.Node
}

describe('commitTopLevelNode', () => {
  it('folds a Konva scale into domain width/height and resets the node scale', () => {
    const layer = photo('p', 1, { x: 400, y: 2000, width: 800, height: 400 }) as Layer
    // center-origin node: x,y are the center; width 800 with scaleX 1.37 (the example from the brief)
    const node = fakeNode({ id: 'p', x: 800, y: 2200, width: 800, height: 400, scaleX: 1.37 })
    const change = commitTopLevelNode(node, layer)
    expect(change.geometry.width).toBeCloseTo(1096, 3)
    expect(change.geometry.height).toBe(400)
    expect(change.geometry.x + change.geometry.width / 2).toBeCloseTo(800, 3)
    expect(node.scaleX()).toBe(1)
    expect(node.scaleY()).toBe(1)
  })

  it('text keeps the scale convention: fontSize × scaleY', () => {
    const layer = text('t', 0) as Layer
    const node = fakeNode({
      id: 't',
      x: 1200,
      y: 3100,
      width: 2000,
      height: 170,
      scaleX: 1,
      scaleY: 1.5
    })
    const change = commitTopLevelNode(node, layer)
    expect(change.fontSize).toBe(225)
  })
})

describe('commitGroupNode', () => {
  it('reads each child in design space (removing the stage view) and resets the group', () => {
    const layers = [
      { ...shape('g', 0), type: 'group' } as unknown as Layer,
      shape('c1', 0, { parentId: 'g', x: 100, y: 100, width: 50, height: 40 })
    ]
    const reset: string[] = []
    // stage view: scale 0.5 offset (10,20); child absolute matrix = view × (translate 100,100) → [0.5,0,0,0.5, 10+50, 20+50]
    const child = fakeNode(
      { id: 'c1', width: 50, height: 40 },
      { getAbsoluteTransform: () => ({ getMatrix: () => [0.5, 0, 0, 0.5, 60, 70] }) }
    )
    const group = {
      getStage: () => ({
        getAbsoluteTransform: () => ({ getMatrix: () => [0.5, 0, 0, 0.5, 10, 20] })
      }),
      getChildren: () => [child],
      position: () => reset.push('position'),
      rotation: () => reset.push('rotation'),
      scale: () => reset.push('scale')
    } as unknown as Konva.Group
    const changes = commitGroupNode(group, layers)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.geometry).toEqual({ x: 100, y: 100, width: 50, height: 40, rotation: 0 })
    expect(reset).toEqual(['position', 'rotation', 'scale'])
  })
})

describe('snapDraggedNode', () => {
  const rectNode = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Record<string, unknown> = {}
  ): Konva.Node =>
    ({
      id: () => id,
      visible: () => true,
      getClientRect: () => ({ x, y, width: w, height: h }),
      ...extra
    }) as unknown as Konva.Node

  it('uses a screen-pixel tolerance converted to design units (zoom independent)', () => {
    const dragged = rectNode('d', 1190, 500, 1000, 400)
    const other = rectNode('o', 0, 0, 10, 10)
    const layer = { getChildren: () => [dragged, other] }
    ;(dragged as unknown as { getLayer: () => unknown }).getLayer = () => layer
    const design = { width: 2400, height: 3600 }
    // 10 screen px at scale 1 => 10 design px: center x is 1690 vs design center 1200 (no snap), left 1190 vs 1200 (snap +10)
    const atOne = snapDraggedNode(dragged, design, { scale: 1, offsetX: 0, offsetY: 0 }, 10)
    expect(atOne?.dx).toBe(10)
    // zoomed far out (scale 0.1) the same 10 screen px is 100 design px: snaps to center-of-design too / nearest wins
    const out = snapDraggedNode(dragged, design, { scale: 0.1, offsetX: 0, offsetY: 0 }, 10)
    expect(Math.abs(out?.dx ?? 0)).toBeLessThanOrEqual(100)
    // far from anything at scale 1: no snap
    const far = rectNode('f', 700, 700, 100, 100)
    ;(far as unknown as { getLayer: () => unknown }).getLayer = () => ({ getChildren: () => [far] })
    expect(snapDraggedNode(far, design, { scale: 1, offsetX: 0, offsetY: 0 }, 10)).toMatchObject({
      dx: 0,
      dy: 0,
      guides: []
    })
  })

  it('returns null when the node has no layer', () => {
    const n = rectNode('x', 0, 0, 1, 1, { getLayer: () => null })
    expect(
      snapDraggedNode(n, { width: 10, height: 10 }, { scale: 1, offsetX: 0, offsetY: 0 }, 10)
    ).toBeNull()
  })
})
