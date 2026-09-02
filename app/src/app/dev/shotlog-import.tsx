// ShotLog CSV import — pick, preview, choose, import
// (docs/specs/shotlog-import-spec.md §7). Mirrors the WebShooter import's
// contract: nothing is written before the user confirms on this screen, and
// every suggestion the importer derived is visible and editable first.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';
import { DISCIPLINES, SPSF_WEAPON_GROUPS, type ShotlogPlanRow } from '@shotledger/shared';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { db } from '@/db/client';
import { listFirearms } from '@/db/queries/firearms';
import { isShotlogRowImportable } from '@/db/queries/shotlog';
import { useShotlogImport } from '@/features/shotlog/use-shotlog-import';
import { disciplineLabel } from '@/features/session/labels';
import { Spacing } from '@/theme/tokens';

const PAGE_SIZE = 20;
const UNSET = '—';

export default function ShotlogImportScreen() {
  const { t } = useTranslation();
  const {
    plan,
    status,
    planImport,
    toggleRow,
    setAllSelected,
    editRow,
    applyToSimilar,
    runImport,
  } = useShotlogImport();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<number | null>(null);

  const firearms = db ? listFirearms(db) : [];
  const selectedCount = plan?.rows.filter((row) => row.selected).length ?? 0;

  function statusLabel(row: ShotlogPlanRow): string {
    return t(`shotlog.status.${row.status}`);
  }

  return (
    <Screen>
      <ThemedText type="title">{t('shotlog.title')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('shotlog.intro')}
      </ThemedText>

      <Card>
        <ListRow
          title={t('shotlog.pickFile')}
          subtitle={t('shotlog.pickFileSubtitle')}
          onPress={() => void planImport()}
          testID="shotlog-pick-file"
        />
        {status.kind === 'cancelled' && (
          <ThemedText type="small" themeColor="textSecondary" testID="shotlog-status">
            {t('shotlog.cancelled')}
          </ThemedText>
        )}
        {status.kind === 'unavailable' && (
          <ThemedText type="small" themeColor="textSecondary" testID="shotlog-status">
            {t('shotlog.unavailable')}
          </ThemedText>
        )}
        {status.kind === 'imported' && (
          <ThemedText type="default" testID="shotlog-result">
            {t('shotlog.imported', { created: status.created, skipped: status.skipped })}
          </ThemedText>
        )}
      </Card>

      {plan && plan.rows.length === 0 && (
        <EmptyState title={t('shotlog.noRowsTitle')} body={t('shotlog.noRowsBody')} />
      )}

      {plan && plan.rows.length > 0 && (
        <>
          <Card testID="shotlog-summary">
            <ThemedText type="smallBold">{t('shotlog.summaryTitle')}</ThemedText>
            <ThemedText type="small">
              {t('shotlog.summaryCounts', {
                total: plan.summary.total,
                new: plan.summary.byStatus.new,
                duplicates:
                  plan.summary.byStatus['duplicate-in-file'] +
                  plan.summary.byStatus['exact-duplicate'] +
                  plan.summary.byStatus['probable-duplicate'],
                empty: plan.summary.byStatus.empty,
                errors: plan.summary.errorCount,
              })}
            </ThemedText>
            {plan.summary.dateUncertainCount > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('shotlog.summaryDateUnknown', { count: plan.summary.dateUncertainCount })}
              </ThemedText>
            )}
            <View style={styles.actions}>
              <PrimaryButton
                label={t('shotlog.selectNone')}
                onPress={() => setAllSelected(false)}
                testID="shotlog-select-none"
              />
              <PrimaryButton
                label={t('shotlog.selectAll')}
                onPress={() => setAllSelected(true)}
                testID="shotlog-select-all"
              />
            </View>
          </Card>

          <View style={styles.list}>
            {plan.rows.slice(0, visible).map((row) => {
              const blocked = !isShotlogRowImportable(row);
              return (
                <Card key={row.line} testID={`shotlog-row-${row.line}`}>
                  <ListRow
                    title={row.name === '' ? t('shotlog.unnamed') : row.name}
                    subtitle={`${row.datetime.slice(0, 10)} · ${statusLabel(row)}`}
                    trailing={
                      <Switch
                        value={row.selected}
                        onValueChange={() => toggleRow(row.line)}
                        disabled={blocked}
                        testID={`shotlog-select-${row.line}`}
                      />
                    }
                    onPress={() => setExpanded(expanded === row.line ? null : row.line)}
                    testID={`shotlog-expand-${row.line}`}
                  />
                  <View style={styles.chips}>
                    <Chip
                      label={
                        row.suggestion.disciplineId
                          ? disciplineLabel(t, row.suggestion.disciplineId)
                          : t('shotlog.disciplineUnknown')
                      }
                    />
                    <Chip label={row.suggestion.weaponGroup ?? UNSET} />
                    <Chip
                      label={t(`sessionType.${row.suggestion.sessionType}`)}
                      tone={row.suggestion.sessionType === 'competition' ? 'primary' : 'neutral'}
                    />
                    {row.dateUncertain && <Chip label={t('shotlog.dateUnknown')} />}
                    {row.warnings.map((warning) => (
                      <Chip key={warning} label={t(`shotlog.warning.${warning}`)} />
                    ))}
                  </View>

                  {expanded === row.line && (
                    <View style={styles.editor} testID={`shotlog-editor-${row.line}`}>
                      <OptionPicker
                        label={t('session.discipline')}
                        options={DISCIPLINES.map((discipline) => ({
                          value: discipline.id,
                          label: disciplineLabel(t, discipline.id),
                        }))}
                        value={row.suggestion.disciplineId}
                        onChange={(value) => editRow(row.line, { disciplineId: value })}
                      />
                      <OptionPicker
                        label={t('session.weaponGroup')}
                        options={SPSF_WEAPON_GROUPS.map((group) => ({
                          value: group.id,
                          label: group.code,
                        }))}
                        value={row.suggestion.weaponGroup}
                        onChange={(value) => editRow(row.line, { weaponGroup: value })}
                      />
                      <OptionPicker
                        label={t('session.firearm')}
                        options={firearms.map((firearm) => ({
                          value: firearm.id,
                          label: `${firearm.make} ${firearm.model}`,
                        }))}
                        value={row.suggestion.firearmId}
                        onChange={(value) => editRow(row.line, { firearmId: value })}
                        emptyLabel={t('shotlog.noFirearms')}
                      />
                      <PrimaryButton
                        label={t('shotlog.applyToSimilar')}
                        onPress={() =>
                          applyToSimilar(row.line, {
                            disciplineId: row.suggestion.disciplineId,
                            weaponGroup: row.suggestion.weaponGroup,
                            firearmId: row.suggestion.firearmId,
                          })
                        }
                        testID={`shotlog-apply-similar-${row.line}`}
                      />
                    </View>
                  )}
                </Card>
              );
            })}
          </View>

          {visible < plan.rows.length && (
            <PrimaryButton
              label={t('shotlog.showMore', {
                shown: visible,
                total: plan.rows.length,
              })}
              onPress={() => setVisible(visible + PAGE_SIZE)}
              testID="shotlog-show-more"
            />
          )}

          <PrimaryButton
            label={t('shotlog.import', { count: selectedCount })}
            onPress={runImport}
            testID="shotlog-import"
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  editor: { gap: Spacing.two },
  list: { gap: Spacing.two },
});
