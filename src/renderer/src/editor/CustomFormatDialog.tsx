import { useEffect, useId, useRef, useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import {
  MAX_GRID,
  RECOMMENDED_SAFE_MARGIN_MM,
  displayNumber,
  formatOrientation,
  fromInches,
  inchesToPixels,
  summarizeFormat,
  toInches,
  type FormatIssue,
  type LengthUnit
} from '@domain'
import {
  STEP_SHORT,
  STEP_TITLES,
  WIZARD_STEPS,
  goBack,
  arrangementInWords,
  goNext,
  initialWizard,
  parseNumberField,
  safeMarginOf,
  setDpi,
  setMode,
  setOrientation,
  setRepeatGap,
  setRepeatMargin,
  setUnit,
  sheetDiagram,
  stepIssues,
  wizardFormat,
  wizardFrom,
  wizardIssues,
  type ArrangementMode,
  type SafeMode,
  type WizardState
} from '@editor/formatWizard'
import { editorStore } from './editorStore'
import { guideStore } from './guideStore'
import { formatsStore } from './formatsStore'
import { FormatDiagram } from './FormatDiagram'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { onRadioGroupKeyDown } from '../ui/radioGroupKeys'

/**
 * The Custom Size wizard (Phase 7B B5.5): Size → Printing → Safe margin → Review → Create design. It only sets up the
 * format (design size, output arrangement, generic safe margin, cut guides); Create makes a normal project through the
 * same path as the built-in formats and opens the normal editor. Browsing it never touches the open project.
 */

const UNIT_LABEL: Record<LengthUnit, string> = { in: 'Inches', mm: 'Millimeters', px: 'Pixels' }

/** A text field bound to a number. Keeps what the user typed while it is being typed; NaN when it is not a number. */
function NumberField({
  id,
  label,
  value,
  format,
  parse,
  onValue,
  suffix,
  error,
  hint,
  autoFocus,
  testId
}: {
  id: string
  label: string
  value: number
  format: (v: number) => string
  parse: (text: string) => number
  onValue: (v: number) => void
  suffix?: string
  error?: string | undefined
  hint?: string | undefined
  autoFocus?: boolean
  testId?: string
}): React.JSX.Element {
  const [text, setText] = useState(() => (Number.isFinite(value) ? format(value) : ''))
  const emitted = useRef(value)
  useEffect(() => {
    if (!Object.is(value, emitted.current)) {
      emitted.current = value
      setText(Number.isFinite(value) ? format(value) : '')
    }
  }, [value, format])
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  const described = [error ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ')
  return (
    <div className="cf-field">
      <label htmlFor={id}>{label}</label>
      <span className="cf-input">
        <input
          id={id}
          className="ui-input"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          data-testid={testId}
          {...(autoFocus ? { 'data-autofocus': true } : {})}
          onChange={(e) => {
            setText(e.target.value)
            const v = parse(e.target.value)
            emitted.current = v
            onValue(v)
          }}
          onBlur={() => {
            if (Number.isFinite(value)) setText(format(value))
          }}
        />
        {suffix && <span className="cf-suffix">{suffix}</span>}
      </span>
      {hint && (
        <span className="field-note" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="cf-error" id={errId}>
          <CircleAlert size={13} aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  )
}

/** A segmented single choice (role=radiogroup). */
function Seg<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testId
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  testId?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="cf-field">
      <span id={id} className="cf-label">
        {label}
      </span>
      <div
        className="seg"
        role="radiogroup"
        onKeyDown={onRadioGroupKeyDown}
        aria-labelledby={id}
        data-testid={testId}
      >
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            data-value={String(v)}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

const errorFor = (
  issues: readonly FormatIssue[],
  field: FormatIssue['field']
): string | undefined => issues.find((i) => i.field === field)?.message

function useLength(s: WizardState): {
  fmt: (v: number) => string
  parse: (t: string) => number
  unit: string
} {
  const unit = s.unit
  const dpi = s.dpi
  return {
    fmt: (v: number) => displayNumber(fromInches(v, unit, dpi), unit),
    parse: (t: string) =>
      toInches(parseNumberField(t), unit, Number.isFinite(dpi) && dpi > 0 ? dpi : 300),
    unit
  }
}

function SizeStep({
  s,
  set,
  issues
}: {
  s: WizardState
  set: (f: (s: WizardState) => WizardState) => void
  issues: readonly FormatIssue[]
}): React.JSX.Element {
  const id = useId()
  const L = useLength(s)
  const o = formatOrientation(s.width, s.height)
  const valid = Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0
  const dpiOk = Number.isInteger(s.dpi) && s.dpi > 0
  const px =
    valid && dpiOk
      ? `${inchesToPixels(s.width, s.dpi)} × ${inchesToPixels(s.height, s.dpi)} px`
      : '—'
  const inText = valid
    ? `${displayNumber(s.width, 'in')} × ${displayNumber(s.height, 'in')} in`
    : '—'
  const mmText = valid
    ? `${displayNumber(s.width * 25.4, 'mm')} × ${displayNumber(s.height * 25.4, 'mm')} mm`
    : '—'
  return (
    <div className="cf-step" data-step="size">
      <div className="cf-cols">
        <div className="cf-form">
          <Seg
            label="Units"
            value={s.unit}
            testId="cf-unit"
            options={(['in', 'mm', 'px'] as const).map((u) => [u, UNIT_LABEL[u]] as const)}
            onChange={(u) => set((x) => setUnit(x, u))}
          />
          <div className="cf-row">
            <NumberField
              key={`w-${s.unit}`}
              id={`${id}-w`}
              label="Width"
              testId="cf-width"
              value={s.width}
              format={L.fmt}
              parse={L.parse}
              suffix={L.unit}
              autoFocus
              error={errorFor(issues, 'width')}
              onValue={(v) => set((x) => ({ ...x, width: v }))}
            />
            <NumberField
              key={`h-${s.unit}`}
              id={`${id}-h`}
              label="Height"
              testId="cf-height"
              value={s.height}
              format={L.fmt}
              parse={L.parse}
              suffix={L.unit}
              error={errorFor(issues, 'height')}
              onValue={(v) => set((x) => ({ ...x, height: v }))}
            />
          </div>
          <Seg
            label="Resolution"
            value={s.dpiChoice}
            testId="cf-dpi"
            options={[
              [300, '300 DPI'],
              [600, '600 DPI'],
              ['custom', 'Custom']
            ]}
            onChange={(v) =>
              set((x) => (v === 'custom' ? { ...x, dpiChoice: 'custom' } : setDpi(x, v)))
            }
          />
          {s.dpiChoice === 'custom' && (
            <NumberField
              id={`${id}-dpi`}
              label="Custom resolution"
              testId="cf-dpi-custom"
              value={s.dpi}
              format={(v) => String(v)}
              parse={parseNumberField}
              suffix="DPI"
              error={errorFor(issues, 'dpi')}
              onValue={(v) => set((x) => setDpi(x, v, 'custom'))}
            />
          )}
          {s.unit === 'px' && (
            <p className="field-note">
              Pixels stay as you entered them. The resolution only sets the printed size ({inText}{' '}
              at {dpiOk ? s.dpi : '—'} DPI).
            </p>
          )}
          <Seg
            label="Orientation"
            value={o === 'square' ? 'square' : o}
            testId="cf-orientation"
            options={[
              ['portrait', 'Portrait'],
              ['landscape', 'Landscape'],
              ...(o === 'square' ? ([['square', 'Square']] as const) : [])
            ]}
            onChange={(v) => {
              if (v !== 'square') set((x) => setOrientation(x, v))
            }}
          />
        </div>
        <div className="cf-preview">
          <FormatDiagram
            sheet={{ width: valid ? s.width : 1, height: valid ? s.height : 1 }}
            copies={valid ? [{ x: 0, y: 0, width: s.width, height: s.height }] : []}
            box={160}
            testId="cf-size-diagram"
          />
          <dl className="cf-facts" data-testid="cf-conversion">
            <dt>Size</dt>
            <dd>{s.unit === 'mm' ? mmText : inText}</dd>
            <dt>{s.unit === 'mm' ? 'Inches' : 'Millimeters'}</dt>
            <dd>{s.unit === 'mm' ? inText : mmText}</dd>
            <dt>Pixels</dt>
            <dd data-testid="cf-pixels">
              {px}
              {dpiOk ? ` @ ${s.dpi} DPI` : ''}
            </dd>
            <dt>Shape</dt>
            <dd>{o === 'square' ? 'Square' : o === 'portrait' ? 'Portrait' : 'Landscape'}</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}

const MODE_TEXT: Record<ArrangementMode, { title: string; desc: string }> = {
  exact: {
    title: 'Exact size',
    desc: 'Print or export the design at exactly this size: one design per print. Use it when the print is this size or someone else arranges it.'
  },
  repeat: {
    title: 'Repeat on a sheet',
    desc: 'Several copies of this design on a larger sheet, evenly spaced and centred, e.g. 4 magnets on a 4×6.'
  },
  custom: {
    title: 'Custom sheet layout',
    desc: 'Set every gap and margin yourself, for a production layout you already know.'
  }
}

function OutputStep({
  s,
  set,
  issues
}: {
  s: WizardState
  set: (f: (s: WizardState) => WizardState) => void
  issues: readonly FormatIssue[]
}): React.JSX.Element {
  const id = useId()
  // Sheet values in a pixel format are still physical paper: show them in inches.
  const sheetUnit: LengthUnit = s.unit === 'px' ? 'in' : s.unit
  const SL = {
    fmt: (v: number) => displayNumber(fromInches(v, sheetUnit, s.dpi), sheetUnit),
    parse: (t: string) => toInches(parseNumberField(t), sheetUnit, s.dpi),
    unit: sheetUnit
  }
  const sheet = s.sheet
  const diagram = sheetDiagram(s)
  const fit = errorFor(issues, 'fit')
  const count = (v: number): string => String(v)
  const sheetFields = (
    <div className="cf-row">
      <NumberField
        key={`sw-${sheetUnit}`}
        id={`${id}-sw`}
        label="Sheet width"
        testId="cf-sheet-width"
        value={sheet.sheetWidth}
        format={SL.fmt}
        parse={SL.parse}
        suffix={SL.unit}
        error={errorFor(issues, 'sheetWidth')}
        onValue={(v) => set((x) => ({ ...x, sheet: { ...x.sheet, sheetWidth: v } }))}
      />
      <NumberField
        key={`sh-${sheetUnit}`}
        id={`${id}-sh`}
        label="Sheet height"
        testId="cf-sheet-height"
        value={sheet.sheetHeight}
        format={SL.fmt}
        parse={SL.parse}
        suffix={SL.unit}
        error={errorFor(issues, 'sheetHeight')}
        onValue={(v) => set((x) => ({ ...x, sheet: { ...x.sheet, sheetHeight: v } }))}
      />
    </div>
  )
  const countFields = (
    <div className="cf-row">
      <NumberField
        id={`${id}-cols`}
        label="Copies across"
        testId="cf-columns"
        value={sheet.columns}
        format={count}
        parse={parseNumberField}
        error={errorFor(issues, 'columns')}
        onValue={(v) => set((x) => ({ ...x, sheet: { ...x.sheet, columns: v } }))}
      />
      <NumberField
        id={`${id}-rows`}
        label="Copies down"
        testId="cf-rows"
        value={sheet.rows}
        format={count}
        parse={parseNumberField}
        error={errorFor(issues, 'rows')}
        onValue={(v) => set((x) => ({ ...x, sheet: { ...x.sheet, rows: v } }))}
      />
    </div>
  )
  const lengthField = (
    key: string,
    label: string,
    value: number,
    onValue: (v: number) => void,
    error?: string
  ): React.JSX.Element => (
    <NumberField
      key={`${key}-${sheetUnit}`}
      id={`${id}-${key}`}
      label={label}
      testId={`cf-${key}`}
      value={value}
      format={SL.fmt}
      parse={SL.parse}
      suffix={SL.unit}
      error={error}
      onValue={onValue}
    />
  )
  return (
    <div className="cf-step" data-step="output">
      <div
        className="cf-modes"
        role="radiogroup"
        onKeyDown={onRadioGroupKeyDown}
        aria-label="How should it print?"
        data-testid="cf-mode"
      >
        {(['exact', 'repeat', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={s.mode === m}
            data-value={m}
            className="cf-mode"
            onClick={() => set((x) => setMode(x, m))}
            {...(m === 'exact' ? { 'data-autofocus': true } : {})}
          >
            <span className="cf-mode-title">{MODE_TEXT[m].title}</span>
            <span className="cf-mode-desc">{MODE_TEXT[m].desc}</span>
          </button>
        ))}
      </div>
      <div className="cf-cols">
        <div className="cf-form">
          {s.mode === 'exact' && (
            <p className="field-note" data-testid="cf-exact-note">
              One design per print at {summarizeFormat(wizardFormat(s)).design}. The design is never
              scaled.
            </p>
          )}
          {s.mode === 'repeat' && (
            <>
              {sheetFields}
              {countFields}
              <div className="cf-row">
                {lengthField(
                  'gap',
                  'Gap between copies',
                  sheet.columnGap,
                  (v) => set((x) => setRepeatGap(x, v)),
                  errorFor(issues, 'columnGap') ?? errorFor(issues, 'rowGap')
                )}
                {lengthField(
                  'margin',
                  'Sheet margin',
                  sheet.margins.top,
                  (v) => set((x) => setRepeatMargin(x, v)),
                  errorFor(issues, 'margins')
                )}
              </div>
            </>
          )}
          {s.mode === 'custom' && (
            <>
              {sheetFields}
              {countFields}
              <div className="cf-row">
                {lengthField(
                  'gap-x',
                  'Gap across',
                  sheet.columnGap,
                  (v) => set((x) => ({ ...x, sheet: { ...x.sheet, columnGap: v } })),
                  errorFor(issues, 'columnGap')
                )}
                {lengthField(
                  'gap-y',
                  'Gap down',
                  sheet.rowGap,
                  (v) => set((x) => ({ ...x, sheet: { ...x.sheet, rowGap: v } })),
                  errorFor(issues, 'rowGap')
                )}
              </div>
              <fieldset className="cf-margins">
                <legend>Sheet margins</legend>
                <div className="cf-row four">
                  {(['top', 'right', 'bottom', 'left'] as const).map((side) =>
                    lengthField(
                      `margin-${side}`,
                      side[0]!.toUpperCase() + side.slice(1),
                      sheet.margins[side],
                      (v) =>
                        set((x) => ({
                          ...x,
                          sheet: { ...x.sheet, margins: { ...x.sheet.margins, [side]: v } }
                        }))
                    )
                  )}
                </div>
                {errorFor(issues, 'margins') && (
                  <span className="cf-error">
                    <CircleAlert size={13} aria-hidden="true" /> {errorFor(issues, 'margins')}
                  </span>
                )}
              </fieldset>
              <Seg
                label="Place the copies"
                value={sheet.align}
                testId="cf-align"
                options={[
                  ['center', 'Centred'],
                  ['start', 'From the top-left margin']
                ]}
                onChange={(v) => set((x) => ({ ...x, sheet: { ...x.sheet, align: v } }))}
              />
            </>
          )}
          {s.mode !== 'exact' && (
            <label className="cf-check">
              <input
                type="checkbox"
                checked={s.cutGuides}
                data-testid="cf-cut-guides"
                onChange={(e) => {
                  const on = e.target.checked
                  set((x) => ({ ...x, cutGuides: on }))
                }}
              />
              <span>
                Show cut guides in Print Preview
                <span className="field-note block">
                  Guides only: they are never printed or exported.
                </span>
              </span>
            </label>
          )}
        </div>
        <div className="cf-preview">
          <FormatDiagram
            sheet={diagram.sheet}
            copies={diagram.copies}
            margins={s.mode === 'exact' ? null : sheet.margins}
            cutGuides={s.mode !== 'exact' && s.cutGuides}
            invalid={!!fit}
            box={200}
            testId="cf-sheet-diagram"
          />
          <p className="sr-only" data-testid="cf-arrangement-words">
            {arrangementInWords(s)}
          </p>
          <p className="cf-diagram-caption" data-testid="cf-output-caption">
            {summarizeFormat(wizardFormat(s)).output}
            {s.mode !== 'exact' && Number.isFinite(sheet.columns) && Number.isFinite(sheet.rows)
              ? ` · ${sheet.columns} across × ${sheet.rows} down`
              : ''}
          </p>
          {fit && (
            // Polite, not assertive: it can change on every keystroke while a number is typed.
            <p className="cf-fit-error" role="status" data-testid="cf-fit-error">
              <CircleAlert size={15} aria-hidden="true" />
              <span>{fit}</span>
            </p>
          )}
          {s.mode !== 'exact' && !fit && (
            <p className="cf-fit-ok" data-testid="cf-fit-ok">
              Fits. Every copy prints at exactly the design size (max {MAX_GRID} across and down).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SafeStep({
  s,
  set,
  issues
}: {
  s: WizardState
  set: (f: (s: WizardState) => WizardState) => void
  issues: readonly FormatIssue[]
}): React.JSX.Element {
  const id = useId()
  const mm = safeMarginOf(s)
  const px =
    mm !== null && Number.isFinite(mm) && s.dpi > 0 ? Math.round((mm / 25.4) * s.dpi) : null
  const options: readonly [SafeMode, string, string][] = [
    ['none', 'None', 'No generic safe-margin guide.'],
    [
      'recommended',
      `Recommended · ${RECOMMENDED_SAFE_MARGIN_MM} mm`,
      'Keep text, logos and photos at least 3 mm from every edge.'
    ],
    ['custom', 'Custom', 'Choose your own distance in millimetres.']
  ]
  return (
    <div className="cf-step" data-step="safe">
      <div className="cf-cols">
        <div className="cf-form">
          <div
            className="cf-modes vertical"
            role="radiogroup"
            onKeyDown={onRadioGroupKeyDown}
            aria-label="Safe margin"
            data-testid="cf-safe"
          >
            {options.map(([m, title, desc]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={s.safe === m}
                data-value={m}
                className="cf-mode"
                onClick={() => set((x) => ({ ...x, safe: m }))}
                {...(m === s.safe ? { 'data-autofocus': true } : {})}
              >
                <span className="cf-mode-title">{title}</span>
                <span className="cf-mode-desc">{desc}</span>
              </button>
            ))}
          </div>
          {s.safe === 'custom' && (
            <NumberField
              id={`${id}-safe`}
              label="Safe margin"
              testId="cf-safe-custom"
              value={s.safeMm}
              format={(v) => displayNumber(v, 'mm')}
              parse={parseNumberField}
              suffix="mm"
              hint={px !== null ? `${px} px at ${s.dpi} DPI` : undefined}
              error={errorFor(issues, 'safeMargin')}
              onValue={(v) => set((x) => ({ ...x, safeMm: v }))}
            />
          )}
          <p className="cf-note" data-testid="cf-safe-note">
            <Info size={15} aria-hidden="true" />
            <span>
              This is a <strong>generic design safe margin</strong>: general guidance shown in the
              editor and Checks. It is not a measurement of any printer. A printer profile, when one
              matches, gives printer-specific safe areas instead.
            </span>
          </p>
        </div>
        <div className="cf-preview">
          <FormatDiagram
            sheet={{ width: s.width > 0 ? s.width : 1, height: s.height > 0 ? s.height : 1 }}
            copies={
              s.width > 0 && s.height > 0 ? [{ x: 0, y: 0, width: s.width, height: s.height }] : []
            }
            safeInset={mm !== null && Number.isFinite(mm) ? mm / 25.4 : 0}
            box={160}
            testId="cf-safe-diagram"
          />
          <p className="cf-diagram-caption">{summarizeFormat(wizardFormat(s)).safeMargin}</p>
        </div>
      </div>
    </div>
  )
}

function ReviewStep({
  s,
  set,
  issues,
  projectName,
  setProjectName,
  forGuide
}: {
  s: WizardState
  set: (f: (s: WizardState) => WizardState) => void
  issues: readonly FormatIssue[]
  projectName: string
  setProjectName: (v: string) => void
  forGuide: boolean
}): React.JSX.Element {
  const id = useId()
  const f = wizardFormat(s)
  const sum = summarizeFormat(f)
  const d = sheetDiagram(s)
  return (
    <div className="cf-step" data-step="review">
      <div className="cf-cols">
        <div className="cf-form">
          <dl className="cf-summary" data-testid="cf-summary">
            <dt>Design</dt>
            <dd>
              <span data-testid="cf-sum-design">{sum.design}</span>
              <span className="muted" data-testid="cf-sum-pixels">
                {sum.pixels}
              </span>
            </dd>
            <dt>Output</dt>
            <dd>
              <span data-testid="cf-sum-output">{sum.output}</span>
              {sum.layout && <span className="muted">{sum.layout}</span>}
            </dd>
            {sum.spacing && (
              <>
                <dt>Gaps / margins</dt>
                <dd data-testid="cf-sum-spacing">{sum.spacing}</dd>
              </>
            )}
            <dt>Safe margin</dt>
            <dd data-testid="cf-sum-safe">{sum.safeMargin}</dd>
            {f.arrangement.kind !== 'exact' && (
              <>
                <dt>Cut guides</dt>
                <dd>{sum.cutGuides}</dd>
              </>
            )}
            <dt>Printer profile</dt>
            <dd data-testid="cf-sum-printer">
              No printer profile assigned
              <span className="muted">That is fine for PNG files. You can choose one later.</span>
            </dd>
          </dl>
          {/* From the Design Guide the project is named in the Guide; this size goes back to it. */}
          {!forGuide && (
            <div className="cf-field">
              <label htmlFor={`${id}-pname`}>Project name</label>
              <input
                id={`${id}-pname`}
                className="ui-input"
                data-testid="cf-project-name"
                data-autofocus
                value={projectName}
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setProjectName(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
          <label className="cf-check">
            <input
              type="checkbox"
              checked={s.savePreset}
              data-testid="cf-save-preset"
              onChange={(e) => {
                const on = e.target.checked
                set((x) => ({ ...x, savePreset: on }))
              }}
            />
            <span>
              Save to My formats
              <span className="field-note block">
                Keeps only the size and print setup on this computer, never artwork or photos.
              </span>
            </span>
          </label>
          {s.savePreset && (
            <div className="cf-field">
              <label htmlFor={`${id}-fname`}>Format name</label>
              <input
                id={`${id}-fname`}
                className="ui-input"
                data-testid="cf-format-name"
                value={s.name}
                maxLength={80}
                autoComplete="off"
                aria-invalid={errorFor(issues, 'name') ? true : undefined}
                onChange={(e) => {
                  const v = e.target.value
                  set((x) => ({ ...x, name: v }))
                }}
              />
              {errorFor(issues, 'name') && (
                <span className="cf-error">
                  <CircleAlert size={13} aria-hidden="true" /> {errorFor(issues, 'name')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="cf-preview">
          <FormatDiagram
            sheet={d.sheet}
            copies={d.copies}
            margins={s.mode === 'exact' ? null : s.sheet.margins}
            safeInset={f.safeMarginMm ? f.safeMarginMm / 25.4 : 0}
            cutGuides={s.mode !== 'exact' && s.cutGuides}
            box={200}
            testId="cf-review-diagram"
          />
        </div>
      </div>
    </div>
  )
}

function Wizard({
  initial,
  projectName: initialName,
  forGuide
}: {
  initial: WizardState
  projectName: string
  /** 7C: the size is for the Design Guide (handed back to it; no project is created here). */
  forGuide: boolean
}): React.JSX.Element {
  const [s, setS] = useState(initial)
  const [projectName, setProjectName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const set = (f: (s: WizardState) => WizardState): void => setS((x) => f(x))
  const issues = stepIssues(s)
  const all = wizardIssues(s)
  // The name only matters when the format is being saved.
  const blocking = s.savePreset ? all : all.filter((i) => i.field !== 'name')
  const close = (): void => layoutStore.getState().setCustomFormat(null)
  const index = WIZARD_STEPS.indexOf(s.step)
  const last = s.step === 'review'

  // A new step: focus its first control (keyboard users are never left on a control that has gone).
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    bodyRef.current
      ?.closest('[role=dialog]')
      ?.querySelector<HTMLElement>('.cf-step [data-autofocus], .cf-step input, .cf-step button')
      ?.focus()
  }, [s.step])

  const create = async (): Promise<void> => {
    if (blocking.length > 0 || busy) return
    setBusy(true)
    setMessage(null)
    const format = { ...wizardFormat(s), name: s.name.trim() || 'Custom format' }
    if (s.savePreset) {
      const saved = await formatsStore.getState().save(format)
      if (!saved) {
        setBusy(false)
        setMessage(formatsStore.getState().error ?? 'The format could not be saved.')
        return
      }
    }
    close()
    if (forGuide) {
      guideStore.getState().update((a) => ({ ...a, formatChoice: 'custom', customFormat: format }))
      return
    }
    const r = await editorStore
      .getState()
      .createProject({ name: projectName.trim() || 'Untitled', format })
    // Cut guides are a Print Preview view preference; the wizard's choice applies to the new project.
    if (r.status === 'ok' && format.arrangement.kind !== 'exact')
      editorStore.getState().setShowCutGuides(format.cutGuides)
    const sessionId = editorStore.getState().session?.sessionId
    if (r.status === 'ok' && sessionId) layoutStore.getState().startTips(sessionId)
  }

  const next = (): void => {
    if (last) void create()
    else set(goNext)
  }

  return (
    <Dialog
      title={STEP_TITLES[s.step]}
      description={`Custom size · Step ${index + 1} of ${WIZARD_STEPS.length}`}
      size="lg"
      testId="custom-format-dialog"
      onEscape={close}
      summary={
        <ol className="cf-steps" aria-label="Steps">
          {WIZARD_STEPS.map((st, i) => (
            <li
              key={st}
              className={i === index ? 'current' : i < index ? 'done' : ''}
              aria-current={i === index ? 'step' : undefined}
              data-step={st}
            >
              <span className="cf-step-num" aria-hidden="true">
                {i + 1}
              </span>
              {STEP_SHORT[st]}
            </li>
          ))}
        </ol>
      }
      footer={
        <DialogActions
          start={
            index > 0 ? (
              <Button variant="ghost" onClick={() => set(goBack)} data-testid="cf-back">
                Back
              </Button>
            ) : undefined
          }
          cancel={
            <Button variant="ghost" onClick={close} data-testid="cf-cancel">
              Cancel
            </Button>
          }
          primary={
            <Button
              variant="primary"
              data-testid={last ? 'cf-create' : 'cf-next'}
              disabled={last ? blocking.length > 0 || busy : issues.length > 0}
              // B6: a disabled Next / Create says why (the summary above, or the review error).
              aria-describedby={
                !last && issues.length > 0
                  ? 'cf-issue-summary'
                  : last && blocking.length > 0
                    ? 'cf-review-error'
                    : undefined
              }
              onClick={next}
            >
              {last ? (forGuide ? 'Use this size' : 'Create design') : 'Next'}
            </Button>
          }
        />
      }
    >
      <div
        ref={bodyRef}
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            e.target instanceof HTMLInputElement &&
            e.target.type !== 'checkbox'
          ) {
            e.preventDefault()
            next()
          }
        }}
      >
        {issues.length > 0 && s.step !== 'review' && (
          <p
            id="cf-issue-summary"
            className="cf-issue-summary"
            role="status"
            data-testid="cf-issue-summary"
          >
            <CircleAlert size={15} aria-hidden="true" />
            {issues.length === 1
              ? 'Fix 1 thing to continue.'
              : `Fix ${issues.length} things to continue.`}
          </p>
        )}
        {/* B6: the step change is announced once (focus moves to the step's first field, which alone would not say
            that the step changed). */}
        <p className="sr-only" aria-live="polite" data-testid="cf-step-announce">
          {`Step ${index + 1} of ${WIZARD_STEPS.length}: ${STEP_TITLES[s.step]}`}
        </p>
        {s.step === 'size' && <SizeStep s={s} set={set} issues={issues} />}
        {s.step === 'output' && <OutputStep s={s} set={set} issues={issues} />}
        {s.step === 'safe' && <SafeStep s={s} set={set} issues={issues} />}
        {s.step === 'review' && (
          <ReviewStep
            s={s}
            set={set}
            issues={all}
            projectName={projectName}
            setProjectName={setProjectName}
            forGuide={forGuide}
          />
        )}
        {s.step === 'review' && blocking.length > 0 && (
          <p
            id="cf-review-error"
            className="cf-fit-error"
            role="alert"
            data-testid="cf-review-error"
          >
            <CircleAlert size={15} aria-hidden="true" />
            <span>{blocking[0]!.message}</span>
          </p>
        )}
        {message && (
          <p className="cf-fit-error" role="alert">
            <CircleAlert size={15} aria-hidden="true" />
            <span>{message}</span>
          </p>
        )}
      </div>
    </Dialog>
  )
}

export function CustomFormatDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.customFormat)
  if (!open) return null
  const initial = open.format ? wizardFrom(open.format) : initialWizard()
  return (
    <Wizard
      key={open.format ? `preset-${open.format.name}` : 'new'}
      initial={initial}
      projectName={open.projectName ?? (open.format ? open.format.name : 'Untitled')}
      forGuide={open.purpose === 'guide'}
    />
  )
}
