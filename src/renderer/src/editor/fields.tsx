import { useId, useRef, useState } from 'react'
import type { ColorValue, Palette } from '@domain'
import { resolveColor } from '@canvas/rendering/color'
import { formatNumber, normalizeHex, parseNumberInput, type NumberRule } from '@editor/numberInput'

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

export function NumberField({
  label,
  value,
  onCommit,
  rule,
  unit,
  disabled,
  mixed
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  rule?: NumberRule
  unit?: string
  disabled?: boolean
  /** Several layers with different values: shown empty with a "Mixed" placeholder. */
  mixed?: boolean
}): React.JSX.Element {
  const id = useId()
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
    <FieldRow label={unit ? `${label} (${unit})` : label} htmlFor={id}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
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
 * Color control. A LITERAL color is editable (native picker + hex text). A PALETTE reference is shown as such
 * and is never silently rewritten: the only way to leave the palette link is the explicit "Use fixed color" button.
 */
export function ColorField({
  label,
  value,
  palette,
  onCommit,
  disabled
}: {
  label: string
  value: ColorValue
  palette: Palette
  onCommit: (v: ColorValue, continuous?: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  const id = useId()
  const resolved = resolveColor(palette, value)
  const { draft, set: setDraft, take } = useDraft()
  const [error, setError] = useState<string | null>(null)

  if (value.kind === 'palette') {
    const entry = palette.colors.find((c) => c.id === value.paletteColorId)
    return (
      <FieldRow label={label}>
        <span className="swatch" style={{ background: resolved }} aria-hidden="true" />
        <span className="palette-note">
          Palette: {entry ? `${entry.name} (${entry.value})` : 'missing color'}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCommit({ kind: 'literal', value: resolved })}
        >
          Use fixed color
        </button>
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
      <input
        type="color"
        aria-label={`${label} picker`}
        className="color-picker"
        value={value.value.slice(0, 7)}
        disabled={disabled}
        onChange={(e) =>
          onCommit({ kind: 'literal', value: `${e.target.value}${value.value.slice(7)}` }, true)
        }
      />
      <input
        id={id}
        type="text"
        className="hex-input"
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
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </FieldRow>
  )
}
