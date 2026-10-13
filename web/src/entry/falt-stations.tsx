// The station table of a fält entry (docs/specs/web-falt-entry-spec.md §3.3)
// and of the edit page (web-session-edit-spec.md §10, E13): one row per
// station with the phone's station-screen controls. The logic is in
// falt-model.ts; this file only renders.
import { SHOTS_PER_STATION } from '@shotledger/shared/src/scoring/falt';
import { figuresHitRange } from '@shotledger/shared/src/scoring/falt-station';
import { useTranslation } from 'react-i18next';

import { formatFaltResult } from '../../../app/src/features/session/format-falt-result';
import {
  addStation,
  canStartShootOff,
  faltPreview,
  shootOffRows,
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
  positions,
  onRemove,
}: {
  falt: FaltForm;
  onEdit: (next: FaltForm) => void;
  /** Error text by 1-based station row. */
  rowErrors: ReadonlyMap<number, string>;
  /** Edit page: each row's label number, its stored position (E14). Default: 1..n. */
  positions?: readonly number[];
  /** Edit page: Remove on a row, Undo on a removed one (E13). */
  onRemove?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const preview = faltPreview(falt);
  const shootOff = shootOffRows(falt).map((row) => row.isShootOff);

  return (
    <section className="card falt-stations">
      <p className="falt-result">
        {t('session.total')}:{' '}
        <strong>{formatFaltResult(t, { ...preview.result, mode: falt.resultMode })}</strong>
      </p>
      {falt.stations.map((row, index) => {
        const figures = figuresHitRange(row.hits ?? 0, row.figureCount);
        const rowError = rowErrors.get(index + 1);
        const removed = row.deleted === true;
        return (
          <fieldset
            key={row.key}
            className={removed ? 'station-row deleted' : 'station-row'}
            aria-invalid={rowError !== undefined}
          >
            <legend>
              {t('station.title', { position: positions?.[index] ?? index + 1 })}
              {shootOff[index] && <span className="badge">{t('station.shootOff')}</span>}
            </legend>
            <label className="field">
              {t('station.hits')}
              <select
                disabled={removed}
                value={row.hits ?? ''}
                onChange={(event) =>
                  onEdit(
                    withHits(
                      falt,
                      index,
                      event.target.value === '' ? null : Number(event.target.value),
                    ),
                  )
                }
              >
                {/* Not chosen yet: a row left so is not saved; 0 is every shot missed (R8).
                    A stored station always holds hits, as the phone's screen (E15). */}
                {row.id === undefined && <option value="">–</option>}
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
                disabled={removed}
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
                disabled={removed}
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
                disabled={removed}
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
                disabled={removed}
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
                disabled={removed}
                type="checkbox"
                checked={row.isScratched}
                onChange={(event) =>
                  onEdit(withStation(falt, index, { isScratched: event.target.checked }))
                }
              />
              {t('station.scratched')}
            </label>
            {onRemove && (
              <button
                type="button"
                className="secondary small station-remove"
                onClick={() => onRemove(index)}
              >
                {removed ? t('web.edit.undo') : t('station.delete')}
              </button>
            )}
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
