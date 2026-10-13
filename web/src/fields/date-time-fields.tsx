// Date and Time fields in the app's locale format (#770), in place of the
// browser's native inputs, which follow the browser's language. The value in
// and out is the stored `YYYY-MM-DD` / `HH:mm`; text that does not parse sends
// `''`, so the form's own checks refuse it.
import { useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { dateLocale } from '../dates';
import {
  datePlaceholder,
  formatDateText,
  formatTimeText,
  parseDateText,
  parseTimeText,
} from './date-time-text';

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

interface TextFieldProps extends FieldProps {
  format: (value: string, locale: string) => string;
  parse: (text: string, locale: string) => string | null;
  placeholder: string;
  invalidMessage: string;
  inputMode?: 'numeric';
  children?: (commit: (value: string) => void) => ReactNode;
}

function LocaleTextField({
  label,
  value,
  onChange,
  required,
  className = 'field',
  format,
  parse,
  placeholder,
  invalidMessage,
  inputMode,
  children,
}: TextFieldProps) {
  const locale = dateLocale();
  const id = useId();
  const [shown, setShown] = useState({ value, locale, text: format(value, locale) });
  const [touched, setTouched] = useState(false);
  // A value set from outside (a reset, the picker) or a language switch redraws the text.
  if (shown.value !== value || shown.locale !== locale) {
    setShown({ value, locale, text: format(value, locale) });
    setTouched(false);
  }

  const type = (text: string) => {
    const next = parse(text, locale) ?? '';
    setShown({ value: next, locale, text });
    if (next !== value) onChange(next);
  };
  const commit = (next: string) => {
    setShown({ value: next, locale, text: format(next, locale) });
    setTouched(false);
    if (next !== value) onChange(next);
  };
  const blur = () => {
    setTouched(true);
    const parsed = parse(shown.text, locale);
    if (parsed) setShown({ value: parsed, locale, text: format(parsed, locale) });
  };
  const invalid = touched && parse(shown.text, locale) === null;
  const errorId = `${id}-error`;

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className="locale-field">
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={shown.text}
          placeholder={placeholder}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(event) => type(event.target.value)}
          onBlur={blur}
        />
        {children?.(commit)}
      </div>
      {invalid && (
        <span id={errorId} className="danger field-error" role="alert">
          {invalidMessage}
        </span>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

/** The browser's own calendar, opened from a button and kept out of sight. */
function CalendarButton({ value, commit }: { value: string; commit: (value: string) => void }) {
  const { t } = useTranslation();
  const picker = useRef<HTMLInputElement>(null);
  const open = () => {
    const input = picker.current;
    if (input === null) return;
    try {
      input.showPicker();
    } catch {
      // No showPicker (older browsers) or it was refused: the input's own UI.
      input.focus();
    }
  };
  return (
    <>
      <button
        type="button"
        className="secondary icon-button"
        aria-label={t('web.dateField.openCalendar')}
        title={t('web.dateField.openCalendar')}
        onClick={open}
      >
        <CalendarIcon />
      </button>
      <input
        ref={picker}
        type="date"
        className="calendar-picker"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(event) => commit(event.target.value)}
      />
    </>
  );
}

export function DateField(props: FieldProps) {
  const { t } = useTranslation();
  const placeholder = datePlaceholder(dateLocale(), {
    year: t('web.dateField.year'),
    month: t('web.dateField.month'),
    day: t('web.dateField.day'),
  });
  return (
    <LocaleTextField
      {...props}
      format={formatDateText}
      parse={parseDateText}
      placeholder={placeholder}
      invalidMessage={t('web.dateField.invalid', { format: placeholder })}
      inputMode="numeric"
    >
      {(commit) => <CalendarButton value={props.value} commit={commit} />}
    </LocaleTextField>
  );
}

export function TimeField(props: FieldProps) {
  const { t } = useTranslation();
  const example = formatTimeText('18:00', dateLocale());
  return (
    <LocaleTextField
      {...props}
      format={formatTimeText}
      parse={parseTimeText}
      placeholder={example}
      invalidMessage={t('web.timeField.invalid', { example })}
    />
  );
}
