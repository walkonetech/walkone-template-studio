import { z } from 'zod'
import { IdSchema, IsoTimestampSchema, JsonValueSchema } from '../primitives'

/** Identifier of an adapter that produced preserved data, e.g. `dslrbooth`. */
export const AdapterIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)

/**
 * Opaque, adapter-owned data kept only so a later export can reproduce what an import saw.
 * The editor never interprets it. Project-level values stay in `project`; element-level values
 * are keyed by layer id and exist only where round-tripping needs them.
 */
export const AdapterCompatibilitySchema = z.strictObject({
  /** Adapter/importer version that wrote this block (for staleness decisions). */
  adapterVersion: z.string().max(64).optional(),
  importedAt: IsoTimestampSchema,
  project: z.record(z.string(), JsonValueSchema).optional(),
  layers: z.record(IdSchema, z.record(z.string(), JsonValueSchema)).optional(),
  /** Anything the importer could not map, verbatim. */
  unmapped: z.array(JsonValueSchema).optional()
})
export type AdapterCompatibility = z.infer<typeof AdapterCompatibilitySchema>

/** Optional map of adapter id → preserved data. Absent for native projects. */
export const SourceCompatibilityMetadataSchema = z.record(
  AdapterIdSchema,
  AdapterCompatibilitySchema
)
export type SourceCompatibilityMetadata = z.infer<typeof SourceCompatibilityMetadataSchema>
