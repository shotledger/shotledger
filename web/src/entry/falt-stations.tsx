// The station table of a fält entry (docs/specs/web-falt-entry-spec.md §3.3):
// one row per station with the phone's station-screen controls. The logic is
// in falt-model.ts; this file only renders.
import { SHOTS_PER_STATION } from '@shotledger/shared/src/scoring/falt';
import { figuresHitRange } from '@shotledger/shared/src/scoring/falt-station';
import { useTranslation } from 'react-i18next';

import { formatFaltResult } from '../../../app/src/features/session/format-falt-result';
import {
  addStation,
  canStartShootOff,
  faltPreview,
  startShootOff,
  withFigureCount,
  withHits,
  withStation,
  type FaltForm,
} from './falt-model';

const range = (min: number, max: number) =>
  Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);

export function FaltStations({
  falt,
  onEdit,
  rowErrors,
}: {
  falt: FaltForm;
  onEdit: (next: FaltForm) => void;
  /** Error text by 1-based station row. */
  rowErrors: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const preview = faltPreview(falt);

  return (
    <section className="card falt-stations">
      <p className="falt-result">
        {t('session.total')}:{' '}
        <strong>{formatFaltResult(t, { ...preview.result, mode: falt.resultMode })}</strong>
      </p>
      {falt.stations.map((row, index) => {
        const figures = figuresHitRange(row.hits, row.figureCount);
        const rowError = rowErrors.get(index + 1);
        return (
          <fieldset key={row.key} className="station-row" aria-invalid={rowError !== undefined}>
            <legend>
              {t('station.title', { position: index + 1 })}
              {row.isShootOff && <span className="badge">{t('station.shootOff')}</span>}
            </legend>
            <label className="field">
              {t('station.hits')}
              <select
                value={row.hits}
                onChange={(event) => onEdit(withHits(falt, index, Number(event.target.value)))}
              >
                {range(0, SHOTS_PER_STATION).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('station.figuresHit')}
              <select
                value={row.figuresHit}
                onChange={(event) =>
                  onEdit(withStation(falt, index, { figuresHit: Number(event.target.value) }))
                }
              >
                {range(figures.min, figures.max).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('station.figureCount')}
              <select
                value={row.figureCount ?? ''}
                onChange={(event) =>
                  onEdit(
                    withFigureCount(
                      falt,
                      index,
                      event.target.value === '' ? null : Number(event.target.value),
                    ),
                  )
                }
              >
                <option value="">–</option>
                {range(1, SHOTS_PER_STATION).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t('station.points')}
              <input
                inputMode="numeric"
                autoComplete="off"
                value={row.pointsText}
                onChange={(event) =>
                  onEdit(withStation(falt, index, { pointsText: event.target.value }))
                }
              />
            </label>
            <label className="field">
              {t('station.pointsMax')}
              <input
                inputMode="numeric"
                autoComplete="off"
                value={row.pointsMaxText}
                onChange={(event) =>
                  onEdit(withStation(falt, index, { pointsMaxText: event.target.value }))
                }
              />
            </label>
            <label className="field check">
              <input
                type="checkbox"
                checked={row.isScratched}
                onChange={(event) =>
                  onEdit(withStation(falt, index, { isScratched: event.target.checked }))
                }
              />
              {t('station.scratched')}
            </label>
            {preview.rows[index] === 'blank' && (
              <p className="muted station-note">{t('web.entry.stationBlank')}</p>
            )}
            {rowError && <p className="danger station-note">{rowError}</p>}
          </fieldset>
        );
      })}
      <div className="actions">
        <button type="button" className="secondary" onClick={() => onEdit(addStation(falt))}>
          {t('session.addStation')}
        </button>
        {canStartShootOff(falt) && (
          <button type="button" className="secondary" onClick={() => onEdit(startShootOff(falt))}>
            {t('session.startShootOff')}
          </button>
        )}
      </div>
    </section>
  );
}
