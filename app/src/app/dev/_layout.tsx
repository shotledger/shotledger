import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DEV_TOOLS_ENABLED } from '@/constants/flags';
import { useTheme } from '@/hooks/use-theme';

// Dev routes (seed/wipe demo data, component gallery) must be reachable in
// dev builds only (§4 M2) — not linked from the tab shell, and redirected
// away from a release build if someone deep-links in.
export default function DevLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  if (!DEV_TOOLS_ENABLED) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.backgroundElement },
        headerTintColor: theme.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('dev.title') }} />
      <Stack.Screen name="components" options={{ title: t('dev.componentsTitle') }} />
      <Stack.Screen name="shotlog-import" options={{ title: t('shotlog.title') }} />
    </Stack>
  );
}
