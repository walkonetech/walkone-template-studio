import { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, FoldVertical, TriangleAlert } from 'lucide-react'
import type { TemplateProject, TextLayer } from '@domain'
import { collectProjectFonts, primaryFamily } from '@editor/fonts'
import { TEXT_PRESETS } from '@editor/textPresets'
import { editorStore } from './editorStore'
import { fontStatusOf, useFontCatalog } from './fontCatalog'
import { FontPicker } from './FontPicker'
import { ColorField, FieldRow, NumberField, SelectField, TextAreaField } from './fields'
import { PanelSection } from '../ui/PanelSection'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { useLayout, layoutStore } from './layoutStore'

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
  value: w,
  label: String(w)
}))

const ALIGNS = [
  { value: 'left', label: 'Left', icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right', label: 'Right', icon: AlignRight }
] as const

function Section({
  id,
  title,
  children
}: {
  id: string
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  const collapsed = useLayout((s) => s.collapsedSections.includes(id))
  return (
    <PanelSection
      title={title}
      open={!collapsed}
      onToggle={() => layoutStore.getState().toggleSection(id)}
    >
      {children}
    </PanelSection>
  )
}

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

/** The typography workflow for one text layer: content and presets, typeface (with missing-font handling), size & spacing, alignment & colour, text box. */
export function TypographySection({
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
  return (
    <>
      <Section id="text" title="Text">
        <TextAreaField
          label="Content"
          value={layer.content}
          disabled={locked}
          onCommit={(content) => st().commitText(layer.id, content)}
        />
        <SelectField
          label="Style preset"
          value=""
          options={[
            { value: '', label: 'Apply a preset…' },
            ...TEXT_PRESETS.map((p) => ({ value: p.id, label: `${p.label}: ${p.hint}` }))
          ]}
          disabled={locked}
          onCommit={(id) =>
            id &&
            st().applyTextPreset(layer.id, id, (f) => fontStatusOf(f).availability === 'available')
          }
        />
      </Section>
      <Section id="typeface" title="Typeface">
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
              <Tooltip
                label="Replace all uses"
                hint="Replace this font on every matching text layer"
              >
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
        <SelectField
          label="Weight"
          value={layer.fontWeight}
          options={WEIGHTS}
          disabled={locked}
          onCommit={(fontWeight) => edit(layer.id, { fontWeight })}
        />
        <SelectField
          label="Style"
          value={layer.fontStyle}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' }
          ]}
          disabled={locked}
          onCommit={(fontStyle) => edit(layer.id, { fontStyle })}
        />
        <p className="field-note">
          Weight and style use the font&apos;s own variants when it has them; otherwise the system
          approximates them.
        </p>
      </Section>
      <Section id="type-size" title="Size & spacing">
        <NumberField
          label="Font size"
          unit="px"
          value={layer.fontSize}
          rule={{ positive: true }}
          disabled={locked}
          onCommit={(fontSize) => edit(layer.id, { fontSize })}
        />
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
      </Section>
      <Section id="type-align" title="Alignment & color">
        <FieldRow label="Align">
          <span className="seg" role="radiogroup" aria-label="Text alignment">
            {ALIGNS.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={layer.align === a.value}
                disabled={locked}
                onClick={() => edit(layer.id, { align: a.value })}
              >
                <a.icon size={14} aria-hidden="true" /> {a.label}
              </button>
            ))}
          </span>
        </FieldRow>
        <ColorField
          label="Color"
          value={layer.fill}
          palette={project.palette}
          disabled={locked}
          onCommit={(fill, c) => edit(layer.id, { fill }, c)}
        />
      </Section>
      <Section id="text-box" title="Text box">
        <dl className="derived">
          <div>
            <dt>Width</dt>
            <dd>{Math.round(layer.width)} px</dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{Math.round(layer.height * 100) / 100} px</dd>
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
          Width is set in Transform. Fit height keeps the width and font size and resizes the box to
          the text as it is drawn now; run it again after changing the font, size or text.
        </p>
      </Section>
    </>
  )
}
