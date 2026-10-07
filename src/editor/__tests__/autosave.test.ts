import { describe, expect, it, vi } from 'vitest'
import { createAutosaver } from '../autosave'
import { fakeTimers } from './fakeTimers'

function setup(writeImpl: () => Promise<void> = async () => undefined) {
  const timers = fakeTimers()
  const write = vi.fn(writeImpl)
  const statuses: string[] = []
  const saver = createAutosaver({
    debounceMs: 2000,
    maxWaitMs: 10000,
    retryMs: [1000, 5000],
    timers,
    write,
    onStatus: (s) => statuses.push(s.state)
  })
  return { timers, write, saver, statuses }
}

describe('autosave scheduler', () => {
  it('does nothing when nothing changed', async () => {
    const { timers, write } = setup()
    await timers.advance(60_000)
    expect(write).not.toHaveBeenCalled()
  })

  it('writes once after the debounce of quiet', async () => {
    const { timers, write, saver } = setup()
    saver.notify()
    await timers.advance(1999)
    expect(write).not.toHaveBeenCalled()
    await timers.advance(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(saver.status()).toMatchObject({ state: 'saved', failures: 0 })
    await timers.advance(60_000)
    expect(write).toHaveBeenCalledTimes(1) // no more writes without new changes
  })

  it('a burst of edits coalesces into one write (each edit restarts the debounce)', async () => {
    const { timers, write, saver } = setup()
    for (let i = 0; i < 5; i++) {
      saver.notify()
      await timers.advance(1000)
    }
    expect(write).not.toHaveBeenCalled()
    await timers.advance(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('continuous editing is still written at least every maxWait', async () => {
    const { timers, write, saver } = setup()
    for (let i = 0; i < 12; i++) {
      saver.notify()
      await timers.advance(1000) // never quiet for 2 s
    }
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(timers.time()).toBe(12_000)
  })

  it('edits made while a write is in flight are written afterwards (latest wins)', async () => {
    let release: () => void = () => undefined
    const first = new Promise<void>((r) => (release = r))
    const { timers, write, saver } = setup()
    write.mockImplementationOnce(() => first)
    saver.notify()
    await timers.advance(2000)
    expect(saver.status().state).toBe('saving')
    saver.notify() // new edit during the write
    release()
    await timers.advance(2000)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('failure never throws, is retried with backoff, and counts consecutive failures', async () => {
    const { timers, write, saver } = setup()
    write.mockRejectedValue(new Error('disk full'))
    saver.notify()
    await timers.advance(2000)
    expect(saver.status()).toMatchObject({ state: 'error', failures: 1, error: 'disk full' })
    await timers.advance(1000) // first retry delay
    expect(write).toHaveBeenCalledTimes(2)
    expect(saver.status().failures).toBe(2)
    await timers.advance(5000)
    expect(write).toHaveBeenCalledTimes(3)
    write.mockResolvedValue(undefined)
    await timers.advance(5000)
    expect(saver.status()).toMatchObject({ state: 'saved', failures: 0, error: null })
  })

  it('flush writes pending work immediately and is a no-op otherwise', async () => {
    const { write, saver } = setup()
    await saver.flush()
    expect(write).not.toHaveBeenCalled()
    saver.notify()
    await saver.flush()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('reset forgets pending work and ignores an in-flight write result', async () => {
    const { timers, write, saver } = setup()
    saver.notify()
    saver.reset()
    await timers.advance(60_000)
    expect(write).not.toHaveBeenCalled()
    expect(saver.status().state).toBe('idle')
  })
})
