import { Camera, Check, Palette, Type, X } from 'lucide-react'
import { TIPS_FOOTER, tipSteps, tipsVisible, type TipStepId } from '@editor/firstRun'
import { selectViewMode, selectViewTransform, selectDesignSize } from '@editor/store'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { appearanceStore, useAppearance } from '../appearance/appearanceStore'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

const ICONS: Readonly<Record<TipStepId, typeof Camera>> = {
  photo: Camera,
  text: Type,
  colors: Palette
}

const openTool = (tool: 'text' | 'colors'): void => {
  const l = layoutStore.getState()
  if (!(l.drawerOpen && l.tool === tool)) l.clickTool(tool)
}

const run = (id: TipStepId): void => {
  if (id === 'photo') editorStore.getState().addNewLayer('photo')
  else if (id === 'text') openTool('text')
  else openTool('colors')
}

/** Card width (CSS px before the interface scale). */
const CARD_WIDTH = 300

/**
 * Getting-started tips (B5, B1 mockup 02b): a light card beside the artboard of a new blank project. Three steps with
 * one button each and a line about checking before export. Not a wizard and not modal: the editor stays fully usable,
 * nothing changes until a button is pressed, and it never blocks Save or Export. × hides it for this project; "Hide
 * these tips" turns it off on this computer (Settings › Editor turns it back on).
 */
export function FirstRunTips(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  const viewMode = useEditor(selectViewMode)
  // Subscribe to the view's stable inputs; the transform and design size are derived (new objects each time).
  useEditor((s) => s.view)
  const view = selectViewTransform(editorStore.getState())
  const design = selectDesignSize(editorStore.getState())
  const viewport = useEditor((s) => s.viewport)
  const pref = useAppearance((s) => s.showGettingStartedTips)
  const tipsSession = useLayout((s) => s.tipsSession)
  const closed = useLayout((s) => s.tipsClosed)
  const scale = useAppearance((s) => s.uiScale)
  if (
    !project ||
    !tipsVisible({
      pref,
      origin: sessionId !== null && tipsSession === sessionId ? 'new-blank' : null,
      closedForThisProject: closed,
      viewMode
    })
  )
    return null
  const steps = tipSteps(project)
  // Beside the artboard when there is room (B1 02b); otherwise against the right edge of the canvas area.
  const width = CARD_WIDTH * scale
  const artRight = view && design ? view.offsetX + design.width * view.scale : 0
  const beside = artRight + 40 + width + 16 <= viewport.width
  const left = beside ? artRight + 40 : Math.max(16, viewport.width - width - 16)
  return (
    <aside
      className="first-run"
      aria-labelledby="first-run-title"
      data-testid="first-run-tips"
      data-placement={beside ? 'beside' : 'edge'}
      style={{ left, width }}
    >
      <header className="first-run-head">
        <h2 id="first-run-title">Three steps to a template</h2>
        <IconButton
          size="sm"
          icon={X}
          label="Close tips for this project"
          onClick={() => layoutStore.getState().closeTips()}
        />
      </header>
      <ol className="first-run-steps">
        {steps.map((s, i) => {
          const Icon = ICONS[s.id]
          return (
            <li
              key={s.id}
              className="first-run-step"
              data-step={s.id}
              data-done={s.done || undefined}
            >
              <span className="first-run-num" aria-hidden="true">
                {s.done ? <Check size={13} strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="first-run-body">
                <span className="first-run-title">
                  {s.title}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
                <span className="first-run-text">{s.text}</span>
                <Button size="sm" icon={Icon} onClick={() => run(s.id)} data-tip-action={s.id}>
                  {s.action}
                </Button>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="first-run-foot">{TIPS_FOOTER}</p>
      <button
        type="button"
        className="link first-run-hide"
        data-testid="hide-tips"
        onClick={() => appearanceStore.getState().setShowGettingStartedTips(false)}
      >
        Hide these tips
      </button>
    </aside>
  )
}
