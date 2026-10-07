import type { AutosaveTimers } from '../autosave'

/** Manual clock + timer queue for deterministic scheduler tests. */
export function fakeTimers(): AutosaveTimers & {
  advance(ms: number): Promise<void>
  pendingCount(): number
  time(): number
} {
  let t = 0
  let nextId = 1
  const queue = new Map<number, { at: number; fn: () => void }>()
  return {
    setTimeout: (fn, ms) => {
      const id = nextId++
      queue.set(id, { at: t + ms, fn })
      return id
    },
    clearTimeout: (h) => {
      queue.delete(h as number)
    },
    now: () => t,
    time: () => t,
    pendingCount: () => queue.size,
    async advance(ms) {
      const target = t + ms
      for (;;) {
        const due = [...queue.entries()]
          .filter(([, v]) => v.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        queue.delete(due[0])
        t = due[1].at
        due[1].fn()
        // let async write() continuations settle
        for (let i = 0; i < 5; i++) await Promise.resolve()
      }
      t = target
      for (let i = 0; i < 5; i++) await Promise.resolve()
    }
  }
}
