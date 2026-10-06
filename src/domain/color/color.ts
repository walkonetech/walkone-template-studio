import { z } from 'zod'
import { IdSchema } from '../primitives'

/**
 * Canonical serialized color: lowercase hex `#rrggbb` or `#rrggbbaa` (alpha last).
 * Lowercase only, so equal colors always serialize identically.
 */
export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/, {
  message: 'Expected lowercase hex color #rrggbb or #rrggbbaa'
})
export type HexColor = z.infer<typeof HexColorSchema>

/** A color used by a layer: either a literal value or a reference to a palette entry. */
export const ColorValueSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: HexColorSchema }),
  z.strictObject({ kind: z.literal('palette'), paletteColorId: IdSchema })
])
export type ColorValue = z.infer<typeof ColorValueSchema>

export const literalColor = (value: HexColor): ColorValue => ({ kind: 'literal', value })
export const paletteColor = (paletteColorId: string): ColorValue => ({
  kind: 'palette',
  paletteColorId
})
