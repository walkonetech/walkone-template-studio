import type { Palette, PaletteRole, TextLayer } from '@domain'
import type { LayerPatch } from './mutations'

/**
 * Quick typography presets: application-level conveniences (NOT saved project styles yet; groundwork for Badge Builder
 * and Templates). Applying one patches the selected text layer in a single undo step. Fonts are preference lists ending
 * in a generic family, resolved against what is installed, so no specific commercial font is ever assumed.
 */
export interface TextPreset {
  id: string
  label: string
  hint: string
  /** Preferred families, best first; the last is always generic. */
  fonts: readonly string[]
  /** Font size as a fraction of the design height (so it suits 300 and 600 DPI and any print size). */
  sizeFraction: number
  weight: TextLayer['fontWeight']
  style: TextLayer['fontStyle']
  align: TextLayer['align']
  /** Letter spacing in em (× font size). */
  letterSpacingEm: number
  lineHeight: number
  /** Palette role to link the colour to when the palette has it. */
  role: Exclude<PaletteRole, 'custom'> | null
}

export const TEXT_PRESETS: readonly TextPreset[] = [
  {
    id: 'title',
    label: 'Title',
    hint: 'Large serif headline',
    fonts: ['Didot', 'Georgia', 'Times New Roman', 'serif'],
    sizeFraction: 0.05,
    weight: 700,
    style: 'normal',
    align: 'center',
    letterSpacingEm: 0.02,
    lineHeight: 1.1,
    role: 'text'
  },
  {
    id: 'names',
    label: 'Names / Script',
    hint: 'Flowing script for names',
    fonts: ['Snell Roundhand', 'Brush Script MT', 'Segoe Script', 'cursive'],
    sizeFraction: 0.065,
    weight: 400,
    style: 'normal',
    align: 'center',
    letterSpacingEm: 0,
    lineHeight: 1.1,
    role: 'accent'
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    hint: 'Italic serif line under a title',
    fonts: ['Georgia', 'Palatino', 'Times New Roman', 'serif'],
    sizeFraction: 0.028,
    weight: 400,
    style: 'italic',
    align: 'center',
    letterSpacingEm: 0.01,
    lineHeight: 1.2,
    role: 'text'
  },
  {
    id: 'date',
    label: 'Date',
    hint: 'Spaced capitals-style sans line',
    fonts: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
    sizeFraction: 0.026,
    weight: 600,
    style: 'normal',
    align: 'center',
    letterSpacingEm: 0.14,
    lineHeight: 1.2,
    role: 'text'
  },
  {
    id: 'location',
    label: 'Location',
    hint: 'Small sans line',
    fonts: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
    sizeFraction: 0.02,
    weight: 400,
    style: 'normal',
    align: 'center',
    letterSpacingEm: 0.08,
    lineHeight: 1.25,
    role: 'text'
  },
  {
    id: 'caption',
    label: 'Caption',
    hint: 'Small italic note',
    fonts: ['Georgia', 'Times New Roman', 'serif'],
    sizeFraction: 0.016,
    weight: 400,
    style: 'italic',
    align: 'center',
    letterSpacingEm: 0,
    lineHeight: 1.3,
    role: 'text'
  }
]

export function presetPatch(
  preset: TextPreset,
  ctx: { designHeight: number; isAvailable: (family: string) => boolean; palette: Palette }
): LayerPatch {
  const fontFamily =
    preset.fonts.find((f) => ctx.isAvailable(f)) ??
    (preset.fonts[preset.fonts.length - 1] as string)
  const fontSize = Math.max(8, Math.round(ctx.designHeight * preset.sizeFraction))
  const entry = preset.role ? ctx.palette.colors.find((c) => c.role === preset.role) : undefined
  return {
    fontFamily,
    fontSize,
    fontWeight: preset.weight,
    fontStyle: preset.style,
    align: preset.align,
    letterSpacing: Math.round(fontSize * preset.letterSpacingEm * 100) / 100,
    lineHeight: preset.lineHeight,
    // Only link the colour when the project has that role; otherwise the layer keeps its current colour.
    ...(entry ? { fill: { kind: 'palette' as const, paletteColorId: entry.id } } : {})
  }
}
