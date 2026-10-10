import { useSyncExternalStore } from 'react'
import {
  COMMON_FAMILIES,
  familyKey,
  fontStatus,
  type FontCatalog,
  type FontEnvironment,
  type FontStatus
} from '@editor/fonts'

/**
 * The renderer's view of which fonts this computer has (ADR-039). Primary source: the Chromium Local Font Access API
 * (`queryLocalFonts`), which Electron exposes for family/style NAMES only (never file paths); the main process grants
 * just that one permission. If it is missing or refused the app keeps working: availability is then judged by a
 * measurement probe, and the picker offers generic families, the project's own fonts and common cross-platform names.
 */
let catalog: FontCatalog = { status: 'loading', families: [] }
let version = 0
const listeners = new Set<() => void>()
let started = false

const set = (next: FontCatalog): void => {
  catalog = next
  version++
  for (const l of listeners) l()
}

interface LocalFontData {
  family: string
}
type QueryLocalFonts = () => Promise<LocalFontData[]>

/** Starts enumeration once (idempotent unless a previous attempt failed and `retry` is true). */
export async function loadFontCatalog(retry = false): Promise<void> {
  if (started && !(retry && catalog.status !== 'ready')) return
  started = true
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
  if (typeof query !== 'function') {
    set({ status: 'unavailable', families: [] })
    return
  }
  set({ status: 'loading', families: catalog.families })
  try {
    const faces = await query.call(window)
    const families = [...new Set(faces.map((f) => f.family).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    )
    set({ status: 'ready', families })
  } catch (e) {
    const denied =
      e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    set({ status: denied ? 'denied' : 'unavailable', families: [] })
  }
}

let probeCanvas: CanvasRenderingContext2D | null = null
const PROBE_TEXT = 'mmmmmmmmmmlliWWWwwiiiOOO0123456789'
const PROBE_BASES = ['monospace', 'serif', 'sans-serif'] as const
const baseWidths = new Map<string, number>()

/** Measurement probe: a family counts as installed if text set in it differs from every generic fallback. */
export function probeFont(family: string): boolean | null {
  try {
    probeCanvas ??= document.createElement('canvas').getContext('2d')
    const ctx = probeCanvas
    if (!ctx) return null
    const width = (stack: string): number => {
      ctx.font = `72px ${stack}`
      return ctx.measureText(PROBE_TEXT).width
    }
    for (const base of PROBE_BASES) {
      if (!baseWidths.has(base)) baseWidths.set(base, width(base))
      if (width(`"${family}", ${base}`) !== baseWidths.get(base)) return true
    }
    return false
  } catch {
    return null
  }
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getFontCatalog = (): FontCatalog => catalog
export const fontEnvironment = (): FontEnvironment => ({ catalog, probe: probeFont })
export const fontStatusOf = (requested: string): FontStatus =>
  fontStatus(requested, fontEnvironment())

/** Re-renders when the catalog changes. */
export function useFontCatalog(): FontCatalog {
  useSyncExternalStore(subscribe, () => version)
  return catalog
}

/** Families the picker can offer: the installed list, or (when it cannot be enumerated) the common ones that probe as installed. */
export function pickerFamilies(c: FontCatalog, projectFonts: readonly string[]): string[] {
  if (c.status === 'ready') return [...c.families]
  const out = new Map<string, string>()
  for (const f of [...COMMON_FAMILIES, ...projectFonts]) {
    if (probeFont(f) === true || projectFonts.includes(f)) out.set(familyKey(f), f)
  }
  return [...out.values()]
}
