import { app } from 'electron'

const counters = new Map<string, number>()

/**
 * Development-only answers for native dialogs, so scripted validation can drive them. Ignored entirely when the
 * app is packaged. A value may be a ';'-separated sequence consumed one entry per dialog (the last repeats), e.g.
 * WALKONE_DEV_UNSAVED_CHOICES="cancel;save;discard" or WALKONE_DEV_SAVE_PATH="CANCEL;/tmp/x.boothproject".
 */
export function devValue(name: string): string | undefined {
  if (app.isPackaged) return undefined
  const raw = process.env[name]
  if (!raw) return undefined
  const list = raw.split(';')
  const i = counters.get(name) ?? 0
  counters.set(name, i + 1)
  return list[Math.min(i, list.length - 1)]
}
