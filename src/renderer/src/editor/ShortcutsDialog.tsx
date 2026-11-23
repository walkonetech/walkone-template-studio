import { COMMANDS, MENUS, shortcutLabel, type CommandId } from '@editor/commands'
import { isMac } from './platform'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

/** Every command with a shortcut, in menu order (labels and keys come from the command model, never repeated). */
function commandRows(mac: boolean): [string, string][] {
  const seen = new Set<CommandId>()
  const rows: [string, string][] = []
  for (const m of MENUS)
    for (const id of m.items) {
      if (id === '-' || seen.has(id)) continue
      seen.add(id)
      const keys = shortcutLabel(COMMANDS[id].shortcut, mac)
      if (keys) rows.push([COMMANDS[id].label.replace(/…$/, ''), keys])
    }
  return rows
}

/**
 * Help › Keyboard shortcuts… (also the last item of the Layers "More" menu): the editor's command shortcuts and the
 * Layers panel keys, with the platform's own labels (⌘ on macOS, Ctrl elsewhere).
 */
export function ShortcutsDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.shortcutsOpen)
  if (!open) return null
  const mac = isMac()
  const mod = mac ? '⌘' : 'Ctrl+'
  const close = (): void => layoutStore.getState().setShortcutsOpen(false)
  const layerRows: [string, string][] = [
    ['Move between layers', '↑ ↓'],
    ['Extend selection', 'Shift + ↑ ↓'],
    ['Expand / collapse group', '→ ←'],
    ['Rename', 'Enter or F2'],
    ['Lock / unlock', 'L'],
    ['Show / hide', 'V'],
    ['Delete', mac ? '⌫' : 'Delete'],
    ['Toggle in selection', `${mod}click`],
    ['Select a range', 'Shift + click'],
    ['Reorder', 'Drag a row (within its group)']
  ]
  const canvasRows: [string, string][] = [
    ['Nudge 1 px (10 px with Shift)', 'Arrow keys'],
    ['Pan the canvas (pointer over the canvas)', 'Space + drag'],
    ['Close a popover, then the floating drawer, then clear the selection', 'Esc'],
    ['Move between areas of the window', 'F6 / Shift+F6'],
    ...((mac
      ? [['In an open menu, jump to an item', 'Type its first letter']]
      : [
          ['Redo (also)', 'Ctrl+Y'],
          ['Go to the menu bar (and back)', 'F10 or Alt'],
          ['Open a menu', 'Alt + its underlined letter'],
          ['Choose a menu item', 'Its underlined letter']
        ]) as [string, string][]),
    ['Custom size: next step', 'Enter in a field']
  ]
  const section = (title: string, rows: [string, string][]): React.JSX.Element => (
    <section aria-label={title}>
      <h3 className="section-heading">{title}</h3>
      <dl className="shortcut-list">
        {rows.map(([what, keys]) => (
          <div key={what}>
            <dt>{what}</dt>
            <dd>
              <kbd>{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
  return (
    <Dialog
      title="Keyboard shortcuts"
      description="In the Layers panel, the top of the list is the front of the artwork."
      onEscape={close}
      size="md"
      testId="shortcuts-dialog"
      footer={
        <Button variant="primary" data-autofocus onClick={close}>
          Done
        </Button>
      }
    >
      {section('Commands', commandRows(mac))}
      {section('Canvas and window', canvasRows)}
      {section('Layers panel', layerRows)}
    </Dialog>
  )
}
