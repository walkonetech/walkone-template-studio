import { Menu, app, type MenuItemConstructorOptions } from 'electron'

/**
 * Native application menu. The editor has its own in-app File / Edit / View menus (identical on every platform), so
 * the native menu stays minimal and exposes NO diagnostic commands in packaged builds:
 *  - macOS needs an app menu (About, Hide, Quit → the same guarded quit path as Cmd+Q), an Edit menu so Cut/Copy/Paste
 *    work in text fields, and a Window menu (Close → the same guarded window close).
 *  - Undo/Redo are shown but do NOT register their accelerators: the editor owns Cmd+Z / Shift+Cmd+Z, and in a text
 *    field the page's own undo handles them. (A registered accelerator would swallow the key before the editor saw it.)
 *  - Windows/Linux: no native menu bar at all.
 * Reload and DevTools exist only in development.
 */
function developMenu(): MenuItemConstructorOptions[] {
  if (app.isPackaged) return []
  return [{ label: 'Develop', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }]
}

export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', registerAccelerator: false },
        { role: 'redo', registerAccelerator: false },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    ...developMenu(),
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
