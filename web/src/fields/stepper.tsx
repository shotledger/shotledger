// A count picked by stepping, the web twin of the phone's SegmentedStepper
// (app/src/features/forms/segmented-stepper.tsx, #822): − / value / +, each
// at least 48px, stopping at either end of the options. Used for the fält
// station counts, which were native selects.
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { stepOption } from '../../../app/src/features/forms/segmented-stepper-logic';

export function StepperField<T extends string>({
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
  const { t } = useTranslation();
  const id = useId();
  const values = options.map((option) => option.value);
  const index = values.indexOf(value);
  const current = options[index]?.label ?? value;
  const step = (delta: -1 | 1) => {
    const next = stepOption(values, value, delta);
    if (next !== undefined && next !== value) onChange(next);
  };
  return (
    <div className="field stepper-field">
      <span id={id}>{label}</span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button
          type="button"
          aria-label={t('formsA.decrease', { field: label })}
          disabled={disabled || index === 0 || values.length === 0}
          onClick={() => step(-1)}
        >
          −
        </button>
        <output aria-live="polite">{current}</output>
        <button
          type="button"
          aria-label={t('formsA.increase', { field: label })}
          disabled={disabled || index === values.length - 1 || values.length === 0}
          onClick={() => step(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
