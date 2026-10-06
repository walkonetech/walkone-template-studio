import { describe, expect, it } from 'vitest'
import { emptyHistory, HISTORY_LIMIT, pushHistory, redoHistory, undoHistory } from '../history'

describe('snapshot history', () => {
  it('undo and redo walk the stack', () => {
    let h = pushHistory(emptyHistory<number>(), 1)
    h = pushHistory(h, 2)
    const u1 = undoHistory(h, 3)
    expect(u1?.value).toBe(2)
    const u2 = undoHistory(u1!.history, 2)
    expect(u2?.value).toBe(1)
    expect(undoHistory(u2!.history, 1)).toBeNull()
    const r1 = redoHistory(u2!.history, 1)
    expect(r1?.value).toBe(2)
  })

  it('a new edit clears the redo branch', () => {
    let h = pushHistory(emptyHistory<number>(), 1)
    const u = undoHistory(h, 2)!
    expect(u.history.future).toHaveLength(1)
    h = pushHistory(u.history, 1)
    expect(h.future).toHaveLength(0)
  })

  it('coalesces rapid repeats with the same key into one undo step', () => {
    let h = pushHistory(emptyHistory<number>(), 0, { coalesceKey: 'nudge', now: 1000 })
    h = pushHistory(h, 1, { coalesceKey: 'nudge', now: 1200 })
    h = pushHistory(h, 2, { coalesceKey: 'nudge', now: 1400 })
    expect(h.past).toEqual([0]) // one entry: undo returns to the value before the whole run
  })

  it('does not coalesce across keys, after the window, or without a key', () => {
    let h = pushHistory(emptyHistory<number>(), 0, { coalesceKey: 'a', now: 0 })
    h = pushHistory(h, 1, { coalesceKey: 'b', now: 100 })
    expect(h.past).toEqual([0, 1])
    h = pushHistory(h, 2, { coalesceKey: 'b', now: 10_000 })
    expect(h.past).toEqual([0, 1, 2])
    h = pushHistory(h, 3)
    h = pushHistory(h, 4)
    expect(h.past).toEqual([0, 1, 2, 3, 4])
  })

  it('is bounded', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) h = pushHistory(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(50)
  })
})
