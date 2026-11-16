/**
 * Layer package container rules (Phase 6A), shared by the renderer (which assembles entries) and the main process
 * (which validates them and writes the ZIP). The package is flat: a handful of named files, no folders.
 */

export const LAYER_PACKAGE_FORMAT = 'walkone.layer-package'
export const LAYER_PACKAGE_VERSION = 1
export const MAX_PACKAGE_ENTRIES = 16

const ENTRY = /^[a-z0-9][a-z0-9._-]{0,63}\.(png|json|txt)$/

/** A package entry path is a lower-case flat file name with a .png, .json or .txt extension. */
export const isSafePackageEntryPath = (path: string): boolean =>
  ENTRY.test(path) && !path.includes('..')
