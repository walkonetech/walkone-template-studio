import type { TemplateProject } from '../project/project'

export interface AssetUsage {
  /** Image layers drawing this asset. */
  imageLayerIds: string[]
  /** Photo placeholders using it as an editing sample. */
  sampleLayerIds: string[]
  total: number
}

/** Which layers reference an asset. Many layers may share one asset; the asset exists once. */
export function assetUsage(project: TemplateProject, assetId: string): AssetUsage {
  const imageLayerIds: string[] = []
  const sampleLayerIds: string[] = []
  for (const l of project.layers) {
    if (l.type === 'image' && l.assetId === assetId) imageLayerIds.push(l.id)
    else if (l.type === 'photo' && l.sampleAssetId === assetId) sampleLayerIds.push(l.id)
  }
  return { imageLayerIds, sampleLayerIds, total: imageLayerIds.length + sampleLayerIds.length }
}
