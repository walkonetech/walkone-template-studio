import { Link2, Pipette } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ColorValue, HexColor, Palette } from '@domain'
import { resolveColor } from '@canvas/rendering/color'
import { formatNumber, normalizeHex, parseNumberInput, type NumberRule } from '@editor/numberInput'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Tooltip } from '../ui/Tooltip'

/**
 * Draft text for a field while the user types. `take()` returns the draft AND clears it synchronously, so the
 * Enter-then-blur sequence can never commit the same edit twice.
 */
function useDraft(): {
  draft: string | null
  set: (v: string | null) => void
  take: () => string | null
} {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<string | null>(null)
  return {
    draft,
    set: (v) => {
      ref.current = v
      setDraft(v)
    },
    take: () => {
      const v = ref.current
      ref.current = null
      setDraft(null)
      return v
    }
  }
}

/**
 * Inspector form controls. Text-like fields keep a local DRAFT while typing and only commit on Enter or blur,
 * so partial input never reaches project state; Escape discards the draft. Every control has a visible label.
 */

export function FieldRow({
  label,
  htmlFor,
  children,
  hint
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <div className="field-row">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="field-control">
        {children}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
    </div>
  )
}

/**
 * The numeric text input (no label): keeps a draft while typing, commits on Enter/blur, Escape discards, and shows an
 * inline error for input it cannot parse. Shared by NumberField, CompactNumber and OpacityField.
 */
function NumberInput({
  id,
  value,
  onCommit,
  rule,
  disabled,
  mixed,
  className
}: {
  id: string
  value: number
  onCommit: (value: number) => void
  rule: NumberRule | undefined
  disabled: boolean | undefined
  mixed: boolean | undefined
  className?: string
}): React.JSX.Element {
  const { draft, set: setDraft, take } = useDraft()
  const [error, setError] = useState<string | null>(null)
  const shown = draft ?? (mixed ? '' : formatNumber(value))

  const commit = (): void => {
    const taken = take()
    if (taken === null) return
    const r = parseNumberInput(taken, rule)
    if (!r.ok) {
      setError(r.reason)
      return
    }
    setError(null)
    if (mixed || r.value !== value) onCommit(r.value)
  }

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className={`ui-input num ${className ?? ''}`}
        value={shown}
        placeholder={mixed ? 'Mixed' : undefined}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onFocus={(e) => {
          setError(null)
          setDraft(mixed ? '' : formatNumber(value))
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            take()
            setError(null)
            e.currentTarget.blur()
          }
        }}
      />
      {error && (
        <span id={`${id}-err`} role="alert" className="field-error">
          {error}
        </span>
      )}
    </>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  onCommit: (value: number) => void
  rule?: NumberRule
  unit?: string
  disabled?: boolean
  /** Several layers with different values: shown empty with a "Mixed" placeholder. */
  mixed?: boolean
}

export function NumberField({
  label,
  value,
  onCommit,
  rule,
  unit,
  disabled,
  mixed
}: NumberFieldProps): React.JSX.Element {
  const id = useId()
  return (
    <FieldRow label={unit ? `${label} (${unit})` : label} htmlFor={id}>
      <NumberInput
        id={id}
        value={value}
        onCommit={onCommit}
        rule={rule}
        disabled={disabled}
        mixed={mixed}
      />
    </FieldRow>
  )
}

/** A labelled-elsewhere number input with a unit tag ("200 px"), for rows that pair it with another control (B5). */
export function NumberInputBare({
  id,
  value,
  onCommit,
  rule,
  unit,
  disabled
}: {
  id: string
  value: number
  onCommit: (value: number) => void
  rule?: NumberRule
  unit?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <span className="unit-input">
      <NumberInput
        id={id}
        value={value}
        onCommit={onCommit}
        rule={rule}
        disabled={disabled}
        mixed={false}
      />
      {unit && (
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  )
}

/**
 * Compact transform cell: a short visible tag ("X", "W", "°") inside the field, the full name for assistive tech
 * ("Width (px)"). Two of these sit side by side (X | Y, W | H).
 */
export function CompactNumber({
  label,
  short,
  value,
  onCommit,
  rule,
  unit,
  disabled,
  mixed
}: NumberFieldProps & { short: string }): React.JSX.Element {
  const id = useId()
  return (
    <div className="compact-num">
      <label htmlFor={id}>
        <span aria-hidden="true">{short}</span>
        <span className="sr-only">{unit ? `${label} (${unit})` : label}</span>
      </label>
      <NumberInput
        id={id}
        value={value}
        onCommit={onCommit}
        rule={rule}
        disabled={disabled}
        mixed={mixed}
      />
    </div>
  )
}

/** Opacity: a slider for quick scrubbing (commits on release) plus the exact numeric field. Keyboard precision kept. */
export function OpacityField({
  value,
  onCommit,
  disabled,
  mixed
}: {
  value: number
  onCommit: (percent: number) => void
  disabled?: boolean
  mixed?: boolean
}): React.JSX.Element {
  const id = useId()
  const [live, setLive] = useState<number | null>(null)
  const shown = live ?? value
  const release = (): void => {
    if (live !== null && live !== value) onCommit(live)
    setLive(null)
  }
  return (
    <FieldRow label="Opacity (%)" htmlFor={id}>
      <div className="opacity-row">
        <input
          type="range"
          className="ui-range"
          style={{ ['--pct' as string]: `${mixed && live === null ? 100 : shown}%` }}
          aria-label="Opacity slider"
          min={0}
          max={100}
          step={1}
          value={mixed && live === null ? 100 : shown}
          disabled={disabled}
          onChange={(e) => setLive(Number(e.target.value))}
          onPointerUp={release}
          onKeyUp={release}
          onBlur={release}
        />
        <NumberInput
          id={id}
          className="narrow"
          value={shown}
          onCommit={onCommit}
          rule={{ min: 0, max: 100 }}
          disabled={disabled}
          mixed={mixed && live === null}
        />
      </div>
    </FieldRow>
  )
}

export function TextField({
  label,
  value,
  onCommit,
  disabled,
  list,
  allowEmpty = true
}: {
  label: string
  value: string
  onCommit: (value: string) => void
  disabled?: boolean
  list?: string
  allowEmpty?: boolean
}): React.JSX.Element {
  const id = useId()
  const { draft, set: setDraft, take } = useDraft()
  const commit = (): void => {
    const next = take()
    if (next !== null && next !== value && (allowEmpty || next.trim() !== '')) onCommit(next)
  }
  return (
    <FieldRow label={label} htmlFor={id}>
      <input
        id={id}
        type="text"
        className="ui-input"
        list={list}
        autoComplete="off"
        spellCheck={false}
        value={draft ?? value}
        disabled={disabled}
        onFocus={(e) => {
          setDraft(value)
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            take()
            e.currentTarget.blur()
          }
        }}
      />
    </FieldRow>
  )
}

/** Multi-line text. Enter inserts a newline; Cmd/Ctrl+Enter or blur commits; Escape discards. */
export function TextAreaField({
  label,
  value,
  onCommit,
  disabled
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  const { draft, set: setDraft, take } = useDraft()
  const commit = (): void => {
    const next = take()
    if (next !== null && next !== value) onCommit(next)
  }
  return (
    <FieldRow label={label} htmlFor={id}>
      <textarea
        id={id}
        className="ui-textarea"
        rows={3}
        value={draft ?? value}
        disabled={disabled}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            take()
            e.currentTarget.blur()
          }
        }}
      />
    </FieldRow>
  )
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onCommit,
  disabled
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onCommit: (v: T) => void
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  return (
    <FieldRow label={label} htmlFor={id}>
      <select
        id={id}
        className="ui-select"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked && picked.value !== value) onCommit(picked.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

export function CheckboxField({
  label,
  checked,
  onCommit,
  disabled,
  mixed,
  hint
}: {
  label: string
  checked: boolean
  onCommit: (v: boolean) => void
  disabled?: boolean
  mixed?: boolean
  hint?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="field-row checkbox-row">
      <input
        id={id}
        type="checkbox"
        className="ui-check"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed
        }}
        onChange={(e) => onCommit(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

/**
 * Color control. A LITERAL color shows a swatch, an editable hex value and a secondary eyedropper button that opens
 * the system picker (the native input is hidden; it is never the primary UI). A PALETTE reference is shown as linked
 * and is never silently rewritten: the only way to leave the palette link is the explicit "Use fixed color" button.
 */
export function ColorField({
  label,
  value,
  palette,
  onCommit,
  disabled,
  allowLink = true
}: {
  label: string
  value: ColorValue
  palette: Palette
  onCommit: (v: ColorValue, continuous?: boolean) => void
  disabled?: boolean
  /** Offer "link to an Event Palette color" (off for the palette's own entries). */
  allowLink?: boolean
}): React.JSX.Element {
  const id = useId()
  const resolved = resolveColor(palette, value)
  const { draft, set: setDraft, take } = useDraft()
  const [error, setError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  if (value.kind === 'palette') {
    const entry = palette.colors.find((c) => c.id === value.paletteColorId)
    return (
      <FieldRow label={label}>
        <span className="swatch" style={{ background: resolved }} aria-hidden="true" />
        <span className="palette-linked">
          <span className="palette-note">
            <Link2 size={12} aria-hidden="true" /> Linked to{' '}
            <strong>{entry ? entry.name : 'a missing palette color'}</strong>
            {entry ? ` (${entry.value})` : ''}
          </span>
          <select
            className="ui-select compact"
            aria-label={`${label} palette color`}
            value={entry ? entry.id : ''}
            disabled={disabled}
            onChange={(e) =>
              e.target.value && onCommit({ kind: 'palette', paletteColorId: e.target.value })
            }
          >
            {!entry && <option value="">Missing color</option>}
            {palette.colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.value})
              </option>
            ))}
          </select>
        </span>
        <Tooltip
          label="Use fixed color"
          hint="Detach from the Event Palette and keep the current appearance"
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onCommit({ kind: 'literal', value: resolved as HexColor })}
          >
            Use fixed color
          </Button>
        </Tooltip>
      </FieldRow>
    )
  }

  const commitHex = (): void => {
    const taken = take()
    if (taken === null) return
    const hex = normalizeHex(taken)
    if (!hex) {
      setError('Use a hex color like #1a2b3c')
      return
    }
    setError(null)
    if (hex !== value.value) onCommit({ kind: 'literal', value: hex })
  }

  return (
    <FieldRow label={label} htmlFor={id}>
      <span className="color-input">
        <span className="swatch lg" style={{ background: value.value }} aria-hidden="true" />
        <input
          id={id}
          type="text"
          className="ui-input hex-input"
          spellCheck={false}
          autoComplete="off"
          value={draft ?? value.value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onFocus={(e) => {
            setDraft(value.value)
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitHex()
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              take()
              setError(null)
              e.currentTarget.blur()
            }
          }}
        />
        <IconButton
          size="sm"
          icon={Pipette}
          label={`Open ${label} color picker`}
          disabled={disabled}
          onClick={() => picker.current?.showPicker?.()}
        />
        <input
          ref={picker}
          type="color"
          tabIndex={-1}
          aria-label={`${label} picker`}
          className="native-color"
          value={value.value.slice(0, 7)}
          disabled={disabled}
          onChange={(e) =>
            onCommit({ kind: 'literal', value: `${e.target.value}${value.value.slice(7)}` }, true)
          }
        />
      </span>
      {allowLink && palette.colors.length > 0 && (
        <Tooltip label="Use palette color" hint="Link this property to an Event Palette color">
          <select
            className="ui-select compact"
            aria-label={`Link ${label} to an Event Palette color`}
            value=""
            disabled={disabled}
            onChange={(e) =>
              e.target.value && onCommit({ kind: 'palette', paletteColorId: e.target.value })
            }
          >
            <option value="">Fixed color</option>
            {palette.colors.map((c) => (
              <option key={c.id} value={c.id}>
                Palette: {c.name} ({c.value})
              </option>
            ))}
          </select>
        </Tooltip>
      )}
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </FieldRow>
  )
}
