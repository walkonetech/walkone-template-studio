import { type TemplateProject, type TextLayer } from '@domain'
import { familyKey, primaryFamily } from './fonts'
import { MutationError, updateLayer, type MutationContext } from './mutations'

/** Pure project mutations for typography. The requested family is only ever changed by an explicit user action. */

/**
 * Replace-all: every text layer whose PRIMARY family matches `from` (case-insensitive) requests `to` instead. Nothing
 * else about those layers changes, and other fonts are untouched. Returns the same project when nothing matches.
 */
export function replaceFontFamily(
  project: TemplateProject,
  from: string,
  to: string,
  ctx: MutationContext = {}
): { project: TemplateProject; replaced: number } {
  const target = to.trim()
  if (target === '') throw new MutationError('Choose a font to replace it with.')
  const key = familyKey(from)
  const ids = project.layers
    .filter(
      (l): l is TextLayer => l.type === 'text' && familyKey(primaryFamily(l.fontFamily)) === key
    )
    .map((l) => l.id)
  let next = project
  for (const id of ids) next = updateLayer(next, id, { fontFamily: target }, ctx)
  return { project: next, replaced: ids.length }
}

/** Resizes a text box's HEIGHT to the measured content height (width, font size and everything else are kept). */
export function fitTextHeight(
  project: TemplateProject,
  layerId: string,
  measuredHeight: number,
  ctx: MutationContext = {}
): TemplateProject {
  const layer = project.layers.find((l) => l.id === layerId)
  if (!layer || layer.type !== 'text')
    throw new MutationError('Only text layers can fit their height to content.')
  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0)
    throw new MutationError('The text could not be measured.')
  const height = Math.max(1, Math.round(measuredHeight * 100) / 100)
  return updateLayer(project, layerId, { height }, ctx)
}
