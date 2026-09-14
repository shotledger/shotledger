// The Settings tab: a menu, nothing more.
//
// Every group is a drill-down (maintainer, #138: "like we have for account &
// sync — no setting shall be done directly under Settings"), which is also
// the answer to the screen being "very much scrolling": the pages behind the
// rows hold the switches, and this list holds the answers.
//
// Rows carry their current value where there is one worth reading without
// opening anything — the language, the theme, the rule sets in play.
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { DEV_TOOLS_ENABLED } from '@/constants/dev-tools';
import { effectiveRegulations } from '@shotledger/shared/src/regulations/registry';

import { DrillDownRow } from '@/components/drill-down-row';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { useRegulations } from '@/features/regulations/use-regulations';

import { SUPPORT_URL } from '@/constants/links';
import { useComplianceProfile } from '@/features/compliance/use-compliance-profile';
import { useAppSettings } from '@/state/app-settings';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, language } = useAppSettings();

  // The short names of everything in effect, adoption included — "SPSF, ISSF,
  // SvSF" rather than only what has a switch turned on.
  const { enabled: enabledRegulations } = useRegulations();
  const effective = effectiveRegulations(enabledRegulations);
  const activeRegulationSummary =
    effective.length === 0
      ? t('regulations.settingsRowNone')
      : effective.map((regulation) => regulation.shortName).join(' · ');
  const { selection: complianceSelection } = useComplianceProfile();

  return (
    <Screen>
      <ScreenTitle>{t('settings.title')}</ScreenTitle>

      <Card>
        <DrillDownRow
          title={t('settings.personal')}
          subtitle={t('settings.personalSubtitle')}
          onPress={() => router.push('/settings/personal')}
          testID="settings-open-personal"
        />
        <DrillDownRow
          title={t('regulations.settingsRowTitle')}
          subtitle={activeRegulationSummary}
          onPress={() => router.push('/regulations')}
          testID="settings-open-regulations"
        />
        <DrillDownRow
          title={t('compliance.settingsTitle')}
          value={t(`compliance.profile${complianceSelection === 'se' ? 'Se' : 'None'}` as const)}
          onPress={() => router.push('/settings/compliance')}
          testID="settings-open-compliance"
        />
      </Card>

      <Card>
        <DrillDownRow
          title={t('settings.language')}
          value={t(
            `settings.language${language === 'system' ? 'System' : language === 'sv' ? 'Sv' : 'En'}` as const,
          )}
          onPress={() => router.push('/settings/language')}
          testID="settings-open-language"
        />
        <DrillDownRow
          title={t('settings.theme')}
          value={t(
            `settings.theme${theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}` as const,
          )}
          onPress={() => router.push('/settings/theme')}
          testID="settings-open-theme"
        />
        <DrillDownRow
          title={t('settings.locationLookup')}
          subtitle={t('settings.locationRowSubtitle')}
          onPress={() => router.push('/settings/location')}
          testID="settings-open-location"
        />
      </Card>

      <Card>
        <DrillDownRow
          title={t('account.settingsRowTitle')}
          subtitle={t('account.settingsRowSubtitle')}
          onPress={() => router.push('/account')}
          testID="settings-open-account"
        />
        <DrillDownRow
          title={t('providers.sectionTitle')}
          subtitle={t('settings.externalSitesRowSubtitle')}
          onPress={() => router.push('/settings/external-sites')}
          testID="settings-open-external-sites"
        />
      </Card>

      <Card>
        <DrillDownRow
          title={t('settings.dataTitle')}
          subtitle={t('settings.dataRowSubtitle')}
          onPress={() => router.push('/settings/data')}
          testID="settings-open-data"
        />
        <DrillDownRow
          title={t('settings.trainingTitle')}
          subtitle={t('settings.trainingRowSubtitle')}
          onPress={() => router.push('/settings/training-data')}
          testID="settings-open-training-data"
        />
      </Card>

      <Card>
        <ListRow
          title={t('settings.supportDevelopment')}
          subtitle={t('settings.supportSubtitle')}
          onPress={() => Linking.openURL(SUPPORT_URL)}
          testID="settings-support-development"
        />
        <DrillDownRow
          title={t('settings.about')}
          onPress={() => router.push('/about')}
          testID="settings-about"
        />
      </Card>

      {/* The only tap-path to /dev. A dev build reaches it by deep link, but a
          sideloaded release build built with EXPO_PUBLIC_ENABLE_DEV_TOOLS=1
          cannot — and that build exists so the maintainer can load demo data
          on a phone. */}
      {DEV_TOOLS_ENABLED && (
        <Card>
          <DrillDownRow
            title={t('settings.devSection')}
            onPress={() => router.push('/dev')}
            testID="settings-open-dev"
          />
        </Card>
      )}
    </Screen>
  );
}
