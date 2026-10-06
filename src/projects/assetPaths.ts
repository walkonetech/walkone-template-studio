import { ProjectRelativePathSchema, type TemplateProject } from '../domain'
import { ASSETS_PREFIX, MANIFEST_NAME } from './constants'
import { PersistenceError } from './errors'

/**
 * Package-level rules for asset paths, stricter than the domain's "relative path" rule:
 * must live under `assets/`, be a file (not a directory), and be unique case-insensitively
 * (macOS and Windows file systems are case-insensitive by default).
 */
function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 32) return true
  return false
}

export function checkAssetPaths(project: TemplateProject): void {
  const seen = new Map<string, string>()
  for (const asset of project.assets) {
    const path = asset.path
    if (!ProjectRelativePathSchema.safeParse(path).success) {
      throw new PersistenceError(
        'unsafe-path',
        `Asset "${asset.filename}" has an unsafe path.`,
        path
      )
    }
    if (
      !path.startsWith(ASSETS_PREFIX) ||
      path.length === ASSETS_PREFIX.length ||
      path.endsWith('/')
    ) {
      throw new PersistenceError(
        'unsafe-path',
        `Asset "${asset.filename}" must be stored under ${ASSETS_PREFIX}.`,
        path
      )
    }
    if (/[<>:"|?*]/.test(path) || hasControlChar(path) || /[. ]$/.test(path)) {
      throw new PersistenceError(
        'unsafe-path',
        `Asset "${asset.filename}" has a name that is not portable across systems.`,
        path
      )
    }
    const key = path.toLowerCase()
    const prior = seen.get(key)
    if (prior !== undefined) {
      throw new PersistenceError(
        'corrupted-package',
        `Two assets would overwrite each other ("${prior}" and "${path}").`,
        key
      )
    }
    seen.set(key, path)
    if (key === MANIFEST_NAME) {
      throw new PersistenceError('unsafe-path', 'An asset cannot be named project.json.', path)
    }
  }
}
