// Webshooter import — per-competition review (integration spec §A.1–§A.9):
// each result row's verdict (new / exact-duplicate / probable-match /
// not-importable) with a per-row confirm — no write happens before this
// screen's confirm button, and there is deliberately no "import everything"
// action (§A.1's own "Done when" criterion).
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import {
  useWebshooterReview,
  type ReviewCandidate,
} from '@/features/webshooter/use-webshooter-import';
import { Spacing } from '@/theme/tokens';

function verdictLabelKey(candidate: ReviewCandidate['candidate']): string {
  switch (candidate.verdict.kind) {
    case 'new':
      return 'webshooter.verdictNew';
    case 'exact-duplicate':
      return 'webshooter.verdictExactDuplicate';
    case 'probable-match':
      return 'webshooter.verdictProbableMatch';
    case 'not-importable':
      switch (candidate.verdict.reason) {
        case 'results-type-unknown':
          return 'webshooter.resultsTypeNotSupported';
        case 'station-data-invalid':
          return 'webshooter.verdictStationDataInvalid';
        case 'class-mapping-unresolved':
          return 'webshooter.verdictClassMappingUnresolved';
      }
  }
}

export default function WebshooterImportReviewScreen() {
  const { t } = useTranslation();
  const { competitionId } = useLocalSearchParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const { candidates, loading, error, load, confirmImport } = useWebshooterReview(id);
  // Per start: each is one weapon group and class, shot with its own firearm.
  const [firearmByRow, setFirearmByRow] = useState<Record<number, string>>({});
  const [sightersByRow, setSightersByRow] = useState<Record<number, boolean>>({});
  const firearms = listFirearms(db);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount
  }, [id]);

  async function onConfirm(item: ReviewCandidate) {
    const linkToSessionId =
      item.candidate.verdict.kind === 'exact-duplicate'
        ? item.candidate.verdict.sessionId
        : item.candidate.verdict.kind === 'probable-match'
          ? item.candidate.verdict.candidates[0]?.id
          : undefined;
    await confirmImport(item, {
      linkToSessionId,
      firearmId: firearmByRow[item.row.id] ?? null,
      addSighterRounds: sightersByRow[item.row.id] === true,
    });
    Alert.alert(t('webshooter.importConfirmedTitle'));
    void load({ forceRefresh: true });
  }

  return (
    <Screen>
      <ScreenTitle>{t('webshooter.reviewTitle')}</ScreenTitle>

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('webshooter.fetchFailed')}
        </ThemedText>
      )}

      {!loading && candidates.length === 0 && (
        <EmptyState title={t('webshooter.noResultsTitle')} body={t('webshooter.noResultsBody')} />
      )}

      <View style={styles.list}>
        {candidates.map((item) => {
          const importable = item.candidate.verdict.kind !== 'not-importable';
          // A re-import already had its sighter rounds offered once.
          const reimport = item.candidate.verdict.kind === 'exact-duplicate';
          return (
            <Card key={item.row.id}>
              <ThemedText type="smallBold">{item.candidate.competitionName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.candidate.weaponGroup, item.candidate.shooterClass]
                  .filter(Boolean)
                  .join(' ')}
                {' · '}
                {t(verdictLabelKey(item.candidate))}
              </ThemedText>
              {item.candidate.verdict.kind === 'probable-match' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('webshooter.probableMatchHint', {
                    name: item.candidate.verdict.candidates[0]?.eventName ?? '',
                  })}
                </ThemedText>
              )}
              {importable && firearms.length > 0 && (
                <OptionPicker
                  label={t('session.firearm')}
                  options={firearms.map((f) => ({
                    value: f.id,
                    label: `${f.make} ${f.model}`,
                    testID: `webshooter-firearm-${item.row.id}-${f.id}`,
                  }))}
                  value={firearmByRow[item.row.id] ?? null}
                  onChange={(firearmId) =>
                    setFirearmByRow((prev) => ({ ...prev, [item.row.id]: firearmId }))
                  }
                />
              )}
              {importable && !reimport && (
                <View style={styles.switchRow}>
                  <ThemedText type="small">{t('webshooter.addSighterRounds')}</ThemedText>
                  <Switch
                    value={sightersByRow[item.row.id] === true}
                    onValueChange={(on) =>
                      setSightersByRow((prev) => ({ ...prev, [item.row.id]: on }))
                    }
                    testID={`webshooter-sighters-${item.row.id}`}
                  />
                </View>
              )}
              {importable && (
                <PrimaryButton
                  label={reimport ? t('webshooter.reimport') : t('webshooter.import')}
                  onPress={() => void onConfirm(item)}
                  testID={`webshooter-confirm-${item.row.id}`}
                />
              )}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
