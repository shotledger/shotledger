// Settings state backed by the `settings` table (§3), covering M2's
// language and theme preferences. `db` is null on web (see db/client.web.ts)
// so there settings fall back to in-memory 'system' for the session.
//
// AppSettingsProvider is only ever rendered inside MigrationGate (see
// app/_layout.tsx), so by the time its body runs the `settings` table is
// guaranteed to exist — initial values are read via lazy useState
// initializers (not an effect) to avoid an extra render.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { db } from '@/db/client';
import { getSetting, setSetting, SETTINGS_KEYS } from '@/db/queries/settings';
import i18n, { detectDeviceLanguage } from '@/i18n';

export type ThemeSetting = 'system' | 'light' | 'dark';
export type LanguageSetting = 'system' | 'sv' | 'en';

interface AppSettingsValue {
  theme: ThemeSetting;
  language: LanguageSetting;
  setTheme: (value: ThemeSetting) => void;
  setLanguage: (value: LanguageSetting) => void;
}

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

function readInitialLanguage(): LanguageSetting {
  const stored = db ? getSetting<LanguageSetting>(db, SETTINGS_KEYS.language, 'system') : 'system';
  if (stored !== 'system') void i18n.changeLanguage(stored);
  return stored;
}

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>(() =>
    db ? getSetting<ThemeSetting>(db, SETTINGS_KEYS.theme, 'system') : 'system',
  );
  const [language, setLanguageState] = useState<LanguageSetting>(readInitialLanguage);

  const setTheme = useCallback((value: ThemeSetting) => {
    setThemeState(value);
    if (db) setSetting(db, SETTINGS_KEYS.theme, value);
  }, []);

  const setLanguage = useCallback((value: LanguageSetting) => {
    setLanguageState(value);
    if (db) setSetting(db, SETTINGS_KEYS.language, value);
    void i18n.changeLanguage(value === 'system' ? detectDeviceLanguage() : value);
  }, []);

  const value = useMemo(
    () => ({ theme, language, setTheme, setLanguage }),
    [theme, language, setTheme, setLanguage],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
