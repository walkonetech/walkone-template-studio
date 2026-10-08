import {
  AssetReferenceSchema,
  assetUsage,
  getPixelSize,
  type AssetReference,
  type ColorValue,
  type FitMode,
  type ImageLayer,
  type TemplateProject
} from '@domain'
import {
  addLayer,
  MutationError,
  reorderLayer,
  updateLayer,
  type MutationContext
} from './mutations'
import { createImageLayer } from './imagePlacement'

/**
 * Pure project mutations for project-owned assets and the image workflows built on them. Like every mutation they
 * return a NEW validated project (or the same object when nothing changes) with `updatedAt` refreshed. Asset FILES
 * are handled by the main process; here only `project.assets` and the layers that reference it change.
 */

export class AssetInUseError extends MutationError {
  constructor(
    readonly assetId: string,
    readonly layerCount: number
  ) {
    super(
      `This asset is used by ${layerCount} layer${layerCount === 1 ? '' : 's'}. Delete or change ${layerCount === 1 ? 'that layer' : 'those layers'} first.`
    )
    this.name = 'AssetInUseError'
  }
}

const stamp = (
  project: TemplateProject,
  ctx: MutationContext,
  patch: Partial<TemplateProject>
): TemplateProject => ({
  ...project,
  ...patch,
  metadata: { ...project.metadata, updatedAt: ctx.now ?? new Date().toISOString() }
})

/** Adds assets that are not yet in the project (matched by id; re-adding the same id is a no-op, e.g. after dedup). */
export function addAssets(
  project: TemplateProject,
  assets: readonly AssetReference[],
  ctx: MutationContext = {}
): TemplateProject {
  const fresh: AssetReference[] = []
  for (const a of assets) {
    if (project.assets.some((x) => x.id === a.id) || fresh.some((x) => x.id === a.id)) continue
    const parsed = AssetReferenceSchema.safeParse(a)
    if (!parsed.success) throw new MutationError('The imported asset record is not valid.')
    fresh.push(parsed.data)
  }
  return fresh.length === 0
    ? project
    : stamp(project, ctx, { assets: [...project.assets, ...fresh] })
}

/** Removes an UNUSED asset record. Refuses (AssetInUseError) while any layer references it: no broken references. */
export function removeAsset(
  project: TemplateProject,
  assetId: string,
  ctx: MutationContext = {}
): TemplateProject {
  if (!project.assets.some((a) => a.id === assetId)) return project
  const usage = assetUsage(project, assetId)
  if (usage.total > 0) throw new AssetInUseError(assetId, usage.total)
  return stamp(project, ctx, { assets: project.assets.filter((a) => a.id !== assetId) })
}

/** Adds an ImageLayer for an asset (which must already be in the project). Returns the new layer's id. */
export function addAssetLayer(
  project: TemplateProject,
  assetId: string,
  at: { x: number; y: number } | null,
  ctx: MutationContext = {}
): { project: TemplateProject; layerId: string } {
  const asset = project.assets.find((a) => a.id === assetId)
  if (!asset) throw new MutationError('That asset is not part of the project.')
  const layer = createImageLayer(project, asset, {
    at,
    ...(ctx.createId ? { createLayerId: ctx.createId } : {})
  })
  return { project: addLayer(project, layer, ctx), layerId: layer.id }
}

/** Per-layer replacement: points ONE layer at a different asset; every other layer using the old asset is untouched. */
export function replaceLayerAsset(
  project: TemplateProject,
  layerId: string,
  newAsset: AssetReference,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = project.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'image')
    throw new MutationError('Only image layers have an image to replace.')
  const withAsset = addAssets(project, [newAsset], ctx)
  return updateLayer(withAsset, layerId, { assetId: newAsset.id }, ctx)
}

/** Resizes an image layer to its source pixel size (1 source px = 1 design px), keeping its centre. */
export function setImageOriginalSize(
  project: TemplateProject,
  layerId: string,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = project.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'image')
    throw new MutationError('Only image layers have an original size.')
  const asset = project.assets.find((a) => a.id === layer.assetId)
  if (!asset?.pixelWidth || !asset.pixelHeight)
    throw new MutationError('The image size is unknown.')
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  return updateLayer(
    project,
    layerId,
    {
      width: asset.pixelWidth,
      height: asset.pixelHeight,
      x: Math.round(cx - asset.pixelWidth / 2),
      y: Math.round(cy - asset.pixelHeight / 2),
      fit: 'contain'
    },
    ctx
  )
}

export type BackgroundMode = 'cover' | 'contain' | 'original'

/** Geometry of a background image: fills the artboard (cover), fits inside it (contain) or sits at native size. */
function backgroundPatch(
  project: TemplateProject,
  asset: AssetReference,
  mode: BackgroundMode
): Pick<ImageLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'fit'> {
  const { width: W, height: H } = getPixelSize(project.canvas.print)
  if (mode === 'original' && asset.pixelWidth && asset.pixelHeight) {
    return {
      x: Math.round((W - asset.pixelWidth) / 2),
      y: Math.round((H - asset.pixelHeight) / 2),
      width: asset.pixelWidth,
      height: asset.pixelHeight,
      rotation: 0,
      fit: 'contain'
    }
  }
  return {
    x: 0,
    y: 0,
    width: W,
    height: H,
    rotation: 0,
    fit: mode === 'contain' ? ('contain' as FitMode) : 'cover'
  }
}

/**
 * "Set as Background" for an asset. The design keeps ONE background image layer: if a top-level `background` image
 * layer already exists its asset is replaced (same layer, same undo step), otherwise one is created. The result is an
 * ordinary ImageLayer (role `background`), sized per `mode`, locked, and sent to the back of the top level.
 */
export function setAssetAsBackground(
  project: TemplateProject,
  assetId: string,
  mode: BackgroundMode,
  ctx: MutationContext = {}
): { project: TemplateProject; layerId: string } {
  const asset = project.assets.find((a) => a.id === assetId)
  if (!asset) throw new MutationError('That asset is not part of the project.')
  const patch = backgroundPatch(project, asset, mode)
  const existing = project.layers.find(
    (l) => l.type === 'image' && l.role === 'background' && l.parentId === undefined
  )
  let next: TemplateProject
  let layerId: string
  if (existing) {
    layerId = existing.id
    next = updateLayer(
      project,
      existing.id,
      { assetId, ...patch, locked: false, visible: true },
      ctx
    )
    next = updateLayer(next, existing.id, { locked: true }, ctx)
  } else {
    const base = createImageLayer(
      project,
      asset,
      ctx.createId ? { createLayerId: ctx.createId } : {}
    )
    layerId = base.id
    next = addLayer(
      project,
      { ...base, name: 'Background', role: 'background', ...patch, locked: true },
      ctx
    )
  }
  return { project: reorderLayer(next, layerId, 'back', ctx), layerId }
}

/** "Set as Background" for an existing top-level image layer: it becomes the background-role layer, at the back. */
export function makeLayerBackground(
  project: TemplateProject,
  layerId: string,
  mode: BackgroundMode,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = project.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'image')
    throw new MutationError('Only an image can be set as the background.')
  if (layer.parentId !== undefined)
    throw new MutationError('Move the image out of its group before using it as the background.')
  const asset = project.assets.find((a) => a.id === layer.assetId)
  if (!asset) throw new MutationError('The image asset is missing.')
  let next = updateLayer(
    project,
    layerId,
    { role: 'background', ...backgroundPatch(project, asset, mode), visible: true, locked: false },
    ctx
  )
  next = updateLayer(next, layerId, { locked: true }, ctx)
  return reorderLayer(next, layerId, 'back', ctx)
}

/** Canvas (artboard) background colour: the design's solid fill behind every layer. */
export function setCanvasBackgroundColor(
  project: TemplateProject,
  color: ColorValue,
  ctx: MutationContext = {}
): TemplateProject {
  if (JSON.stringify(project.canvas.backgroundColor) === JSON.stringify(color)) return project
  return stamp(project, ctx, { canvas: { ...project.canvas, backgroundColor: color } })
}
