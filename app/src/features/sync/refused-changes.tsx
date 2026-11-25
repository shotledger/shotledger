// Account & Sync's refused changes, each with Discard
// (docs/specs/sync-discard-refused-spec.md §2.3). Rows come from the shared
// `badRows`; the web's Account page lists the same rows with the same strings.
import { rowKey, type BadRow } from '@shotledger/shared';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { useDateFormat } from '@/features/dates/use-date-format';

export interface RefusedChangesProps {
  rows: readonly BadRow[];
  onDiscard: (row: BadRow) => void;
  /** `rowKey`s whose last discard failed. */
  failed?: readonly string[];
  /** The `rowKey` being discarded; every Discard waits while one runs. */
  busy?: string | null;
}

export function RefusedChanges({ rows, onDiscard, failed = [], busy = null }: RefusedChangesProps) {
  const { t } = useTranslation();
  const dates = useDateFormat();

  const title = (row: BadRow) => {
    const kind = t(`account.refusal.kind.${row.tableName}`);
    const context = row.context;
    if (context === null) return kind;
    if (context.kind === 'firearm') return `${kind} · ${context.label}`;
    const date = context.startedAt === null ? null : dates.date(context.startedAt);
    const label = [context.name, date].filter((part) => part !== null).join(', ');
    return label === '' ? kind : `${kind} · ${label}`;
  };

  const confirm = (row: BadRow) => {
    const second =
      row.role === 'member'
        ? t('account.refusal.confirmMember')
        : row.role === 'root'
          ? t('account.refusal.confirmRoot')
          : null;
    const body = [t('account.refusal.confirmBody'), second].filter(Boolean).join('\n\n');
    Alert.alert(t('account.refusal.confirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.refusal.discard'),
        style: 'destructive',
        onPress: () => onDiscard(row),
      },
    ]);
  };

  return (
    <>
      {rows.map((row) => {
        const key = rowKey(row.tableName, row.rowId);
        const id = `${row.tableName}-${row.rowId}`;
        return (
          // ListRow sets a testID only on a pressable row.
          <View key={key} testID={`refused-row-${id}`}>
            <ListRow
              title={title(row)}
              subtitle={[
                row.waiting > 0 ? t('account.refusal.waiting', { count: row.waiting }) : null,
                row.held ? null : t('account.refusal.notOnDevice'),
                failed.includes(key) ? t('account.refusal.discardFailed') : null,
              ]}
              trailing={
                <Button
                  variant="destructive"
                  label={t('account.refusal.discard')}
                  disabled={busy !== null}
                  onPress={() => confirm(row)}
                  testID={`refused-discard-${id}`}
                />
              }
            />
          </View>
        );
      })}
    </>
  );
}
