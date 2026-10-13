import type {
  AnalyticsFilterOptions,
  AnalyticsFilterState,
  StatsPeriod,
} from '@shotledger/shared/src/analytics-rows';
import { useTranslation } from 'react-i18next';

import { disciplineLabel } from '../../../app/src/features/session/labels';
import { DateField } from '../fields/date-time-fields';

const PERIOD_KEYS: Record<StatsPeriod, string> = {
  '30d': 'period.last30Days',
  '6m': 'period.last6Months',
  '12m': 'period.last12Months',
  all: 'period.max',
  custom: 'period.custom',
};

function Choice<T extends string | number | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="choices">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? '' : 'secondary'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The phone's filter form, minus tags (the tag control is a later #301 layer). */
export function Filters({
  state,
  options,
  onChange,
}: {
  state: AnalyticsFilterState;
  options: AnalyticsFilterOptions;
  onChange: (next: AnalyticsFilterState) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<AnalyticsFilterState>) => onChange({ ...state, ...patch });

  return (
    <aside className="filters card">
      <section>
        <h2>{t('stats.sectionPeriod')}</h2>
        <Choice
          value={state.period}
          options={(Object.keys(PERIOD_KEYS) as StatsPeriod[]).map((period) => ({
            value: period,
            label: t(PERIOD_KEYS[period]),
          }))}
          onChange={(period) => set({ period })}
        />
        {state.period === 'custom' && (
          <div className="dates">
            <DateField
              label={t('period.from')}
              value={state.customFrom ?? ''}
              onChange={(from) => set({ customFrom: from || null })}
            />
            <DateField
              label={t('period.to')}
              value={state.customTo ?? ''}
              onChange={(to) => set({ customTo: to || null })}
            />
            {state.customFrom !== null &&
              state.customTo !== null &&
              state.customFrom > state.customTo && (
                <p className="danger" role="alert">
                  {t('web.rangeReversed')}
                </p>
              )}
          </div>
        )}
      </section>

      <section>
        <h2>{t('stats.sectionType')}</h2>
        <Choice
          value={state.sessionType}
          options={[
            { value: null, label: t('stats.all') },
            { value: 'training' as const, label: t('sessionType.training') },
            { value: 'competition' as const, label: t('sessionType.competition') },
          ]}
          onChange={(sessionType) => set({ sessionType })}
        />
      </section>

      <section>
        <h2>{t('session.discipline')}</h2>
        <select
          value={state.disciplineId ?? ''}
          onChange={(event) => set({ disciplineId: event.target.value || null })}
        >
          <option value="">{t('stats.all')}</option>
          {options.disciplineIds.map((id) => (
            <option key={id} value={id}>
              {disciplineLabel(t, id)}
            </option>
          ))}
        </select>
      </section>

      {options.shotsPerSeriesValues.length > 1 && (
        <section>
          <h2>{t('stats.sectionShotsPerSeries')}</h2>
          <Choice
            value={state.shotsPerSeries}
            options={[
              { value: null, label: t('stats.all') },
              ...options.shotsPerSeriesValues.map((count) => ({
                value: count,
                label: String(count),
              })),
            ]}
            onChange={(shotsPerSeries) => set({ shotsPerSeries })}
          />
        </section>
      )}

      <section>
        <h2>{t('stats.sectionSighters')}</h2>
        <Choice
          value={state.includeSighters ? 'include' : 'exclude'}
          options={[
            { value: 'include' as const, label: t('stats.sightersInclude') },
            { value: 'exclude' as const, label: t('stats.sightersExclude') },
          ]}
          onChange={(choice) => set({ includeSighters: choice === 'include' })}
        />
      </section>
    </aside>
  );
}
