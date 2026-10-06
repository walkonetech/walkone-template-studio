import type { ColorValue, Palette } from '@domain'

/** Shown when a palette reference cannot be resolved (never silently invisible). */
export const MISSING_COLOR = '#ff00ff'

export function resolveColor(palette: Palette, color: ColorValue): string {
  if (color.kind === 'literal') return color.value
  return palette.colors.find((c) => c.id === color.paletteColorId)?.value ?? MISSING_COLOR
}
