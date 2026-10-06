import { z } from 'zod'
import { IdSchema } from '../primitives'
import { HexColorSchema } from '../color/color'

/** Semantic roles. `custom` entries are free-form extra colors. */
export const PALETTE_ROLES = [
  'primary',
  'secondary',
  'accent',
  'background',
  'text',
  'custom'
] as const
export const PaletteRoleSchema = z.enum(PALETTE_ROLES)
export type PaletteRole = z.infer<typeof PaletteRoleSchema>

export const PaletteColorSchema = z.strictObject({
  id: IdSchema,
  role: PaletteRoleSchema,
  name: z.string().min(1).max(100),
  value: HexColorSchema
})
export type PaletteColor = z.infer<typeof PaletteColorSchema>

/** A project need not define every role; each non-custom role may appear at most once. */
export const PaletteSchema = z.strictObject({
  colors: z.array(PaletteColorSchema)
})
export type Palette = z.infer<typeof PaletteSchema>
