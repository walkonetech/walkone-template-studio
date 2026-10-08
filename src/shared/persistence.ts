/** Persistence error codes and the IPC result envelope shared by main, preload and renderer. */
export const PERSISTENCE_ERROR_CODES = [
  'file-not-found',
  'invalid-project',
  'unsupported-version',
  'corrupted-package',
  'missing-asset',
  'unsafe-path',
  'permission-denied',
  'write-failed',
  'replace-failed',
  'session-not-found',
  'autosave-failed',
  'recovery-corrupt',
  'recovery-asset-missing',
  'recovery-conflict',
  'recovery-discard-failed',
  // Asset import / project assets (Phase 5A)
  'unsupported-format',
  'decode-failed',
  'unsafe-svg',
  'image-too-large',
  'asset-copy-failed',
  'asset-in-use',
  'asset-corrupt',
  'not-allowed',
  'invalid-request',
  'unexpected'
] as const
export type PersistenceErrorCode = (typeof PERSISTENCE_ERROR_CODES)[number]

/** Serializable, user-safe error. Raw system detail never crosses IPC. */
export interface SafeError {
  code: PersistenceErrorCode
  message: string
}

/**
 * Outcome of a user-driven operation. `cancelled` (the user dismissed a dialog) is a normal
 * outcome, not an error, and must not be shown as one.
 */
export type IpcResult<T> =
  { status: 'ok'; value: T } | { status: 'cancelled' } | { status: 'error'; error: SafeError }
