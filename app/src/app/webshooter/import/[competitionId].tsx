// WebShooter import — per-competition review (integration spec §A.1–§A.9):
// each result row's verdict (new / exact-duplicate / probable-match /
// not-importable) with a per-row confirm — no write happens before this
// screen's confirm button, and there is deliberately no "import everything"
// action (§A.1's own "Done when" criterion).
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import { useWebShooterReview, type ReviewCandidate } from '@/features/webshooter/use-webshooter-import';
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
      return candidate.verdict.reason === 'field-not-supported'
        ? 'webshooter.fieldNotSupported'
        : 'webshooter.verdictClassMappingUnresolved';
  }
}

export default function WebShooterImportReviewScreen() {
  const { t } = useTranslation();
  const { competitionId } = useLocalSearchParams<{ competitionId: string }>();
  const id = Number(competitionId);
  const { candidates, loading, error, load, confirmImport } = useWebShooterReview(id);
  const [applySighterFirearmId, setApplySighterFirearmId] = useState<string | null>(null);
  const firearms = db ? listFirearms(db) : [];

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
      applySighterRoundsForFirearmId: applySighterFirearmId,
    });
    Alert.alert(t('webshooter.importConfirmedTitle'));
    void load({ forceRefresh: true });
  }

  return (
    <Screen>
      <ThemedText type="title">{t('webshooter.reviewTitle')}</ThemedText>

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('webshooter.fetchFailed')}
        </ThemedText>
      )}

      {firearms.length > 0 && (
        <OptionPicker
          label={t('webshooter.sighterRoundsFirearmLabel')}
          options={firearms.map((f) => ({ value: f.id, label: `${f.make} ${f.model}` }))}
          value={applySighterFirearmId}
          onChange={setApplySighterFirearmId}
        />
      )}

      {!loading && candidates.length === 0 && (
        <EmptyState title={t('webshooter.noResultsTitle')} body={t('webshooter.noResultsBody')} />
      )}

      <View style={styles.list}>
        {candidates.map((item) => {
          const importable = item.candidate.verdict.kind !== 'not-importable';
          return (
            <Card key={item.row.id}>
              <ThemedText type="smallBold">{item.candidate.competitionName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.candidate.weaponGroup, item.candidate.shooterClass].filter(Boolean).join(' ')}
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
              {importable && (
                <PrimaryButton
                  label={
                    item.candidate.verdict.kind === 'exact-duplicate'
                      ? t('webshooter.reimport')
                      : t('webshooter.import')
                  }
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
});
