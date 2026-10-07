import { describe, expect, it, vi } from 'vitest'
import type { DocumentState } from '../../shared/ipc'
import {
  CloseCoordinator,
  type CloseDeps,
  type SaveOutcome,
  type UnsavedChoice
} from '../closeCoordinator'

const state = (over: Partial<DocumentState> = {}): DocumentState => ({
  hasProject: true,
  dirty: true,
  name: 'Wedding',
  neverSaved: false,
  ...over
})

function make(
  over: Partial<CloseDeps> & {
    choice?: UnsavedChoice
    save?: SaveOutcome
    state?: DocumentState | null
  } = {}
) {
  const prompt = vi.fn<CloseDeps['prompt']>(async () => over.choice ?? 'cancel')
  const requestSave = vi.fn(async () => over.save ?? 'saved')
  const queryState = vi.fn(async () => (over.state === undefined ? state() : over.state))
  const onSaveFailed = vi.fn()
  const c = new CloseCoordinator({
    queryState,
    prompt,
    requestSave,
    onSaveFailed,
    ...(over.prompt ? { prompt: over.prompt } : {}),
    ...(over.requestSave ? { requestSave: over.requestSave } : {}),
    ...(over.queryState ? { queryState: over.queryState } : {})
  })
  return { c, prompt, requestSave, queryState, onSaveFailed }
}

describe('unsaved-changes decision (all close paths share it)', () => {
  it.each(['window-close', 'quit', 'close-project', 'replace'] as const)(
    '%s: a clean project proceeds without any prompt',
    async (reason) => {
      const { c, prompt } = make({ state: state({ dirty: false }) })
      expect(await c.requestClose(reason)).toEqual({ proceed: true, cleanup: true })
      expect(prompt).not.toHaveBeenCalled()
    }
  )

  it('no project open proceeds without a prompt', async () => {
    const { c, prompt } = make({ state: state({ hasProject: false, dirty: false, name: null }) })
    expect(await c.requestClose('quit')).toEqual({ proceed: true, cleanup: true })
    expect(prompt).not.toHaveBeenCalled()
  })

  it('a modified project prompts once', async () => {
    const { c, prompt } = make({ choice: 'cancel' })
    await c.requestClose('window-close')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(prompt.mock.calls[0]?.[1]).toBe('window-close')
  })

  it('Cancel aborts and cleans up nothing', async () => {
    const { c, requestSave } = make({ choice: 'cancel' })
    expect(await c.requestClose('quit')).toEqual({ proceed: false, cleanup: false })
    expect(requestSave).not.toHaveBeenCalled()
  })

  it('a dismissed or failing prompt is treated as Cancel', async () => {
    const { c } = make({
      prompt: async () => {
        throw new Error('dialog gone')
      }
    })
    expect(await c.requestClose('quit')).toEqual({ proceed: false, cleanup: false })
  })

  it("Don't Save proceeds and allows discarding the recovery data", async () => {
    const { c, requestSave } = make({ choice: 'discard' })
    expect(await c.requestClose('quit')).toEqual({ proceed: true, cleanup: true })
    expect(requestSave).not.toHaveBeenCalled()
  })

  it('Save proceeds only after the renderer reports it saved', async () => {
    const { c, requestSave } = make({ choice: 'save', save: 'saved' })
    expect(await c.requestClose('quit')).toEqual({ proceed: true, cleanup: true })
    expect(requestSave).toHaveBeenCalledTimes(1)
  })

  it('a FAILED save keeps the app open and keeps the recovery data', async () => {
    const { c, onSaveFailed } = make({ choice: 'save', save: 'failed' })
    expect(await c.requestClose('quit')).toEqual({ proceed: false, cleanup: false })
    expect(onSaveFailed).toHaveBeenCalled()
  })

  it('a thrown save error is a failed save', async () => {
    const { c } = make({
      choice: 'save',
      requestSave: async () => {
        throw new Error('ipc')
      }
    })
    expect((await c.requestClose('window-close')).proceed).toBe(false)
  })

  it('Save As cancelled for an untitled project keeps the app open (no data lost)', async () => {
    const { c } = make({
      state: state({ neverSaved: true, name: 'Untitled' }),
      choice: 'save',
      save: 'cancelled'
    })
    expect(await c.requestClose('quit')).toEqual({ proceed: false, cleanup: false })
  })

  it('an unavailable renderer proceeds WITHOUT cleanup so recovery data survives', async () => {
    const { c, prompt } = make({ state: null })
    expect(await c.requestClose('quit')).toEqual({ proceed: true, cleanup: false })
    expect(prompt).not.toHaveBeenCalled()
  })

  it('a failing state query behaves like an unavailable renderer', async () => {
    const { c } = make({
      queryState: async () => {
        throw new Error('timeout')
      }
    })
    expect(await c.requestClose('window-close')).toEqual({ proceed: true, cleanup: false })
  })

  it('window close and quit arriving together share one prompt (no duplicate dialogs)', async () => {
    let release: (c: UnsavedChoice) => void = () => undefined
    const prompt = vi.fn(() => new Promise<UnsavedChoice>((r) => (release = r)))
    const { c } = make({ prompt })
    const a = c.requestClose('window-close')
    const b = c.requestClose('quit')
    await new Promise((r) => setTimeout(r, 0)) // let the state query settle so the prompt is actually open
    release('discard')
    expect(await a).toEqual(await b)
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('is reusable after a decision (a later close asks again)', async () => {
    const { c, prompt } = make({ choice: 'cancel' })
    await c.requestClose('quit')
    await c.requestClose('quit')
    expect(prompt).toHaveBeenCalledTimes(2)
  })
})
