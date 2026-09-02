import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  FirearmsTabIcon,
  HomeTabIcon,
  SettingsTabIcon,
  StatsTabIcon,
} from '@/components/tab-icons';
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
          title: t('tabs.firearms'),
          tabBarIcon: ({ color, size }) => <FirearmsTabIcon color={color} size={size} />,
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
