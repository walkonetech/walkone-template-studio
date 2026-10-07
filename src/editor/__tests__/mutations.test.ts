import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type Layer, type TemplateProject } from '@domain'
import {
  addLayer,
  commitGeometry,
  DUPLICATE_OFFSET,
  duplicateLayer,
  moveLayerBy,
  MutationError,
  removeLayer,
  reorderLayer,
  resizeLayer,
  rotateLayer,
  setLayerGeometry,
  setLayerZIndex,
  setLocked,
  setVisibility,
  updateLayer
} from '../mutations'
import { group, makeProject, photo, scene, shape, T0, text } from './helpers'

const NOW = '2026-02-02T00:00:00.000Z'
const ctx = { now: NOW }
const valid = (p: TemplateProject): void => expect(checkProjectIntegrity(p)).toEqual([])
const get = (p: TemplateProject, id: string): Layer => p.layers.find((l) => l.id === id) as Layer

describe('mutations are pure, validated and stamp updatedAt', () => {
  it('never mutate their input and refresh updatedAt', () => {
    const p = scene()
    const before = JSON.stringify(p)
    const q = updateLayer(p, 'photo-1', { name: 'Renamed' }, ctx)
    expect(JSON.stringify(p)).toBe(before)
    expect(q.metadata.updatedAt).toBe(NOW)
    expect(p.metadata.updatedAt).toBe(T0)
    valid(q)
  })

  it('keeps unchanged layers referentially equal (structural sharing)', () => {
    const p = scene()
    const q = updateLayer(p, 'photo-1', { name: 'X' }, ctx)
    expect(get(q, 'photo-2')).toBe(get(p, 'photo-2'))
    expect(get(q, 'photo-1')).not.toBe(get(p, 'photo-1'))
  })

  it('rejects identity changes and fields that do not belong to the layer type', () => {
    const p = scene()
    expect(() => updateLayer(p, 'photo-1', { id: 'x' } as never)).toThrow(MutationError)
    expect(() => updateLayer(p, 'photo-1', { parentId: 'g' } as never)).toThrow(MutationError)
    expect(() => updateLayer(p, 'bg-bar', { photoNumber: 3 } as never)).toThrow(MutationError)
    expect(() => updateLayer(p, 'photo-1', { opacity: 2 })).toThrow(MutationError)
    expect(() => updateLayer(p, 'nope', { name: 'x' })).toThrow(MutationError)
  })
})

describe('add / update / remove', () => {
  it('adds on top of siblings and rejects duplicate ids and bad parents', () => {
    const p = scene()
    const q = addLayer(p, shape('new', 0), ctx)
    expect(get(q, 'new').zIndex).toBe(
      Math.max(...p.layers.filter((l) => !l.parentId).map((l) => l.zIndex)) + 1
    )
    valid(q)
    expect(() => addLayer(q, shape('new', 0))).toThrow(MutationError)
    expect(() => addLayer(p, shape('x', 0, { parentId: 'photo-1' }))).toThrow(MutationError)
  })

  it('adding into a group recomputes the group box', () => {
    const p = scene()
    const q = addLayer(
      p,
      shape('g-c', 0, { parentId: 'g', x: 1600, y: 900, width: 100, height: 100 }),
      ctx
    )
    const g = get(q, 'g')
    expect(g.x).toBe(1000)
    expect(g.y).toBe(900)
    expect(g.x + g.width).toBe(1700)
    valid(q)
  })

  it('removes a layer and keeps sibling zIndex dense', () => {
    const p = scene()
    const q = removeLayer(p, 'photo-1', ctx)
    expect(q.layers.some((l) => l.id === 'photo-1')).toBe(false)
    const top = q.layers
      .filter((l) => !l.parentId)
      .map((l) => l.zIndex)
      .sort((a, b) => a - b)
    expect(top).toEqual([...top.keys()])
    valid(q)
  })
})

describe('geometry: move / resize / rotate / commit', () => {
  it('sets geometry and wraps rotation', () => {
    const p = scene()
    const q = setLayerGeometry(
      p,
      'photo-1',
      { x: -250, y: -40, width: 500, height: 300, rotation: 270 },
      ctx
    )
    expect(get(q, 'photo-1')).toMatchObject({
      x: -250,
      y: -40,
      width: 500,
      height: 300,
      rotation: -90
    })
    valid(q)
    expect(get(resizeLayer(p, 'photo-1', 10, 20), 'photo-1')).toMatchObject({
      width: 10,
      height: 20
    })
    expect(get(rotateLayer(p, 'photo-1', 725), 'photo-1').rotation).toBe(5)
  })

  it('allows off-canvas and negative coordinates', () => {
    const q = moveLayerBy(scene(), 'photo-1', -5000, 9000, ctx)
    expect(get(q, 'photo-1').x).toBe(250 - 5000)
    valid(q)
  })

  it('commits one interaction touching several layers atomically', () => {
    const p = scene()
    const q = commitGeometry(
      p,
      [
        { id: 'g-a', geometry: { x: 1100, y: 1100, width: 200, height: 300, rotation: 0 } },
        { id: 'g-b', geometry: { x: 1300, y: 1100, width: 200, height: 300, rotation: 0 } }
      ],
      ctx
    )
    expect(get(q, 'g')).toMatchObject({ x: 1100, y: 1100, width: 400, height: 300, rotation: 0 })
    valid(q)
    expect(commitGeometry(p, [])).toBe(p)
  })

  it('applies a text fontSize from a corner resize', () => {
    const q = commitGeometry(scene(), [
      { id: 'title', geometry: { x: 0, y: 0, width: 100, height: 50, rotation: 0 }, fontSize: 222 }
    ])
    expect(get(q, 'title')).toMatchObject({ fontSize: 222, width: 100 })
  })
})

describe('visibility, lock, z-order', () => {
  it('toggles visibility and lock without touching geometry', () => {
    const p = scene()
    const q = setLocked(setVisibility(p, 'photo-1', false, ctx), 'photo-1', true, ctx)
    expect(get(q, 'photo-1')).toMatchObject({ visible: false, locked: true, x: 250 })
    valid(q)
  })

  it('reorders among siblings only and keeps zIndex dense and unique', () => {
    let p = scene()
    p = reorderLayer(p, 'photo-1', 'front', ctx)
    const top = p.layers.filter((l) => !l.parentId).sort((a, b) => a.zIndex - b.zIndex)
    expect(top[top.length - 1]?.id).toBe('photo-1')
    expect(top.map((l) => l.zIndex)).toEqual([...top.keys()])
    valid(p)
    p = reorderLayer(p, 'photo-1', 'back')
    expect(p.layers.filter((l) => !l.parentId).sort((a, b) => a.zIndex - b.zIndex)[0]?.id).toBe(
      'photo-1'
    )
    // children of a group are ordered independently
    const q = reorderLayer(p, 'g-a', 'front')
    expect(get(q, 'g-a').zIndex).toBe(1)
    expect(get(q, 'g-b').zIndex).toBe(0)
    valid(q)
  })

  it('forward/backward at the ends is a no-op and returns the same project', () => {
    const p = scene()
    const topId = p.layers.filter((l) => !l.parentId).sort((a, b) => b.zIndex - a.zIndex)[0]
      ?.id as string
    expect(reorderLayer(p, topId, 'forward')).toBe(p)
  })

  it('setLayerZIndex clamps its position', () => {
    const p = setLayerZIndex(scene(), 'photo-1', 999)
    valid(p)
    expect(get(p, 'photo-1').zIndex).toBe(p.layers.filter((l) => !l.parentId).length - 1)
  })
})

describe('duplicate', () => {
  it('creates a new id, offsets position, preserves photoNumber and puts the copy on top', () => {
    let n = 0
    const r = duplicateLayer(scene(), 'photo-2', { now: NOW, createId: () => `dup-${++n}` })
    const copy = get(r.project, r.rootId)
    expect(r.rootId).toBe('dup-1')
    expect(copy).toMatchObject({
      type: 'photo',
      photoNumber: 2,
      x: 250 + DUPLICATE_OFFSET,
      y: 400 + DUPLICATE_OFFSET,
      name: 'Photo 2 copy'
    })
    expect(get(r.project, 'photo-2')).toMatchObject({ x: 250, photoNumber: 2 })
    valid(r.project)
    const siblings = r.project.layers.filter((l) => !l.parentId)
    expect(Math.max(...siblings.map((l) => l.zIndex))).toBe(copy.zIndex)
    expect(new Set(r.project.layers.map((l) => l.id)).size).toBe(r.project.layers.length)
  })

  it('repeated duplicates keep repeating the same capture slot', () => {
    let n = 0
    const createId = () => `d${++n}`
    let p = scene()
    for (let i = 0; i < 3; i++) p = duplicateLayer(p, 'photo-1', { createId }).project
    expect(p.layers.filter((l) => l.type === 'photo' && l.photoNumber === 1)).toHaveLength(4)
    valid(p)
  })

  it('duplicates a group with its whole subtree and remaps parent ids', () => {
    let n = 0
    const r = duplicateLayer(scene(), 'g', { createId: () => `c${++n}` })
    expect(r.newIds).toHaveLength(3)
    const newGroup = get(r.project, r.rootId)
    const kids = r.project.layers.filter((l) => l.parentId === newGroup.id)
    expect(kids).toHaveLength(2)
    expect(r.project.layers.filter((l) => l.parentId === 'g')).toHaveLength(2) // original untouched
    valid(r.project)
  })
})

describe('groups', () => {
  it('moving a group moves every descendant and the group box by the same delta', () => {
    const p = scene()
    const q = moveLayerBy(p, 'g', 30, -20, ctx)
    for (const id of ['g', 'g-a', 'g-b']) {
      expect(get(q, id).x).toBe(get(p, id).x + 30)
      expect(get(q, id).y).toBe(get(p, id).y - 20)
    }
    valid(q)
  })

  it('deleting a group deletes its descendants (no dangling parentId)', () => {
    const q = removeLayer(scene(), 'g', ctx)
    expect(q.layers.some((l) => ['g', 'g-a', 'g-b'].includes(l.id))).toBe(false)
    valid(q)
  })

  it('deleting one child recomputes bounds; deleting the last child removes the empty group', () => {
    const one = removeLayer(scene(), 'g-a', ctx)
    expect(get(one, 'g')).toMatchObject({ x: 1200, width: 200 })
    valid(one)
    const none = removeLayer(one, 'g-b', ctx)
    expect(none.layers.some((l) => l.id === 'g')).toBe(false)
    valid(none)
  })

  it('moving a child updates the parent group bounds', () => {
    const q = moveLayerBy(scene(), 'g-b', 500, 0, ctx)
    expect(get(q, 'g')).toMatchObject({ x: 1000, width: 900 })
  })
})

describe('text layers', () => {
  it('updates content only through the schema-validated patch', () => {
    const p = makeProject([text('t', 0)])
    expect(get(updateLayer(p, 't', { content: 'Hi\nthere' }), 't')).toMatchObject({
      content: 'Hi\nthere'
    })
    expect(() => updateLayer(p, 't', { fontSize: -1 })).toThrow(MutationError)
  })

  it('photo helper sanity', () => {
    expect(group('x', 0).type).toBe('group')
    expect(photo('p', 1).type).toBe('photo')
  })
})

import {
  groupLayers,
  moveLayerRelative,
  renameLayer,
  reorderLayers,
  ungroupLayer
} from '../mutations'

const order = (p: TemplateProject, parent?: string): string[] =>
  p.layers
    .filter((l) => l.parentId === parent)
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => l.id)

describe('rename', () => {
  it('trims, allows duplicates, rejects empty, and an unchanged name is a no-op', () => {
    const p = scene()
    expect(get(renameLayer(p, 'photo-1', '  Hero  ', ctx), 'photo-1').name).toBe('Hero')
    const dup = renameLayer(p, 'photo-1', 'Photo 2', ctx)
    expect(get(dup, 'photo-1').name).toBe('Photo 2')
    expect(get(dup, 'photo-1').id).toBe('photo-1') // name is a label, not an identifier
    expect(() => renameLayer(p, 'photo-1', '   ')).toThrow(MutationError)
    expect(renameLayer(p, 'photo-1', 'Photo 1')).toBe(p)
  })
})

describe('reorder relative to a sibling and as a block', () => {
  it('moveLayerRelative puts a layer directly above/below a sibling', () => {
    const p = scene()
    const top = order(p)
    const q = moveLayerRelative(p, top[0] as string, top[3] as string, 'above', ctx)
    expect(order(q).indexOf(top[0] as string)).toBe(order(q).indexOf(top[3] as string) + 1)
    valid(q)
    const r = moveLayerRelative(q, top[0] as string, top[3] as string, 'below', ctx)
    expect(order(r).indexOf(top[0] as string)).toBe(order(r).indexOf(top[3] as string) - 1)
    valid(r)
    expect(moveLayerRelative(p, top[1] as string, top[1] as string, 'above')).toBe(p)
  })

  it('refuses to move a layer out of (or into) another group', () => {
    expect(() => moveLayerRelative(scene(), 'g-a', 'photo-1', 'above')).toThrow(MutationError)
  })

  it('a no-op reorder returns the same project object (no history entry)', () => {
    const p = scene()
    const top = order(p)
    expect(moveLayerRelative(p, top[2] as string, top[1] as string, 'above')).toBe(p)
  })

  it('reorderLayers moves a block, keeps relative order and stays within the parent', () => {
    const p = scene()
    const q = reorderLayers(p, ['photo-1', 'photo-3'], 'front', ctx)
    const o = order(q)
    expect(o.slice(-2)).toEqual(['photo-1', 'photo-3'])
    valid(q)
    const back = reorderLayers(p, ['photo-2', 'photo-3'], 'back', ctx)
    expect(order(back).slice(0, 2)).toEqual(['photo-2', 'photo-3'])
    const fwd = reorderLayers(p, ['photo-1'], 'forward', ctx)
    expect(order(fwd).indexOf('photo-1')).toBe(order(p).indexOf('photo-1') + 1)
    const bwd = reorderLayers(p, ['photo-3'], 'backward', ctx)
    expect(order(bwd).indexOf('photo-3')).toBe(order(p).indexOf('photo-3') - 1)
    expect(() => reorderLayers(p, ['photo-1', 'g-a'], 'front')).toThrow(MutationError)
  })

  it('children never leave their group when reordered', () => {
    const q = reorderLayers(scene(), ['g-a'], 'front', ctx)
    expect(get(q, 'g-a').parentId).toBe('g')
    expect(order(q, 'g')).toEqual(['g-b', 'g-a'])
    valid(q)
  })

  it('zIndex stays dense and unique after every command', () => {
    let p = scene()
    for (const d of ['front', 'back', 'forward', 'backward'] as const) {
      p = reorderLayers(p, ['photo-2'], d, ctx)
      const z = p.layers
        .filter((l) => !l.parentId)
        .map((l) => l.zIndex)
        .sort((a, b) => a - b)
      expect(z).toEqual([...z.keys()])
    }
  })
})

describe('group and ungroup', () => {
  it('groups siblings without moving them, taking the topmost stacking slot', () => {
    let n = 0
    const p = scene()
    const r = groupLayers(p, ['photo-1', 'photo-2'], { now: NOW, createId: () => `grp-${++n}` })
    const q = r.project
    valid(q)
    expect(get(q, 'photo-1')).toMatchObject({ parentId: r.groupId, x: 250, y: 200 })
    expect(get(q, 'photo-2')).toMatchObject({ parentId: r.groupId })
    expect(order(q, r.groupId)).toEqual(['photo-1', 'photo-2'])
    const grp = get(q, r.groupId)
    expect(grp).toMatchObject({ type: 'group', rotation: 0 })
    // the group sits where photo-2 (the topmost member) was; other layers keep their relative order
    expect(order(q)).toEqual(['bg-bar', r.groupId, 'photo-3', 'title', 'g'])
  })

  it('rejects grouping layers from different parents', () => {
    expect(() => groupLayers(scene(), ['photo-1', 'g-a'])).toThrow(MutationError)
  })

  it('grouping a group and its own child groups only the group (no double handling)', () => {
    const r = groupLayers(scene(), ['g', 'g-a', 'photo-1'], { createId: () => 'wrap' })
    valid(r.project)
    expect(get(r.project, 'g').parentId).toBe('wrap')
    expect(get(r.project, 'g-a').parentId).toBe('g')
  })

  it('ungroup restores children to the parent in place with dense zIndex and unchanged positions', () => {
    const p = scene()
    const before = (id: string) => ({ x: get(p, id).x, y: get(p, id).y })
    const r = ungroupLayer(p, 'g', ctx)
    valid(r.project)
    expect(r.project.layers.some((l) => l.id === 'g')).toBe(false)
    expect(r.childIds.sort()).toEqual(['g-a', 'g-b'])
    for (const id of r.childIds) expect(get(r.project, id)).toMatchObject({ ...before(id) })
    expect(get(r.project, 'g-a').parentId).toBeUndefined()
    const o = order(r.project)
    expect(o.slice(-2)).toEqual(['g-a', 'g-b']) // the group was on top; its children replace it in order
    const z = r.project.layers
      .filter((l) => !l.parentId)
      .map((l) => l.zIndex)
      .sort((a, b) => a - b)
    expect(z).toEqual([...z.keys()])
  })

  it('ungroup folds the group flags into children so the picture does not change', () => {
    const p = {
      ...scene(),
      layers: scene().layers.map((l) =>
        l.id === 'g' ? ({ ...l, opacity: 0.5, locked: true, visible: false } as Layer) : l
      )
    }
    const r = ungroupLayer(p, 'g')
    expect(get(r.project, 'g-a')).toMatchObject({ opacity: 0.5, locked: true, visible: false })
    valid(r.project)
  })

  it('group then ungroup round-trips structure', () => {
    const p = scene()
    const g = groupLayers(p, ['photo-1', 'photo-2', 'photo-3'], { createId: () => 'tmp' })
    const u = ungroupLayer(g.project, 'tmp')
    valid(u.project)
    expect(order(u.project)).toEqual(order(p))
  })

  it('ungroup of a non-group is rejected', () => {
    expect(() => ungroupLayer(scene(), 'photo-1')).toThrow(MutationError)
  })
})

describe('idempotent updates', () => {
  it('a patch that changes nothing returns the same project (so no history entry can be created)', () => {
    const p = scene()
    expect(updateLayer(p, 'photo-1', { x: get(p, 'photo-1').x })).toBe(p)
    expect(
      updateLayer(p, 'photo-1', {
        frame: { style: 'solid', thickness: 12, color: { kind: 'literal', value: '#ffffff' } }
      })
    ).toBe(p)
    expect(updateLayer(p, 'photo-1', { x: 5 })).not.toBe(p)
  })
})
