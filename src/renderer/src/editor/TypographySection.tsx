import { useId, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, FoldVertical, TriangleAlert } from 'lucide-react'
import type { TemplateProject, TextLayer } from '@domain'
import { collectProjectFonts, primaryFamily } from '@editor/fonts'
import { TEXT_STYLE_OPTIONS, textStyleFromValue, textStyleValue } from '@editor/propertiesModel'
import { editorStore } from './editorStore'
import { fontStatusOf, useFontCatalog } from './fontCatalog'
import { FontPicker } from './FontPicker'
import { ColorField, FieldRow, NumberField, NumberInputBare, TextAreaField } from './fields'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { onRadioGroupKeyDown } from '../ui/radioGroupKeys'

const ALIGNS = [
  { value: 'left', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right', label: 'Right', icon: AlignRight }
] as const

type Patch = Parameters<ReturnType<typeof editorStore.getState>['editLayers']>[1]
const edit = (id: string, patch: Patch, continuous = false): void => {
  editorStore
    .getState()
    .editLayers(
      [id],
      patch,
      continuous ? { coalesceKey: `color:${id}:${Object.keys(patch).join(',')}` } : {}
    )
}

/**
 * Text ESSENTIALS (B5, B1 mockup 03): Content · Font (with the missing-font replacement) · Style + Size · Color ·
 * Align. Style is weight and italic as one choice ("Regular", "Bold Italic"). Line and letter spacing and the text box
 * live in the "Spacing & box" section (`TextSpacingSection`). Ready-made styles are in the Text drawer.
 */
export function TextEssentials({
  layer,
  project,
  locked
}: {
  layer: TextLayer
  project: TemplateProject
  locked: boolean
}): React.JSX.Element {
  useFontCatalog() // re-render when the installed-font list arrives
  const st = editorStore.getState
  const status = fontStatusOf(layer.fontFamily)
  const fonts = collectProjectFonts(project.layers)
  const projectFonts = fonts.map((f) => f.family)
  const requested = primaryFamily(layer.fontFamily) || layer.fontFamily
  const [replacement, setReplacement] = useState<string | null>(null)
  const sameUses =
    fonts.find((f) => f.family.toLowerCase() === requested.toLowerCase())?.layerIds.length ?? 1
  const styleId = useId()
  const sizeId = useId()
  return (
    <div className="essentials" data-essentials="text">
      <TextAreaField
        label="Content"
        value={layer.content}
        disabled={locked}
        onCommit={(content) => st().commitText(layer.id, content)}
      />
      <FontPicker
        label="Font"
        value={layer.fontFamily}
        projectFonts={projectFonts}
        disabled={locked}
        onCommit={(fontFamily) => edit(layer.id, { fontFamily })}
      />
      {status.availability === 'missing' && (
        <div className="font-alert" role="alert" data-testid="font-missing">
          <strong>
            <TriangleAlert size={13} aria-hidden="true" /> Font unavailable
          </strong>
          <p>
            “{requested}” is not installed on this computer. Template Studio is displaying a
            fallback font; the project keeps asking for “{requested}”.
          </p>
          <FontPicker
            label="Replace with"
            value={replacement ?? ''}
            projectFonts={projectFonts}
            disabled={locked}
            onCommit={setReplacement}
          />
          <div className="button-row">
            <Button
              size="sm"
              disabled={locked || !replacement}
              onClick={() => {
                if (replacement) edit(layer.id, { fontFamily: replacement })
                setReplacement(null)
              }}
            >
              Replace on this layer
            </Button>
            <Tooltip label="Replace all uses" hint="Replace this font on every matching text layer">
              <Button
                size="sm"
                disabled={!replacement}
                onClick={() => {
                  if (replacement) st().replaceFont(requested, replacement)
                  setReplacement(null)
                }}
              >
                Replace all uses ({sameUses})
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
      {status.availability === 'unknown' && (
        <p className="field-note">Checking whether this font is installed…</p>
      )}
      <FieldRow label="Style" htmlFor={styleId}>
        <span className="style-size">
          <select
            id={styleId}
            className="ui-select"
            value={textStyleValue(layer)}
            disabled={locked}
            onChange={(e) => {
              const v = textStyleFromValue(e.target.value)
              if (v) edit(layer.id, v)
            }}
          >
            {TEXT_STYLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label htmlFor={sizeId} className="sr-only">
            Font size (px)
          </label>
          <NumberInputBare
            id={sizeId}
            unit="px"
            value={layer.fontSize}
            rule={{ positive: true }}
            disabled={locked}
            onCommit={(fontSize) => edit(layer.id, { fontSize })}
          />
        </span>
      </FieldRow>
      <ColorField
        label="Color"
        value={layer.fill}
        palette={project.palette}
        disabled={locked}
        onCommit={(fill, c) => edit(layer.id, { fill }, c)}
      />
      <FieldRow label="Align">
        <span
          className="seg"
          role="radiogroup"
          onKeyDown={onRadioGroupKeyDown}
          aria-label="Text alignment"
        >
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={layer.align === a.value}
              aria-label={a.label}
              title={a.label}
              disabled={locked}
              onClick={() => edit(layer.id, { align: a.value })}
            >
              <a.icon size={15} aria-hidden="true" />
            </button>
          ))}
        </span>
      </FieldRow>
    </div>
  )
}

/** "Spacing & box": line height, letter spacing and the text box (B5; was Size & spacing + Text box). */
export function TextSpacingSection({
  layer,
  locked
}: {
  layer: TextLayer
  locked: boolean
}): React.JSX.Element {
  const st = editorStore.getState
  return (
    <>
      <div className="grid-2">
        <NumberField
          label="Line height"
          unit="×"
          value={layer.lineHeight}
          rule={{ positive: true }}
          disabled={locked}
          onCommit={(lineHeight) => edit(layer.id, { lineHeight })}
        />
        <NumberField
          label="Letter spacing"
          unit="px"
          value={layer.letterSpacing}
          disabled={locked}
          onCommit={(letterSpacing) => edit(layer.id, { letterSpacing })}
        />
      </div>
      <dl className="derived">
        <div>
          <dt>Box</dt>
          <dd>
            {Math.round(layer.width)} × {Math.round(layer.height * 100) / 100} px
          </dd>
        </div>
      </dl>
      <div className="button-row">
        <Tooltip
          label="Fit height to content"
          hint="Resize the text box height to fit its current content"
        >
          <Button
            size="sm"
            icon={FoldVertical}
            disabled={locked}
            onClick={() => st().fitTextHeight(layer.id)}
          >
            Fit height to content
          </Button>
        </Tooltip>
      </div>
      <p className="field-note">
        Width is set in Position &amp; size. Fit height keeps the width and font size and resizes
        the box to the text as it is drawn now.
      </p>
    </>
  )
}
