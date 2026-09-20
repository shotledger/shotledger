// Firearms + ammo inventory (§4 M4). A SegmentedControl toggles between the
// two lists on one tab — the plan's §5 screen inventory only names /firearms
// routes, so ammo lots are surfaced here rather than adding a new tab.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { DrillDownRow } from '@/components/drill-down-row';
import { EmptyState } from '@/components/empty-state';
import { FAB } from '@/components/fab';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented-control';
import { db } from '@/db/client';
import { listAmmoLots } from '@/db/queries/ammo-lots';
import { getAmmoLotUsage } from '@/db/queries/ammo-usage';
import { formatAmmoRecipe } from '@/features/ammo/format-ammo-recipe';
import { useFirearmsList } from '@/features/firearms/use-firearms-list';
import { Spacing } from '@/theme/tokens';

type Section = 'firearms' | 'ammo';

const MAINTENANCE_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

const LICENSE_ACTIVITY_TONE: Record<string, 'neutral' | 'primary'> = {
  green: 'neutral',
  amber: 'primary',
  red: 'primary',
};

export default function FirearmsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [section, setSection] = useState<Section>('firearms');
  const { rows: firearmRows } = useFirearmsList();
  const ammoRows = db
    ? listAmmoLots(db).map((lot) => ({ lot, usage: getAmmoLotUsage(db!, lot.id) }))
    : [];

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
        firearmRows.length === 0 ? (
          <EmptyState title={t('firearms.emptyTitle')} body={t('firearms.emptyBody')} />
        ) : (
          <Card>
            {firearmRows.map((row) => (
              <ListRow
                key={row.id}
                testID={`firearm-${row.id}`}
                title={`${row.make} ${row.model}`}
                subtitle={
                  row.weaponType ? t(`firearms.weaponType${capitalize(row.weaponType)}`) : undefined
                }
                onPress={() => router.push(`/firearms/${row.id}`)}
                trailing={
                  <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                    {/* "No License" and "Incomplete" together said the same
                        thing twice and squeezed the name into one-word-per-line
                        wrapping (seen on the emulator with six imported
                        firearms). Incomplete already means a licence is among
                        the missing details, and the detail screen names them. */}
                    {!(row.isIncomplete && row.licenseStatus === 'none') && (
                      <Chip label={t(`firearms.licenseStatus${capitalize(row.licenseStatus)}`)} />
                    )}
                    {row.maintenanceStatus !== 'unknown' && (
                      <Chip
                        label={t(`firearms.maintenanceStatus${capitalize(row.maintenanceStatus)}`)}
                        tone={MAINTENANCE_TONE[row.maintenanceStatus]}
                      />
                    )}
                    {/* An imported firearm shows "No License" because nothing
                        on file says otherwise — which reads as a fact about
                        the shooter rather than a gap in the data (#320). */}
                    {row.isIncomplete && (
                      <Chip
                        testID={`firearm-incomplete-${row.id}`}
                        label={t('firearms.incomplete')}
                        tone="primary"
                      />
                    )}
                    {row.licenseActivityStatus && (
                      <Chip
                        testID={`firearm-barometer-${row.id}`}
                        label={t(
                          `compliance.licenseActivity${capitalize(row.licenseActivityStatus)}`,
                        )}
                        tone={LICENSE_ACTIVITY_TONE[row.licenseActivityStatus]}
                      />
                    )}
                  </View>
                }
              />
            ))}
          </Card>
        )
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
