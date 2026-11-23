import { onRadioGroupKeyDown } from './radioGroupKeys'

/** Small radio-style segmented control (one of N). Arrow keys move and select, per the radiogroup pattern. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="ui-seg"
      onKeyDown={disabled ? undefined : onRadioGroupKeyDown}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={disabled}
          title={o.title ?? o.label}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
