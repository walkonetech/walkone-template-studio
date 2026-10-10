/**
 * How a requested font family reaches the renderer. Shared by the canvas, the exact render and the HTML text editor so
 * a missing font falls back identically everywhere. The requested family is NEVER rewritten in the project (ADR-039).
 */

export const GENERIC_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'system-ui'
] as const

/**
 * Where a missing font falls back when RENDERING (never stored). Helvetica/Arial exist on macOS and Windows; the final
 * generic keeps it predictable on any machine. A requested generic family is kept as the last resort.
 */
export const FALLBACK_STACK = 'Helvetica, Arial, sans-serif'

/** Normalized key for comparing family names: case-insensitive, surrounding quotes/space removed. */
export const familyKey = (family: string): string =>
  family
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .toLowerCase()

/** The first (primary) family of a CSS-style family list: "Georgia, serif" → "Georgia". */
export function primaryFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0] ?? fontFamily
  return first
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
}

export const isGenericFamily = (family: string): boolean =>
  (GENERIC_FAMILIES as readonly string[]).includes(familyKey(family))

/**
 * The family list handed to the renderer (canvas, Konva, the editing overlay): the requested family first, then the
 * fallback stack. The requested name is untouched, so the project and the UI keep showing the intended font.
 */
export function renderFontFamily(requested: string): string {
  const trimmed = requested.trim()
  if (trimmed === '' || isGenericFamily(primaryFamily(trimmed))) {
    return trimmed === '' ? FALLBACK_STACK : `${trimmed}, ${FALLBACK_STACK}`
  }
  return `${trimmed}, ${FALLBACK_STACK}`
}

/** `renderFontFamily` as a valid CSS `font-family` value (names with spaces quoted) for the HTML text editor. */
export function cssFontFamily(requested: string): string {
  return renderFontFamily(requested)
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => (/[\s]/.test(f) && !/^["']/.test(f) ? `"${f}"` : f))
    .join(', ')
}
