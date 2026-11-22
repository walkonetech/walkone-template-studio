import { z } from 'zod'
import { IdSchema, IsoTimestampSchema, NonNegativeNumberSchema } from '../primitives'
import { ColorValueSchema } from '../color/color'
import { PrintConfigurationSchema } from '../print/print'
import { OutputCompositionSchema } from '../print/composition'
import { PaletteSchema } from '../palette/palette'
import { LayerSchema } from '../layers/layers'
import { AssetReferenceSchema } from '../assets/assets'
import { AdapterIdSchema, SourceCompatibilityMetadataSchema } from '../compatibility/compatibility'

/** Marker written into every native project file so unrelated JSON is rejected early. */
export const PROJECT_FORMAT = 'walkone.template-project'
/**
 * Newest native schema version this build reads and writes (ADR-005, schema-version policy in ADR-060).
 * `schemaVersion` in a FILE is the oldest file-format version whose readers can parse that file: writers stamp the
 * lowest version that represents the content (`fileSchemaVersion`). In memory a project is always at this version.
 * - 1: the original format.
 * - 2 (Phase 7B B5.5, ADR-059): adds optional `output.layout` grid `rowGap` / `margins` / `align` and optional
 *   `canvas.safeMarginMm`. A v1 file is a valid v2 file (migration only re-labels it).
 */
export const CURRENT_SCHEMA_VERSION = 2

const optText = z.string().max(2000).optional()

export const ProjectMetadataSchema = z.strictObject({
  name: z.string().min(1).max(200),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  notes: optText
})
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

/** Event categories are extensible strings; this list only seeds UI suggestions. */
export const KNOWN_EVENT_TYPES = [
  'Wedding',
  'Birthday',
  'Sweet 16',
  'Corporate',
  'School',
  'Graduation',
  'Prom',
  'Holiday',
  'Baby Shower',
  'Bridal Shower',
  'Anniversary',
  'Church',
  'Fundraiser',
  'Festival',
  'Sports',
  'Community Event',
  'Custom'
] as const

export const EventMetadataSchema = z.strictObject({
  eventName: optText,
  eventType: z.string().max(100).optional(),
  clientName: optText,
  organization: optText,
  /** Calendar date `YYYY-MM-DD` (no time zone). */
  date: z.iso.date().optional(),
  location: optText,
  cityState: optText,
  subtitle: optText,
  sponsor: optText,
  hashtag: optText,
  notes: optText
})
export type EventMetadata = z.infer<typeof EventMetadataSchema>

export const DesignMetadataSchema = z.strictObject({
  /** Free-form style tags (Elegant, Modern, …). */
  styleTags: z.array(z.string().min(1).max(100)),
  brief: z.string().max(5000).optional()
})
export type DesignMetadata = z.infer<typeof DesignMetadataSchema>

/** The authoring surface. Layer geometry lives in this canvas' pixel space at `print.dpi`. */
export const DesignCanvasSchema = z.strictObject({
  print: PrintConfigurationSchema,
  backgroundColor: ColorValueSchema,
  /**
   * Generic design safe margin in millimetres (Phase 7B B5.5, ADR-059): a format's own "keep important content this
   * far from every design edge" guidance, set by the Custom Size wizard. It is NOT printer evidence; a matching Output
   * Profile's safe areas take precedence. Optional: absent = no generic guidance (every project before B5.5).
   */
  safeMarginMm: NonNegativeNumberSchema.max(50).optional()
})
export type DesignCanvas = z.infer<typeof DesignCanvasSchema>

/** Vendor-neutral export preferences. Exporters are referenced by adapter id, e.g. `dslrbooth`. */
export const ExportSettingsSchema = z.strictObject({
  preferredExporterId: AdapterIdSchema.nullable(),
  includePreview: z.boolean()
})
export type ExportSettings = z.infer<typeof ExportSettingsSchema>

export const TemplateProjectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: IdSchema,
  metadata: ProjectMetadataSchema,
  event: EventMetadataSchema,
  design: DesignMetadataSchema,
  canvas: DesignCanvasSchema,
  output: OutputCompositionSchema,
  palette: PaletteSchema,
  /** Flat list; hierarchy via `parentId`, stacking via `zIndex` among siblings. */
  layers: z.array(LayerSchema),
  assets: z.array(AssetReferenceSchema),
  export: ExportSettingsSchema,
  /** Present only for projects that came from an importer. */
  sourceCompatibility: SourceCompatibilityMetadataSchema.optional()
})
export type TemplateProject = z.infer<typeof TemplateProjectSchema>
