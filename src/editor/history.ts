/**
 * Snapshot history. Project updates are immutable with structural sharing, so each past state is a
 * cheap reference rather than a deep copy, and undo/redo is just swapping references. Chosen over a
 * command pattern for maintainability (ADR-031): every mutation gets undo "for free".
 */
export interface History<T> {
  past: readonly T[]
  future: readonly T[]
  /** Last coalescing key and when it was recorded, to merge rapid repeats (e.g. arrow-key nudges). */
  last: { key: string; at: number } | null
}

export const HISTORY_LIMIT = 200
export const COALESCE_WINDOW_MS = 600

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], last: null })

export interface PushOptions {
  coalesceKey?: string | undefined
  now?: number
  limit?: number
  windowMs?: number
}

/** Records `previous` as an undo step before a change. A new change always clears the redo branch. */
export function pushHistory<T>(h: History<T>, previous: T, options: PushOptions = {}): History<T> {
  const now = options.now ?? Date.now()
  const windowMs = options.windowMs ?? COALESCE_WINDOW_MS
  const limit = options.limit ?? HISTORY_LIMIT
  const key = options.coalesceKey
  if (
    key !== undefined &&
    h.last &&
    h.last.key === key &&
    now - h.last.at <= windowMs &&
    h.past.length > 0
  ) {
    // Same ongoing gesture: keep the earlier past entry, so one undo reverts the whole run.
    return { past: h.past, future: [], last: { key, at: now } }
  }
  const past = [...h.past, previous]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, future: [], last: key === undefined ? null : { key, at: now } }
}

export function undoHistory<T>(
  h: History<T>,
  current: T
): { history: History<T>; value: T } | null {
  const value = h.past[h.past.length - 1]
  if (h.past.length === 0 || value === undefined) return null
  return {
    value,
    history: { past: h.past.slice(0, -1), future: [...h.future, current], last: null }
  }
}

export function redoHistory<T>(
  h: History<T>,
  current: T
): { history: History<T>; value: T } | null {
  const value = h.future[h.future.length - 1]
  if (h.future.length === 0 || value === undefined) return null
  return {
    value,
    history: { past: [...h.past, current], future: h.future.slice(0, -1), last: null }
  }
}
