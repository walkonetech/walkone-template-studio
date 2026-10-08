import { useState } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween
} from 'lucide-react'
import type { AlignMode, AlignTarget } from '@editor/arrange'
import { editorStore } from './editorStore'
import { IconButton } from '../ui/IconButton'

const ALIGN: readonly { mode: AlignMode; label: string; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Align left', icon: AlignStartVertical },
  { mode: 'hcenter', label: 'Align horizontal centers', icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { mode: 'vcenter', label: 'Align vertical centers', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal }
]

/**
 * Align and distribute for the current selection. Several layers align to the selection's bounds (or to the canvas);
 * a single layer can only align to the canvas. Distribute needs three layers. Each button is one undo step.
 */
export function ArrangeControls({ count }: { count: number }): React.JSX.Element {
  const [target, setTarget] = useState<AlignTarget>('selection')
  const effective: AlignTarget = count === 1 ? 'canvas' : target
  const st = editorStore.getState
  return (
    <div className="arrange" role="group" aria-label="Align and distribute">
      {count > 1 && (
        <div className="seg" role="radiogroup" aria-label="Align to">
          {(['selection', 'canvas'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={target === t}
              onClick={() => setTarget(t)}
            >
              {t === 'selection' ? 'Selection' : 'Canvas'}
            </button>
          ))}
        </div>
      )}
      {count === 1 && <p className="field-note">Aligns this layer to the canvas.</p>}
      <div className="arrange-row">
        {ALIGN.map((a) => (
          <IconButton
            key={a.mode}
            size="sm"
            icon={a.icon}
            label={`${a.label}${effective === 'canvas' ? ' to canvas' : ''}`}
            onClick={() => st().alignSelection(a.mode, effective)}
          />
        ))}
        <span className="ui-divider" aria-hidden="true" />
        <IconButton
          size="sm"
          icon={AlignHorizontalSpaceBetween}
          label="Distribute horizontally"
          disabled={count < 3}
          onClick={() => st().distributeSelection('horizontal')}
        />
        <IconButton
          size="sm"
          icon={AlignVerticalSpaceBetween}
          label="Distribute vertically"
          disabled={count < 3}
          onClick={() => st().distributeSelection('vertical')}
        />
      </div>
      {count < 3 && <p className="field-note">Distribute needs three or more layers.</p>}
    </div>
  )
}
