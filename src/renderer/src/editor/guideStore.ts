import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { GUIDE_STEPS, initialGuide, type GuideAnswers, type GuideStep } from '@editor/designGuide'

/**
 * Design Guide state (Phase 7C): which step is shown and the operator's answers. UI state of this run only — never in
 * the project, history, autosave or Modified. Closing the Guide before Finish keeps the answers until the app quits, so
 * an accidental Escape loses nothing (Start over clears them); Finish clears them once the design is in the editor.
 */
interface GuideState {
  open: boolean
  step: GuideStep
  answers: GuideAnswers
  /** Set when the editor could not be opened (shown in the Guide). */
  error: string | null
  openGuide(): void
  close(): void
  setStep(step: GuideStep): void
  update(f: (a: GuideAnswers) => GuideAnswers): void
  startOver(): void
  setError(message: string | null): void
  /** The design is in the editor: forget the answers. */
  finished(): void
}

const fresh = (): Pick<GuideState, 'step' | 'answers' | 'error'> => ({
  step: GUIDE_STEPS[0],
  answers: initialGuide(),
  error: null
})

export const guideStore = createStore<GuideState>((set) => ({
  open: false,
  ...fresh(),
  openGuide: () => set({ open: true, error: null }),
  close: () => set({ open: false }),
  setStep: (step) => set({ step, error: null }),
  update: (f) => set((s) => ({ answers: f(s.answers) })),
  startOver: () => set(fresh()),
  setError: (error) => set({ error }),
  finished: () => set({ open: false, ...fresh() })
}))

export function useGuide<T>(selector: (s: GuideState) => T): T {
  return useStore(guideStore, selector)
}
