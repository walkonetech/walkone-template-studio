import { z } from 'zod'

/**
 * Output Profile (ADR-053): what a printer, its driver settings and its media do to a print — the physical sheet, cut
 * positions, the expected loss at each edge (trim / overscan), the recommended keep-safe margins, finishing results
 * and setup guidance. A profile is NOT part of `TemplateProject`: templates stay vendor-neutral and printer-neutral,
 * and the same template can be checked against different profiles. Standalone Template Studio and the future WalkOne
 * Booth read the same format.
 *
 * Every physical value carries its evidence, because most of them start as observations or estimates and become
 * measurements later. A value that is not known yet is `null` with evidence `unknown`; updating a profile when a
 * measurement arrives is a data change, never a code change.
 */

export const OUTPUT_PROFILE_FORMAT = 'walkone.output-profile'
export const OUTPUT_PROFILE_FORMAT_VERSION = 1

/** How much a value can be trusted, weakest first. */
export const EVIDENCE_LEVELS = [
  'unknown',
  'nominal',
  'inferred',
  'provisional',
  'observed-test-laptop',
  'owner-measured',
  'verified-production'
] as const
export const EvidenceSchema = z.enum(EVIDENCE_LEVELS)
export type Evidence = z.infer<typeof EvidenceSchema>

export const EVIDENCE_LABELS: Readonly<Record<Evidence, string>> = {
  unknown: 'Unknown',
  nominal: 'Nominal',
  inferred: 'Inferred',
  provisional: 'Provisional',
  'observed-test-laptop': 'Observed on test laptop',
  'owner-measured': 'Owner-measured',
  'verified-production': 'Verified on production booth'
}

/** One-line explanation of each level, for the profile readout. */
export const EVIDENCE_HINTS: Readonly<Record<Evidence, string>> = {
  unknown: 'Not known yet.',
  nominal: 'The size the media is sold as.',
  inferred: 'Estimated from other observations; not measured on a print.',
  provisional: 'Interim guidance until a measurement replaces it.',
  'observed-test-laptop':
    'Seen at runtime on the Windows research laptop, not the production booth PC.',
  'owner-measured': 'Measured by the owner on a physical print.',
  'verified-production': 'Verified on the production booth PC and printer.'
}

/** True for evidence that a physical measurement or production check stands behind. */
export const isVerifiedEvidence = (e: Evidence): boolean =>
  e === 'owner-measured' || e === 'verified-production'

const Text = z.string().trim().min(1).max(500)
const Note = z.string().trim().min(1).max(1000).optional()
const IsoDate = z.iso.date()
const Mm = z.number().finite().min(0).max(1000)

/** A value with its evidence. `null` means "not known yet" and requires evidence `unknown` (and vice versa). */
function measured<V>(value: z.ZodType<V>) {
  return z
    .strictObject({ value: value.nullable(), evidence: EvidenceSchema, note: Note })
    .refine((m) => (m.value === null) === (m.evidence === 'unknown'), {
      message: 'A value is null exactly when its evidence is "unknown"'
    })
}
const MeasuredMm = measured(Mm)
const MeasuredText = measured(Text)
export type Measured<T> = { value: T | null; evidence: Evidence; note?: string | undefined }

const SizeMm = z.strictObject({ width: Mm.positive(), height: Mm.positive() })

export const CutSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Shown in checks and the overlay, e.g. "2-inch centre cut". */
  label: Text,
  /** 'x' = a vertical cut at `positionIn` from the sheet's left edge; 'y' = horizontal, from the top. */
  axis: z.enum(['x', 'y']),
  positionIn: z.number().finite().positive().max(100),
  evidence: EvidenceSchema,
  note: Note
})
export type OutputCut = z.infer<typeof CutSchema>

export const OutputProfileSchema = z
  .strictObject({
    format: z.literal(OUTPUT_PROFILE_FORMAT),
    formatVersion: z.literal(OUTPUT_PROFILE_FORMAT_VERSION),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: Text,
    /** Compact name for the status bar, e.g. "DNP DS-RX1". */
    shortName: z.string().trim().min(1).max(40),
    description: Text,
    /** The profile's overall status: never stronger than what was actually observed, measured or verified. */
    confidence: EvidenceSchema,
    /** Printer, when the profile describes one. */
    device: z
      .strictObject({
        manufacturer: Text,
        model: Text,
        driverVersion: MeasuredText
      })
      .nullable(),
    media: z.strictObject({
      name: Text,
      nominalMm: SizeMm,
      /** Page size the driver reported for the print job (may be larger than the paper: overscan). */
      driverPageMm: measured(SizeMm)
    }),
    /** The print sheet in Template Studio's orientation (the project's output print size). */
    sheet: z.strictObject({
      widthIn: z.number().finite().positive().max(100),
      heightIn: z.number().finite().positive().max(100)
    }),
    /** What the sheet holds: one design, or copies of one strip in a grid (two-up 2×6 = 2 columns, 1 row). */
    composition: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('single') }),
      z.strictObject({
        mode: z.literal('copies'),
        columns: z.number().int().min(1).max(8),
        rows: z.number().int().min(1).max(8)
      })
    ]),
    borderless: measured(z.boolean()),
    cuts: z.array(CutSchema).max(16),
    /** Expected loss from each sheet edge, and on each side of a cut (trim / overscan / cut tolerance), in mm. */
    trimMm: z.strictObject({
      top: MeasuredMm,
      bottom: MeasuredMm,
      left: MeasuredMm,
      right: MeasuredMm,
      cut: MeasuredMm
    }),
    /** Recommended keep-safe distance for critical content, from the sheet edges and from each cut, in mm. */
    safeMarginMm: z.strictObject({ edge: MeasuredMm, cut: MeasuredMm }),
    /** Finishing results read from a measurement print (pending until the readout arrives). */
    finishing: z.strictObject({
      autoCut: MeasuredText,
      cutOnSeam: MeasuredText,
      gutter: MeasuredText
    }),
    setup: z.array(Text).max(20),
    /** Where and when the profile's observations were made. */
    observedEnvironment: Text.nullable(),
    observedDate: IsoDate.nullable(),
    /** Where and when the profile was verified on real production equipment (null until then). */
    verifiedEnvironment: Text.nullable(),
    verifiedDate: IsoDate.nullable(),
    notes: z.array(Text).max(20)
  })
  .superRefine((p, ctx) => {
    for (const [i, c] of p.cuts.entries()) {
      const limit = c.axis === 'x' ? p.sheet.widthIn : p.sheet.heightIn
      if (c.positionIn >= limit)
        ctx.addIssue({
          code: 'custom',
          path: ['cuts', i, 'positionIn'],
          message: `Cut “${c.label}” lies outside the ${p.sheet.widthIn}×${p.sheet.heightIn} in sheet`
        })
    }
    if (new Set(p.cuts.map((c) => c.id)).size !== p.cuts.length)
      ctx.addIssue({ code: 'custom', path: ['cuts'], message: 'Cut ids must be unique' })
    if ((p.verifiedEnvironment === null) !== (p.verifiedDate === null))
      ctx.addIssue({
        code: 'custom',
        path: ['verifiedDate'],
        message: 'A verified environment and date go together'
      })
  })
export type OutputProfile = z.infer<typeof OutputProfileSchema>

export type ProfileParseResult = { ok: true; profile: OutputProfile } | { ok: false; error: string }

/** Validates untrusted profile data (a bundled JSON file today; a user profile store later). */
export function parseOutputProfile(data: unknown): ProfileParseResult {
  const r = OutputProfileSchema.safeParse(data)
  if (r.success) return { ok: true, profile: r.data }
  const first = r.error.issues[0]
  return {
    ok: false,
    error: first ? `${first.path.join('.') || 'profile'}: ${first.message}` : 'Invalid profile'
  }
}

const trimNumber = (n: number): string => String(Math.round(n * 100) / 100)

/** "2×6" for a two-up strip sheet, "4×6" for a single sheet: what a designer prints with this profile. */
export function profileDesignSize(p: OutputProfile): string {
  const cols = p.composition.mode === 'copies' ? p.composition.columns : 1
  const rows = p.composition.mode === 'copies' ? p.composition.rows : 1
  return `${trimNumber(p.sheet.widthIn / cols)}×${trimNumber(p.sheet.heightIn / rows)}`
}

/** Compact status text, e.g. "DNP DS-RX1 · 2×6 · Provisional". */
export function profileStatusLabel(p: OutputProfile): string {
  return `${p.shortName} · ${profileDesignSize(p)} · ${EVIDENCE_LABELS[p.confidence]}`
}
