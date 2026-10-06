/** Canonical single-file project extension. The file is a ZIP-compatible archive internally. */
export const PROJECT_EXTENSION = '.boothproject'
export const MANIFEST_NAME = 'project.json'
export const ASSETS_DIR = 'assets'
export const ASSETS_PREFIX = `${ASSETS_DIR}/`

export const SESSION_META_NAME = 'session.json'

/** Defensive limits applied when opening a package. */
export const MAX_ENTRIES = 5000
export const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024

export function hasProjectExtension(path: string): boolean {
  return path.toLowerCase().endsWith(PROJECT_EXTENSION)
}
