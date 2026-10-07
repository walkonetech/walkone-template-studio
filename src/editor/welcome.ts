import { PRINT_PRESETS, PRINT_PRESET_IDS, getOrientation, type PrintPresetId } from '@domain'

/** What the editor area shows. No project → the welcome screen; the editor chrome only exists with a project. */
export const shouldShowWelcome = (hasProject: boolean): boolean => !hasProject

/**
 * "just now", "5 minutes ago", "yesterday", "3 days ago", else a short date. Recent projects show this instead of
 * file-system paths (paths are long, private, and rarely what the user is looking for).
 */
export function describeWhen(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = now.getTime() - t
  if (diff < 0 || diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

/** "4×6 Portrait · 600 DPI" for the New Project format picker. */
export function presetLabel(id: PrintPresetId): string {
  const p = PRINT_PRESETS[id]
  const o = getOrientation(p)
  const name =
    p.width === 2 && p.height === 6
      ? '2×6 Strip'
      : `${p.width}×${p.height} ${o === 'portrait' ? 'Portrait' : o === 'landscape' ? 'Landscape' : 'Square'}`
  return `${name} · ${p.dpi} DPI`
}

export const PRESET_OPTIONS: readonly { value: PrintPresetId; label: string }[] =
  PRINT_PRESET_IDS.map((id) => ({
    value: id,
    label: presetLabel(id)
  }))
export const DEFAULT_PRESET: PrintPresetId = 'photo-4x6-portrait-600'
