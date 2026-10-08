/**
 * The left tool rail's structure. `design` (elements to add, canvas background) and `assets` (project images) are real today; the
 * other categories are declared so the layout is established, and are shown disabled with an honest "later phase"
 * tooltip. Adding a category later means adding an entry here and a drawer body for it, not reworking the rail.
 */
export type ToolId = 'design' | 'templates' | 'photos' | 'assets'

export interface ToolDef {
  id: ToolId
  label: string
  status: 'available' | 'planned'
  /** Shown as the tooltip of a planned tool. */
  note?: string
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'design', label: 'Design', status: 'available' },
  {
    id: 'templates',
    label: 'Templates',
    status: 'planned',
    note: 'Template gallery arrives in a later phase'
  },
  {
    id: 'photos',
    label: 'Photos',
    status: 'planned',
    note: 'Sample photos arrive in a later phase'
  },
  { id: 'assets', label: 'Assets', status: 'available' }
]

/** Selecting a planned tool does nothing; selecting the active tool toggles the drawer. */
export function nextToolState(
  current: { tool: ToolId; open: boolean },
  clicked: ToolId
): { tool: ToolId; open: boolean } {
  const def = TOOLS.find((t) => t.id === clicked)
  if (!def || def.status !== 'available') return current
  if (clicked === current.tool) return { tool: current.tool, open: !current.open }
  return { tool: clicked, open: true }
}
