/**
 * The editor's command model: ONE list of commands that menus, tooltips and enablement all read, so labels, shortcuts
 * and "is this available now" never disagree between the menu bar, the toolbar and the Layers panel. Pure data and
 * decisions only; the renderer maps ids to store actions (`commandRunner.ts`).
 */

export type CommandId =
  | 'file.new'
  | 'file.open'
  | 'file.importDslr'
  | 'file.save'
  | 'file.saveAs'
  | 'file.export'
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
  | 'view.showOverflow'
  | 'view.shufflePhotos'
  | 'view.design'
  | 'view.printPreview'
  | 'view.safeAreas'
  | 'view.outputProfile'
  | 'view.themeLight'
  | 'view.themeDark'
  | 'view.themeSystem'
  | 'view.densityComfortable'
  | 'view.densityCompact'
  | 'arrange.alignLeft'
  | 'arrange.alignCenter'
  | 'arrange.alignRight'
  | 'arrange.alignTop'
  | 'arrange.alignMiddle'
  | 'arrange.alignBottom'
  | 'arrange.distributeH'
  | 'arrange.distributeV'

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
  /** The project prints several copies per sheet, so a Print Preview exists. */
  hasPrintPreview: boolean
  /** Artwork beyond the artboard is shown (not the clipped view). */
  showOverflow: boolean
  viewMode: 'design' | 'preview'
  /** An Output Profile is selected (safe areas exist only then). */
  hasOutputProfile: boolean
  showSafeAreas: boolean
  /** App appearance (B2, ADR-055): a per-computer preference, not project state. */
  theme?: 'light' | 'dark' | 'system'
  density?: 'comfortable' | 'compact'
}

interface CommandDef {
  label: string
  /** One sentence for the tooltip: what it does (shortcuts are derived from `shortcut`, never repeated here). */
  hint: string
  shortcut?: Shortcut
  /** True when the command needs an open project. Everything except New and Open does. */
  needsProject?: boolean
  needsSelection?: boolean
  /** Checkable commands show their state in menus. */
  checked?: (ctx: CommandContext) => boolean
}

export const COMMANDS: Readonly<Record<CommandId, CommandDef>> = {
  'file.new': {
    label: 'New project…',
    hint: 'Create a new project',
    shortcut: { key: 'N', mod: true }
  },
  'file.open': {
    label: 'Open…',
    hint: 'Open a saved .boothproject file',
    shortcut: { key: 'O', mod: true }
  },
  'file.importDslr': {
    label: 'Import dslrBooth template…',
    hint: 'Turn a dslrBooth template ZIP into a new project you can edit'
  },
  'file.save': {
    label: 'Save',
    hint: 'Save the project to its .boothproject file',
    shortcut: { key: 'S', mod: true },
    needsProject: true
  },
  'file.saveAs': {
    label: 'Save As…',
    hint: 'Save the project to a new file',
    shortcut: { key: 'S', mod: true, shift: true },
    needsProject: true
  },
  'file.export': {
    label: 'Export…',
    hint: 'Export a dslrBooth template, print PNGs or a proof after checking the design',
    shortcut: { key: 'E', mod: true },
    needsProject: true
  },
  'file.close': { label: 'Close project', hint: 'Close the project', needsProject: true },
  'edit.undo': {
    label: 'Undo',
    hint: 'Undo the last change',
    shortcut: { key: 'Z', mod: true },
    needsProject: true
  },
  'edit.redo': {
    label: 'Redo',
    hint: 'Redo the change you undid',
    shortcut: { key: 'Z', mod: true, shift: true },
    needsProject: true
  },
  'edit.duplicate': {
    label: 'Duplicate',
    hint: 'Duplicate the selected layers',
    shortcut: { key: 'D', mod: true },
    needsProject: true,
    needsSelection: true
  },
  'edit.delete': {
    label: 'Delete',
    hint: 'Delete the selected layers',
    shortcut: { key: '⌫' },
    needsProject: true,
    needsSelection: true
  },
  'edit.group': {
    label: 'Group',
    hint: 'Group the selected layers so they move together',
    shortcut: { key: 'G', mod: true },
    needsProject: true,
    needsSelection: true
  },
  'edit.ungroup': {
    label: 'Ungroup',
    hint: 'Release the layers of the selected group',
    shortcut: { key: 'G', mod: true, shift: true },
    needsProject: true,
    needsSelection: true
  },
  'view.fit': {
    label: 'Fit to window',
    hint: 'Fit the whole artboard in the workspace',
    shortcut: { key: '0', mod: true },
    needsProject: true
  },
  'view.actual': {
    label: 'Actual size (100%)',
    hint: 'View at 100% (one design pixel per screen pixel)',
    shortcut: { key: '1', mod: true },
    needsProject: true
  },
  'view.zoomIn': {
    label: 'Zoom in',
    hint: 'Zoom in on the workspace',
    shortcut: { key: '+', mod: true, match: ['=', '+'] },
    needsProject: true
  },
  'view.zoomOut': {
    label: 'Zoom out',
    hint: 'Zoom out of the workspace',
    shortcut: { key: '−', mod: true, match: ['-', '_'] },
    needsProject: true
  },
  'view.snap': {
    label: 'Snap to guides',
    hint: 'Snap objects to canvas and layer alignment guides',
    needsProject: true,
    checked: (c) => c.snapping
  },
  'view.design': {
    label: 'Design view',
    hint: 'Edit the single design',
    needsProject: true,
    checked: (c) => c.viewMode === 'design'
  },
  'view.printPreview': {
    label: 'Print Preview',
    hint: 'See the print sheet with every copy (read-only)',
    needsProject: true,
    checked: (c) => c.viewMode === 'preview'
  },
  'view.safeAreas': {
    label: 'Safe areas',
    hint: 'Show the output profile’s expected trim, keep-safe lines and cut (guides only, never printed)',
    needsProject: true,
    checked: (c) => c.hasOutputProfile && c.showSafeAreas
  },
  'view.outputProfile': {
    label: 'Output profile…',
    hint: 'Choose the printer and media profile used for safe areas and checks (not saved in the project)',
    needsProject: true
  },
  'arrange.alignLeft': {
    label: 'Align left',
    hint: 'Align the selected objects to the left edge',
    needsProject: true,
    needsSelection: true
  },
  'arrange.alignCenter': {
    label: 'Align horizontal centers',
    hint: 'Align the selected objects on their horizontal centers',
    needsProject: true,
    needsSelection: true
  },
  'arrange.alignRight': {
    label: 'Align right',
    hint: 'Align the selected objects to the right edge',
    needsProject: true,
    needsSelection: true
  },
  'arrange.alignTop': {
    label: 'Align top',
    hint: 'Align the selected objects to the top edge',
    needsProject: true,
    needsSelection: true
  },
  'arrange.alignMiddle': {
    label: 'Align vertical centers',
    hint: 'Align the selected objects on their vertical centers',
    needsProject: true,
    needsSelection: true
  },
  'arrange.alignBottom': {
    label: 'Align bottom',
    hint: 'Align the selected objects to the bottom edge',
    needsProject: true,
    needsSelection: true
  },
  'arrange.distributeH': {
    label: 'Distribute horizontally',
    hint: 'Distribute three or more selected objects with equal horizontal spacing',
    needsProject: true,
    needsSelection: true
  },
  'arrange.distributeV': {
    label: 'Distribute vertically',
    hint: 'Distribute three or more selected objects with equal vertical spacing',
    needsProject: true,
    needsSelection: true
  },
  'view.showOverflow': {
    label: 'Show overflow',
    hint: 'Show artwork that extends beyond the printable artboard (off = clipped view, as printed)',
    needsProject: true,
    checked: (c) => c.showOverflow
  },
  'view.shufflePhotos': {
    label: 'Shuffle photos',
    hint: 'Pick a different set of sample photos',
    needsProject: true
  },
  'view.previewPhotos': {
    label: 'Preview photos',
    hint: 'Show sample photos inside photo placeholders',
    needsProject: true,
    checked: (c) => c.previewPhotos
  },
  // Appearance (B2): interim home until Settings › Appearance (B5). Settings of this computer, never the project.
  'view.themeLight': {
    label: 'Light theme',
    hint: 'Use the light interface (the default). Your designs are never recoloured.',
    checked: (c) => c.theme === 'light'
  },
  'view.themeDark': {
    label: 'Dark theme',
    hint: 'Use the dark interface. Your designs are never recoloured.',
    checked: (c) => c.theme === 'dark'
  },
  'view.themeSystem': {
    label: 'Match system theme',
    hint: 'Follow the light or dark setting of this computer',
    checked: (c) => c.theme === 'system'
  },
  'view.densityComfortable': {
    label: 'Comfortable size',
    hint: 'Larger controls and text (the default)',
    checked: (c) => c.density === 'comfortable'
  },
  'view.densityCompact': {
    label: 'Compact size',
    hint: 'Smaller controls: more room for the canvas and panels',
    checked: (c) => c.density === 'compact'
  }
}

export function isCommandEnabled(id: CommandId, ctx: CommandContext): boolean {
  const def = COMMANDS[id]
  if (def.needsProject && !ctx.hasProject) return false
  if (def.needsSelection && ctx.selectionCount === 0) return false
  if (id === 'edit.undo') return ctx.canUndo
  if (id === 'edit.redo') return ctx.canRedo
  if (id === 'view.printPreview' || id === 'view.design') return ctx.hasPrintPreview
  // Arranging edits artwork, which only Design mode does. Align needs one layer (to the canvas) or more; distribute three.
  if (id.startsWith('arrange.')) {
    if (ctx.viewMode !== 'design') return false
    return id === 'arrange.distributeH' || id === 'arrange.distributeV'
      ? ctx.selectionCount >= 3
      : ctx.selectionCount >= 1
  }
  if (id === 'view.shufflePhotos') return ctx.previewPhotos
  if (id === 'view.safeAreas') return ctx.hasOutputProfile
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
      items: [
        'file.new',
        'file.open',
        'file.importDslr',
        '-',
        'file.save',
        'file.saveAs',
        '-',
        'file.export',
        '-',
        'file.close'
      ]
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
      id: 'align',
      label: 'Align',
      items: [
        'arrange.alignLeft',
        'arrange.alignCenter',
        'arrange.alignRight',
        '-',
        'arrange.alignTop',
        'arrange.alignMiddle',
        'arrange.alignBottom',
        '-',
        'arrange.distributeH',
        'arrange.distributeV'
      ]
    },
    {
      id: 'view',
      label: 'View',
      items: [
        'view.design',
        'view.printPreview',
        '-',
        'view.fit',
        'view.actual',
        'view.zoomIn',
        'view.zoomOut',
        '-',
        'view.snap',
        'view.showOverflow',
        '-',
        'view.safeAreas',
        'view.outputProfile',
        '-',
        'view.previewPhotos',
        'view.shufflePhotos',
        '-',
        'view.themeLight',
        'view.themeDark',
        'view.themeSystem',
        '-',
        'view.densityComfortable',
        'view.densityCompact'
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

/** What a tooltip for a command shows. The shortcut is derived from the command's own definition, never repeated. */
export function commandTip(
  id: CommandId,
  mac: boolean
): { label: string; hint: string; shortcut: string } {
  const def = COMMANDS[id]
  return { label: def.label, hint: def.hint, shortcut: shortcutLabel(def.shortcut, mac) }
}
