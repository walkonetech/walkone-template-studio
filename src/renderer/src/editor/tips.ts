import { commandTip, type CommandId } from '@editor/commands'
import { TIPS, type TipId } from '@editor/tooltips'
import { isMac } from './platform'

/**
 * Tooltip props for a COMMAND (hint and shortcut come from the command model, so they cannot drift) or for a
 * non-command control (`TIPS`). Spread into IconButton / Tooltip.
 */
export function commandTipProps(id: CommandId): { hint: string; shortcut?: string } {
  const t = commandTip(id, isMac())
  return { hint: t.hint, ...(t.shortcut ? { shortcut: t.shortcut } : {}) }
}

export const tipProps = (id: TipId): { hint: string } => ({ hint: TIPS[id].hint })
