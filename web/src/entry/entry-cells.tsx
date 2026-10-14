// A typed row drawn as the phone's shot cells (#822; app/src/components/
// shot-cell.tsx): one 48px cell per shot of the series, the next one to fill
// outlined, an empty one a dash. The row's text input stays the way in — the
// same keys as the phone's keypad, 0–10 and X, typed — and the cells show
// what it holds. Hidden from screen readers: the input already says it.
import type { EntryShot } from '@shotledger/shared/src/scoring/entry';
import { tenthsToScore } from '@shotledger/shared/src/scoring/totals';
import { useTranslation } from 'react-i18next';

import { formatShotValue } from '../../../app/src/components/shot-value';
import type { LastTime } from './running-totals';

export function EntryCells({
  shots,
  length,
  mode,
  lastTime,
}: {
  /** Null while the text does not parse: the cells keep their dashes. */
  shots: readonly EntryShot[] | null;
  length: number;
  mode: 'integer' | 'decimal';
  lastTime: LastTime | null;
}) {
  const { t } = useTranslation();
  const filled = shots ?? [];
  const count = Math.max(length, filled.length);
  const current = shots === null ? -1 : filled.length;
  return (
    <div className="entry-cells-row">
      <ol className="entry-cells" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li
            key={index}
            className={[
              index === current ? 'current' : '',
              index < filled.length ? '' : 'empty',
              index >= length ? 'over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {formatShotValue(filled[index] ?? null, mode)}
          </li>
        ))}
      </ol>
      {lastTime && (
        <span className="muted entry-last-time">
          {`${t('entryA.lastTime')} ${tenthsToScore(lastTime.totalTenths).toFixed(
            mode === 'decimal' ? 1 : 0,
          )}`}
          {lastTime.innerTens !== null &&
            ` · ${t('entryA.innerTens', { count: lastTime.innerTens })}`}
        </span>
      )}
    </div>
  );
}
