import {
  HexColorSchema,
  PaletteColorSchema,
  createId as defaultCreateId,
  type ColorValue,
  type PaletteColor,
  type PaletteRole,
  type TemplateProject
} from '@domain'
import { MutationError, type MutationContext } from './mutations'

/**
 * The Event Palette: named, semantic project colours that layers reference BY ID (renaming never breaks a link; changing
 * a value updates every linked property because rendering resolves the id each time). Pure project mutations; the
 * `palette` model, `ColorValue` references and integrity rules already existed (no schema change).
 */

export const ROLE_LABELS: Readonly<Record<PaletteRole, string>> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  background: 'Background',
  text: 'Text',
  custom: 'Custom'
}
export const SEMANTIC_ROLES: readonly PaletteRole[] = [
  'primary',
  'secondary',
  'accent',
  'background',
  'text'
]

/** Neutral starter values (they match the editor's own defaults: white page, dark text, blue shape). */
export const BASIC_PALETTE: Readonly<Record<Exclude<PaletteRole, 'custom'>, string>> = {
  primary: '#4a6fa5',
  secondary: '#f5efe4',
  accent: '#c6a45d',
  background: '#ffffff',
  text: '#222222'
}

export class PaletteInUseError extends MutationError {
  constructor(
    readonly paletteColorId: string,
    readonly usage: number,
    name: string
  ) {
    super(
      `"${name}" is used by ${usage} propert${usage === 1 ? 'y' : 'ies'}. Change those to a fixed color or another palette color first.`
    )
    this.name = 'PaletteInUseError'
  }
}

export interface PaletteReference {
  /** Layer id, or null for the canvas background. */
  layerId: string | null
  property: 'text color' | 'fill' | 'stroke' | 'frame color' | 'background'
}

const refersTo = (c: ColorValue | null | undefined, id: string): boolean =>
  !!c && c.kind === 'palette' && c.paletteColorId === id

/** Every colour property that points at a palette entry (the properties the domain lets reference one). */
export function paletteReferences(
  project: TemplateProject,
  paletteColorId: string
): PaletteReference[] {
  const refs: PaletteReference[] = []
  if (refersTo(project.canvas.backgroundColor, paletteColorId))
    refs.push({ layerId: null, property: 'background' })
  for (const l of project.layers) {
    if (l.type === 'text' && refersTo(l.fill, paletteColorId))
      refs.push({ layerId: l.id, property: 'text color' })
    else if (l.type === 'shape') {
      if (refersTo(l.fill, paletteColorId)) refs.push({ layerId: l.id, property: 'fill' })
      if (l.stroke && refersTo(l.stroke.color, paletteColorId))
        refs.push({ layerId: l.id, property: 'stroke' })
    } else if (
      l.type === 'photo' &&
      l.frame.style === 'solid' &&
      refersTo(l.frame.color, paletteColorId)
    ) {
      refs.push({ layerId: l.id, property: 'frame color' })
    }
  }
  return refs
}

/** All palette references in the project, including ones whose entry no longer exists (should not happen). */
export function brokenPaletteReferences(
  project: TemplateProject
): { paletteColorId: string; ref: PaletteReference }[] {
  const ids = new Set(project.palette.colors.map((c) => c.id))
  const out: { paletteColorId: string; ref: PaletteReference }[] = []
  const check = (c: ColorValue | null | undefined, ref: PaletteReference): void => {
    if (c && c.kind === 'palette' && !ids.has(c.paletteColorId))
      out.push({ paletteColorId: c.paletteColorId, ref })
  }
  check(project.canvas.backgroundColor, { layerId: null, property: 'background' })
  for (const l of project.layers) {
    if (l.type === 'text') check(l.fill, { layerId: l.id, property: 'text color' })
    if (l.type === 'shape') {
      check(l.fill, { layerId: l.id, property: 'fill' })
      check(l.stroke?.color, { layerId: l.id, property: 'stroke' })
    }
    if (l.type === 'photo' && l.frame.style === 'solid')
      check(l.frame.color, { layerId: l.id, property: 'frame color' })
  }
  return out
}

const stamp = (
  project: TemplateProject,
  ctx: MutationContext,
  colors: PaletteColor[]
): TemplateProject => ({
  ...project,
  palette: { ...project.palette, colors },
  metadata: { ...project.metadata, updatedAt: ctx.now ?? new Date().toISOString() }
})

function normalizeHex(value: string): string {
  const v = value.trim().toLowerCase()
  const parsed = HexColorSchema.safeParse(v.startsWith('#') ? v : `#${v}`)
  if (!parsed.success) throw new MutationError('Use a hex color like #1a2b3c.')
  return parsed.data
}

export function addPaletteColor(
  project: TemplateProject,
  input: { role: PaletteRole; name?: string; value: string },
  ctx: MutationContext = {}
): { project: TemplateProject; id: string } {
  if (input.role !== 'custom' && project.palette.colors.some((c) => c.role === input.role)) {
    throw new MutationError(`The palette already has a ${ROLE_LABELS[input.role]} color.`)
  }
  const customCount = project.palette.colors.filter((c) => c.role === 'custom').length
  const name =
    (input.name ?? '').trim() ||
    (input.role === 'custom' ? `Color ${customCount + 1}` : ROLE_LABELS[input.role])
  const color = PaletteColorSchema.safeParse({
    id: (ctx.createId ?? defaultCreateId)(),
    role: input.role,
    name,
    value: normalizeHex(input.value)
  })
  if (!color.success) throw new MutationError('That color name is not valid.')
  return {
    project: stamp(project, ctx, [...project.palette.colors, color.data]),
    id: color.data.id
  }
}

/** Adds the missing semantic roles with neutral starter values. One mutation. */
export function addBasicPalette(
  project: TemplateProject,
  ctx: MutationContext = {}
): TemplateProject {
  const have = new Set(project.palette.colors.map((c) => c.role))
  const bg = project.canvas.backgroundColor
  let next = project
  for (const role of SEMANTIC_ROLES) {
    if (have.has(role) || role === 'custom') continue
    const value =
      role === 'background' && bg.kind === 'literal'
        ? bg.value
        : BASIC_PALETTE[role as keyof typeof BASIC_PALETTE]
    next = addPaletteColor(
      next,
      { role, value },
      { ...ctx, createId: ctx.createId ?? defaultCreateId }
    ).project
  }
  return next
}

export function setPaletteColorValue(
  project: TemplateProject,
  id: string,
  value: string,
  ctx: MutationContext = {}
): TemplateProject {
  const hex = normalizeHex(value)
  const current = project.palette.colors.find((c) => c.id === id)
  if (!current) throw new MutationError('That palette color does not exist.')
  if (current.value === hex) return project
  return stamp(
    project,
    ctx,
    project.palette.colors.map((c) => (c.id === id ? { ...c, value: hex } : c))
  )
}

/** Renames a CUSTOM color (the id, and so every reference, is untouched). Semantic roles keep their fixed names. */
export function renamePaletteColor(
  project: TemplateProject,
  id: string,
  name: string,
  ctx: MutationContext = {}
): TemplateProject {
  const current = project.palette.colors.find((c) => c.id === id)
  if (!current) throw new MutationError('That palette color does not exist.')
  if (current.role !== 'custom') throw new MutationError('Only custom colors can be renamed.')
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > 100)
    throw new MutationError('A color name needs 1–100 characters.')
  if (trimmed === current.name) return project
  return stamp(
    project,
    ctx,
    project.palette.colors.map((c) => (c.id === id ? { ...c, name: trimmed } : c))
  )
}

/** Removes an UNUSED entry; refuses (PaletteInUseError) while anything still references it. */
export function removePaletteColor(
  project: TemplateProject,
  id: string,
  ctx: MutationContext = {}
): TemplateProject {
  const current = project.palette.colors.find((c) => c.id === id)
  if (!current) return project
  const usage = paletteReferences(project, id).length
  if (usage > 0) throw new PaletteInUseError(id, usage, current.name)
  return stamp(
    project,
    ctx,
    project.palette.colors.filter((c) => c.id !== id)
  )
}
