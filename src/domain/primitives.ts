import { z } from 'zod'

/** Stable opaque identifier. Generated as UUIDv4; validated only as a bounded non-empty string. */
export const IdSchema = z.string().min(1).max(128)
export type Id = z.infer<typeof IdSchema>

/** ISO 8601 UTC instant, e.g. `2026-10-06T14:39:58.771Z`. */
export const IsoTimestampSchema = z.iso.datetime()
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>

/** Finite number (rejects NaN and ±Infinity). */
export const FiniteNumberSchema = z.number().finite()

export const NonNegativeNumberSchema = FiniteNumberSchema.min(0)

export const PositiveNumberSchema = FiniteNumberSchema.positive()

/** Plain JSON-compatible value; used for opaque preserved data. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    FiniteNumberSchema,
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema)
  ])
)

/** Creates a new identifier. Uses the runtime's built-in UUID generator (Node and browsers). */
export function createId(): Id {
  return globalThis.crypto.randomUUID()
}

/** Current time as an ISO 8601 UTC string. */
export function nowIso(): IsoTimestamp {
  return new Date().toISOString()
}
