import { z } from 'zod'
import { IdSchema } from '../primitives'

export const ASSET_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const
export const AssetMediaTypeSchema = z.enum(ASSET_MEDIA_TYPES)
export type AssetMediaType = z.infer<typeof AssetMediaTypeSchema>

/**
 * Project-relative POSIX path inside the project package (e.g. `assets/<id>.png`).
 * Absolute paths, drive letters, backslashes, empty or `.`/`..` segments are rejected so a
 * project never depends on a location outside itself.
 */
export const ProjectRelativePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !/^[a-zA-Z]:/.test(p) &&
      !p.includes('\0') &&
      p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..'),
    { message: 'Must be a relative POSIX path without empty, "." or ".." segments' }
  )

export const AssetSourceSchema = z.strictObject({
  kind: z.enum(['upload', 'library', 'import', 'provider']),
  /** Free-form origin label, e.g. provider name or importing adapter. */
  label: z.string().max(200).optional(),
  licenseNote: z.string().max(2000).optional()
})
export type AssetSource = z.infer<typeof AssetSourceSchema>

/** Domain description of one stored asset file. Not the file itself. */
export const AssetReferenceSchema = z.strictObject({
  id: IdSchema,
  /** Original or display filename (not used for identity or lookup). */
  filename: z.string().min(1).max(255),
  mediaType: AssetMediaTypeSchema,
  /** Location of the stored file within the project package. */
  path: ProjectRelativePathSchema,
  /** Pixel size of the stored raster. Absent when unknown or for SVG. */
  pixelWidth: z.number().int().positive().optional(),
  pixelHeight: z.number().int().positive().optional(),
  hasAlpha: z.boolean().optional(),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  source: AssetSourceSchema
})
export type AssetReference = z.infer<typeof AssetReferenceSchema>
