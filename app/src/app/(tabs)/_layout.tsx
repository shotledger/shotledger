import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/use-theme';

// Real M2 tab shell replacing the M0 scaffold demo tabs (Home/Explore).
// Cross-platform `Tabs` (not the native-only NativeTabs) so web renders it too.
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="stats" options={{ title: t('tabs.stats') }} />
      <Tabs.Screen name="firearms" options={{ title: t('tabs.firearms') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
    </Tabs>
  );
}
