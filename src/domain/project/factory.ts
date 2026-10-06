import { createId, nowIso, type Id, type IsoTimestamp } from '../primitives'
import { literalColor } from '../color/color'
import { createSingleOutput, type OutputComposition } from '../print/composition'
import { getPrintPreset, type PrintConfiguration, type PrintPresetId } from '../print/print'
import { CURRENT_SCHEMA_VERSION, PROJECT_FORMAT, type TemplateProject } from './project'

export interface CreateProjectOptions {
  name: string
  /** Design canvas size: a preset id or an explicit configuration. */
  design: PrintPresetId | PrintConfiguration
  /** Defaults to a single-up output equal to the design. */
  output?: OutputComposition
  /** Injectable for deterministic tests. */
  now?: IsoTimestamp
  createId?: () => Id
}

/** Creates a valid, empty project (no layers, no assets, white background). */
export function createProject(options: CreateProjectOptions): TemplateProject {
  const newId = options.createId ?? createId
  const now = options.now ?? nowIso()
  const print =
    typeof options.design === 'string' ? getPrintPreset(options.design) : { ...options.design }
  return {
    format: PROJECT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    metadata: { name: options.name, createdAt: now, updatedAt: now },
    event: {},
    design: { styleTags: [] },
    canvas: { print, backgroundColor: literalColor('#ffffff') },
    output: options.output ?? createSingleOutput(print),
    palette: { colors: [] },
    layers: [],
    assets: [],
    export: { preferredExporterId: null, includePreview: true }
  }
}
