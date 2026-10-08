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

export type PrintType = 'photo-4x6' | 'strip-2x6'
export type SheetOrientation = 'portrait' | 'landscape'
export type PrintDpi = 300 | 600
export const PRINT_DPIS: readonly PrintDpi[] = [300, 600]

/** The preset for the New Project choices ("what are you printing" + orientation + resolution). */
export function presetIdFor(
  type: PrintType,
  orientation: SheetOrientation,
  dpi: PrintDpi
): PrintPresetId {
  if (type === 'strip-2x6') return dpi === 300 ? 'strip-2x6-300' : 'strip-2x6-600'
  return `photo-4x6-${orientation}-${dpi}` as PrintPresetId
}

/** Plain-language description of what a New Project choice will create (design size, print sheet, copies). */
export function describeNewProject(
  type: PrintType,
  orientation: SheetOrientation,
  dpi: PrintDpi
): { design: string; sheet: string | null; note: string } {
  const p = PRINT_PRESETS[presetIdFor(type, orientation, dpi)]
  const px = (w: number, h: number): string => `${Math.round(w * dpi)}×${Math.round(h * dpi)} px`
  if (type === 'strip-2x6') {
    return {
      design: `Design size: 2×6 in (${px(p.width, p.height)}), vertical`,
      sheet: `Print sheet: 4×6 in (${px(p.width * 2, p.height)}), 2 copies side by side`,
      note: 'Design one 2×6 strip. Template Studio will place two identical copies on the 4×6 print sheet. Printer finishing: configure DSLR Booth and your printer for the 2-inch center cut.'
    }
  }
  return {
    design: `Design size: ${p.width}×${p.height} in (${px(p.width, p.height)}), ${orientation}`,
    sheet: null,
    note: 'The design is printed as is: one copy per 4×6 print.'
  }
}
