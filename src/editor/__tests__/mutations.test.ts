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
