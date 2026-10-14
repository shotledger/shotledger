// Settings → Regulations. Which rule sets the shooter competes under.
//
// Turning one on adds its disciplines and vapengrupper to the choices when a
// session is created; nothing else changes, and no session already logged is
// affected.
import {
  REGULATIONS,
  effectiveRegulations,
  findRegulation,
} from '@shotledger/shared/src/regulations/registry';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { ScreenTitle } from '@/components/screen-title';
import { ThemedText } from '@/components/themed-text';
import { Toggle } from '@/components/toggle';
import { useRegulations } from '@/features/regulations/use-regulations';

export default function RegulationsScreen() {
  const { t } = useTranslation();
  const { enabled, toggle } = useRegulations();

  // What is actually in play, adoption included: switching on SvSF brings
  // ISSF with it, and a screen that did not say so would look broken when
  // ISSF events appeared from an ISSF switch that is still off.
  const effective = effectiveRegulations(enabled);
  const impliedIds = effective
    .map((regulation) => regulation.id)
    .filter((id) => !enabled.includes(id));

  return (
    <Screen>
      <Stack.Screen options={{ title: t('regulations.title') }} />
      <ScreenTitle>{t('regulations.title')}</ScreenTitle>

      <ThemedText type="small" themeColor="textSecondary">
        {t('regulations.intro')}
      </ThemedText>

      {REGULATIONS.map((regulation) => {
        const isOn = enabled.includes(regulation.id);
        const isImplied = impliedIds.includes(regulation.id);
        const adoptedNames = regulation.adopts
          .map((id) => findRegulation(id)?.shortName)
          .filter(Boolean)
          .join(', ');

        return (
          <Card key={regulation.id}>
            <ListRow
              title={regulation.displayName}
              subtitle={[
                regulation.shortName,
                adoptedNames === '' ? null : t('regulations.adopts', { adopted: adoptedNames }),
                // Said plainly, because the switch below it is off while the
                // rules are nevertheless in effect.
                isImplied ? t('regulations.impliedBy') : null,
              ]}
              trailing={
                <Toggle
                  value={isOn}
                  onValueChange={(next) => toggle(regulation.id, next)}
                  testID={`regulation-${regulation.id}-toggle`}
                />
              }
            />
          </Card>
        );
      })}

      <ThemedText type="small" themeColor="textSecondary">
        {t('regulations.footnote')}
      </ThemedText>
    </Screen>
  );
}
