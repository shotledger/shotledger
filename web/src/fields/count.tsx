// A count picked in one click, the web twin of the phone's CountCells
// (app/src/features/forms/count-cells.tsx, #822): every value a 48px cell
// on a segmented track, wrapping onto a second row of equal cells rather
// than shrinking one. Native radios, so the arrow keys move the choice.
import { useId } from 'react';

export function CountField<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  /** In order, lowest first. */
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="field count-field">
      <legend id={id}>{label}</legend>
      <div className="count-cells" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={option.value === value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
