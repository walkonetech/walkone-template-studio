import {
  childrenOf,
  topmostIds,
  createId as defaultCreateId,
  descendantIds,
  LayerSchema,
  nowIso,
  sortedSiblings,
  type ImageLayer,
  type Layer,
  type PhotoLayer,
  type ShapeLayer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import { uniqueName } from './naming'

/**
 * Explicit, pure project mutations. Every function returns a NEW project (structural sharing keeps
 * unchanged layers referentially equal) with `metadata.updatedAt` refreshed, and never edits its
 * input. Results are validated against the domain layer schema, so a mutation cannot produce a layer
 * with the wrong fields. Nothing here knows about Konva, React or selection.
 */

export class MutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MutationError'
  }
}

export interface MutationContext {
  now?: string
  createId?: () => string
}

export interface Geometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface GeometryChange {
  id: string
  geometry: Geometry
  /** Text layers: new font size when a resize scaled the glyphs. */
  fontSize?: number
}

/** Offset applied to a duplicated layer, in design pixels (0.08 in at 600 DPI). */
export const DUPLICATE_OFFSET = 48

type Patch<T> = Partial<Omit<T, 'id' | 'type' | 'parentId'>>
/** Fields that may be patched; the layer's type decides which apply (validated against the schema). */
export type LayerPatch =
  | Patch<PhotoLayer>
  | Patch<ImageLayer>
  | Patch<TextLayer>
  | Patch<ShapeLayer>
  | Patch<Extract<Layer, { type: 'group' }>>

const stamp = (project: TemplateProject, ctx: MutationContext): TemplateProject => ({
  ...project,
  metadata: { ...project.metadata, updatedAt: ctx.now ?? nowIso() }
})

const withLayers = (
  project: TemplateProject,
  layers: Layer[],
  ctx: MutationContext
): TemplateProject => stamp({ ...project, layers }, ctx)

function find(project: TemplateProject, id: string): Layer {
  const layer = project.layers.find((l) => l.id === id)
  if (!layer) throw new MutationError(`Unknown layer ${id}`)
  return layer
}

export const wrapRotation = (deg: number): number => {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}

/** Axis-aligned bounds of a possibly rotated box. */
export function boundsOf(l: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const cx = l.x + l.width / 2
  const cy = l.y + l.height / 2
  const a = (l.rotation * Math.PI) / 180
  const hw = (Math.abs(Math.cos(a)) * l.width + Math.abs(Math.sin(a)) * l.height) / 2
  const hh = (Math.abs(Math.sin(a)) * l.width + Math.abs(Math.cos(a)) * l.height) / 2
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh }
}

/** Re-derives a group's box (rotation 0) from its children, then does the same for its ancestors. */
function recomputeGroupBounds(layers: Layer[], groupId: string | undefined): Layer[] {
  let result = layers
  let current = groupId
  while (current !== undefined) {
    const group = result.find((l) => l.id === current)
    if (!group || group.type !== 'group') break
    const kids = childrenOf(result, group.id)
    if (kids.length > 0) {
      let left = Infinity
      let top = Infinity
      let right = -Infinity
      let bottom = -Infinity
      for (const k of kids) {
        const b = boundsOf(k)
        left = Math.min(left, b.left)
        top = Math.min(top, b.top)
        right = Math.max(right, b.right)
        bottom = Math.max(bottom, b.bottom)
      }
      const next = {
        ...group,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        rotation: 0
      }
      result = result.map((l) => (l.id === group.id ? next : l))
    }
    current = group.parentId
  }
  return result
}

/** Dense zIndex (0..n-1) for one sibling set, preserving current order. */
function normalizeSiblings(layers: Layer[], parentId: string | undefined): Layer[] {
  const order = sortedSiblings(layers, parentId)
  const z = new Map(order.map((l, i) => [l.id, i]))
  return layers.map((l) =>
    l.parentId === parentId && z.get(l.id) !== l.zIndex
      ? { ...l, zIndex: z.get(l.id) as number }
      : l
  )
}

const topZ = (layers: Layer[], parentId: string | undefined): number =>
  layers.filter((l) => l.parentId === parentId).reduce((m, l) => Math.max(m, l.zIndex + 1), 0)

function validate(layer: unknown): Layer {
  const r = LayerSchema.safeParse(layer)
  if (!r.success)
    throw new MutationError(`Invalid layer: ${r.error.issues[0]?.message ?? 'unknown'}`)
  return r.data
}

/** Adds a layer on top of its siblings (zIndex is assigned; the given one is ignored). */
export function addLayer(
  project: TemplateProject,
  layer: Layer,
  ctx: MutationContext = {}
): TemplateProject {
  if (project.layers.some((l) => l.id === layer.id))
    throw new MutationError(`Layer id ${layer.id} already exists`)
  if (layer.parentId !== undefined) {
    const parent = project.layers.find((l) => l.id === layer.parentId)
    if (!parent || parent.type !== 'group')
      throw new MutationError('Parent must be an existing group')
  }
  const added = validate({ ...layer, zIndex: topZ(project.layers, layer.parentId) })
  const layers = recomputeGroupBounds([...project.layers, added], added.parentId)
  return withLayers(project, layers, ctx)
}

/** Patches a layer. Identity (`id`, `type`, `parentId`) cannot be changed here. */
export function updateLayer(
  project: TemplateProject,
  id: string,
  patch: LayerPatch,
  ctx: MutationContext = {}
): TemplateProject {
  for (const forbidden of ['id', 'type', 'parentId']) {
    if (forbidden in patch)
      throw new MutationError(`"${forbidden}" cannot be changed with updateLayer`)
  }
  const current = find(project, id)
  // Idempotent: a patch that changes nothing is a no-op (no new project object, so no history entry).
  const same = (Object.keys(patch) as (keyof typeof patch)[]).every(
    (k) => JSON.stringify((current as Record<string, unknown>)[k]) === JSON.stringify(patch[k])
  )
  if (same) return project
  const merged = validate({ ...current, ...patch })
  let layers = project.layers.map((l) => (l.id === id ? merged : l))
  layers = recomputeGroupBounds(layers, merged.parentId)
  return withLayers(project, layers, ctx)
}

/** Sets x/y/width/height/rotation of one layer (rotation is wrapped to (-180, 180]). */
export function setLayerGeometry(
  project: TemplateProject,
  id: string,
  geometry: Partial<Geometry>,
  ctx: MutationContext = {}
): TemplateProject {
  const patch = { ...geometry }
  if (patch.rotation !== undefined) patch.rotation = wrapRotation(patch.rotation)
  return updateLayer(project, id, patch, ctx)
}

export const resizeLayer = (
  project: TemplateProject,
  id: string,
  width: number,
  height: number,
  ctx: MutationContext = {}
): TemplateProject => setLayerGeometry(project, id, { width, height }, ctx)

export const rotateLayer = (
  project: TemplateProject,
  id: string,
  rotation: number,
  ctx: MutationContext = {}
): TemplateProject => setLayerGeometry(project, id, { rotation }, ctx)

/** Moves a layer by a delta; a group moves all of its descendants (children hold absolute coordinates). */
export function moveLayerBy(
  project: TemplateProject,
  id: string,
  dx: number,
  dy: number,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = find(project, id)
  const moving = new Set([id, ...(layer.type === 'group' ? descendantIds(project.layers, id) : [])])
  let layers = project.layers.map((l) =>
    moving.has(l.id) ? ({ ...l, x: l.x + dx, y: l.y + dy } as Layer) : l
  )
  layers = recomputeGroupBounds(layers, layer.parentId)
  return withLayers(project, layers, ctx)
}

/**
 * Applies the normalized result of ONE canvas interaction (possibly several layers, e.g. the children
 * of a runtime group) as a single mutation, then re-derives affected group bounds.
 */
export function commitGeometry(
  project: TemplateProject,
  changes: readonly GeometryChange[],
  ctx: MutationContext = {}
): TemplateProject {
  if (changes.length === 0) return project
  const byId = new Map(changes.map((c) => [c.id, c]))
  for (const id of byId.keys()) find(project, id)
  const parents = new Set<string>()
  let layers = project.layers.map((l) => {
    const c = byId.get(l.id)
    if (!c) return l
    if (l.parentId !== undefined) parents.add(l.parentId)
    const g = c.geometry
    const next = {
      ...l,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      rotation: wrapRotation(g.rotation),
      ...(c.fontSize !== undefined && l.type === 'text' ? { fontSize: c.fontSize } : {})
    }
    return validate(next)
  })
  for (const p of parents) layers = recomputeGroupBounds(layers, p)
  return withLayers(project, layers, ctx)
}

export const setVisibility = (
  project: TemplateProject,
  id: string,
  visible: boolean,
  ctx: MutationContext = {}
): TemplateProject => updateLayer(project, id, { visible }, ctx)

export const setLocked = (
  project: TemplateProject,
  id: string,
  locked: boolean,
  ctx: MutationContext = {}
): TemplateProject => updateLayer(project, id, { locked }, ctx)

/** Moves a layer to a stacking position among its siblings (0 = back); siblings are renumbered densely. */
export function setLayerZIndex(
  project: TemplateProject,
  id: string,
  position: number,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = find(project, id)
  const order = sortedSiblings(project.layers, layer.parentId).filter((l) => l.id !== id)
  const index = Math.max(0, Math.min(order.length, Math.round(position)))
  order.splice(index, 0, layer)
  const z = new Map(order.map((l, i) => [l.id, i]))
  const layers = project.layers.map((l) =>
    z.has(l.id) && l.parentId === layer.parentId ? { ...l, zIndex: z.get(l.id) as number } : l
  )
  return withLayers(project, layers, ctx)
}

export function reorderLayer(
  project: TemplateProject,
  id: string,
  direction: 'forward' | 'backward' | 'front' | 'back',
  ctx: MutationContext = {}
): TemplateProject {
  const layer = find(project, id)
  const order = sortedSiblings(project.layers, layer.parentId)
  const i = order.findIndex((l) => l.id === id)
  const target =
    direction === 'front'
      ? order.length - 1
      : direction === 'back'
        ? 0
        : direction === 'forward'
          ? i + 1
          : i - 1
  if (target < 0 || target > order.length - 1 || target === i) return project
  return setLayerZIndex(project, id, target, ctx)
}

/**
 * Deletes a layer. Group semantics: deleting a group deletes all of its descendants; deleting the last
 * child of a group removes the (now empty) group too; otherwise the group's bounds are recomputed.
 * No parentId ever dangles.
 */
export function removeLayer(
  project: TemplateProject,
  id: string,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = find(project, id)
  const gone = new Set([id, ...descendantIds(project.layers, id)])
  let layers = project.layers.filter((l) => !gone.has(l.id))
  let parentId = layer.parentId
  while (parentId !== undefined) {
    const parent = layers.find((l) => l.id === parentId)
    if (!parent) break
    if (childrenOf(layers, parent.id).length === 0) {
      layers = layers.filter((l) => l.id !== parent.id)
      parentId = parent.parentId
    } else {
      layers = recomputeGroupBounds(layers, parentId)
      break
    }
  }
  layers = normalizeSiblings(layers, layer.parentId)
  return withLayers(project, layers, ctx)
}

export interface DuplicateResult {
  project: TemplateProject
  /** The new layer (the new group for a group). */
  rootId: string
  newIds: string[]
}

/**
 * Duplicates a layer (and a group's whole subtree) with new ids, offset by DUPLICATE_OFFSET, on top of
 * its siblings. `photoNumber` is deliberately PRESERVED so repeated two-up strips keep repeating the
 * same capture slots; a future explicit action will assign new slots.
 */
export function duplicateLayer(
  project: TemplateProject,
  id: string,
  ctx: MutationContext = {}
): DuplicateResult {
  const root = find(project, id)
  const newId = ctx.createId ?? defaultCreateId
  const subtree = [root, ...descendantIds(project.layers, id).map((d) => find(project, d))]
  const idMap = new Map(subtree.map((l) => [l.id, newId()]))
  const copies = subtree.map((l) => {
    const copy = {
      ...l,
      id: idMap.get(l.id) as string,
      x: l.x + DUPLICATE_OFFSET,
      y: l.y + DUPLICATE_OFFSET,
      ...(l.parentId !== undefined && idMap.has(l.parentId)
        ? { parentId: idMap.get(l.parentId) as string }
        : {}),
      ...(l.id === root.id
        ? { zIndex: topZ(project.layers, root.parentId), name: `${l.name} copy` }
        : {})
    }
    return validate(copy)
  })
  let layers = [...project.layers, ...copies]
  layers = recomputeGroupBounds(layers, root.parentId)
  return {
    project: withLayers(project, layers, ctx),
    rootId: idMap.get(root.id) as string,
    newIds: copies.map((c) => c.id)
  }
}

/** Renames a layer (a label, not an identifier). Empty names are rejected; an unchanged name is a no-op. */
export function renameLayer(
  project: TemplateProject,
  id: string,
  name: string,
  ctx: MutationContext = {}
): TemplateProject {
  const trimmed = name.trim()
  if (trimmed === '') throw new MutationError('A layer name cannot be empty')
  if (find(project, id).name === trimmed) return project
  return updateLayer(project, id, { name: trimmed }, ctx)
}

const renumber = (layers: Layer[], order: Layer[], parentId: string | undefined): Layer[] => {
  const z = new Map(order.map((l, i) => [l.id, i]))
  return layers.map((l) =>
    l.parentId === parentId && z.has(l.id) && z.get(l.id) !== l.zIndex
      ? { ...l, zIndex: z.get(l.id) as number }
      : l
  )
}

/**
 * Moves a layer directly in front of ('above') or behind ('below') a SIBLING. Cross-parent moves are not
 * supported (a child can never be dragged out of its group by this).
 */
export function moveLayerRelative(
  project: TemplateProject,
  id: string,
  targetId: string,
  placement: 'above' | 'below',
  ctx: MutationContext = {}
): TemplateProject {
  if (id === targetId) return project
  const layer = find(project, id)
  const target = find(project, targetId)
  if (layer.parentId !== target.parentId)
    throw new MutationError('Layers can only be reordered within the same group')
  const before = sortedSiblings(project.layers, layer.parentId)
  const order = before.filter((l) => l.id !== id)
  const ti = order.findIndex((l) => l.id === targetId)
  order.splice(placement === 'above' ? ti + 1 : ti, 0, layer)
  if (order.every((l, i) => l.id === before[i]?.id)) return project
  return withLayers(project, renumber(project.layers, order, layer.parentId), ctx)
}

/** Stacking command for one or more SIBLING layers, moving them as a block while keeping their relative order. */
export function reorderLayers(
  project: TemplateProject,
  ids: readonly string[],
  direction: 'forward' | 'backward' | 'front' | 'back',
  ctx: MutationContext = {}
): TemplateProject {
  if (ids.length === 0) return project
  const first = find(project, ids[0] as string)
  for (const id of ids) {
    if (find(project, id).parentId !== first.parentId)
      throw new MutationError('Select layers that share the same group to reorder them')
  }
  const picked = new Set(ids)
  const before = sortedSiblings(project.layers, first.parentId)
  let arr = [...before]
  const sel = before.filter((l) => picked.has(l.id))
  const rest = before.filter((l) => !picked.has(l.id))
  if (direction === 'front') arr = [...rest, ...sel]
  else if (direction === 'back') arr = [...sel, ...rest]
  else if (direction === 'forward') {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (picked.has((arr[i] as Layer).id) && !picked.has((arr[i + 1] as Layer).id))
        [arr[i], arr[i + 1]] = [arr[i + 1] as Layer, arr[i] as Layer]
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (picked.has((arr[i] as Layer).id) && !picked.has((arr[i - 1] as Layer).id))
        [arr[i], arr[i - 1]] = [arr[i - 1] as Layer, arr[i] as Layer]
    }
  }
  if (arr.every((l, i) => l.id === before[i]?.id)) return project
  return withLayers(project, renumber(project.layers, arr, first.parentId), ctx)
}

export interface GroupResult {
  project: TemplateProject
  groupId: string
}

/**
 * Groups sibling layers under a new GroupLayer. Children keep their absolute coordinates (so nothing moves
 * visually); the group takes the stacking position of the topmost member; members are renumbered 0..n-1 in
 * their previous relative order. Layers that are not siblings cannot be grouped together.
 */
export function groupLayers(
  project: TemplateProject,
  ids: readonly string[],
  ctx: MutationContext = {}
): GroupResult {
  const roots = topmostIds(project.layers, ids)
  if (roots.length === 0) throw new MutationError('Nothing to group')
  const members = roots.map((id) => find(project, id))
  const parentId = members[0]?.parentId
  if (members.some((m) => m.parentId !== parentId))
    throw new MutationError('Select layers that share the same group to group them')
  const ordered = sortedSiblings(project.layers, parentId).filter((l) => roots.includes(l.id))
  const newId = (ctx.createId ?? defaultCreateId)()
  const topZ = Math.max(...ordered.map((l) => l.zIndex))
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const l of ordered) {
    const b = boundsOf(l)
    left = Math.min(left, b.left)
    top = Math.min(top, b.top)
    right = Math.max(right, b.right)
    bottom = Math.max(bottom, b.bottom)
  }
  const group = validate({
    id: newId,
    type: 'group',
    name: uniqueName('Group', project.layers),
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rotation: 0,
    opacity: 1,
    zIndex: topZ,
    visible: true,
    locked: false,
    ...(parentId !== undefined ? { parentId } : {})
  })
  const index = new Map(ordered.map((l, i) => [l.id, i]))
  let layers: Layer[] = project.layers.map((l) =>
    index.has(l.id) ? validate({ ...l, parentId: newId, zIndex: index.get(l.id) as number }) : l
  )
  layers = [...layers, group]
  layers = normalizeSiblings(layers, parentId)
  return { project: withLayers(project, layers, ctx), groupId: newId }
}

export interface UngroupResult {
  project: TemplateProject
  childIds: string[]
}

/**
 * Dissolves a group. Children return to the group's parent, replacing the group in the stacking order (keeping
 * their relative order) with dense zIndex. Because the group's own flags would otherwise be lost, they are folded
 * into the children so nothing changes visually: opacity multiplies, hidden/locked propagate.
 */
export function ungroupLayer(
  project: TemplateProject,
  groupId: string,
  ctx: MutationContext = {}
): UngroupResult {
  const group = find(project, groupId)
  if (group.type !== 'group') throw new MutationError('Only a group can be ungrouped')
  const kids = childrenOf(project.layers, groupId)
  const parentId = group.parentId
  const order: Layer[] = []
  for (const sibling of sortedSiblings(project.layers, parentId)) {
    if (sibling.id === groupId) order.push(...kids)
    else order.push(sibling)
  }
  const z = new Map(order.map((l, i) => [l.id, i]))
  const kidIds = new Set(kids.map((k) => k.id))
  const layers: Layer[] = []
  for (const l of project.layers) {
    if (l.id === groupId) continue
    if (kidIds.has(l.id)) {
      const { parentId: _drop, ...rest } = l
      void _drop
      layers.push(
        validate({
          ...rest,
          ...(parentId !== undefined ? { parentId } : {}),
          zIndex: z.get(l.id) as number,
          opacity: Math.round(l.opacity * group.opacity * 10000) / 10000,
          visible: l.visible && group.visible,
          locked: l.locked || group.locked
        })
      )
    } else if (l.parentId === parentId && z.has(l.id)) {
      layers.push({ ...l, zIndex: z.get(l.id) as number })
    } else layers.push(l)
  }
  const result = recomputeGroupBounds(layers, parentId)
  return { project: withLayers(project, result, ctx), childIds: kids.map((k) => k.id) }
}
