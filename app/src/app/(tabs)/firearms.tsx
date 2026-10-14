// Firearms + ammo inventory (§4 M4). A SegmentedControl toggles between the
// two lists on one tab — the plan's §5 screen inventory only names /firearms
// routes, so ammo lots are surfaced here rather than adding a new tab.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SecondaryButton } from '@/components/secondary-button';
import { SegmentedControl } from '@/components/segmented-control';
import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { getAmmoLotUsage } from '@/db/queries/ammo-usage';
import { formatAmmoRecipe } from '@/features/ammo/format-ammo-recipe';
import { requiresLicense } from '@/features/firearms/completeness';
import { useFirearmsList, type FirearmListRow } from '@/features/firearms/use-firearms-list';
import { ToneLine, type ToneLevel } from '@/features/forms/tone-line';
import { StatusLine } from '@/components/status-line';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/theme/tokens';

type Section = 'firearms' | 'ammo';

/** Statuses read as words in a status colour under the name, never as
 *  lavender chips: the accent is for what can be tapped (#822). */
function toneLevel(status: string): ToneLevel {
  return status === 'red' ? 'red' : status === 'amber' ? 'amber' : 'green';
}

export default function FirearmsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [section, setSection] = useState<Section>('firearms');
  const [showArchived, setShowArchived] = useState(false);
  const { rows: allFirearmRows } = useFirearmsList();
  // Archived firearms (#799) sit behind a toggle under the active ones.
  const firearmRows = allFirearmRows.filter((row) => !row.isArchived);
  const archivedRows = allFirearmRows.filter((row) => row.isArchived);
  const ammoRows = listAmmoLots(db).map((lot) => ({ lot, usage: getAmmoLotUsage(db, lot.id) }));

  function renderFirearmRow(row: FirearmListRow) {
    return (
      <ListRow
        key={row.id}
        testID={`firearm-${row.id}`}
        title={`${row.make} ${row.model}`}
        subtitle={
          row.weaponType ? t(`firearms.weaponType${capitalize(row.weaponType)}`) : undefined
        }
        onPress={() => router.push(`/firearms/${row.id}`)}
        // An archived firearm (#799) carries no status: its licence and
        // maintenance are history, not something to act on.
        below={
          row.isArchived ? undefined : (
            <View style={styles.statuses}>
              {/* "No License" and "Incomplete" together said the same
                  thing twice. Incomplete already means a licence is among
                  the missing details, and the detail screen names them.

                  A firearm that needs no licence shows no licence status at
                  all: "No License" on an air pistol reads as a gap, and
                  there is none to fill (#365). */}
              {requiresLicense(row.weaponType) &&
                !(row.isIncomplete && row.licenseStatus === 'none') && (
                  <StatusLine status={row.licenseStatus} />
                )}
              {row.maintenanceStatus !== 'unknown' && (
                <ToneLine
                  label={t(`firearms.maintenanceStatus${capitalize(row.maintenanceStatus)}`)}
                  level={toneLevel(row.maintenanceStatus)}
                />
              )}
              {/* An imported firearm shows "No License" because nothing
                  on file says otherwise — which reads as a fact about
                  the shooter rather than a gap in the data (#320). */}
              {row.isIncomplete && (
                <ThemedText
                  type="smallBold"
                  themeColor="textSecondary"
                  testID={`firearm-incomplete-${row.id}`}
                >
                  {t('firearms.incomplete')}
                </ThemedText>
              )}
              {row.licenseActivityStatus && (
                <ToneLine
                  testID={`firearm-barometer-${row.id}`}
                  label={t(`compliance.licenseActivity${capitalize(row.licenseActivityStatus)}`)}
                  level={toneLevel(row.licenseActivityStatus)}
                />
              )}
            </View>
          )
        }
      />
    );
  }

  return (
    <Screen
      fab={
        <FAB
          label={section === 'firearms' ? t('firearms.newFirearm') : t('ammo.newLot')}
          testID="firearms-fab"
          onPress={() => router.push(section === 'firearms' ? '/firearms/new' : '/ammo/new')}
        />
      }
    >
      <ScreenTitle>{t('firearms.title')}</ScreenTitle>
      <SegmentedControl
        options={[
          { value: 'firearms' as Section, label: t('firearms.tabFirearms') },
          { value: 'ammo' as Section, label: t('firearms.tabAmmo') },
        ]}
        value={section}
        onChange={setSection}
      />

      {section === 'firearms' ? (
        <>
          {firearmRows.length === 0 ? (
            <EmptyState title={t('firearms.emptyTitle')} body={t('firearms.emptyBody')} />
          ) : (
            <Card>{firearmRows.map(renderFirearmRow)}</Card>
          )}
          {archivedRows.length > 0 && (
            <SecondaryButton
              label={
                showArchived
                  ? t('firearms.hideArchived')
                  : t('firearms.showArchived', { count: archivedRows.length })
              }
              onPress={() => setShowArchived((shown) => !shown)}
              testID="firearms-toggle-archived"
            />
          )}
          {showArchived && archivedRows.length > 0 && (
            <Card>{archivedRows.map(renderFirearmRow)}</Card>
          )}
        </>
      ) : ammoRows.length === 0 ? (
        <EmptyState title={t('ammo.emptyTitle')} body={t('ammo.emptyBody')} />
      ) : (
        <>
          {ammoRows.length > 1 && (
            <Card>
              <DrillDownRow
                title={t('ammo.compareOpen')}
                subtitle={t('ammo.compareOpenSubtitle')}
                onPress={() => router.push('/ammo/compare')}
                testID="ammo-open-compare"
              />
            </Card>
          )}
          <Card>
            {ammoRows.map(({ lot, usage }) => (
              <ListRow
                key={lot.id}
                testID={`ammo-${lot.id}`}
                title={lot.label}
                subtitle={[
                  // The load is derived from the recipe columns, on its own
                  // line — never baked into `label` (maintainer, 2026-09-10).
                  formatAmmoRecipe(lot, (value) => t('ammo.grainsValue', { value })),
                  t('ammo.usageCount', {
                    sessions: usage.sessionCount,
                    shots: usage.shotCount,
                  }),
                ]}
                onPress={() => router.push(`/ammo/${lot.id}`)}
                trailing={lot.isHandload ? <Chip label={t('ammo.isHandload')} /> : undefined}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  statuses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
    marginTop: Spacing.one,
  },
});
