// The web's two single-choice controls (#822, finding "Six ways to pick one
// option"), mirroring the phone's OptionPicker (app/src/components/
// option-picker.tsx): two to four short options draw as a segmented track,
// anything else as choice chips, by the same rule (`optionPickerLayout`).
// Native radios underneath, so the arrow keys move the choice and a form
// reset or a disabled fieldset behaves as the browser's own controls do.
import { useId } from 'react';

import {
  optionPickerLayout,
  type OptionPickerLayout,
} from '../../../app/src/components/option-picker-layout';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export function ChoiceGroup<T extends string>({
  labelledBy,
  options,
  value,
  onChange,
  layout,
  disabled,
}: {
  labelledBy: string;
  options: readonly ChoiceOption<T>[];
  /** `null`: nothing chosen yet, every option unchecked. */
  value: T | null;
  onChange: (next: T) => void;
  layout?: OptionPickerLayout;
  disabled?: boolean;
}) {
  const name = useId();
  const drawAs = layout ?? optionPickerLayout(options.map((option) => option.label));
  return (
    <div
      className={drawAs === 'segmented' ? 'segmented' : 'choice-chips'}
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** A labelled ChoiceGroup: the field's name as the group's legend. */
export function ChoiceField<T extends string>({
  label,
  className = 'field',
  ...group
}: Omit<Parameters<typeof ChoiceGroup<T>>[0], 'labelledBy'> & {
  label: string;
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={className}>
      <legend id={id}>{label}</legend>
      <ChoiceGroup labelledBy={id} {...group} />
    </fieldset>
  );
}
