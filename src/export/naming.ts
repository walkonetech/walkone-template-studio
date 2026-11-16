/**
 * Export file naming (Phase 6A). Pure and shared by the renderer (which proposes names) and the main process (which
 * re-validates every name it is asked to write). Names are single path components: never a directory, never a path.
 */

/** Characters that are invalid in a file name on Windows or macOS, plus control characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what must be removed
const INVALID = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
/** Device names Windows reserves regardless of extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
export const MAX_STEM_LENGTH = 100

/**
 * A portable file-name stem from a project name: keeps letters (any script), digits, spaces and common punctuation
 * ("Mya & Myka's Sweet 16" stays readable), drops characters that are invalid on Windows/macOS, collapses whitespace,
 * trims trailing dots/spaces (Windows strips them), avoids reserved device names and caps the length.
 */
export function exportFileStem(projectName: string): string {
  let stem = projectName.normalize('NFC').replace(INVALID, ' ').replace(/\s+/g, ' ').trim()
  stem = stem.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (stem.length > MAX_STEM_LENGTH) stem = stem.slice(0, MAX_STEM_LENGTH).replace(/[.\s]+$/, '')
  if (stem === '' || RESERVED.test(stem)) stem = stem === '' ? 'Untitled' : `${stem}_`
  return stem
}

/** What an export produces. Vendor-neutral; DSLR Booth output is a later adapter (Phase 6B). */
export type ExportKind = 'print' | 'design' | 'proof' | 'package'

export const EXPORT_SUFFIX: Readonly<Record<ExportKind, string>> = {
  print: '-print.png',
  design: '-design.png',
  proof: '-proof.png',
  package: '-layers.zip'
}

export const exportFileName = (projectName: string, kind: ExportKind): string =>
  exportFileStem(projectName) + EXPORT_SUFFIX[kind]

export const ALLOWED_EXPORT_EXTENSIONS = ['.png', '.zip'] as const

/**
 * True when `name` is a safe single file name for an export: no separators or invalid characters, not hidden, not a
 * reserved device name, a permitted extension, and a sensible length. The main process refuses anything else.
 */
export function isSafeExportFileName(name: string): boolean {
  if (name.length < 5 || name.length > MAX_STEM_LENGTH + 40) return false
  if (new RegExp(INVALID.source).test(name)) return false
  if (name.startsWith('.') || name.endsWith('.') || name.endsWith(' ') || name.startsWith(' '))
    return false
  const lower = name.toLowerCase()
  const ext = ALLOWED_EXPORT_EXTENSIONS.find((e) => lower.endsWith(e))
  if (!ext) return false
  const stem = name.slice(0, -ext.length)
  return stem.trim() !== '' && !RESERVED.test(stem) && !RESERVED.test(stem.split('.')[0] ?? '')
}

/**
 * "Keep both": the first `Name (2).png`, `Name (3).png`, … that is not taken. `taken` compares case-insensitively
 * because the default macOS and Windows file systems do.
 */
export function uniqueFileName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!taken(candidate)) return candidate
  }
  throw new Error('No free file name')
}
