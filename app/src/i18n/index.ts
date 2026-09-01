// i18next setup per docs/implementation-plan.md §2/§4 (M2). Device locale
// via expo-localization picks the initial language; Settings can override it
// (see @/state/app-settings), which calls i18n.changeLanguage directly.
import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import sv from './sv.json';

export const SUPPORTED_LANGUAGES = ['en', 'sv'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function detectDeviceLanguage(): SupportedLanguage {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === 'sv' ? 'sv' : 'en';
}

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      sv: { translation: sv },
    },
    lng: detectDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18next;
