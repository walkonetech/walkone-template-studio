/**
 * The editor's command model: ONE list of commands that menus, tooltips and enablement all read, so labels, shortcuts
 * and "is this available now" never disagree between the menu bar, the toolbar and the Layers panel. Pure data and
 * decisions only; the renderer maps ids to store actions (`commandRunner.ts`).
 */

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.close'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.duplicate'
  | 'edit.delete'
  | 'edit.group'
  | 'edit.ungroup'
  | 'view.fit'
  | 'view.actual'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.snap'
  | 'view.previewPhotos'

/** Platform-neutral shortcut: `mod` is Command on macOS and Ctrl elsewhere. */
export interface Shortcut {
  /** Display key ("Z", "⌫", "+"). */
  key: string
  mod?: boolean
  shift?: boolean
  /** Lower-case `KeyboardEvent.key` values that trigger it, when they differ from `key` ("=" and "+" for zoom in). */
  match?: readonly string[]
}

export interface CommandContext {
  hasProject: boolean
  canUndo: boolean
  canRedo: boolean
  selectionCount: number
  snapping: boolean
  previewPhotos: boolean
}

interface CommandDef {
  label: string
  shortcut?: Shortcut
  /** True when the command needs an open project. Everything except New and Open does. */
  needsProject?: boolean
  needsSelection?: boolean
  /** Checkable commands show their state in menus. */
  checked?: (ctx: CommandContext) => boolean
}

export const COMMANDS: Readonly<Record<CommandId, CommandDef>> = {
  'file.new': { label: 'New project…', shortcut: { key: 'N', mod: true } },
  'file.open': { label: 'Open…', shortcut: { key: 'O', mod: true } },
  'file.save': { label: 'Save', shortcut: { key: 'S', mod: true }, needsProject: true },
  'file.saveAs': {
    label: 'Save As…',
    shortcut: { key: 'S', mod: true, shift: true },
    needsProject: true
  },
  'file.close': { label: 'Close project', needsProject: true },
  'edit.undo': { label: 'Undo', shortcut: { key: 'Z', mod: true }, needsProject: true },
  'edit.redo': {
    label: 'Redo',
    shortcut: { key: 'Z', mod: true, shift: true },
    needsProject: true
  },
  'edit.duplicate': {
    label: 'Duplicate',
    shortcut: { key: 'D', mod: true },
    needsProject: true,
    needsSelection: true
  },
  'edit.delete': {
    label: 'Delete',
    shortcut: { key: '⌫' },
    needsProject: true,
    needsSelection: true
  },
  'edit.group': {
    label: 'Group',
    shortcut: { key: 'G', mod: true },
    needsProject: true,
    needsSelection: true
  },
  'edit.ungroup': {
    label: 'Ungroup',
    shortcut: { key: 'G', mod: true, shift: true },
    needsProject: true,
    needsSelection: true
  },
  'view.fit': {
    label: 'Fit to window',
    shortcut: { key: '0', mod: true },
    needsProject: true
  },
  'view.actual': {
    label: 'Actual size (100%)',
    shortcut: { key: '1', mod: true },
    needsProject: true
  },
  'view.zoomIn': {
    label: 'Zoom in',
    shortcut: { key: '+', mod: true, match: ['=', '+'] },
    needsProject: true
  },
  'view.zoomOut': {
    label: 'Zoom out',
    shortcut: { key: '−', mod: true, match: ['-', '_'] },
    needsProject: true
  },
  'view.snap': { label: 'Snap to guides', needsProject: true, checked: (c) => c.snapping },
  'view.previewPhotos': {
    label: 'Preview photos',
    needsProject: true,
    checked: (c) => c.previewPhotos
  }
}

export function isCommandEnabled(id: CommandId, ctx: CommandContext): boolean {
  const def = COMMANDS[id]
  if (def.needsProject && !ctx.hasProject) return false
  if (def.needsSelection && ctx.selectionCount === 0) return false
  if (id === 'edit.undo') return ctx.canUndo
  if (id === 'edit.redo') return ctx.canRedo
  // Sample photos do not exist yet (Phase 5C), so there is nothing to preview.
  if (id === 'view.previewPhotos') return false
  return true
}

export const isCommandChecked = (id: CommandId, ctx: CommandContext): boolean | undefined =>
  COMMANDS[id].checked?.(ctx)

/** "⇧⌘Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function shortcutLabel(s: Shortcut | undefined, mac: boolean): string {
  if (!s) return ''
  if (mac) return `${s.shift ? '⇧' : ''}${s.mod ? '⌘' : ''}${s.key}`
  return [s.mod ? 'Ctrl' : '', s.shift ? 'Shift' : '', s.key === '⌫' ? 'Delete' : s.key]
    .filter(Boolean)
    .join('+')
}

export const MENUS: readonly { id: string; label: string; items: readonly (CommandId | '-')[] }[] =
  [
    {
      id: 'file',
      label: 'File',
      items: ['file.new', 'file.open', '-', 'file.save', 'file.saveAs', '-', 'file.close']
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        'edit.undo',
        'edit.redo',
        '-',
        'edit.duplicate',
        'edit.delete',
        '-',
        'edit.group',
        'edit.ungroup'
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        'view.fit',
        'view.actual',
        'view.zoomIn',
        'view.zoomOut',
        '-',
        'view.snap',
        'view.previewPhotos'
      ]
    }
  ]

/** The command a key press maps to, or null. `mod` = the platform's primary modifier is held. */
export function commandForKey(
  e: { key: string; shiftKey: boolean },
  mod: boolean
): CommandId | null {
  const key = e.key.toLowerCase()
  for (const id of Object.keys(COMMANDS) as CommandId[]) {
    const sc = COMMANDS[id].shortcut
    if (!sc || !!sc.mod !== mod) continue
    const keys = sc.match ?? [sc.key.toLowerCase()]
    if (!keys.includes(key)) continue
    // Zoom keys ignore Shift (Cmd+Shift+= is how "+" is typed); everything else must match exactly.
    if (!sc.match && !!sc.shift !== e.shiftKey) continue
    return id
  }
  return null
}
