import type { TemplateProject } from '@domain'
import { fontInventory, type FontEnvironment, type InventoryEntry } from './fonts'
import {
  brokenPaletteReferences,
  paletteReferences,
  type PaletteReference
} from './paletteMutations'

/**
 * Pure foundation for a future export preflight (no screen yet): which fonts the project requests and which are
 * missing here, and which palette references exist or are broken. Nothing here modifies the project.
 */
export interface TypographyPreflight {
  fontsUsed: InventoryEntry[]
  fontsMissing: InventoryEntry[]
  fontsUnknown: InventoryEntry[]
}
export interface PalettePreflight {
  references: { paletteColorId: string; name: string; refs: PaletteReference[] }[]
  broken: { paletteColorId: string; ref: PaletteReference }[]
}

export function typographyPreflight(
  project: TemplateProject,
  env: FontEnvironment
): TypographyPreflight {
  const inv = fontInventory(project, env)
  return {
    fontsUsed: inv.entries,
    fontsMissing: inv.entries.filter((e) => e.availability === 'missing'),
    fontsUnknown: inv.entries.filter((e) => e.availability === 'unknown')
  }
}

export function palettePreflight(project: TemplateProject): PalettePreflight {
  return {
    references: project.palette.colors
      .map((c) => ({ paletteColorId: c.id, name: c.name, refs: paletteReferences(project, c.id) }))
      .filter((r) => r.refs.length > 0),
    broken: brokenPaletteReferences(project)
  }
}
