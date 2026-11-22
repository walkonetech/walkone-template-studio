import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { FormatDefinition } from '@domain'
import type { FormatPresetItem } from '@shared/ipc'

/**
 * My formats in the renderer (Phase 7B B5.5): the app-local list kept by the main process (`formats.json`). This is
 * a cache of that list for the Start screen, New project and the wizard; it never holds project data.
 */
interface FormatsState {
  items: FormatPresetItem[] | null
  /** The last error message from a save / rename / delete, for the UI to show (null = fine). */
  error: string | null
  refresh(): Promise<void>
  save(format: FormatDefinition): Promise<FormatPresetItem | null>
  rename(id: string, name: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}

export const formatsStore = createStore<FormatsState>((set, get) => ({
  items: null,
  error: null,
  async refresh() {
    const r = await window.api.formats.list()
    set({ items: r.status === 'ok' ? r.value : [] })
  },
  async save(format) {
    const r = await window.api.formats.save({ format })
    if (r.status !== 'ok') {
      set({ error: r.status === 'error' ? r.error.message : null })
      return null
    }
    set({ error: null })
    await get().refresh()
    return r.value
  },
  async rename(id, name) {
    const r = await window.api.formats.rename({ id, name })
    set({ error: r.status === 'error' ? r.error.message : null })
    await get().refresh()
    return r.status === 'ok'
  },
  async remove(id) {
    const r = await window.api.formats.delete({ id })
    set({ error: r.status === 'error' ? r.error.message : null })
    await get().refresh()
    return r.status === 'ok'
  }
}))

export function useFormats<T>(selector: (s: FormatsState) => T): T {
  return useStore(formatsStore, selector)
}
