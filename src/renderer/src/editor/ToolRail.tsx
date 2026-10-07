import { Camera, Circle, Image, LayoutTemplate, Minus, PenTool, Square, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NEW_LAYER_KINDS, type NewLayerKind } from '@editor/newLayers'
import { TOOLS, type ToolId } from '@editor/tools'
import { editorStore } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { Tooltip } from '../ui/Tooltip'

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  design: PenTool,
  templates: LayoutTemplate,
  photos: Camera,
  assets: Image
}

const KIND_ICONS: Record<NewLayerKind, LucideIcon> = {
  photo: Camera,
  text: Type,
  rectangle: Square,
  ellipse: Circle,
  line: Minus
}

const GROUPS: readonly { title: string; kinds: readonly NewLayerKind[] }[] = [
  { title: 'Photos', kinds: ['photo'] },
  { title: 'Text', kinds: ['text'] },
  { title: 'Shapes', kinds: ['rectangle', 'ellipse', 'line'] }
]

/** Narrow icon rail for tool categories. Only "Design" is real today; the rest are visibly disabled. */
export function ToolRail(): React.JSX.Element {
  const tool = useLayout((s) => s.tool)
  const open = useLayout((s) => s.drawerOpen)
  return (
    <nav className="toolrail" aria-label="Tools" data-editor-panel>
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.id]
        const available = t.status === 'available'
        return (
          <Tooltip key={t.id} label={available ? t.label : (t.note ?? t.label)} placement="right">
            <button
              type="button"
              className={`toolrail-btn ${available && tool === t.id && open ? 'active' : ''}`}
              aria-label={t.label}
              aria-pressed={available ? tool === t.id && open : undefined}
              aria-disabled={!available}
              onClick={() => layoutStore.getState().clickTool(t.id)}
            >
              <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}

/** Contextual drawer for the active tool. Click an element to add it to the centre of the artboard. */
export function ToolDrawer(): React.JSX.Element | null {
  const open = useLayout((s) => s.drawerOpen)
  const tool = useLayout((s) => s.tool)
  if (!open || tool !== 'design') return null
  return (
    <aside className="tooldrawer" aria-label="Design elements" data-editor-panel>
      <h2 className="panel-heading">Add to design</h2>
      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h3 className="section-heading">{g.title}</h3>
          <ul className="drawer-list">
            {g.kinds.map((k) => {
              const Icon = KIND_ICONS[k]
              const label = NEW_LAYER_KINDS.find((x) => x.kind === k)?.label ?? k
              return (
                <li key={k}>
                  <button
                    type="button"
                    className="drawer-item"
                    onClick={() => editorStore.getState().addNewLayer(k)}
                  >
                    <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </aside>
  )
}
