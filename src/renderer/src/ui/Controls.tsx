import { useId } from 'react'

/**
 * Form primitives (Phase 7B B2): native inputs underneath, so keyboard and screen-reader behaviour come for free.
 * Every control has a visible label (or an explicit accessible one) and keeps a hit target of at least 24 px.
 */

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  hint
}: {
  label: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hint?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <label className="ui-field-check" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="ui-check"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
      />
      <span>
        {label}
        {hint && (
          <span id={`${id}-hint`} className="ui-field-hint">
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

/** One-of-N choice as native radios in a labelled group (arrow keys move between options). */
export function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string
  value: T
  options: readonly { value: T; label: React.ReactNode; hint?: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}): React.JSX.Element {
  const name = useId()
  return (
    <fieldset className="ui-radio-group" disabled={disabled}>
      <legend>{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="ui-field-check">
          <input
            type="radio"
            className="ui-radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          <span>
            {o.label}
            {o.hint && <span className="ui-field-hint">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** On/off setting that applies immediately (role=switch, the state is also written as a word for clarity). */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  showState = true
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Show "On" / "Off" beside the track (state is never colour-only). */
  showState?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ui-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
      {showState && (
        <span className="state" aria-hidden="true">
          {checked ? 'On' : 'Off'}
        </span>
      )}
    </button>
  )
}
