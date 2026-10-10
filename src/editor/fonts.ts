import type { Layer, TemplateProject, TextLayer } from '@domain'

/**
 * Typography logic that does not depend on Electron or the DOM: how a requested font family is turned into a render
 * stack, how availability is decided from an injected "environment", the project font inventory and the font picker's
 * search. The TextLayer always stores the family the designer ASKED for; nothing here rewrites it (ADR-039).
 */

export {
  FALLBACK_STACK,
  GENERIC_FAMILIES,
  cssFontFamily,
  familyKey,
  isGenericFamily,
  primaryFamily,
  renderFontFamily
} from '@canvas/rendering/fontStack'
import {
  familyKey,
  isGenericFamily,
  primaryFamily,
  GENERIC_FAMILIES
} from '@canvas/rendering/fontStack'

// ------------------------------------------------------------------------------------------------ availability

export type FontCatalogStatus = 'loading' | 'ready' | 'unavailable' | 'denied'

export interface FontCatalog {
  status: FontCatalogStatus
  /** Installed family names (sorted, unique). Meaningful only when status is 'ready'. */
  families: readonly string[]
}

export interface FontEnvironment {
  catalog: FontCatalog
  /**
   * Fallback detection when the catalog is not ready: does the machine render this family differently from its
   * generic fallback? (A measurement probe; may be absent in tests.) `null` = cannot tell.
   */
  probe?: (family: string) => boolean | null
}

export type FontAvailability = 'available' | 'missing' | 'unknown'

export interface FontStatus {
  availability: FontAvailability
  /** How it was decided: a generic family, the installed-font list, or a measurement probe. */
  basis: 'generic' | 'catalog' | 'probe' | 'none'
}

export function fontStatus(requested: string, env: FontEnvironment): FontStatus {
  const family = primaryFamily(requested)
  if (family === '' || isGenericFamily(family))
    return { availability: 'available', basis: 'generic' }
  if (env.catalog.status === 'ready') {
    const key = familyKey(family)
    const has = env.catalog.families.some((f) => familyKey(f) === key)
    return { availability: has ? 'available' : 'missing', basis: 'catalog' }
  }
  const probed = env.probe ? env.probe(family) : null
  if (probed === null) return { availability: 'unknown', basis: 'none' }
  return { availability: probed ? 'available' : 'missing', basis: 'probe' }
}

// ------------------------------------------------------------------------------------------------ inventory

export interface ProjectFont {
  /** The family exactly as requested by the first layer that uses it. */
  family: string
  /** Text layers requesting it (any spelling/case of the same family). */
  layerIds: string[]
}

const isText = (l: Layer): l is TextLayer => l.type === 'text'

/** Unique fonts the project asks for, in order of first use. Generic families are included (they are always fine). */
export function collectProjectFonts(layers: readonly Layer[]): ProjectFont[] {
  const byKey = new Map<string, ProjectFont>()
  for (const l of layers.filter(isText)) {
    const family = primaryFamily(l.fontFamily) || l.fontFamily
    const key = familyKey(family)
    const entry = byKey.get(key)
    if (entry) entry.layerIds.push(l.id)
    else byKey.set(key, { family, layerIds: [l.id] })
  }
  return [...byKey.values()]
}

export interface InventoryEntry extends ProjectFont {
  availability: FontAvailability
  basis: FontStatus['basis']
}

export interface FontInventory {
  entries: InventoryEntry[]
  total: number
  missing: number
  unknown: number
}

export function fontInventory(project: TemplateProject, env: FontEnvironment): FontInventory {
  const entries = collectProjectFonts(project.layers).map((f) => ({
    ...f,
    ...fontStatus(f.family, env)
  }))
  return {
    entries,
    total: entries.length,
    missing: entries.filter((e) => e.availability === 'missing').length,
    unknown: entries.filter((e) => e.availability === 'unknown').length
  }
}

// ------------------------------------------------------------------------------------------------ picker search

export interface FontOption {
  family: string
  kind: 'installed' | 'generic' | 'current-missing' | 'manual'
}

/** Case-insensitive substring match on the family name ("garamond" → EB Garamond, Cormorant Garamond). */
export function searchFonts(query: string, families: readonly string[]): string[] {
  const q = query.trim().toLowerCase()
  return q === '' ? [...families] : families.filter((f) => f.toLowerCase().includes(q))
}

/**
 * Options for the font picker: the installed families that match (alphabetical), the generic families that match, the
 * CURRENT font if it is not installed (so an unavailable requested family stays visible and selectable), and, when
 * something was typed that matches nothing exactly, a "use this name" manual entry. Browsing never changes anything.
 */
export function fontOptions(opts: {
  query: string
  installed: readonly string[]
  current: string
  catalogReady: boolean
}): FontOption[] {
  const { query, installed, current, catalogReady } = opts
  const out: FontOption[] = []
  const currentPrimary = primaryFamily(current)
  const sorted = [...new Set(installed)].sort((a, b) => a.localeCompare(b))
  const matches = searchFonts(query, sorted)
  const generics = searchFonts(query, GENERIC_FAMILIES)
  const has = (name: string): boolean => out.some((o) => familyKey(o.family) === familyKey(name))
  const currentMatches =
    query.trim() === '' || currentPrimary.toLowerCase().includes(query.trim().toLowerCase())
  const currentInstalled = sorted.some((f) => familyKey(f) === familyKey(currentPrimary))
  if (
    currentPrimary &&
    !isGenericFamily(currentPrimary) &&
    !currentInstalled &&
    currentMatches &&
    catalogReady
  ) {
    out.push({ family: currentPrimary, kind: 'current-missing' })
  }
  for (const g of generics) out.push({ family: g, kind: 'generic' })
  for (const f of matches) if (!has(f)) out.push({ family: f, kind: 'installed' })
  const q = query.trim()
  if (q !== '' && !has(q) && !isGenericFamily(q)) out.push({ family: q, kind: 'manual' })
  return out
}

/** Common cross-platform families offered (after a probe) when the installed list cannot be enumerated. */
export const COMMON_FAMILIES: readonly string[] = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Palatino',
  'Garamond',
  'Didot',
  'Bodoni 72',
  'Snell Roundhand',
  'Brush Script MT',
  'Segoe UI',
  'Calibri',
  'Cambria',
  'Impact'
]
