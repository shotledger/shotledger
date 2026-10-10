// The Logging picker, Rounds Fired and the final's controls on Enter Series
// (docs/specs/web-rounds-final-spec.md). The rules are in kinds.ts.
import { useTranslation } from 'react-i18next';

import { canStartFinal, startFinal, withKind } from './kinds';
import type { EntryForm, SessionKind } from './model';

interface FieldProps {
  form: EntryForm;
  edit: (next: EntryForm) => void;
}

export function KindPicker({ form, edit }: FieldProps) {
  const { t } = useTranslation();
  return (
    <label className="field">
      {t('session.kind')}
      <select
        value={form.kind}
        onChange={(event) => edit(withKind(form, event.target.value as SessionKind))}
      >
        <option value="series">{t('sessionKind.series')}</option>
        <option value="rounds">{t('sessionKind.rounds')}</option>
      </select>
    </label>
  );
}

export function RoundsFiredField({ form, edit }: FieldProps) {
  const { t } = useTranslation();
  return (
    <label className="field">
      {t('session.roundsFired')}
      <input
        inputMode="numeric"
        value={form.roundsFired}
        placeholder="0"
        onChange={(event) => edit({ ...form, roundsFired: event.target.value })}
      />
    </label>
  );
}

/** The phone's section labels, shown once the session has a final. */
export function SectionHeading({ form, index }: { form: EntryForm; index: number }) {
  const { t } = useTranslation();
  const row = form.rows[index]!;
  if (!form.rows.some((r) => r.isFinal)) return null;
  if (index === 0 && !row.isFinal) {
    return <h3 className="muted">{t('session.mainSection')}</h3>;
  }
  if (row.isFinal && !form.rows[index - 1]?.isFinal) {
    return <h3 className="muted">{t('session.finalSection')}</h3>;
  }
  return null;
}

export function StartFinalButton({ form, edit }: FieldProps) {
  const { t } = useTranslation();
  if (!canStartFinal(form)) return null;
  return (
    <button type="button" className="secondary" onClick={() => edit(startFinal(form))}>
      {t('session.startFinal')}
    </button>
  );
}
