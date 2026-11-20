/**
 * The labelled left rail (Phase 7B B3, B1 mockups): five categories, each opening a tool drawer. Every category is
 * real (no disabled "coming soon" entries): Elements adds photo slots, text and shapes; Text adds text and applies the
 * quick text styles; Photos adds and lists the design's photo slots; Uploads holds this project's own images; Colors
 * holds the Event Palette and the canvas background. Adding a category later means an entry here and a drawer body.
 */
export type ToolId = 'elements' | 'text' | 'photos' | 'uploads' | 'colors'

export interface ToolDef {
  id: ToolId
  label: string
  /** One sentence for the rail tooltip. */
  hint: string
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'elements', label: 'Elements', hint: 'Add photo slots, text and shapes' },
  { id: 'text', label: 'Text', hint: 'Add text and apply quick text styles' },
  { id: 'photos', label: 'Photos', hint: 'Photo slots: where the booth places guest photos' },
  { id: 'uploads', label: 'Uploads', hint: 'Your own images in this project' },
  { id: 'colors', label: 'Colors', hint: 'The event palette and the canvas background' }
]

export const isToolId = (v: unknown): v is ToolId => TOOLS.some((t) => t.id === v)

/** Selecting another category opens its drawer; selecting the open category again closes the drawer. */
export function nextToolState(
  current: { tool: ToolId; open: boolean },
  clicked: ToolId
): { tool: ToolId; open: boolean } {
  if (!isToolId(clicked)) return current
  if (clicked === current.tool) return { tool: current.tool, open: !current.open }
  return { tool: clicked, open: true }
}
