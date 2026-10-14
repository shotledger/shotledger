import { Tabs, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  FirearmsTabIcon,
  HomeTabIcon,
  SettingsTabIcon,
  StatsTabIcon,
  ToolsTabIcon,
} from '@/components/tab-icons';
import { isProviderEnabled } from '@/features/providers/use-provider-enabled';
import { useFeatures } from '@/features/settings/feature-visibility';
import { useTheme } from '@/hooks/use-theme';

import { PROVIDERS } from '@shotledger/shared/src/integrations/providers/registry';

// Real M2 tab shell replacing the M0 scaffold demo tabs (Home/Explore).
// Cross-platform `Tabs` (not the native-only NativeTabs) so web renders it too.
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const features = useFeatures();
  // Read on every navigation: a site is switched on in Settings, which this
  // layout does not otherwise hear about.
  usePathname();
  // Tools would be empty with the timer and photos hidden and no site on (#801).
  const toolsEmpty =
    !features.timer &&
    !features.photos &&
    !PROVIDERS.some((provider) => isProviderEnabled(provider.id));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <HomeTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs.stats'),
          tabBarIcon: ({ color, size }) => <StatsTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="firearms"
        options={{
          title: features.ammoLots ? t('tabs.firearms') : t('firearms.tabFirearms'),
          tabBarIcon: ({ color, size }) => <FirearmsTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: t('tabs.tools'),
          href: toolsEmpty ? null : undefined,
          tabBarIcon: ({ color, size }) => <ToolsTabIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <SettingsTabIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
