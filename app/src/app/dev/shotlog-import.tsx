// ShotLog CSV import — pick, preview, choose, import
// (docs/specs/shotlog-import-spec.md §7, revision 2). Mirrors the Webshooter import's
// contract: nothing is written before the user confirms on this screen, and
// every suggestion the importer derived is visible and editable first.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  ringScoringDisciplines,
  SPSF_WEAPON_GROUPS,
  sumValueTenths,
  tenthsToScore,
  type ShotlogPlanRow,
  type ShotlogTagRole,
} from '@shotledger/shared';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { OptionPicker } from '@/components/option-picker';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { db } from '@/db/client';
import { listActiveFirearms } from '@/db/queries/firearms';
import { isShotlogRowImportable } from '@/db/queries/shotlog';
import { useShotlogImport } from '@/features/shotlog/use-shotlog-import';
import { disciplineLabel } from '@/features/session/labels';
import { Spacing } from '@/theme/tokens';

const PAGE_SIZE = 20;

/** Integer points of the non-sighter series — what the session will score. */
function scoreOf(row: ShotlogPlanRow): number {
  const scored = row.suggestion.series.filter((entry) => !entry.isSighter);
  return tenthsToScore(sumValueTenths(scored.flatMap((entry) => entry.shots)));
}
const UNSET = '—';

// The role picker's values are strings, so each role is encoded as one.
// `|` separates the parts because weapon-group ids contain a colon
// (`spsf:C`). `firearm` carries the tag's own text, hence the label argument.
function encodeRole(role: ShotlogTagRole): string {
  switch (role.kind) {
    case 'discipline':
      return `discipline|${role.disciplineId}`;
    case 'weapon-group':
      return `group|${role.weaponGroup}|${role.shooterClass ?? ''}`;
    case 'ignore':
    case 'competition':
    case 'sighter':
    case 'final':
    case 'dnf':
    case 'firearm':
      return role.kind;
  }
}

function decodeRole(value: string, label: string): ShotlogTagRole {
  const [kind, first, second] = value.split('|');
  if (kind === 'discipline') return { kind: 'discipline', disciplineId: first! };
  if (kind === 'group') {
    return { kind: 'weapon-group', weaponGroup: first!, shooterClass: second || null };
  }
  if (kind === 'firearm') return { kind: 'firearm', label };
  if (kind === 'competition' || kind === 'sighter' || kind === 'final' || kind === 'dnf') {
    return { kind };
  }
  return { kind: 'ignore' };
}

export default function ShotlogImportScreen() {
  const { t } = useTranslation();
  const {
    plan,
    status,
    tags,
    tagMapping,
    setTagRole,
    planImport,
    toggleRow,
    setAllSelected,
    editRow,
    applyToSimilar,
    runImport,
  } = useShotlogImport();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const firearms = listActiveFirearms(db);
  const selectedCount = plan?.rows.filter((row) => row.selected).length ?? 0;

  function statusLabel(row: ShotlogPlanRow): string {
    return t(`shotlog.status.${row.status}`);
  }

  /** The chosen role, as the one line shown under the tag's name. */
  function roleLabel(role: ShotlogTagRole, tagLabel: string): string {
    const match = roleOptions(tagLabel).find((option) => option.value === encodeRole(role));
    return match?.label ?? t('shotlog.role.ignore');
  }

  /** Every role a tag may be given, in the order the picker shows them. */
  function roleOptions(tagLabel: string) {
    return [
      { value: 'ignore', label: t('shotlog.role.ignore') },
      { value: 'firearm', label: t('shotlog.role.firearm', { tag: tagLabel }) },
      { value: 'competition', label: t('shotlog.role.competition') },
      { value: 'sighter', label: t('shotlog.role.sighter') },
      { value: 'final', label: t('shotlog.role.final') },
      { value: 'dnf', label: t('shotlog.role.dnf') },
      ...ringScoringDisciplines().map((discipline) => ({
        value: `discipline|${discipline.id}`,
        label: t('shotlog.role.discipline', { name: disciplineLabel(t, discipline.id) }),
      })),
      ...SPSF_WEAPON_GROUPS.map((group) => ({
        value: `group|${group.id}|`,
        label: t('shotlog.role.weaponGroup', { code: group.label }),
      })),
    ];
  }

  return (
    <Screen>
      <ScreenTitle>{t('shotlog.title')}</ScreenTitle>
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
        {status.kind === 'canceled' && (
          <ThemedText type="small" themeColor="textSecondary" testID="shotlog-status">
            {t('shotlog.canceled')}
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

      {tags.length > 0 && (
        <Card testID="shotlog-tag-mapping">
          <ThemedText type="smallBold">{t('shotlog.tagMappingTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('shotlog.tagMappingIntro')}
          </ThemedText>
          {/* One row per tag, its picker rendered only while open: every role
              is a chip, and laying out all of them for every tag at once was
              heavy enough to stall the UI thread on a real device. */}
          {tags.map((tag) => {
            const role = tagMapping[tag.key] ?? { kind: 'ignore' };
            const open = expandedTag === tag.key;
            return (
              <View key={tag.key}>
                <ListRow
                  title={t('shotlog.tagLabel', { tag: tag.label, count: tag.count })}
                  subtitle={roleLabel(role, tag.label)}
                  onPress={() => setExpandedTag(open ? null : tag.key)}
                  testID={`shotlog-tag-${tag.key}`}
                />
                {open && (
                  <OptionPicker
                    label={t('shotlog.tagMappingTitle')}
                    options={roleOptions(tag.label)}
                    value={encodeRole(role)}
                    onChange={(value) => {
                      setTagRole(tag.key, decodeRole(value ?? 'ignore', tag.label));
                      setExpandedTag(null);
                    }}
                  />
                )}
              </View>
            );
          })}
        </Card>
      )}

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
                series: plan.summary.seriesCount,
                shots: plan.summary.shotCount,
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
                    subtitle={`${row.datetime.slice(0, 10)} · ${statusLabel(row)} · ${t(
                      'shotlog.rowDetail',
                      { series: row.suggestion.series.length, score: scoreOf(row) },
                    )}`}
                    trailing={
                      <Toggle
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
                        options={ringScoringDisciplines().map((discipline) => ({
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
                          label: group.label,
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
