/**
 * Debounced autosave scheduler for the recovery copy (ADR-034). Pure and timer-injectable.
 *
 * content change -> notify() -> wait `debounceMs` of quiet (a burst of edits coalesces) -> write()
 * Continuous editing is still written at least every `maxWaitMs`. Nothing runs when nothing changed. A failed write
 * is retried with backoff and never throws into the editor; status is exposed for the UI.
 */
export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface AutosaveStatus {
  state: AutosaveState
  /** Epoch ms of the last successful recovery write. */
  lastSavedAt: number | null
  /** Consecutive failures since the last success. */
  failures: number
  error: string | null
}

export interface AutosaveTimers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  now: () => number
}

export interface AutosaveOptions {
  debounceMs: number
  maxWaitMs: number
  /** Retry delays after consecutive failures (the last repeats). */
  retryMs?: readonly number[]
  timers?: AutosaveTimers
  /** Performs one recovery write of the CURRENT project; rejects on failure. */
  write: () => Promise<void>
  onStatus?: (status: AutosaveStatus) => void
}

export interface Autosaver {
  /** The project changed: schedule a recovery write. */
  notify(): void
  /** Write now if anything is pending or failed (used before risky operations). Resolves when settled; never rejects. */
  flush(): Promise<void>
  /** Forget pending work and status (project closed or replaced). */
  reset(): void
  status(): AutosaveStatus
}

const realTimers: AutosaveTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now()
}

export function createAutosaver(options: AutosaveOptions): Autosaver {
  const timers = options.timers ?? realTimers
  const retry = options.retryMs ?? [5000, 15000, 60000]
  let status: AutosaveStatus = { state: 'idle', lastSavedAt: null, failures: 0, error: null }
  let debounceTimer: unknown = null
  let maxTimer: unknown = null
  let retryTimer: unknown = null
  let pending = false
  let running: Promise<void> | null = null
  let generation = 0

  const publish = (patch: Partial<AutosaveStatus>): void => {
    status = { ...status, ...patch }
    options.onStatus?.(status)
  }
  const clearTimers = (): void => {
    if (debounceTimer !== null) timers.clearTimeout(debounceTimer)
    if (maxTimer !== null) timers.clearTimeout(maxTimer)
    if (retryTimer !== null) timers.clearTimeout(retryTimer)
    debounceTimer = maxTimer = retryTimer = null
  }

  const run = (): Promise<void> => {
    if (running) return running
    clearTimers()
    const gen = generation
    running = (async () => {
      while (pending && gen === generation) {
        pending = false
        publish({ state: 'saving' })
        try {
          await options.write()
          if (gen !== generation) return
          publish({
            state: pending ? 'pending' : 'saved',
            lastSavedAt: timers.now(),
            failures: 0,
            error: null
          })
        } catch (e) {
          if (gen !== generation) return
          pending = true // the latest content is still not safely written
          const failures = status.failures + 1
          publish({ state: 'error', failures, error: e instanceof Error ? e.message : String(e) })
          const delay = retry[Math.min(failures - 1, retry.length - 1)] ?? 60000
          retryTimer = timers.setTimeout(() => void run(), delay)
          return
        }
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  return {
    notify() {
      pending = true
      if (status.state !== 'error' && status.state !== 'saving') publish({ state: 'pending' })
      if (debounceTimer !== null) timers.clearTimeout(debounceTimer)
      debounceTimer = timers.setTimeout(() => void run(), options.debounceMs)
      if (maxTimer === null) maxTimer = timers.setTimeout(() => void run(), options.maxWaitMs)
    },
    async flush() {
      if (!pending && !running) return
      await run()
    },
    reset() {
      generation++
      pending = false
      clearTimers()
      running = null
      status = { state: 'idle', lastSavedAt: null, failures: 0, error: null }
      options.onStatus?.(status)
    },
    status: () => status
  }
}
