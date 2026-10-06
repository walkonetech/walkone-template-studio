import {
  childrenOf,
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
