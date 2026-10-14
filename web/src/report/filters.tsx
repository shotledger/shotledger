// The Statistics filter on the web (#822, direction A): the phone's Filter
// Bar (app/src/components/filter-bar.tsx) — a sticky row with a Filters
// button and one removable chip per filter that is set, opening a panel
// with the phone's sheet controls (app/src/features/stats/stats-filter-sheet.tsx)
// in the same order, applied live. The chips, removal and Clear All are the
// phone's own functions (app/src/features/stats/stats-filters.ts).
import type {
  AnalyticsFilterOptions,
  AnalyticsFilterState,
  StatsPeriod,
} from '@shotledger/shared/src/analytics-rows';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toggleChoice } from '../../../app/src/components/choice-chips-logic';
import { disciplineLabel } from '../../../app/src/features/session/labels';
import {
  clearStatsFilters,
  removeStatsFilter,
  statsFilterChips,
} from '../../../app/src/features/stats/stats-filters';
import { DateField } from '../fields/date-time-fields';

const PERIOD_KEYS: Record<StatsPeriod, string> = {
  '30d': 'period.last30Days',
  '6m': 'period.last6Months',
  '12m': 'period.last12Months',
  all: 'period.max',
  custom: 'period.custom',
};

/** One choice of several, as a radio group: the phone's Segmented / single Choice Chips. */
function Choice<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          className="choice"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The sheet's controls, in the phone's order (`StatsFilterSheet`). */
function FilterControls({
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
  // The phone's multi Choice Chips rule: toggle, kept in the options' order.
  const toggleTag = (id: string) =>
    set({
      tagIds: toggleChoice(
        state.tagIds,
        id,
        'multi',
        options.tags.map((tag) => tag.id),
      ),
    });

  return (
    <>
      <section>
        <h2>{t('stats.sectionPeriod')}</h2>
        <Choice
          label={t('stats.sectionPeriod')}
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
            {(state.customFrom === null || state.customTo === null) && (
              <p className="muted">{t('period.rangeIncomplete')}</p>
            )}
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
          label={t('stats.sectionType')}
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
        <h2>{t('stats.sectionSighters')}</h2>
        <Choice
          label={t('stats.sectionSighters')}
          value={state.includeSighters ? 'include' : 'exclude'}
          options={[
            { value: 'include' as const, label: t('stats.sightersInclude') },
            { value: 'exclude' as const, label: t('stats.sightersExclude') },
          ]}
          onChange={(choice) => set({ includeSighters: choice === 'include' })}
        />
      </section>

      <section>
        <h2>{t('session.discipline')}</h2>
        <Choice
          label={t('session.discipline')}
          value={state.disciplineId}
          options={[
            { value: null, label: t('stats.all') },
            ...options.disciplineIds.map((id) => ({ value: id, label: disciplineLabel(t, id) })),
          ]}
          onChange={(disciplineId) => set({ disciplineId })}
        />
      </section>

      <section>
        <h2>{t('stats.sectionShotsPerSeries')}</h2>
        <Choice
          label={t('stats.sectionShotsPerSeries')}
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

      <section>
        <h2>{t('stats.sectionTags')}</h2>
        <p className="muted">{t('stats.sectionTagsHint')}</p>
        {options.tags.length === 0 ? (
          <p className="muted">{t('stats.tagsEmpty')}</p>
        ) : (
          <div className="choices" role="group" aria-label={t('stats.sectionTags')}>
            {options.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                role="checkbox"
                className="choice"
                aria-checked={state.tagIds.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/** The sticky Filter Bar and its panel. The page holds the filter. */
export function FilterBar({
  state,
  options,
  summary,
  onChange,
}: {
  state: AnalyticsFilterState;
  options: AnalyticsFilterOptions;
  /** The period and the session count, kept in view with the filter (the phone's title subtitle). */
  summary: string;
  onChange: (next: AnalyticsFilterState) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panel = useId();
  const chips = statsFilterChips(t, state, options.tags);

  return (
    <div className="filter-bar" role="region" aria-label={t('web.statsFilters')}>
      <div className="filter-row">
        <button
          type="button"
          className="tonal"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((was) => !was)}
        >
          {chips.length > 0
            ? t('components.filtersActive', { count: chips.length })
            : t('components.filters')}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="filter-chip"
            aria-label={t('components.removeFilter', { label: chip.label })}
            onClick={() => onChange(removeStatsFilter(state, chip.key))}
          >
            {chip.label}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        <span className="filter-summary muted" data-testid="stats-summary">
          {summary}
        </span>
      </div>
      {open && (
        <div className="filter-panel" id={panel}>
          <FilterControls state={state} options={options} onChange={onChange} />
          <div className="filter-actions">
            {chips.length > 0 && (
              <button
                type="button"
                className="text"
                onClick={() => onChange(clearStatsFilters(state))}
              >
                {t('components.clearFilters')}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
