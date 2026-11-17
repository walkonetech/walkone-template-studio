import type { AdapterCompatibility, TemplateProject } from '@domain'

/**
 * Adapter data kept per layer (ADR-017, e.g. a dslrBooth element's unknown attributes) must point at a real layer
 * (`checkProjectIntegrity`). Applied after every edit, so deleting an imported layer also drops its entry instead of
 * leaving the project unsavable. Undo restores both together (history holds whole snapshots). Returns the same object
 * when nothing changes.
 */
export function pruneCompatibility(project: TemplateProject): TemplateProject {
  const sc = project.sourceCompatibility
  if (!sc) return project
  const ids = new Set(project.layers.map((l) => l.id))
  let changed = false
  const out: Record<string, AdapterCompatibility> = {}
  for (const [adapter, data] of Object.entries(sc)) {
    const layers = data.layers
    if (!layers || Object.keys(layers).every((id) => ids.has(id))) {
      out[adapter] = data
      continue
    }
    changed = true
    const kept = Object.entries(layers).filter(([id]) => ids.has(id))
    const rest: AdapterCompatibility = { ...data }
    delete rest.layers
    out[adapter] = kept.length > 0 ? { ...rest, layers: Object.fromEntries(kept) } : rest
  }
  return changed ? { ...project, sourceCompatibility: out } : project
}
