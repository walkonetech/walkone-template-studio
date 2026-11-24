import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CircleAlert, Ruler } from 'lucide-react'
import {
  createProjectFromFormat,
  getPixelSize,
  summarizeFormat,
  formatDesignPrint,
  type FormatDefinition,
  type TemplateProject
} from '@domain'
import { renderOutputToCanvas, renderProjectToCanvas } from '@canvas/rendering/renderProject'
import { cssFontFamily, familyKey } from '@canvas/rendering/fontStack'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import {
  COLOR_SETS,
  GUIDE_STEPS,
  GUIDE_STEP_SHORT,
  GUIDE_STEP_TITLES,
  LAYOUTS_FOR,
  PHOTO_COUNTS,
  ROLE_NAMES,
  TEXT_ROLES,
  applyGuide,
  canOpenInEditor,
  effectiveLayout,
  guideBack,
  guideFormat,
  guideIssues,
  guideNext,
  guidePhotoRects,
  guideSummary,
  initialGuide,
  layoutLabel,
  type GuideAnswers,
  type GuideColors,
  type GuideFormatChoice,
  type GuideIssue,
  type MeasureText,
  type PhotoLayoutId
} from '@editor/designGuide'
import { describeCanvasForScreenReader } from '@editor/describe'
import { COMMON_FAMILIES } from '@editor/fonts'
import { DEFAULT_TEXT_FONT } from '@editor/newLayers'
import { selectOutputProfile } from '@editor/store'
import { editorStore } from './editorStore'
import { layoutStore } from './layoutStore'
import { formatsStore, useFormats } from './formatsStore'
import { guideStore, useGuide } from './guideStore'
import { loadFontCatalog, probeFont, useFontCatalog } from './fontCatalog'
import { FormatThumb } from './MyFormats'
import { ColorField } from './fields'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import { onRadioGroupKeyDown } from '../ui/radioGroupKeys'

/**
 * Phase 7C — the Design Guide window (docs/PHASE_7C_DESIGN_GUIDE.md). A short sequence of questions beside a live
 * preview drawn by the export renderer. The answers live in `guideStore`; the project is created only when the operator
 * leaves for the editor (Open in editor / Finish), through the normal create path, and the answers are then applied with
 * the editor's own mutations as one change. Nothing Guide-specific is ever stored in the project.
 */

const g = guideStore.getState

// ---- text measuring (the same font stack the canvas draws with) ------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null
export const measureLine: MeasureText = (text, family, size, weight) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size * 0.55
  measureCtx.font = `${weight} ${size}px ${cssFontFamily(family)}`
  return measureCtx.measureText(text).width
}

/** A preview project: the answers applied to an empty project of the format (ids are throwaway). */
function previewProject(a: GuideAnswers, f: FormatDefinition): TemplateProject {
  let n = 0
  const createId = (): string => `preview-${++n}`
  const now = '2000-01-01T00:00:00.000Z'
  return applyGuide(createProjectFromFormat(f, { name: a.projectName, now, createId }), a, {
    now,
    createId,
    measure: measureLine
  })
}

/**
 * Leaves the Guide for the editor: creates the project through the normal path (same as New project / Custom size),
 * applies the answers as ONE change and starts the editor with a clean undo history — the Guide's result is the
 * project's starting point, as an empty canvas is for a blank design.
 */
export async function finishGuide(): Promise<boolean> {
  const a = g().answers
  const f = guideFormat(a)
  if (!f) return false
  const name = a.projectName.trim() || 'Untitled'
  const r = await editorStore.getState().createProject({ name, format: f })
  if (r.status !== 'ok') {
    if (r.status === 'error') g().setError(r.message)
    return false
  }
  const s = editorStore.getState()
  s.commit((p, ctx) => applyGuide(p, a, { ...ctx, measure: measureLine }))
  s.clearHistory()
  // Cut guides are a Print Preview view preference; a custom size's choice applies (as in the Custom Size wizard).
  if (f.arrangement.kind !== 'exact') s.setShowCutGuides(f.cutGuides)
  s.setMessage('Your design is ready. Fine-tune it, check it and export when you are happy.')
  g().finished()
  // Focus the canvas region (the Guide's opener, the Start card, is gone once a project is open).
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>('[data-region="canvas"] [tabindex], [data-region="canvas"]')
      ?.focus()
  )
  return true
}

// ---- small parts ----------------------------------------------------------------------------------------------------

function FieldError({
  id,
  issue
}: {
  id: string
  issue: GuideIssue | undefined
}): React.JSX.Element | null {
  if (!issue) return null
  return (
    <span className="cf-error" id={id}>
      <CircleAlert size={13} aria-hidden="true" /> {issue.message}
    </span>
  )
}

const FORMAT_CARDS: {
  value: Exclude<GuideFormatChoice, 'custom'>
  title: string
  desc: string
  w: number
  h: number
}[] = [
  { value: 'strip', title: '2×6 Strip', desc: 'Prints two per 4×6 sheet', w: 14, h: 42 },
  { value: 'portrait', title: '4×6 Portrait', desc: 'One per 4×6 print', w: 28, h: 42 },
  { value: 'landscape', title: '6×4 Landscape', desc: 'One per 4×6 print', w: 42, h: 28 }
]

function FormatStep({ a, issues }: { a: GuideAnswers; issues: GuideIssue[] }): React.JSX.Element {
  const id = useId()
  const items = useFormats((s) => s.items)
  useEffect(() => {
    void formatsStore.getState().refresh()
  }, [])
  const set = (f: (a: GuideAnswers) => GuideAnswers): void => g().update(f)
  const custom = a.formatChoice === 'custom'
  const f = guideFormat(a)
  const openWizard = (): void =>
    layoutStore.getState().setCustomFormat({ format: a.customFormat, purpose: 'guide' })
  const err = issues.find((i) => i.field === 'format')
  return (
    <div className="guide-step" data-step="format">
      <div className="cf-field">
        <label htmlFor={`${id}-name`}>Project name</label>
        <input
          id={`${id}-name`}
          className="ui-input"
          data-testid="guide-project-name"
          value={a.projectName}
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set((x) => ({ ...x, projectName: e.target.value }))}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <span className="cf-label" id={`${id}-size`}>
        Print size
      </span>
      <div
        className="cf-modes guide-formats"
        role="radiogroup"
        aria-labelledby={`${id}-size`}
        onKeyDown={onRadioGroupKeyDown}
        data-testid="guide-format"
      >
        {FORMAT_CARDS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            className="cf-mode guide-format"
            aria-checked={a.formatChoice === c.value}
            tabIndex={a.formatChoice === c.value ? 0 : -1}
            data-value={c.value}
            {...(a.formatChoice === c.value ? { 'data-autofocus': true } : {})}
            onClick={() => set((x) => ({ ...x, formatChoice: c.value }))}
          >
            <span className="guide-format-art" aria-hidden="true">
              <span style={{ width: c.w, height: c.h }} />
            </span>
            <span className="cf-mode-title">{c.title}</span>
            <span className="cf-mode-desc">{c.desc}</span>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          className="cf-mode guide-format"
          aria-checked={custom}
          tabIndex={custom ? 0 : -1}
          data-value="custom"
          {...(custom ? { 'data-autofocus': true } : {})}
          onClick={() => set((x) => ({ ...x, formatChoice: 'custom' }))}
        >
          <span className="guide-format-art" aria-hidden="true">
            <Ruler size={22} strokeWidth={1.5} />
          </span>
          <span className="cf-mode-title">Custom size</span>
          <span className="cf-mode-desc">Magnets, wallets, squares…</span>
        </button>
      </div>
      {!custom && (
        <div className="cf-field">
          <span className="cf-label" id={`${id}-dpi`}>
            Resolution
          </span>
          <Segmented
            label="Resolution"
            value={a.dpi}
            options={[
              { value: 300, label: '300 DPI' },
              { value: 600, label: '600 DPI' }
            ]}
            onChange={(dpi) => set((x) => ({ ...x, dpi }))}
          />
        </div>
      )}
      {custom && (
        <div className="guide-custom" data-testid="guide-custom">
          {a.customFormat ? (
            <p className="guide-custom-chosen" data-testid="guide-custom-chosen">
              <strong>{a.customFormat.name}</strong>
              <span className="muted">
                {summarizeFormat(a.customFormat).design} · {summarizeFormat(a.customFormat).output}
              </span>
            </p>
          ) : null}
          <div className="guide-custom-actions">
            <Button
              icon={Ruler}
              onClick={openWizard}
              data-testid="guide-custom-open"
              aria-describedby={err ? `${id}-format-err` : undefined}
            >
              {a.customFormat ? 'Change custom size…' : 'Make a custom size…'}
            </Button>
          </div>
          <FieldError id={`${id}-format-err`} issue={err} />
          {items && items.length > 0 && (
            <div className="cf-field">
              <span className="cf-label" id={`${id}-mine`}>
                My formats
              </span>
              <div className="guide-mine" role="group" aria-labelledby={`${id}-mine`}>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="new-format-btn"
                    data-format-id={item.id}
                    aria-pressed={a.customFormat === item.format}
                    onClick={() => set((x) => ({ ...x, customFormat: item.format }))}
                  >
                    <span className="new-format-thumb">
                      <FormatThumb format={item.format} box={28} />
                    </span>
                    <span>
                      <span className="new-format-name">{item.format.name}</span>
                      <span className="new-format-meta">{summarizeFormat(item.format).design}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {f && (
        <p className="field-note" data-testid="guide-format-note">
          {summarizeFormat(f).design} · {summarizeFormat(f).pixels} · {summarizeFormat(f).output}
        </p>
      )}
    </div>
  )
}

/** A layout choice drawn as its slots (neutral shapes, never photos). */
function LayoutArt({
  a,
  f,
  layout
}: {
  a: GuideAnswers
  f: FormatDefinition
  layout: PhotoLayoutId
}): React.JSX.Element {
  const { width, height } = getPixelSize(formatDesignPrint(f))
  const rects = guidePhotoRects(a, f, layout)
  return (
    <svg className="guide-layout-art" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <rect className="paper" x={0} y={0} width={width} height={height} />
      {rects.map((r, i) => (
        <rect key={i} className="slot" x={r.x} y={r.y} width={r.width} height={r.height} />
      ))}
    </svg>
  )
}

function PhotosStep({ a }: { a: GuideAnswers }): React.JSX.Element {
  const id = useId()
  const f = guideFormat(a)!
  const set = (fn: (a: GuideAnswers) => GuideAnswers): void => g().update(fn)
  const d = getPixelSize(formatDesignPrint(f))
  const current = effectiveLayout(a, d)
  return (
    <div className="guide-step" data-step="photos">
      <div className="cf-field">
        <span className="cf-label">How many photos should the design have?</span>
        <Segmented
          label="How many photos"
          value={a.photoCount}
          options={PHOTO_COUNTS.map((n) => ({ value: n, label: String(n) }))}
          onChange={(photoCount) => set((x) => ({ ...x, photoCount, layout: null }))}
        />
      </div>
      <span className="cf-label" id={`${id}-layout`}>
        Pick a starting layout
      </span>
      <div
        className="cf-modes guide-layouts"
        role="radiogroup"
        aria-labelledby={`${id}-layout`}
        onKeyDown={onRadioGroupKeyDown}
        data-testid="guide-layout"
      >
        {LAYOUTS_FOR[a.photoCount].map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            className="cf-mode guide-layout"
            aria-checked={current === l}
            tabIndex={current === l ? 0 : -1}
            data-value={l}
            onClick={() => set((x) => ({ ...x, layout: l }))}
          >
            <LayoutArt a={a} f={f} layout={l} />
            <span className="cf-mode-title">{layoutLabel(l)}</span>
          </button>
        ))}
      </div>
      <div className="cf-field">
        <span className="cf-label">Photo shape</span>
        <Segmented
          label="Photo shape"
          value={a.shape}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'portrait', label: 'Portrait' },
            { value: 'landscape', label: 'Landscape' },
            { value: 'square', label: 'Square' }
          ]}
          onChange={(shape) => set((x) => ({ ...x, shape }))}
        />
        <span className="field-note">
          Auto picks portrait or landscape to suit the space. Photos are numbered 1, 2, 3… for
          dslrBooth.
        </span>
      </div>
      <p className="field-note">
        A starting arrangement only: in the editor every photo slot can be moved and resized.
      </p>
    </div>
  )
}

function StyleStep({ a }: { a: GuideAnswers }): React.JSX.Element {
  const id = useId()
  const set = (fn: (a: GuideAnswers) => GuideAnswers): void => g().update(fn)
  const setColor = (key: keyof GuideColors, value: string): void =>
    set((x) => ({ ...x, colorSet: 'custom', colors: { ...x.colors, [key]: value } }))
  const empty = { colors: [] }
  return (
    <div className="guide-step" data-step="style">
      <span className="cf-label" id={`${id}-sets`}>
        Starting colors
      </span>
      <div
        className="cf-modes guide-colorsets"
        role="radiogroup"
        aria-labelledby={`${id}-sets`}
        onKeyDown={onRadioGroupKeyDown}
        data-testid="guide-colorsets"
      >
        {COLOR_SETS.map((c) => {
          const on = a.colorSet === c.id
          // With "custom" colours, the first set takes the Tab stop so the group stays reachable.
          const stop = on || (a.colorSet === 'custom' && c.id === COLOR_SETS[0]!.id)
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              className="cf-mode guide-colorset"
              aria-checked={on}
              tabIndex={stop ? 0 : -1}
              data-value={c.id}
              onClick={() => set((x) => ({ ...x, colorSet: c.id, colors: { ...c.colors } }))}
            >
              <span className="guide-swatches" aria-hidden="true">
                <span style={{ background: c.colors.background }} />
                <span style={{ background: c.colors.accent }} />
                <span style={{ background: c.colors.text }} />
              </span>
              <span className="cf-mode-title">{c.name}</span>
            </button>
          )
        })}
      </div>
      <div className="guide-color-fields" data-testid="guide-color-fields">
        <ColorField
          label="Background"
          value={{ kind: 'literal', value: a.colors.background }}
          palette={empty}
          allowLink={false}
          onCommit={(v) => v.kind === 'literal' && setColor('background', v.value)}
        />
        <ColorField
          label="Accent"
          value={{ kind: 'literal', value: a.colors.accent }}
          palette={empty}
          allowLink={false}
          onCommit={(v) => v.kind === 'literal' && setColor('accent', v.value)}
        />
        <ColorField
          label="Text"
          value={{ kind: 'literal', value: a.colors.text }}
          palette={empty}
          allowLink={false}
          onCommit={(v) => v.kind === 'literal' && setColor('text', v.value)}
        />
      </div>
      <p className="field-note">
        These become the project’s Event Palette: change a palette color later and everything linked
        to it follows.
      </p>
      <div className="guide-row">
        <div className="cf-field">
          <span className="cf-label">Photo frame</span>
          <Segmented
            label="Photo frame"
            value={a.frame}
            options={[
              { value: 'none', label: 'None' },
              { value: 'thin', label: 'Thin' },
              { value: 'thick', label: 'Thick' }
            ]}
            onChange={(frame) => set((x) => ({ ...x, frame }))}
          />
        </div>
        <div className="cf-field">
          <span className="cf-label">Frame color</span>
          <Segmented
            label="Frame color"
            value={a.frameColor}
            disabled={a.frame === 'none'}
            options={[
              { value: 'accent', label: 'Accent' },
              { value: 'white', label: 'White' }
            ]}
            onChange={(frameColor) => set((x) => ({ ...x, frameColor }))}
          />
        </div>
        <div className="cf-field">
          <span className="cf-label">Corners</span>
          <Segmented
            label="Corners"
            value={a.corners}
            options={[
              { value: 'square', label: 'Square' },
              { value: 'rounded', label: 'Rounded' }
            ]}
            onChange={(corners) => set((x) => ({ ...x, corners }))}
          />
        </div>
      </div>
    </div>
  )
}

/** Fonts offered by the Guide: the common families that are installed on this computer (never a missing one). */
function useGuideFonts(current: string): string[] {
  const catalog = useFontCatalog()
  useEffect(() => {
    void loadFontCatalog()
  }, [])
  return useMemo(() => {
    const installed = catalog.status === 'ready' ? new Set(catalog.families.map(familyKey)) : null
    const out = COMMON_FAMILIES.filter((f) =>
      installed ? installed.has(familyKey(f)) : probeFont(f) === true
    )
    for (const f of [DEFAULT_TEXT_FONT, current])
      if (!out.some((x) => familyKey(x) === familyKey(f))) out.unshift(f)
    return out
  }, [catalog, current])
}

const PLACEHOLDERS = {
  title: 'e.g. Sam & Alex',
  date: 'e.g. June 14, 2027',
  message: 'e.g. Thank you for celebrating with us'
}

function TextStep({ a, issues }: { a: GuideAnswers; issues: GuideIssue[] }): React.JSX.Element {
  const id = useId()
  const set = (fn: (a: GuideAnswers) => GuideAnswers): void => g().update(fn)
  const fonts = useGuideFonts(a.font)
  return (
    <div className="guide-step" data-step="text">
      {TEXT_ROLES.map((role, i) => {
        const line = a.text[role]
        const issue = issues.find((x) => x.field === `text-${role}`)
        const errId = `${id}-${role}-err`
        return (
          <div className="guide-text-line" key={role} data-role={role}>
            <label className="cf-check">
              <input
                type="checkbox"
                className="ui-check"
                checked={line.on}
                data-testid={`guide-text-${role}-on`}
                {...(i === 0 ? { 'data-autofocus': true } : {})}
                onChange={(e) =>
                  set((x) => ({
                    ...x,
                    text: { ...x.text, [role]: { ...x.text[role], on: e.target.checked } }
                  }))
                }
              />
              <span>{ROLE_NAMES[role]}</span>
            </label>
            {line.on && (
              <div className="cf-field">
                <label htmlFor={`${id}-${role}`} className="sr-only">
                  {ROLE_NAMES[role]}
                </label>
                <input
                  id={`${id}-${role}`}
                  className="ui-input"
                  data-testid={`guide-text-${role}`}
                  value={line.value}
                  maxLength={120}
                  placeholder={PLACEHOLDERS[role]}
                  autoComplete="off"
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? errId : undefined}
                  onChange={(e) =>
                    set((x) => ({
                      ...x,
                      text: { ...x.text, [role]: { ...x.text[role], value: e.target.value } }
                    }))
                  }
                />
                <FieldError id={errId} issue={issue} />
              </div>
            )}
          </div>
        )
      })}
      <div className="guide-row">
        <div className="cf-field">
          <label htmlFor={`${id}-font`}>Font</label>
          <select
            id={`${id}-font`}
            className="ui-select"
            data-testid="guide-font"
            value={a.font}
            onChange={(e) => set((x) => ({ ...x, font: e.target.value }))}
          >
            {fonts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="cf-field">
          <span className="cf-label">Alignment</span>
          <Segmented
            label="Alignment"
            value={a.align}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' }
            ]}
            onChange={(align) => set((x) => ({ ...x, align }))}
          />
        </div>
      </div>
      <label className="cf-check">
        <input
          type="checkbox"
          className="ui-check"
          checked={a.titleBold}
          data-testid="guide-title-bold"
          onChange={(e) => set((x) => ({ ...x, titleBold: e.target.checked }))}
        />
        <span>Bold event name</span>
      </label>
      <p className="field-note">
        Only fonts installed on this computer are listed. Exports turn text into pictures, so the
        booth computer does not need the font.
      </p>
    </div>
  )
}

function ReviewStep({ a }: { a: GuideAnswers }): React.JSX.Element {
  const s = guideSummary(a)!
  const profile = selectOutputProfile(editorStore.getState())
  return (
    <div className="guide-step" data-step="review">
      {/* Focus lands on the summary (read first by a screen reader), not on Finish: a second Enter must not finish. */}
      <dl
        className="cf-summary"
        data-testid="guide-summary"
        tabIndex={-1}
        data-autofocus
        aria-label="Summary of your design"
      >
        <dt>Size</dt>
        <dd>
          <span data-testid="guide-sum-size">
            {s.format.name} · {s.format.design}
          </span>
          <span className="muted">{s.format.pixels}</span>
        </dd>
        <dt>Prints</dt>
        <dd data-testid="guide-sum-output">{s.format.output}</dd>
        <dt>Photos</dt>
        <dd data-testid="guide-sum-photos">{s.photos}</dd>
        <dt>Colors</dt>
        <dd>
          <span className="guide-swatches inline" aria-hidden="true">
            <span style={{ background: s.colors.background }} />
            <span style={{ background: s.colors.accent }} />
            <span style={{ background: s.colors.text }} />
          </span>
          <span data-testid="guide-sum-colors">
            Background {s.colors.background}, accent {s.colors.accent}, text {s.colors.text}
          </span>
        </dd>
        <dt>Text</dt>
        <dd data-testid="guide-sum-text">
          {s.text}
          <span className="muted">{s.font}</span>
        </dd>
        <dt>Safe margin</dt>
        <dd data-testid="guide-sum-safe">{s.format.safeMargin}</dd>
        <dt>Printer profile</dt>
        <dd data-testid="guide-sum-printer">
          {profile ? profile.name : 'No printer profile selected'}
          <span className="muted">
            {profile
              ? 'Safe areas and Checks use it in the editor.'
              : 'That is fine for PNG files. You can choose one later.'}
          </span>
        </dd>
      </dl>
      <p className="field-note">
        Finish opens your design in the editor, where you can fine-tune it, run Checks and export.
      </p>
    </div>
  )
}

/** Live preview: the real renderer (the one exports use) drawing the design the answers make right now. */
function GuidePreview({ a }: { a: GuideAnswers }): React.JSX.Element | null {
  const f = guideFormat(a)
  const project = useMemo(() => (f ? previewProject(a, f) : null), [a, f])
  const copies = project ? hasDerivedCopies(project) : false
  const [view, setView] = useState<'design' | 'sheet'>('design')
  const shown = copies ? view : 'design'
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!project) return
    const t = window.setTimeout(() => {
      const el = canvas.current
      const area = box.current
      if (!el || !area) return
      const size = getPixelSize(shown === 'sheet' ? project.output.print : project.canvas.print)
      const scale = Math.min(area.clientWidth / size.width, area.clientHeight / size.height)
      const cssW = Math.max(1, Math.floor(size.width * scale))
      const cssH = Math.max(1, Math.floor(size.height * scale))
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(cssW * dpr))
      const h = Math.max(1, Math.round(cssH * dpr))
      try {
        const render = shown === 'sheet' ? renderOutputToCanvas : renderProjectToCanvas
        const out = render(project, () => undefined, { width: w, height: h })
        el.width = w
        el.height = h
        el.style.width = `${cssW}px`
        el.style.height = `${cssH}px`
        el.getContext('2d')?.drawImage(out, 0, 0)
        setFailed(false)
      } catch {
        setFailed(true)
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [project, shown])
  if (!project) {
    return (
      <div className="guide-preview" data-testid="guide-preview">
        <p className="field-note">Make a custom size to see a preview.</p>
      </div>
    )
  }
  const label = describeCanvasForScreenReader(project, 'design', [])
  return (
    <div
      className="guide-preview"
      data-testid="guide-preview"
      data-view={shown}
      data-photos={project.layers.filter((l) => l.type === 'photo').length}
      data-texts={project.layers.filter((l) => l.type === 'text').length}
    >
      {copies && (
        <Segmented
          label="Preview"
          value={view}
          options={[
            { value: 'design', label: 'Design' },
            { value: 'sheet', label: 'Print sheet' }
          ]}
          onChange={setView}
        />
      )}
      <div className="guide-preview-box" ref={box}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Preview. ${label}`}
          data-testid="guide-preview-canvas"
        />
      </div>
      {failed && <p className="field-note">The preview could not be drawn.</p>}
      <p className="field-note guide-preview-note">{summaryLine(project)}</p>
    </div>
  )
}

const summaryLine = (p: TemplateProject): string => {
  const photos = p.layers.filter((l) => l.type === 'photo').length
  const texts = p.layers.filter((l) => l.type === 'text').length
  const kinds = [
    `${photos} photo ${photos === 1 ? 'slot' : 'slots'}`,
    ...(texts > 0 ? [`${texts} text ${texts === 1 ? 'line' : 'lines'}`] : [])
  ]
  return `${kinds.join(', ')}: all editable in the editor`
}

// ---- the window -----------------------------------------------------------------------------------------------------

function Guide(): React.JSX.Element {
  const step = useGuide((s) => s.step)
  const a = useGuide((s) => s.answers)
  const error = useGuide((s) => s.error)
  const [busy, setBusy] = useState(false)
  const index = GUIDE_STEPS.indexOf(step)
  const last = step === 'review'
  const issues = guideIssues(a, step)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pristine = JSON.stringify(a) === JSON.stringify(initialGuide()) && index === 0

  // A new step: focus its first control (never leave keyboard users on a control that has gone).
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    // In priority order (one selector list would return whichever comes first in the document, e.g. an unchosen
    // radio): the step's marked control, else the chosen radio of its first group, else its first field or button.
    const body = bodyRef.current
    const target = [
      '.guide-step [data-autofocus]',
      '.guide-step [role=radio][aria-checked="true"]',
      '.guide-step input, .guide-step select, .guide-step button'
    ]
      .map((sel) => body?.querySelector<HTMLElement>(sel))
      .find(Boolean)
    target?.focus()
  }, [step])

  const toEditor = async (): Promise<void> => {
    if (busy || !canOpenInEditor(a)) return
    setBusy(true)
    const ok = await finishGuide()
    if (!ok) setBusy(false)
  }
  const next = (): void => {
    if (issues.length > 0) return
    if (last) void toEditor()
    else g().setStep(guideNext(step))
  }

  return (
    <Dialog
      title={GUIDE_STEP_TITLES[step]}
      description={`Design Guide · Step ${index + 1} of ${GUIDE_STEPS.length}`}
      size="xl"
      testId="design-guide"
      onEscape={() => g().close()}
      summary={
        <div className="guide-summary-row">
          <ol className="cf-steps" aria-label="Steps">
            {GUIDE_STEPS.map((st, i) => (
              <li
                key={st}
                className={i === index ? 'current' : i < index ? 'done' : ''}
                aria-current={i === index ? 'step' : undefined}
                data-step={st}
              >
                <span className="cf-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                {GUIDE_STEP_SHORT[st]}
              </li>
            ))}
          </ol>
          {!pristine && (
            <button
              type="button"
              className="link"
              data-testid="guide-start-over"
              onClick={() => g().startOver()}
            >
              Start over
            </button>
          )}
        </div>
      }
      footer={
        <DialogActions
          start={
            <>
              {index > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => g().setStep(guideBack(step))}
                  data-testid="guide-back"
                  disabled={busy}
                >
                  Back
                </Button>
              )}
              {!last && index > 0 && canOpenInEditor(a) && (
                <Button
                  onClick={() => void toEditor()}
                  data-testid="guide-open-editor"
                  disabled={busy}
                  aria-describedby="guide-open-note"
                >
                  Open in editor
                </Button>
              )}
              <span id="guide-open-note" className="sr-only">
                Creates the design from your answers so far and continues in the full editor.
              </span>
            </>
          }
          cancel={
            <Button
              variant="ghost"
              onClick={() => g().close()}
              data-testid="guide-cancel"
              disabled={busy}
            >
              Cancel
            </Button>
          }
          primary={
            <Button
              variant="primary"
              data-testid={last ? 'guide-finish' : 'guide-next'}
              disabled={issues.length > 0 || busy}
              aria-describedby={issues.length > 0 ? 'guide-issue-summary' : undefined}
              onClick={next}
            >
              {last ? 'Finish' : 'Next'}
            </Button>
          }
        />
      }
    >
      <div
        ref={bodyRef}
        className="guide-cols"
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            e.target instanceof HTMLInputElement &&
            e.target.type === 'text'
          ) {
            e.preventDefault()
            next()
          }
        }}
      >
        <div className="guide-form">
          {issues.length > 0 && (
            <p
              id="guide-issue-summary"
              className="cf-issue-summary"
              role="status"
              data-testid="guide-issue-summary"
            >
              <CircleAlert size={15} aria-hidden="true" />
              {issues.length === 1
                ? 'Fix 1 thing to continue.'
                : `Fix ${issues.length} things to continue.`}
            </p>
          )}
          <p className="sr-only" aria-live="polite" data-testid="guide-step-announce">
            {`Step ${index + 1} of ${GUIDE_STEPS.length}: ${GUIDE_STEP_TITLES[step]}`}
          </p>
          {step === 'format' && <FormatStep a={a} issues={issues} />}
          {step === 'photos' && <PhotosStep a={a} />}
          {step === 'style' && <StyleStep a={a} />}
          {step === 'text' && <TextStep a={a} issues={issues} />}
          {step === 'review' && <ReviewStep a={a} />}
          {error && (
            <p className="cf-fit-error" role="alert">
              <CircleAlert size={15} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </div>
        <GuidePreview a={a} />
      </div>
    </Dialog>
  )
}

export function DesignGuide(): React.JSX.Element | null {
  const open = useGuide((s) => s.open)
  return open ? <Guide /> : null
}

/** Opens the Design Guide (Start screen). */
export function openDesignGuide(): void {
  g().openGuide()
}
