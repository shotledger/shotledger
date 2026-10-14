// One session in a list: Home's Recent and the full Sessions list draw the
// same row (#822, direction A).
//
// - The name, without the date a generated name ends with: the line under it
//   prints the date already.
// - Date and type on one line; the type drops out when a tag says the same.
// - The result: a ring total on the right, the average and inner tens under
//   the name ("0X" included), a fält result as two labelled values, a rounds
//   session's count.
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/components/list-row';
import { TagChips } from '@/components/tag-chips';
import { ThemedText } from '@/components/themed-text';
import { localDayOf } from '@/features/dates/local-day';
import { useDateFormat } from '@/features/dates/use-date-format';
import { formatSessionTotal, type HomeSessionRow } from '@/features/home/home-session-row';
import { formatFaltResult } from '@/features/session/format-falt-result';
import { TabularNums } from '@/theme/tokens';

import { formatInnerTens, typeShownBesideTags, withoutDateSuffix } from './session-row-format';

export interface SessionRowProps {
  session: HomeSessionRow;
  onPress: () => void;
  testID: string;
}

/** The result line under the date: what the session scored, in words a reader can parse. */
export function useSessionResultLine(): (session: HomeSessionRow) => string | null {
  const { t } = useTranslation();
  return (session) => {
    if (session.falt) return formatFaltResult(t, session.falt);
    if (session.seriesAverage !== null) {
      return [
        t('homeA.perSeries', { average: session.seriesAverage.toFixed(1) }),
        formatInnerTens(session.innerTenCount),
      ].join(' · ');
    }
    if (session.shape === 'roundsOnly' && session.extraRounds) {
      return t('homeA.rounds', { count: session.extraRounds });
    }
    return null;
  };
}

export function SessionRow({ session, onPress, testID }: SessionRowProps) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const resultLine = useSessionResultLine();
  const date = dates.date(session.startedAt);
  // A ring total only where something was scored: "0" on an empty session
  // read as a result of nought.
  const total = session.falt === null && session.seriesAverage !== null;

  return (
    <ListRow
      testID={testID}
      title={withoutDateSuffix(session.name, [date, localDayOf(session.startedAt)])}
      subtitle={[
        [
          date,
          typeShownBesideTags(session.type, session.tags) ? t(`sessionType.${session.type}`) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        resultLine(session),
      ]}
      below={<TagChips names={session.tags} testID={`${testID}-tags`} />}
      trailing={
        total ? (
          <ThemedText type="headline" style={TabularNums} testID={`${testID}-total`}>
            {formatSessionTotal(session.total)}
          </ThemedText>
        ) : null
      }
      onPress={onPress}
    />
  );
}
