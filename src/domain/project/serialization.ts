import type { z } from 'zod'
import { JsonValueSchema, type JsonValue } from '../primitives'
import { checkProjectIntegrity, type ProjectIssue } from '../validation/integrity'
import { CURRENT_SCHEMA_VERSION, TemplateProjectSchema, type TemplateProject } from './project'

export type LoadResult =
  { ok: true; project: TemplateProject } | { ok: false; errors: ProjectIssue[] }

/**
 * Migrations from schema version N to N+1, keyed by N. Empty while only version 1 exists.
 * Add an entry (plus a fixture and test) in the same change that bumps CURRENT_SCHEMA_VERSION.
 */
const MIGRATIONS: Readonly<
  Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>
> = {}

function fail(code: string, path: string, message: string): LoadResult {
  return { ok: false, errors: [{ code, path, message }] }
}

function zodIssues(error: z.ZodError): ProjectIssue[] {
  return error.issues.map((i) => ({
    code: 'schema',
    path: i.path
      .map((p, idx) => (typeof p === 'number' ? `[${p}]` : idx === 0 ? String(p) : `.${String(p)}`))
      .join(''),
    message: i.message
  }))
}

/**
 * Detect version → migrate → validate (schema, then integrity) → current model.
 * Never throws for bad input; unknown fields are rejected, not dropped.
 */
export function loadProject(raw: unknown): LoadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('not-an-object', '', 'Project data must be a JSON object')
  }
  let doc = raw as Record<string, unknown>
  const version = doc['schemaVersion']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail(
      'invalid-schema-version',
      'schemaVersion',
      'schemaVersion must be a positive integer'
    )
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return fail(
      'unsupported-schema-version',
      'schemaVersion',
      `Project uses schema version ${version}; this app supports up to ${CURRENT_SCHEMA_VERSION}. Update the app to open it.`
    )
  }
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = MIGRATIONS[v]
    if (!migrate)
      return fail('missing-migration', 'schemaVersion', `No migration from schema version ${v}`)
    doc = migrate(doc)
  }
  const parsed = TemplateProjectSchema.safeParse(doc)
  if (!parsed.success) return { ok: false, errors: zodIssues(parsed.error) }
  const issues = checkProjectIntegrity(parsed.data)
  if (issues.length > 0) return { ok: false, errors: issues }
  return { ok: true, project: parsed.data }
}

/** Recursively sorts object keys so opaque preserved data serializes deterministically. */
function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortJson(value[k] as JsonValue)])
    )
  }
  return value
}

/**
 * Deterministic JSON text for a project: validated, schema key order, two-space indent,
 * trailing newline. Opaque compatibility data has sorted keys. Throws if the project is invalid.
 */
export function serializeProject(project: TemplateProject): string {
  const result = loadProject(project)
  if (!result.ok) {
    throw new Error(
      `Cannot serialize invalid project: ${result.errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('; ')}`
    )
  }
  const out: Record<string, unknown> = { ...result.project }
  if (result.project.sourceCompatibility) {
    out['sourceCompatibility'] = sortJson(JsonValueSchema.parse(result.project.sourceCompatibility))
  }
  return JSON.stringify(out, null, 2) + '\n'
}

/** Parses and loads native project JSON text. */
export function deserializeProject(text: string): LoadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return fail('invalid-json', '', `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  return loadProject(raw)
}
