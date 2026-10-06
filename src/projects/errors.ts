import {
  PERSISTENCE_ERROR_CODES,
  type PersistenceErrorCode,
  type SafeError
} from '../shared/persistence'

export { PERSISTENCE_ERROR_CODES }
export type { PersistenceErrorCode, SafeError }

/** Error with a stable code and a message that is safe to show to the user. */
export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  /** Internal detail for logs and development; never sent to the renderer. */
  readonly detail: string | undefined

  constructor(code: PersistenceErrorCode, userMessage: string, detail?: string, cause?: unknown) {
    super(userMessage, cause === undefined ? undefined : { cause })
    this.name = 'PersistenceError'
    this.code = code
    this.detail = detail
  }
}

export function toSafeError(e: unknown): SafeError {
  if (e instanceof PersistenceError) return { code: e.code, message: e.message }
  return { code: 'unexpected', message: 'An unexpected error occurred.' }
}

/** Translates a Node filesystem error into a PersistenceError. */
export function fromFsError(
  e: unknown,
  fallback: PersistenceErrorCode,
  userMessage: string
): PersistenceError {
  if (e instanceof PersistenceError) return e
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  if (code === 'ENOENT') {
    return new PersistenceError(
      'file-not-found',
      'The file or folder could not be found.',
      detail,
      e
    )
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return new PersistenceError(
      'permission-denied',
      'Permission was denied. Check that the location is writable.',
      detail,
      e
    )
  }
  return new PersistenceError(fallback, userMessage, detail, e)
}
